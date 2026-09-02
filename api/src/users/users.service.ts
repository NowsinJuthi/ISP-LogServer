import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, canAssignRouters } from '../auth/auth-user';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

const userSelect = {
  id: true,
  userName: true,
  email: true,
  firstName: true,
  lastName: true,
  isActivated: true,
  createdAt: true,
  userRoles: { include: { role: true } },
  _count: { select: { userServers: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: { userName: 'asc' },
      select: userSelect,
    });
  }

  private getOne(id: number) {
    return this.prisma.user.findUnique({ where: { id }, select: userSelect });
  }

  private async superAdminCount(exceptUserId?: number) {
    return this.prisma.userRole.count({
      where: {
        role: { roleName: 'SuperAdmin' },
        ...(exceptUserId ? { userId: { not: exceptUserId } } : {}),
      },
    });
  }

  private isSuper(user: { userRoles: { role: { roleName: string } }[] }) {
    return user.userRoles.some((r) => r.role.roleName === 'SuperAdmin');
  }

  async create(
    data: {
      userName: string;
      password: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      roleId?: number;
    },
    actorIsAdmin: boolean,
  ) {
    const userName = data.userName.trim();
    if (!userName) throw new BadRequestException('Username is required');
    if (data.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const exists = await this.prisma.user.findUnique({ where: { userName } });
    if (exists) throw new BadRequestException('Username already exists');
    if (data.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: data.roleId } });
      if (!role) throw new BadRequestException('Role not found');
      if (role.roleName === 'SuperAdmin' && !actorIsAdmin) {
        throw new BadRequestException('Only a SuperAdmin can assign the SuperAdmin role');
      }
    }
    const user = await this.prisma.user.create({
      data: {
        userName,
        password: await bcrypt.hash(data.password, 10),
        email: data.email?.trim() || null,
        firstName: data.firstName?.trim() || null,
        lastName: data.lastName?.trim() || null,
      },
    });
    if (data.roleId) {
      await this.prisma.userRole.create({ data: { userId: user.id, roleId: data.roleId } });
    }
    return this.getOne(user.id);
  }

  async update(
    id: number,
    data: {
      email?: string;
      firstName?: string;
      lastName?: string;
      password?: string;
      isActivated?: boolean;
      roleId?: number;
    },
    actorId: number,
    actorIsAdmin: boolean,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    if (data.isActivated === false) {
      if (id === actorId) throw new BadRequestException('You cannot deactivate your own account');
      if (this.isSuper(user) && (await this.superAdminCount(id)) === 0) {
        throw new BadRequestException('Cannot deactivate the last SuperAdmin');
      }
    }

    if (data.password && data.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    if (data.roleId) {
      if (id === actorId) throw new BadRequestException('You cannot change your own role');
      const role = await this.prisma.role.findUnique({ where: { id: data.roleId } });
      if (!role) throw new BadRequestException('Role not found');
      if (role.roleName === 'SuperAdmin' && !actorIsAdmin) {
        throw new BadRequestException('Only a SuperAdmin can assign the SuperAdmin role');
      }
      const leavingSuper = this.isSuper(user) && role.roleName !== 'SuperAdmin';
      if (leavingSuper && (await this.superAdminCount(id)) === 0) {
        throw new BadRequestException('Cannot remove SuperAdmin from the last SuperAdmin');
      }
      await this.prisma.$transaction([
        this.prisma.userRole.deleteMany({ where: { userId: id } }),
        this.prisma.userRole.create({ data: { userId: id, roleId: data.roleId } }),
      ]);
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        email: data.email !== undefined ? data.email.trim() || null : undefined,
        firstName: data.firstName !== undefined ? data.firstName.trim() || null : undefined,
        lastName: data.lastName !== undefined ? data.lastName.trim() || null : undefined,
        isActivated: data.isActivated,
        password: data.password ? await bcrypt.hash(data.password, 10) : undefined,
      },
    });
    return this.getOne(id);
  }

  async remove(id: number, actorId: number) {
    if (id === actorId) throw new BadRequestException('You cannot delete your own account');
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.userName === 'sohelonlineit') throw new BadRequestException('The sohelonlineit account cannot be deleted');
    if (this.isSuper(user) && (await this.superAdminCount(id)) === 0) {
      throw new BadRequestException('Cannot delete the last SuperAdmin');
    }
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  async setRole(userId: number, roleId: number, actorId: number, actorIsAdmin: boolean) {
    if (userId === actorId) throw new BadRequestException('You cannot change your own role');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException('Role not found');
    if (role.roleName === 'SuperAdmin' && !actorIsAdmin) {
      throw new BadRequestException('Only a SuperAdmin can assign the SuperAdmin role');
    }
    if (this.isSuper(user) && role.roleName !== 'SuperAdmin' && (await this.superAdminCount(userId)) === 0) {
      throw new BadRequestException('Cannot remove SuperAdmin from the last SuperAdmin');
    }
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      this.prisma.userRole.create({ data: { userId, roleId } }),
    ]);
    return this.getOne(userId);
  }

  async setServers(userId: number, serverIds: number[], actor: AuthUser) {
    if (!canAssignRouters(actor)) throw new ForbiddenException('You cannot change router assignments');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const unique = [...new Set(serverIds.filter((id) => Number.isInteger(id)))];
    if (unique.length) {
      const found = await this.prisma.server.count({ where: { id: { in: unique } } });
      if (found !== unique.length) throw new BadRequestException('One or more routers were not found');
    }
    await this.prisma.userServer.deleteMany({ where: { userId } });
    if (unique.length) {
      await this.prisma.userServer.createMany({
        data: unique.map((serverId) => ({ userId, serverId })),
      });
    }
    return { ok: true, serverIds: unique };
  }

  userServers() {
    return this.prisma.userServer.findMany({
      include: {
        user: {
          select: {
            id: true,
            userName: true,
            firstName: true,
            lastName: true,
            isActivated: true,
          },
        },
        server: {
          select: { id: true, serverName: true, url: true, disabled: true, connectivityStatus: true },
        },
      },
      orderBy: { userId: 'asc' },
    });
  }
}
