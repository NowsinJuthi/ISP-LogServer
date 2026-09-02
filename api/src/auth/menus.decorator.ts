import { SetMetadata } from '@nestjs/common';

export const MENUS_KEY = 'requiredMenus';
export const WRITE_KEY = 'requireWrite';
export const ADMIN_KEY = 'requireAdmin';

export const RequireMenus = (...urls: string[]) => SetMetadata(MENUS_KEY, urls);
export const RequireWrite = () => SetMetadata(WRITE_KEY, true);
export const RequireAdmin = () => SetMetadata(ADMIN_KEY, true);
