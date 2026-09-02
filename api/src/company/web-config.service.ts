import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { invalidateMikrotikPortsCache } from './mikrotik-ports';
import { ServerType } from '@prisma/client';
import {
  readCompanySnapshot,
  readServersSnapshot,
  snapshotToPrisma,
  webConfigDir,
  writeCompanySnapshot,
  writeServersSnapshot,
} from './web-config.store';
import { parseRetention } from '../servers/retention';

@Injectable()
export class WebConfigService implements OnModuleInit {
  private readonly log = new Logger(WebConfigService.name);
  private restorePromise?: Promise<void>;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureRestored();
  }

  async ensureRestored() {
    if (!this.restorePromise) {
      this.restorePromise = this.restoreFromDisk();
    }
    return this.restorePromise;
  }

  persistFromRow(row: Parameters<typeof writeCompanySnapshot>[0]) {
    try {
      writeCompanySnapshot(row);
    } catch (err) {
      this.log.warn(`Could not write web config: ${(err as Error).message}`);
    }
  }

  async persistCurrent() {
    const row = await this.prisma.companySetting.findFirst();
    if (row) this.persistFromRow(row);
    await this.persistServers();
  }

  async persistServers() {
    try {
      const rows = await this.prisma.server.findMany({ orderBy: { id: 'asc' } });
      writeServersSnapshot(rows);
    } catch (err) {
      this.log.warn(`Could not write servers config: ${(err as Error).message}`);
    }
  }

  private async restoreFromDisk() {
    await this.restoreCompany();
    await this.restoreServers();
    this.log.log(`Web config folder: ${webConfigDir()}`);
  }

  private async restoreCompany() {
    const file = readCompanySnapshot();
    if (!file) {
      const row = await this.prisma.companySetting.findFirst();
      if (row) this.persistFromRow(row);
      return;
    }
    const data = snapshotToPrisma(file);
    const row = await this.prisma.companySetting.findFirst();
    if (row) {
      await this.prisma.companySetting.update({ where: { id: row.id }, data });
    } else {
      await this.prisma.companySetting.create({ data });
    }
    invalidateMikrotikPortsCache();
    this.log.log('Restored company / SMTP / SMS / license config from disk');
  }

  private async restoreServers() {
    const file = readServersSnapshot();
    if (!file?.length) {
      await this.persistServers();
      return;
    }
    const existing = await this.prisma.server.findMany({ select: { url: true } });
    const known = new Set(existing.map((s) => s.url));
    let added = 0;
    for (const row of file) {
      const url = (row.url || '').trim();
      if (!url || known.has(url)) continue;
      const type = (Object.values(ServerType) as string[]).includes(String(row.type))
        ? (row.type as ServerType)
        : ServerType.NAT_ACCESS;
      const retention = parseRetention(row.retention);
      await this.prisma.server.create({
        data: {
          serverName: (row.serverName || url).slice(0, 120),
          url,
          logServerUrl: (row.logServerUrl || 'localhost').slice(0, 253),
          userName: row.userName || null,
          password: row.password || null,
          port: row.port || null,
          type,
          type1: row.type1 || null,
          natIp: row.natIp || url,
          natRouterId: row.natRouterId || null,
          listeningPort: Number(row.listeningPort || 514),
          retention,
          disabled: !!row.disabled,
          connectivityStatus: false,
        },
      });
      known.add(url);
      added += 1;
    }
    if (added) this.log.log(`Restored ${added} MikroTik server(s) from disk`);
    await this.persistServers();
  }
}
