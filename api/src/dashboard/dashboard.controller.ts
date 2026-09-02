import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { PrismaService } from '../prisma.service';
import { currentHourly, currentReceivedToday, syslogState } from '../syslog/syslog.state';
import { HostMetricsService } from './host-metrics.service';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function last7Days(todayCount: number) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = startOfDay();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().slice(0, 10), count: i === 6 ? todayCount : 0 };
  });
}

function displayType(t: string) {
  return t === 'NAT_ACCESS' ? 'NAT+ACCESS' : t;
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard, MenusGuard)
@RequireMenus('/dashboard')
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private hostMetrics: HostMetricsService,
  ) {}

  @Get('host')
  host() {
    return this.hostMetrics.current();
  }

  @Get()
  async stats(@Req() req: { user: AuthUser }) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: { userRoles: { include: { role: true } }, userServers: true },
    });
    const isAdmin = req.user.isAdmin;
    const assigned = req.user.serverIds;
    const serverWhere: Prisma.ServerWhereInput = isAdmin ? {} : { id: { in: assigned } };
    const logWhere: Prisma.LogEventWhereInput = isAdmin ? {} : { serverId: { in: assigned } };

    const company = await this.prisma.companySetting.findFirst();

    const [activeServers, online, disabled, offline, users, activeUsers, totalLogs, routers, recent] =
      await Promise.all([
        this.prisma.server.count({ where: { ...serverWhere, disabled: false } }),
        this.prisma.server.count({ where: { ...serverWhere, disabled: false, connectivityStatus: true } }),
        this.prisma.server.count({ where: { ...serverWhere, disabled: true } }),
        this.prisma.server.count({ where: { ...serverWhere, disabled: false, connectivityStatus: false } }),
        isAdmin ? this.prisma.user.count() : Promise.resolve(0),
        isAdmin ? this.prisma.user.count({ where: { isActivated: true } }) : Promise.resolve(0),
        this.estimateLogCount(logWhere),
        this.prisma.server.findMany({
          where: serverWhere,
          orderBy: { serverName: 'asc' },
          take: 8,
          select: {
            id: true,
            serverName: true,
            url: true,
            type: true,
            disabled: true,
            connectivityStatus: true,
          },
        }),
        this.recentLogs(logWhere, isAdmin),
      ]);
    const todayLogs = currentReceivedToday();
    const hourly = currentHourly();
    const daily = last7Days(todayLogs);

    return {
      companyName: company?.companyName || 'uniqbd.com Log Server',
      greetingName: user?.firstName || user?.userName || req.user.userName,
      can: {
        users: isAdmin || req.user.menuUrls.includes('/users'),
        servers: isAdmin || req.user.menuUrls.includes('/servers'),
        search: isAdmin || req.user.menuUrls.includes('/search-log'),
        stream: isAdmin || req.user.menuUrls.includes('/log-stream'),
      },
      syslogRunning: syslogState.running,
      syslogPort: syslogState.port,
      syslogError: syslogState.lastError,
      syslogReceived: currentReceivedToday(),
      servers: activeServers,
      online,
      offline,
      disabled,
      users,
      activeUsers,
      todayLogs,
      totalLogs,
      daily,
      hourly,
      routers: routers.map((r) => ({
        id: r.id,
        serverName: r.serverName,
        url: r.url,
        type: displayType(r.type),
        disabled: r.disabled,
        online: r.connectivityStatus,
        logs: 0,
      })),
      recent: recent.map((r) => ({
        id: r.id,
        receivedAt: r.receivedAt,
        userName: r.userName,
        fromIp: r.fromIp,
        fromIpPort: r.fromIpPort,
        gateway: r.gateway,
        toHost: r.toHost,
        serverName: r.server.serverName,
      })),
    };
  }

  private async recentLogs(where: Prisma.LogEventWhereInput, isAdmin: boolean) {
    try {
      return await this.prisma.logEvent.findMany({
        where,
        orderBy: isAdmin ? { id: 'desc' } : { receivedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          receivedAt: true,
          userName: true,
          fromIp: true,
          fromIpPort: true,
          gateway: true,
          toHost: true,
          server: { select: { serverName: true } },
        },
      });
    } catch {
      return [];
    }
  }

  private async estimateLogCount(where: Prisma.LogEventWhereInput) {
    if (where.serverId) {
      return this.prisma.logEvent.count({ where });
    }
    try {
      const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COALESCE(reltuples, 0)::bigint AS n
        FROM pg_class
        WHERE relname = 'LogEvent'
      `;
      return Number(rows[0]?.n || 0);
    } catch {
      return 0;
    }
  }
}
