import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus, RequireWrite } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { UsersService } from './users.service';

class UserDto {
  @IsString()
  @MaxLength(80)
  userName: string;
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roleId?: number;
}

class UserUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;
  @IsOptional()
  @IsBoolean()
  isActivated?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roleId?: number;
}

class SetRoleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roleId: number;
}

class SetServersDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  serverIds: number[];
}

@Controller()
@UseGuards(JwtAuthGuard, MenusGuard)
export class UsersController {
  constructor(
    private users: UsersService,
    private audit: AuditService,
  ) {}

  @Get('users')
  @RequireMenus('/users', '/user-servers')
  list() {
    return this.users.list();
  }

  @Post('users')
  @RequireMenus('/users')
  @RequireWrite()
  async create(@Body() body: UserDto, @Req() req: { user: AuthUser }) {
    const row = await this.users.create(body, req.user.isAdmin);
    void this.audit.write({
      actor: req.user,
      type: 'CREATE',
      tableName: 'User',
      message: `Created user ${row?.userName || body.userName}`,
    });
    return row;
  }

  @Put('users/:id')
  @RequireMenus('/users')
  @RequireWrite()
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UserUpdateDto,
    @Req() req: { user: AuthUser },
  ) {
    const row = await this.users.update(id, body, req.user.id, req.user.isAdmin);
    void this.audit.write({
      actor: req.user,
      type: 'UPDATE',
      tableName: 'User',
      message: `Updated user ${row?.userName || id}`,
    });
    return row;
  }

  @Delete('users/:id')
  @RequireMenus('/users')
  @RequireWrite()
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthUser }) {
    await this.users.remove(id, req.user.id);
    void this.audit.write({
      actor: req.user,
      type: 'DELETE',
      tableName: 'User',
      message: `Deleted user #${id}`,
    });
    return { ok: true };
  }

  @Post('users/:id/role')
  @RequireMenus('/users')
  @RequireWrite()
  async setRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetRoleDto,
    @Req() req: { user: AuthUser },
  ) {
    const row = await this.users.setRole(id, body.roleId, req.user.id, req.user.isAdmin);
    void this.audit.write({
      actor: req.user,
      type: 'ASSIGN',
      tableName: 'User',
      message: `Changed role for ${row?.userName || id}`,
    });
    return row;
  }

  @Post('users/:id/servers')
  @RequireMenus('/user-servers')
  @RequireWrite()
  async setServers(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetServersDto,
    @Req() req: { user: AuthUser },
  ) {
    const result = await this.users.setServers(id, body.serverIds ?? [], req.user);
    void this.audit.write({
      actor: req.user,
      type: 'ASSIGN',
      tableName: 'UserServer',
      message: `Updated router access for user #${id} (${(body.serverIds ?? []).length} routers)`,
    });
    return result;
  }

  @Get('user-servers')
  @RequireMenus('/user-servers')
  userServers() {
    return this.users.userServers();
  }
}
