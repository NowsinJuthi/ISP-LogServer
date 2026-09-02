import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { NotifyService } from '../notify/notify.service';
import { PrismaService } from '../prisma.service';
import { fetchPppActive } from '../servers/mikrotik-ppp';
import { retentionMonths } from '../servers/retention';
import { SessionTable } from '../syslog/session-table';
import { readMikrotikPorts } from '../company/mikrotik-ports';

const LOG_ONLINE_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly log = new Logger(JobsService.name);
  private queue: Queue | null = null;
  private checking = false;
  private syncing = false;

  constructor(
    private prisma: PrismaService,
    private notify: NotifyService,
    private sessions: SessionTable,
  ) {
    const url = process.env.REDIS_URL;
    if (url) {
      try {
        this.queue = new Queue('logserver', { connection: { url } });
      } catch (e) {
        this.log.warn(`Redis/BullMQ not ready: ${(e as Error).message}`);
      }
    }
  }

  @Cron('0 15 2 * * *')
  async purgeOldLogs() {
    const servers = await this.prisma.server.findMany();
    const now = Date.now();
    for (const s of servers) {
      const months = retentionMonths(s.retention);
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - months);
      const logs = await this.prisma.logEvent.deleteMany({
        where: { serverId: s.id, receivedAt: { lt: cutoff } },
      });
      const ppp = await this.prisma.pppSession.deleteMany({
        where: { serverId: s.id, receivedAt: { lt: cutoff } },
      });
      this.log.log(`Purged server ${s.serverName}: logs=${logs.count} ppp=${ppp.count}`);
    }
    await this.purgeOldActivityLogs();
    if (this.queue) {
      try {
        await this.queue.add('purge-done', { at: new Date().toISOString() });
      } catch (e) {
        this.log.warn(`Redis/BullMQ enqueue failed: ${(e as Error).message}`);
      }
    }
  }

  /** Activity Logs older than 30 days are removed every night with log purge. */
  async purgeOldActivityLogs() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const audit = await this.prisma.audit.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.log.log(`Purged activity logs older than 30 days: ${audit.count}`);
  }

  @Cron('*/2 * * * *')
  async checkMikroTikLinks() {
    if (this.checking) return;
    this.checking = true;
    try {
      const rows = await this.prisma.server.findMany({
        where: { disabled: false },
      });
      const cutoff = new Date(Date.now() - LOG_ONLINE_WINDOW_MS);
      for (const s of rows) {
        const [log, ppp] = await Promise.all([
          this.prisma.logEvent.findFirst({
            where: { serverId: s.id, receivedAt: { gte: cutoff } },
            select: { id: true },
          }),
          this.prisma.pppSession.findFirst({
            where: { serverId: s.id, receivedAt: { gte: cutoff } },
            select: { id: true },
          }),
        ]);
        const online = !!(log || ppp);
        if (online !== s.connectivityStatus) {
          await this.prisma.server.update({
            where: { id: s.id },
            data: { connectivityStatus: online },
          });
        }
        if (s.connectivityStatus && !online) {
          this.log.warn(`MikroTik log silent: ${s.serverName} (${s.url})`);
          await this.notify.alertMikroTikDown(s);
        }
      }
    } catch (e) {
      this.log.error(`Connectivity check failed: ${(e as Error).message}`);
    } finally {
      this.checking = false;
    }
  }

  onModuleInit() {
    this.log.log('PPP/ARP client-map sync scheduled');
    void this.syncPppSessions();
    void this.purgeOldActivityLogs();
  }

  @Cron('*/30 * * * * *')
  async syncPppSessions() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const servers = await this.prisma.server.findMany({
        where: { disabled: false },
        select: { id: true, url: true, userName: true, password: true, port: true, serverName: true },
      });
      if (!servers.length) {
        this.log.warn('Client map: no MikroTik servers in database');
        return;
      }
      const ports = await readMikrotikPorts(this.prisma);
      for (const s of servers) {
        if (!s.userName || !s.password) {
          this.log.warn(`Client map skipped ${s.serverName}: save MikroTik API user and password`);
          continue;
        }
        this.log.log(`Client map probing ${s.serverName} ${s.url}:${s.port || ports.api}`);
        const result = await fetchPppActive(s, ports.api);
        const rows = result.rows;
        const withMac = rows.filter((r) => r.mac).length;
        for (const r of rows) {
          this.sessions.remember(s.id, {
            fromIp: r.fromIp,
            userName: r.user,
            macAddress: r.mac,
          });
        }
        if (rows.length) {
          this.log.log(`Client map ${s.serverName}: ${rows.length} rows, ${withMac} with MAC`);
        } else {
          this.log.warn(`Client map empty for ${s.serverName}: ${result.error || 'unknown'}`);
        }
      }
    } catch (e) {
      this.log.warn(`PPP active sync failed: ${(e as Error).message}`);
    } finally {
      this.syncing = false;
    }
  }
}
