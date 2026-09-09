import { Injectable, Logger } from '@nestjs/common';
import { mkdir, appendFile, readdir, rm } from 'fs/promises';
import { join, resolve } from 'path';

const SAFE = /[^A-Za-z0-9._-]+/g;
const DAY_FOLDER = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class DailyLogFileWriter {
  private readonly log = new Logger(DailyLogFileWriter.name);
  private readonly root: string;
  private readonly tz: string;
  private readonly made = new Set<string>();

  constructor() {
    this.root = resolve(process.env.LOG_FILE_DIR || join(process.cwd(), 'data', 'logs'));
    this.tz = (process.env.LOG_TZ || 'Asia/Dhaka').trim() || 'Asia/Dhaka';
  }

  dayKey(at = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  }

  stamp(at = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(at);
    const g = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value || '00';
    return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
  }

  /** Duplicate disk copies of syslog. Off by default — Search Log reads PostgreSQL. */
  filesEnabled(): boolean {
    const raw = (process.env.LOG_FILE_ENABLE || '').trim().toLowerCase();
    return raw === 'true' || raw === '1';
  }

  fileName(serverName: string, kind: 'NAT' | 'PPP'): string {
    const base = (serverName || 'server').replace(SAFE, '_').replace(/^_+|_+$/g, '') || 'server';
    return kind === 'PPP' ? `${base}-ppp.log` : `${base}.log`;
  }

  async write(input: {
    at?: Date;
    serverName: string;
    kind: 'NAT' | 'PPP';
    fromHost: string;
    raw: string;
    user?: string | null;
    fromIp?: string | null;
  }) {
    if (!this.filesEnabled()) return;
    const at = input.at || new Date();
    const day = this.dayKey(at);
    const dir = join(this.root, day);
    try {
      if (!this.made.has(dir)) {
        await mkdir(dir, { recursive: true });
        this.made.add(dir);
      }
      const line = [
        this.stamp(at),
        input.kind,
        input.serverName,
        input.fromHost,
        input.user ? `user=${input.user}` : '-',
        input.fromIp ? `ip=${input.fromIp}` : '-',
        (input.raw || '').replace(/\s+/g, ' ').trim().slice(0, 2000),
      ].join(' | ');
      await appendFile(join(dir, this.fileName(input.serverName, input.kind)), `${line}\n`, 'utf8');
    } catch (e) {
      this.log.warn(`Daily log file write failed: ${(e as Error).message}`);
    }
  }

  /**
   * Remove YYYY-MM-DD folders under the log directory.
   * When disk copies are disabled, all date folders go (Search does not use them).
   * When enabled, folders older than cutoffDay (inclusive bound is cutoffDay itself kept) are removed.
   * Never touches amarpin-license-cache.json or other non-date files.
   */
  async purgeDateFolders(cutoffDay?: string) {
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch {
      return 0;
    }
    const keepFrom = cutoffDay && this.filesEnabled() ? cutoffDay : null;
    let removed = 0;
    for (const name of names) {
      if (!DAY_FOLDER.test(name)) continue;
      if (keepFrom && name >= keepFrom) continue;
      try {
        await rm(join(this.root, name), { recursive: true, force: true });
        this.made.delete(join(this.root, name));
        removed += 1;
      } catch (e) {
        this.log.warn(`Could not delete log folder ${name}: ${(e as Error).message}`);
      }
    }
    if (removed) {
      this.log.log(
        keepFrom
          ? `Removed ${removed} daily log folder(s) older than ${keepFrom}`
          : `Removed ${removed} unused daily log folder(s); Search Log uses the database`,
      );
    }
    return removed;
  }
}
