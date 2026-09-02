import { assertLicenseEnv } from '../license/license.env';

export function getJwtSecret(): string {
  const secret = (process.env.JWT_SECRET || '').trim();
  const production = process.env.NODE_ENV === 'production';
  const min = production ? 32 : 16;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is required. Set a long random value in api/.env (at least 16 characters, 32 in production).',
    );
  }
  if (secret === 'dev-secret-change-me' || secret === 'change-this-to-a-long-random-string') {
    throw new Error('JWT_SECRET is using an insecure default. Generate a new random secret.');
  }
  if (secret.length < min) {
    throw new Error(`JWT_SECRET must be at least ${min} characters.`);
  }
  return secret;
}

export function getJwtExpiresIn(): string {
  return (process.env.JWT_EXPIRES_IN || '7d').trim() || '7d';
}

export function parseDurationMs(input: string): number {
  const raw = (input || '7d').trim();
  const m = raw.match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  const mult: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (mult[unit] || 1000);
}

export function getWebOrigins(): string[] {
  const raw = process.env.WEB_ORIGIN || 'http://localhost:3000';
  const listed = raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const extra: string[] = [];
  for (const o of listed) {
    extra.push(o);
    if (o.includes('localhost')) extra.push(o.replace('localhost', '127.0.0.1'));
    if (o.includes('127.0.0.1')) extra.push(o.replace('127.0.0.1', 'localhost'));
  }
  return [...new Set(extra)];
}

export function getWebOrigin(): string {
  return getWebOrigins()[0];
}

export function cookieSecure(): boolean {
  const raw = (process.env.COOKIE_SECURE || '').trim().toLowerCase();
  if (raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  const origin = (process.env.WEB_ORIGIN || '').split(',')[0].trim();
  if (origin.startsWith('http://')) return false;
  return process.env.NODE_ENV === 'production';
}

export function authCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: cookieSecure(),
    path: '/',
    maxAge: parseDurationMs(getJwtExpiresIn()),
  };
}

export function assertRequiredEnv() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required.');
  }
  getJwtSecret();
  assertLicenseEnv();
}
