import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from './auth-user';
import { ADMIN_KEY, MENUS_KEY, WRITE_KEY } from './menus.decorator';

export function evaluateAccess(
  user: AuthUser | undefined,
  opts: { adminOnly?: boolean; write?: boolean; menus?: string[] },
): { ok: true } | { ok: false; reason: string } {
  if (!user) return { ok: false, reason: 'unauthenticated' };
  if (opts.adminOnly && !user.isAdmin) return { ok: false, reason: 'admin' };
  if (opts.write && user.isViewOnly) return { ok: false, reason: 'view-only' };
  if (!opts.menus?.length) return { ok: true };
  if (user.isAdmin) return { ok: true };
  if (opts.menus.some((url) => user.menuUrls.includes(url))) return { ok: true };
  return { ok: false, reason: 'menu' };
}

@Injectable()
export class MenusGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const result = evaluateAccess(req.user, {
      adminOnly: this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [ctx.getHandler(), ctx.getClass()]),
      write: this.reflector.getAllAndOverride<boolean>(WRITE_KEY, [ctx.getHandler(), ctx.getClass()]),
      menus: this.reflector.getAllAndOverride<string[]>(MENUS_KEY, [ctx.getHandler(), ctx.getClass()]),
    });
    if (result.ok) return true;
    if (result.reason === 'admin') throw new ForbiddenException('Administrator access required');
    if (result.reason === 'view-only') throw new ForbiddenException('View-only accounts cannot change data');
    if (result.reason === 'menu') throw new ForbiddenException('You do not have access to this feature');
    throw new ForbiddenException();
  }
}
