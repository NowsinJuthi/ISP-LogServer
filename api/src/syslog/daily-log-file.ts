import { Injectable, Logger } from '@nestjs/common';
import { mkdir, appendFile } from 'fs/promises';
import { join, resolve } from 'path';

const SAFE = /[^A-Za-z0-9._-]+/g;

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
}
