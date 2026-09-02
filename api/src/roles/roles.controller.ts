import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus, RequireWrite } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { PrismaService } from '../prisma.service';

class RoleDto {
  @IsString()
  @MaxLength(80)
  roleName: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

class SetMenusDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  menuIds: number[];
}

@Controller('roles')
@UseGuards(JwtAuthGuard, MenusGuard)
export class RolesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  @RequireMenus('/roles', '/users')
  list() {
    return this.prisma.role.findMany({
      include: {
        roleMenus: true,
        _count: { select: { userRoles: true, roleMenus: true } },
      },
      orderBy: { roleName: 'asc' },
    });
  }

  @Post()
  @RequireMenus('/roles')
  @RequireWrite()
  async create(@Body() body: RoleDto, @Req() req: { user: AuthUser }) {
    const roleName = body.roleName.trim();
    if (!roleName) throw new BadRequestException('Role name is required');
    if (roleName.toLowerCase() === 'superadmin') {
      throw new BadRequestException('The SuperAdmin role already exists');
    }
    const exists = await this.prisma.role.findUnique({ where: { roleName } });
    if (exists) throw new ConflictException('A role with this name already exists');
    const row = await this.prisma.role.create({
      data: { roleName, description: body.description?.trim() || null },
    });
    void this.audit.write({
      actor: req.user,
      type: 'CREATE',
      tableName: 'Role',
      message: `Created role ${roleName}`,
    });
    return row;
  }

  @Put(':id')
  @RequireMenus('/roles')
  @RequireWrite()
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RoleDto,
    @Req() req: { user: AuthUser },
  ) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    const roleName = body.roleName.trim();
    if (!roleName) throw new BadRequestException('Role name is required');
    if (role.roleName === 'SuperAdmin' && roleName !== 'SuperAdmin') {
      throw new BadRequestException('SuperAdmin cannot be renamed');
    }
    if (role.roleName !== 'SuperAdmin' && roleName.toLowerCase() === 'superadmin') {
      throw new BadRequestException('Cannot rename a role to SuperAdmin');
    }
    const clash = await this.prisma.role.findFirst({
      where: { roleName, NOT: { id } },
    });
    if (clash) throw new ConflictException('A role with this name already exists');
    const row = await this.prisma.role.update({
      where: { id },
      data: { roleName, description: body.description?.trim() || null },
    });
    void this.audit.write({
      actor: req.user,
      type: 'UPDATE',
      tableName: 'Role',
      message: `Updated role ${roleName}`,
    });
    return row;
  }

  @Delete(':id')
  @RequireMenus('/roles')
  @RequireWrite()
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthUser }) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.roleName === 'SuperAdmin') {
      throw new BadRequestException('SuperAdmin cannot be deleted');
    }
    await this.prisma.role.delete({ where: { id } });
    void this.audit.write({
      actor: req.user,
      type: 'DELETE',
      tableName: 'Role',
      message: `Deleted role ${role.roleName}`,
    });
    return { ok: true };
  }

  @Post(':id/menus')
  @RequireMenus('/roles')
  @RequireWrite()
  async setMenus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetMenusDto,
    @Req() req: { user: AuthUser },
  ) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    const unique = [...new Set((body.menuIds || []).filter((n) => Number.isInteger(n) && n > 0))];
    if (unique.length) {
      const found = await this.prisma.menu.count({ where: { id: { in: unique } } });
      if (found !== unique.length) throw new BadRequestException('One or more menus were not found');
    }
    await this.prisma.$transaction([
      this.prisma.roleMenu.deleteMany({ where: { roleId: id } }),
      ...(unique.length
        ? [this.prisma.roleMenu.createMany({ data: unique.map((menuId) => ({ roleId: id, menuId })) })]
        : []),
    ]);
    void this.audit.write({
      actor: req.user,
      type: 'ASSIGN',
      tableName: 'Role',
      message: `Updated menus for ${role.roleName} (${unique.length} menus)`,
    });
    return { ok: true };
  }
}
