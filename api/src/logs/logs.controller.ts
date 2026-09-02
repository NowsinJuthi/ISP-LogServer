import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { LogsService } from './logs.service';

@Controller()
@UseGuards(JwtAuthGuard, MenusGuard)
export class LogsController {
  constructor(private logs: LogsService) {}

  @Get('search-log')
  @RequireMenus('/search-log')
  async search(
    @Req() req: { user: AuthUser },
    @Query('serverId') serverId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userName') userName?: string,
    @Query('fromIp') fromIp?: string,
    @Query('fromPort') fromPort?: string,
    @Query('gateway') gateway?: string,
    @Query('toHost') toHost?: string,
    @Query('toPort') toPort?: string,
    @Query('mac') mac?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.logs.search(req.user, {
      serverId: Number(serverId),
      from,
      to,
      userName,
      fromIp,
      fromPort,
      gateway,
      toHost,
      toPort,
      mac,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 100,
    });
  }

  @Get('log-stream')
  @RequireMenus('/log-stream')
  stream(
    @Req() req: { user: AuthUser },
    @Query('serverId') serverId: string,
    @Query('afterId') afterId?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.logs.stream(req.user, {
      serverId: Number(serverId),
      afterId: afterId ? Number(afterId) : undefined,
      pageSize: pageSize ? Number(pageSize) : 80,
    });
  }
}
