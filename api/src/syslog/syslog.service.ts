import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as dgram from 'dgram';
import { PrismaService } from '../prisma.service';
import { DailyLogFileWriter } from './daily-log-file';
import { SessionTable } from './session-table';
import { isSessionLine, parseDhcp, parseNat, parsePpp } from './syslog.parse';
import { bumpReceivedToday, syslogState } from './syslog.state';
import { pushStreamRow } from './stream-buffer';

const MAX_PACKET = 2048;
const RATE_PER_SEC = 800;
const CACHE_MS = 5000;

/**
 * UDP syslog is unauthenticated. Source IP is matched to Server.url / Server.natIp.
 * Spoofed UDP packets can inject logs for a registered router IP. Bind the listener
 * to a trusted network or firewall UDP 514/5514 to known MikroTik addresses.
 */
@Injectable()
export class SyslogService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SyslogService.name);
  private socket?: dgram.Socket;
  private readonly rate = new Map<string, { window: number; count: number }>();
  private cache: { at: number; rows: { id: number; url: string; natIp: string | null; serverName: string }[] } | null =
    null;
  private writes = 0;
  private readonly maxInFlight = 250;

  constructor(
    private prisma: PrismaService,
    private files: DailyLogFileWriter,
    private sessions: SessionTable,
  ) {}

  onModuleInit() {
    const port = Number(process.env.SYSLOG_UDP_PORT || 514);
    syslogState.port = port;
    this.socket = this.listen(port, true);
    void this.warmSessionCache();
  }

  onModuleDestroy() {
    this.socket?.close();
    syslogState.running = false;
  }

  private listen(port: number, allowFallback: boolean) {
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      void this.handle(msg, rinfo.address);
    });
    socket.once('error', (err: NodeJS.ErrnoException) => {
      if (allowFallback && err.code === 'EACCES' && port < 1024) {
        this.log.warn(`Port ${port} needs admin; falling back to 5514`);
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        this.socket = this.listen(5514, false);
        return;
      }
      syslogState.running = false;
      syslogState.lastError = err.message;
    });
    socket.bind(port, '0.0.0.0', () => {
      syslogState.running = true;
      syslogState.port = port;
      syslogState.lastError =
        port === 5514 ? 'Bound 5514 (514 needs admin on Windows). Use 514 on Ubuntu.' : '';
      this.log.log(`Syslog UDP listening on ${port}`);
    });
    return socket;
  }

  private allowRate(fromHost: string) {
    const now = Math.floor(Date.now() / 1000);
    const bucket = this.rate.get(fromHost);
    if (!bucket || bucket.window !== now) {
      this.rate.set(fromHost, { window: now, count: 1 });
      if (this.rate.size > 5000) {
        for (const [k, v] of this.rate) {
          if (v.window < now - 2) this.rate.delete(k);
        }
      }
      return true;
    }
    bucket.count += 1;
    return bucket.count <= RATE_PER_SEC;
  }

  private async serversFor(fromHost: string) {
    const now = Date.now();
    if (!this.cache || now - this.cache.at > CACHE_MS) {
      const rows = await this.prisma.server.findMany({
        where: { disabled: false },
        select: { id: true, url: true, natIp: true, serverName: true },
      });
      this.cache = { at: now, rows };
    }
    return this.cache.rows.filter((s) => s.url === fromHost || s.natIp === fromHost);
  }

  private wanIp(server: { url: string; natIp: string | null }) {
    return server.natIp || server.url || null;
  }

  private async warmSessionCache() {
    const [ppp, logs] = await Promise.all([
      this.prisma.pppSession.findMany({
        where: { fromIp: { not: null } },
        select: { serverId: true, fromIp: true, user: true, mac: true },
        orderBy: { id: 'desc' },
        take: 4000,
      }),
      this.prisma.logEvent.findMany({
        select: {
          serverId: true,
          fromIp: true,
          userName: true,
          macAddress: true,
          gateway: true,
          gatewayPort: true,
        },
        orderBy: { id: 'desc' },
        take: 4000,
      }),
    ]);
    for (const r of ppp) {
      this.sessions.remember(r.serverId, {
        fromIp: r.fromIp,
        userName: r.user,
        macAddress: r.mac,
      });
    }
    for (const r of logs) {
      this.sessions.remember(r.serverId, {
        fromIp: r.fromIp,
        userName: r.userName,
        macAddress: r.macAddress,
        gateway: r.gateway,
        gatewayPort: r.gatewayPort,
      });
    }
  }

  private async markOnline(serverId: number) {
    await this.prisma.server.updateMany({
      where: { id: serverId, connectivityStatus: false },
      data: { connectivityStatus: true },
    });
  }

  private async handle(buf: Buffer, fromHost: string) {
    if (buf.length > MAX_PACKET) return;
    if (!this.allowRate(fromHost)) return;
    if (this.writes >= this.maxInFlight) return;
    bumpReceivedToday();
    const raw = buf.toString('utf8', 0, Math.min(buf.length, MAX_PACKET));
    this.writes += 1;
    try {
      const servers = await this.serversFor(fromHost);
      const server = servers[0];
      if (!server) return;

      if (isSessionLine(raw)) {
        const dhcp = parseDhcp(raw);
        const parsed = parsePpp(raw);
        const user = dhcp?.user || parsed.user;
        const mac = dhcp?.mac || parsed.mac;
        const fromIp = dhcp?.fromIp || parsed.fromIp;
        this.sessions.remember(server.id, {
          fromIp,
          userName: user,
          macAddress: mac,
        });
        if (user || mac || fromIp) {
          await this.prisma.pppSession.create({
            data: { serverId: server.id, user, mac, fromIp },
          });
        }
        await this.markOnline(server.id);
        await this.files.write({
          serverName: server.serverName,
          kind: 'PPP',
          fromHost,
          raw,
          user,
          fromIp,
        });
        if (!/\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}\s*(?:->|=>|→)/.test(raw)) return;
      }

      const fields = this.sessions.apply(server.id, parseNat(raw), this.wanIp(server));
      const created = await this.prisma.logEvent.create({
        data: { serverId: server.id, rawMessage: raw.slice(0, 2000), ...fields },
      });
      pushStreamRow(created);
      await this.markOnline(server.id);
      await this.files.write({
        serverName: server.serverName,
        kind: 'NAT',
        fromHost,
        raw,
        user: fields.userName,
        fromIp: fields.fromIp,
      });
    } catch (e) {
      this.log.warn(`Syslog ingest failed: ${(e as Error).message}`);
    } finally {
      this.writes -= 1;
    }
  }
}
