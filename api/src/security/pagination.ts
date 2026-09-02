export function clampPage(page: unknown, fallback = 1) {
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), 1_000_000);
}

export function clampPageSize(pageSize: unknown, fallback = 100, max = 200) {
  const n = Number(pageSize);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

const LOG_TZ = () => (process.env.LOG_TZ || 'Asia/Dhaka').trim() || 'Asia/Dhaka';

/** Interpret a datetime-without-offset as wall clock in LOG_TZ (Asia/Dhaka). */
export function parseOptionalDate(value?: string) {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/,
  );
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return wallClockToUtc(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4] || 0),
    Number(m[5] || 0),
    Number(m[6] || 0),
    LOG_TZ(),
  );
}

function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date | null {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const asUtcParts = (ms: number) => {
    const bag: Record<string, string> = {};
    for (const p of fmt.formatToParts(new Date(ms))) {
      if (p.type !== 'literal') bag[p.type] = p.value;
    }
    return Date.UTC(
      Number(bag.year),
      Number(bag.month) - 1,
      Number(bag.day),
      Number(bag.hour),
      Number(bag.minute),
      Number(bag.second),
    );
  };
  const shifted = utcGuess - (asUtcParts(utcGuess) - utcGuess);
  if (asUtcParts(shifted) !== utcGuess) {
    const again = shifted - (asUtcParts(shifted) - utcGuess);
    return Number.isNaN(again) ? null : new Date(again);
  }
  return Number.isNaN(shifted) ? null : new Date(shifted);
}

export function sanitizeFilter(value?: string, max = 80) {
  if (!value) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

/** Full IPv4 uses equals (index-friendly). Prefix / hostname uses startsWith, never LIKE '%x%'. */
export function addressLookup(value: string): { equals: string } | { startsWith: string } {
  const v = value.trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)) {
    return { equals: v };
  }
  return { startsWith: v };
}
