import { RetentionPeriod } from '@prisma/client';

export const RETENTION_VALUES = ['ONE_MONTH', 'THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR'] as const;

export function parseRetention(raw: string | undefined | null): RetentionPeriod {
  if (raw === 'ONE_MONTH') return RetentionPeriod.ONE_MONTH;
  if (raw === 'THREE_MONTHS') return RetentionPeriod.THREE_MONTHS;
  if (raw === 'ONE_YEAR') return RetentionPeriod.ONE_YEAR;
  return RetentionPeriod.SIX_MONTHS;
}

export function retentionRequiresLicense(raw: string | undefined | null): boolean {
  return raw === 'THREE_MONTHS' || raw === 'SIX_MONTHS' || raw === 'ONE_YEAR';
}

export function retentionMonths(period: RetentionPeriod): number {
  if (period === RetentionPeriod.ONE_MONTH) return 1;
  if (period === RetentionPeriod.THREE_MONTHS) return 3;
  if (period === RetentionPeriod.ONE_YEAR) return 12;
  return 6;
}
