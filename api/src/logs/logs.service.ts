import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, canAccessServer } from '../auth/auth-user';
import { PrismaService } from '../prisma.service';
import { addressLookup, clampPage, clampPageSize, parseOptionalDate, sanitizeFilter } from '../security/pagination';
import { SessionTable } from '../syslog/session-table';
import { applyWanNat, fillFromRaw } from '../syslog/syslog.parse';
import { pushStreamRow, readStreamBuffer, seedStreamBuffer, streamBufferSize } from '../syslog/stream-buffer';

type LogRow = {
  id: number;
  serverId: number;
  receivedAt: Date;
  deviceReportedTime: Date | null;
  userName: string | null;
  gateway: string | null;
  gatewayPort: string | null;
  toHost: string | null;
  toHostPort: string | null;
  fromIp: string | null;
  fromIpPort: string | null;
  macAddress: string | null;
  rawMessage: string | null;
};

@Injectable()
export class LogsService {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionTable,
  ) {}

  async search(
    user: AuthUser,
    q: {
      serverId: number;
      from?: string;
      to?: string;
      userName?: string;
      fromIp?: string;
      fromPort?: string;
      gateway?: string;
      toHost?: string;
      toPort?: string;
      mac?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const serverId = Number(q.serverId);
    if (!Number.isInteger(serverId) || serverId < 1) {
      throw new BadRequestException('A valid server is required');
    }
    if (!canAccessServer(user, serverId)) throw new ForbiddenException();
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, url: true, natIp: true },
    });
    if (!server) throw new ForbiddenException();

    const page = clampPage(q.page, 1);
    const pageSize = clampPageSize(q.pageSize, 100, 200);
    const from = q.from ? parseOptionalDate(q.from) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = q.to ? parseOptionalDate(q.to) : new Date(new Date().setHours(23, 59, 59, 999));
    if (!from || !to) throw new BadRequestException('Invalid date range');
    if (from > to) throw new BadRequestException('Invalid date range');
    const span = (to?.getTime() || 0) - (from?.getTime() || 0);
    if (span > 93 * 24 * 60 * 60 * 1000) throw new BadRequestException('Date range cannot exceed 93 days');

    const userName = sanitizeFilter(q.userName);
    const fromIp = sanitizeFilter(q.fromIp, 45);
    const fromPort = sanitizeFilter(q.fromPort, 8);
    const gateway = sanitizeFilter(q.gateway, 80);
    const toHost = sanitizeFilter(q.toHost, 80);
    const toPort = sanitizeFilter(q.toPort, 8);
    const mac = sanitizeFilter(q.mac, 32);

    const and: Prisma.LogEventWhereInput[] = [];
    if (userName) {
      const ips = await this.ipsForUserName(serverId, userName, from, to);
      if (ips.length) {
        and.push({
          OR: [{ fromIp: { in: ips } }, { userName: { contains: userName, mode: 'insensitive' } }],
        });
      } else {
        and.push({ userName: { contains: userName, mode: 'insensitive' } });
      }
    }
    if (fromIp) and.push({ fromIp: addressLookup(fromIp) });
    if (fromPort) and.push({ fromIpPort: fromPort });
    if (gateway) and.push({ gateway: addressLookup(gateway) });
    if (toHost) and.push({ toHost: addressLookup(toHost) });
    if (toPort) and.push({ toHostPort: toPort });
    if (mac) and.push({ macAddress: { contains: mac, mode: 'insensitive' } });

    const where: Prisma.LogEventWhereInput = {
      serverId,
      receivedAt: { gte: from, lte: to },
      ...(and.length ? { AND: and } : {}),
    };

    const rows = await this.prisma.logEvent.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
    });
    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const total = (page - 1) * pageSize + pageRows.length + (hasMore ? 1 : 0);
    const wan = server.natIp || server.url;
    return { total, page, pageSize, rows: await this.hydrate(serverId, pageRows, wan) };
  }

  private async ipsForUserName(serverId: number, userName: string, from: Date, to: Date) {
    const lookback = new Date(from.getTime() - 2 * 24 * 60 * 60 * 1000);
    const live = this.sessions.ipsMatchingUser(serverId, userName);
    try {
      const ppp = await this.prisma.pppSession.findMany({
        where: {
          serverId,
          receivedAt: { gte: lookback, lte: to },
          user: { contains: userName, mode: 'insensitive' },
        },
        select: { fromIp: true },
        distinct: ['fromIp'],
        take: 40,
      });
      return [
        ...new Set(
          [...live, ...ppp.map((r) => r.fromIp)].filter(
            (ip): ip is string => !!ip && ip.trim().length > 0,
          ),
        ),
      ];
    } catch {
      return live;
    }
  }

  async stream(
    user: AuthUser,
    q: { serverId: number; afterId?: number; pageSize?: number },
  ) {
    const serverId = Number(q.serverId);
    if (!Number.isInteger(serverId) || serverId < 1) {
      throw new BadRequestException('A valid server is required');
    }
    if (!canAccessServer(user, serverId)) throw new ForbiddenException();
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, url: true, natIp: true },
    });
    if (!server) throw new ForbiddenException();

    const pageSize = clampPageSize(q.pageSize, 80, 120);
    const afterId = Number(q.afterId);
    const since = Number.isInteger(afterId) && afterId > 0 ? afterId : undefined;
    const wan = server.natIp || server.url;

    let rows = readStreamBuffer(serverId, since);
    if (!since && !rows.length) {
      rows = await this.prisma.logEvent.findMany({
        where: { serverId },
        orderBy: { receivedAt: 'desc' },
        take: pageSize,
      });
      seedStreamBuffer(serverId, rows);
    } else if (since && !streamBufferSize(serverId)) {
      rows = await this.prisma.logEvent.findMany({
        where: { serverId, id: { gt: since } },
        orderBy: { id: 'desc' },
        take: pageSize,
      });
      for (const row of [...rows].reverse()) pushStreamRow(row);
    }

    return {
      total: rows.length,
      page: 1,
      pageSize,
      rows: this.hydrateLive(serverId, rows.slice(0, pageSize), wan),
    };
  }

  private hydrateLive(serverId: number, rows: LogRow[], wanIp?: string | null) {
    return this.sessions.stitch(serverId, rows.map((r) => fillFromRaw(r)), wanIp);
  }

  private async hydrate(serverId: number, rows: LogRow[], wanIp?: string | null) {
    const parsed = rows.map((r) => fillFromRaw(r));
    const first = this.sessions.stitch(serverId, parsed, wanIp);
    const missing = first.filter((r) => !r.userName || !r.macAddress);
    if (!missing.length) return first.map((r) => applyWanNat(r, wanIp));

    const ips = [...new Set(missing.map((r) => r.fromIp).filter(Boolean))] as string[];
    const macs = [...new Set(missing.map((r) => r.macAddress).filter(Boolean))] as string[];
    const users = [...new Set(missing.map((r) => r.userName).filter(Boolean))] as string[];
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    try {
      if (ips.length || macs.length || users.length) {
        const pppHints = await this.prisma.pppSession.findMany({
          where: {
            serverId,
            receivedAt: { gte: since },
            OR: [
              ...(ips.length ? [{ fromIp: { in: ips } }] : []),
              ...(macs.length ? [{ mac: { in: macs } }] : []),
              ...(users.length ? [{ user: { in: users } }] : []),
            ],
          },
          orderBy: { receivedAt: 'desc' },
          take: 200,
          select: { fromIp: true, user: true, mac: true },
        });
        for (const h of pppHints) {
          this.sessions.remember(serverId, {
            fromIp: h.fromIp,
            userName: h.user,
            macAddress: h.mac,
          });
        }
      }
    } catch {
      /* in-memory sessions still apply */
    }

    return this.sessions.stitch(serverId, first, wanIp);
  }
}
