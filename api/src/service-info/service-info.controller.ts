import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { PrismaService } from '../prisma.service';
import { currentReceivedToday, syslogState } from '../syslog/syslog.state';

@Controller('service-info')
@UseGuards(JwtAuthGuard, MenusGuard)
@RequireMenus('/service-info')
export class ServiceInfoController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async status(@Req() req: { user: AuthUser }) {
    const scoped = req.user.isAdmin ? {} : { id: { in: req.user.serverIds } };
    const logScoped = req.user.isAdmin ? {} : { serverId: { in: req.user.serverIds } };
    const [company, servers, online, disabled, users, totalLogs] = await Promise.all([
      this.prisma.companySetting.findFirst(),
      this.prisma.server.count({ where: scoped }),
      this.prisma.server.count({ where: { ...scoped, disabled: false, connectivityStatus: true } }),
      this.prisma.server.count({ where: { ...scoped, disabled: true } }),
      req.user.isAdmin ? this.prisma.user.count() : Promise.resolve(0),
      this.estimateLogCount(logScoped),
    ]);
    const todayLogs = currentReceivedToday();

    return {
      product: {
        name: company?.companyName || 'uniqbd.com Log Server',
        website: 'https://uniqbd.com',
        operator: 'Sohel',
        version: '3.8',
        year: 2026,
      },
      company: {
        companyName: 'UniQbd',
      },
      syslog: {
        name: 'Syslog listener',
        running: syslogState.running,
        port: syslogState.port,
        lastError: syslogState.lastError,
        received: currentReceivedToday(),
      },
      mikrotikApi: { name: 'MikroTik RouterOS API', running: true },
      stats: { servers, online, disabled, users, todayLogs, totalLogs },
      stack: [
        { name: 'TypeScript', version: '5.8', role: 'Language for the website and API' },
        { name: 'Next.js', version: '16.3.3', role: 'Website (App Router, Turbopack)' },
        { name: 'React', version: '19.2.8', role: 'Website UI' },
        { name: 'Tailwind CSS', version: '3.4.17', role: 'Website styling' },
        { name: 'NestJS', version: '11.1.3', role: 'Backend API' },
        { name: 'Prisma', version: '6.10.1', role: 'Database ORM' },
        { name: 'PostgreSQL', version: '16', role: 'Primary database' },
        { name: 'Node.js', version: process.version.replace(/^v/, ''), role: 'Runtime' },
      ],
    };
  }

  private async estimateLogCount(where: { serverId?: { in: number[] } }) {
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
