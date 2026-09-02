type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 2000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export function loginKey(ip: string, userName: string) {
  return `${ip}|${userName.trim().toLowerCase()}`;
}

export function assertLoginAllowed(key: string) {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return;
  if (bucket.count >= MAX_ATTEMPTS) {
    const wait = Math.ceil((bucket.resetAt - now) / 60000);
    const err = new Error(`Too many login attempts. Try again in ${wait} minute${wait === 1 ? '' : 's'}.`);
    (err as Error & { status: number }).status = 429;
    throw err;
  }
}

export function recordLoginFailure(key: string) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

export function clearLoginFailures(key: string) {
  buckets.delete(key);
}

export function resetLoginThrottleForTests() {
  buckets.clear();
}
