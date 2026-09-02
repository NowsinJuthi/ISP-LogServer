export type AuthUser = {
  id: number;
  userName: string;
  isAdmin: boolean;
  isViewOnly: boolean;
  menuUrls: string[];
  serverIds: number[];
};

export function canAccessServer(user: AuthUser, serverId: number) {
  if (user.isAdmin) return true;
  return user.serverIds.includes(serverId);
}

export function canManageRoles(user: AuthUser) {
  if (user.isAdmin) return true;
  return !user.isViewOnly && user.menuUrls.includes('/roles');
}

export function canAssignRouters(user: AuthUser) {
  if (user.isAdmin) return true;
  return !user.isViewOnly && user.menuUrls.includes('/user-servers');
}

export function isActiveUser<T extends { isActivated: boolean }>(
  user: T | null | undefined,
): user is T & { isActivated: true } {
  return Boolean(user?.isActivated);
}
