import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';

const WEAK_PASSWORDS = new Set(['Admin@12345', 'admin', 'password', '12345678', 'changeme']);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  async login(userName: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { userName },
      include: {
        userRoles: { include: { role: { include: { roleMenus: { include: { menu: true } } } } } },
      },
    });
    if (!user || !user.isActivated) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const token = await this.jwt.signAsync({ sub: user.id, userName: user.userName });
    const isAdmin = user.userRoles.some((r) => r.role.roleName === 'SuperAdmin');
    const [allMenus, company] = await Promise.all([
      isAdmin ? this.prisma.menu.findMany() : Promise.resolve([]),
      this.prisma.companySetting.findFirst(),
    ]);
    void this.audit.write({
      actor: { id: user.id, userName: user.userName },
      type: 'LOGIN',
      tableName: 'Auth',
      message: `${user.userName} signed in`,
    });
    return { token, profile: this.toProfile(user, allMenus, company?.companyName) };
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const current = String(currentPassword || '');
    const next = String(newPassword || '');
    if (next.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    if (next.length > 200) throw new BadRequestException('Password is too long');
    if (WEAK_PASSWORDS.has(next)) throw new BadRequestException('Choose a stronger password');
    if (next === current) throw new BadRequestException('New password must be different from the current password');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActivated) throw new UnauthorizedException();
    const matches = await bcrypt.compare(current, user.password);
    if (!matches) throw new BadRequestException('Current password is incorrect');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(next, 10) },
    });
    void this.audit.write({
      actor: { id: user.id, userName: user.userName },
      type: 'PASSWORD_CHANGE',
      tableName: 'Auth',
      message: `${user.userName} changed their password`,
    });
    return { ok: true };
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: { include: { roleMenus: { include: { menu: true } } } } } },
        userServers: true,
      },
    });
    if (!user || !user.isActivated) throw new UnauthorizedException();
    const isAdmin = user.userRoles.some((r) => r.role.roleName === 'SuperAdmin');
    const [allMenus, company] = await Promise.all([
      isAdmin ? this.prisma.menu.findMany() : Promise.resolve([]),
      this.prisma.companySetting.findFirst(),
    ]);
    return this.toProfile(user, allMenus, company?.companyName);
  }

  private toProfile(user: {
    id: number;
    userName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    userRoles: Array<{
      role: {
        roleName: string;
        roleMenus: Array<{ menu: { id: number; menuName: string; url: string; position: number } }>;
      };
    }>;
    userServers?: Array<{ serverId: number }>;
  },
    allMenus: Array<{ id: number; menuName: string; url: string; position: number }> = [],
    companyName?: string | null,
  ) {
    const roles = user.userRoles.map((r) => r.role.roleName);
    const isAdmin = roles.includes('SuperAdmin');
    const fromRole = user.userRoles.flatMap((r) => r.role.roleMenus.map((rm) => rm.menu));
    const hidden = new Set(['/menus', '/faq']);
    const menus = (isAdmin && allMenus.length ? allMenus : fromRole)
      .filter((m) => !hidden.has(m.url))
      .sort((a, b) => a.position - b.position)
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
    return {
      id: user.id,
      userName: user.userName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      companyName: companyName || 'uniqbd.com Log Server',
      roles,
      menus,
      serverIds: user.userServers?.map((s) => s.serverId) ?? [],
    };
  }
}
