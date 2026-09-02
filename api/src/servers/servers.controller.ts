import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus, RequireWrite } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { LicenseService } from '../license/license.service';
import { RETENTION_VALUES, retentionRequiresLicense } from './retention';
import { ServersService } from './servers.service';

class ServerDto {
  @IsString()
  @MaxLength(120)
  serverName: string;

  @IsString()
  @MaxLength(253)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  userName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  port?: string;

  @IsIn(['NAT+ACCESS', 'NAT', 'ACCESS', 'RAW'])
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  natIp?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  listeningPort?: number;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  logServerUrl?: string;

  @IsIn([...RETENTION_VALUES])
  retention: string;
}

@Controller('servers')
@UseGuards(JwtAuthGuard, MenusGuard)
export class ServersController {
  constructor(
    private servers: ServersService,
    private audit: AuditService,
    private license: LicenseService,
  ) {}

  private async assertRetentionLicensed(retention: string) {
    if (!retentionRequiresLicense(retention)) return;
    if (!(await this.license.assertRetentionAllowed())) {
      throw new ForbiddenException(this.license.retentionLockMessage());
    }
  }

  private async assertCanAddServer() {
    if (await this.license.assertRetentionAllowed()) return;
    const count = await this.servers.countAll();
    if (count >= 1) {
      throw new ForbiddenException(this.license.routerLimitMessage());
    }
  }

  @Get()
  @RequireMenus('/servers', '/search-log', '/log-stream', '/dashboard', '/user-servers')
  list(
    @Req() req: { user: AuthUser },
    @Query('disabled') disabled?: string,
    @Query('all') all?: string,
  ) {
    const filter = all === '1' ? 'all' : disabled === '1' ? 'disabled' : 'active';
    return this.servers.list(req.user, filter);
  }

  @Get(':id')
  @RequireMenus('/servers', '/search-log', '/log-stream', '/user-servers')
  get(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthUser }) {
    return this.servers.get(id, req.user);
  }

  @Get(':id/connected-count')
  @RequireMenus('/servers', '/search-log', '/log-stream')
  connected(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthUser }) {
    return this.servers.connectedCount(id, req.user);
  }

  @Post()
  @RequireMenus('/servers')
  @RequireWrite()
  async create(@Body() body: ServerDto, @Req() req: { user: AuthUser }) {
    await this.assertCanAddServer();
    await this.assertRetentionLicensed(body.retention);
    const row = await this.servers.create(body);
    void this.audit.write({
      actor: req.user,
      type: 'CREATE',
      tableName: 'Server',
      message: `Added MikroTik ${body.serverName} (${body.url})`,
    });
    return row;
  }

  @Put(':id')
  @RequireMenus('/servers')
  @RequireWrite()
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ServerDto,
    @Req() req: { user: AuthUser },
  ) {
    await this.assertRetentionLicensed(body.retention);
    const row = await this.servers.update(id, body, req.user);
    void this.audit.write({
      actor: req.user,
      type: 'UPDATE',
      tableName: 'Server',
      message: `Updated MikroTik ${body.serverName}`,
    });
    return row;
  }

  @Post(':id/toggle')
  @RequireMenus('/servers')
  @RequireWrite()
  async toggle(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthUser }) {
    const row = await this.servers.toggle(id, req.user);
    void this.audit.write({
      actor: req.user,
      type: 'UPDATE',
      tableName: 'Server',
      message: `${row.disabled ? 'Disabled' : 'Enabled'} MikroTik ${row.serverName}`,
    });
    return row;
  }

  @Delete(':id')
  @RequireMenus('/servers')
  @RequireWrite()
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthUser }) {
    await this.servers.remove(id, req.user);
    void this.audit.write({
      actor: req.user,
      type: 'DELETE',
      tableName: 'Server',
      message: `Deleted MikroTik #${id}`,
    });
    return { ok: true };
  }
}
