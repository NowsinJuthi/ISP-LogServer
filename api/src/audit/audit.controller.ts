import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { AuditService } from './audit.service';
import { clampPage, clampPageSize, sanitizeFilter } from '../security/pagination';

@Controller('activity-logs')
@UseGuards(JwtAuthGuard, MenusGuard)
@RequireMenus('/activity-logs')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.list({
      search: sanitizeFilter(q, 80),
      type: sanitizeFilter(type, 32) || undefined,
      page: clampPage(page, 1),
      pageSize: clampPageSize(pageSize, 25, 100),
    });
  }
}
