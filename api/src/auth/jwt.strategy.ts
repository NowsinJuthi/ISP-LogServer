import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { getJwtSecret } from '../config/env';
import { AuthUser, isActiveUser } from './auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.access_token || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: { sub?: number; userName?: string }): Promise<AuthUser> {
    const id = Number(payload?.sub);
    if (!Number.isInteger(id) || id < 1) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: { include: { role: { include: { roleMenus: { include: { menu: true } } } } } },
        userServers: true,
      },
    });
    if (!isActiveUser(user)) throw new UnauthorizedException();
    const roles = user.userRoles.map((r) => r.role.roleName);
    const isAdmin = roles.includes('SuperAdmin');
    return {
      id: user.id,
      userName: user.userName,
      isAdmin,
      isViewOnly: roles.includes('view-only') && !isAdmin,
      menuUrls: [...new Set(user.userRoles.flatMap((r) => r.role.roleMenus.map((rm) => rm.menu.url)))],
      serverIds: user.userServers.map((s) => s.serverId),
    };
  }
}
