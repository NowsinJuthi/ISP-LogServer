const WEAK = new Set(['Admin@12345', 'admin', 'password', '12345678', 'changeme']);

export function requireSeedAdminPassword(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.SEED_ADMIN_PASSWORD || '').trim();
  if (!raw) {
    throw new Error('SEED_ADMIN_PASSWORD is required to create the first admin. Set it in api/.env.');
  }
  if (WEAK.has(raw) || raw.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD is too weak. Use at least 8 characters and do not use a known default.');
  }
  return raw;
}

export function seedAdminUserName(env: NodeJS.ProcessEnv = process.env): string {
  const name = (env.SEED_ADMIN_USERNAME || 'sohelonlineit').trim();
  if (!name) throw new Error('SEED_ADMIN_USERNAME cannot be empty.');
  return name;
}
