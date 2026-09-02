import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createRequire } from 'module';
import { hostname } from 'os';
import { join } from 'path';
import { PrismaService } from '../prisma.service';
import { WebConfigService } from '../company/web-config.service';
import type { AmarpinLicense, AmarpinLicenseResult } from './amarpin-license';
import { LICENSE_VENDOR, RETENTION_LICENSE_MESSAGE, ROUTER_LICENSE_MESSAGE } from './license.env';

const requireJs = createRequire(__filename);
const { AmarpinLicense: AmarpinLicenseClient } = requireJs(join(__dirname, 'amarpin-license.js')) as {
  AmarpinLicense: new (options: Record<string, unknown>) => AmarpinLicense;
};

function isUnreachable(code?: string, message?: string, err?: unknown) {
  const errObj = err as { code?: string; message?: string } | undefined;
  const blob = [code, message, errObj?.code, errObj?.message].filter(Boolean).join(' ');
  return /TRANSPORT_ERROR|timed out|TIMEOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|certificate|UNABLE_TO_VERIFY/i.test(
    blob,
  );
}

function maskKey(key: string) {
  const raw = key.trim();
  if (raw.length < 8) {
    return raw ? '••••' : '';
  }
  return `${raw.slice(0, 4)}••••${raw.slice(-4)}`;
}

/** How often this server asks Amarpin if the key is still active. */
const AMARPIN_REFRESH_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly log = new Logger(LicenseService.name);
  private client: AmarpinLicense | null = null;
  private allowed = false;
  private lastCode = '';
  private lastMessage = '';
  private storedKey = '';
  private lastRefreshAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(
    private prisma: PrismaService,
    private webConfig: WebConfigService,
  ) {}

  isAllowed(): boolean {
    return this.allowed;
  }

  searchUnlocked(): boolean {
    return this.allowed;
  }

  retentionLockMessage(): string {
    return RETENTION_LICENSE_MESSAGE;
  }

  routerLimitMessage(): string {
    return ROUTER_LICENSE_MESSAGE;
  }

  /** Instant snapshot. Never waits on Amarpin — licensed features stay snappy. */
  status() {
    void this.refreshIfStale(AMARPIN_REFRESH_MS);
    return this.snapshot();
  }

  private snapshot() {
    return {
      searchUnlocked: this.allowed,
      keySet: !!this.storedKey,
      licenseKeyMasked: this.storedKey ? maskKey(this.storedKey) : '',
      configured: this.hmacReady(),
      code: this.lastCode || undefined,
      message: this.lastMessage || undefined,
      vendor: LICENSE_VENDOR,
    };
  }

  async onModuleInit() {
    await this.webConfig.ensureRestored();
    await this.ensureLicenseMenu();
    this.storedKey = (process.env.AMARPIN_LICENSE_KEY || '').trim() || (await this.readStoredKey());
    if (!this.hmacReady()) {
      this.log.warn('Amarpin API URL missing. Set AMARPIN_API_URL if the default is wrong.');
      return;
    }
    if (!this.storedKey) {
      this.log.log('No license key yet. Licensed features stay locked until a key is added on License.');
      return;
    }
    this.buildClient(this.storedKey);
    await this.refresh(false);
    if (!this.allowed && this.storedKey && this.lastCode === 'TRANSPORT_ERROR') {
      this.allowed = true;
      this.log.warn('Amarpin unreachable on startup; licensed features stay unlocked while a key is stored.');
    }
    this.lastRefreshAt = Date.now();
  }

  async activateKey(licenseKey: string) {
    const key = String(licenseKey || '').trim();
    if (key.length < 8 || key.length > 128) {
      throw new BadRequestException('Enter a valid license key.');
    }
    if (!this.hmacReady()) {
      throw new BadRequestException(
        'License server is not reachable. Check AMARPIN_API_URL.',
      );
    }
    this.buildClient(key);
    try {
      await this.refresh(true);
    } catch (err) {
      const msg = (err as Error).message || '';
      this.client = null;
      this.log.warn(`Amarpin activate error: ${msg}`);
      if (isUnreachable('', msg, err)) {
        throw new BadRequestException(
          'Cannot reach license.amarpin.com from this server. Check internet/DNS, then try again.',
        );
      }
      throw new BadRequestException(msg || 'License key was rejected.');
    }
    this.lastRefreshAt = Date.now();
    if (!this.allowed) {
      this.client = null;
      const reason = this.lastMessage || this.lastCode || 'License key was rejected.';
      this.log.warn(`Amarpin activate rejected: ${this.lastCode || ''} ${this.lastMessage || ''}`);
      if (isUnreachable(this.lastCode, this.lastMessage)) {
        throw new BadRequestException(
          'Cannot reach license.amarpin.com from this server. Check internet/DNS, then try again.',
        );
      }
      throw new BadRequestException(reason);
    }
    this.storedKey = key;
    await this.writeStoredKey(key);
    return this.snapshot();
  }

  async deactivate() {
    if (!this.storedKey && !this.client) {
      this.allowed = false;
      return this.snapshot();
    }
    if (this.client) {
      try {
        await this.client.deactivateInstallation();
      } catch (err) {
        this.log.warn(`Amarpin deactivate: ${(err as Error).message}`);
      }
    }
    this.client = null;
    this.allowed = false;
    this.storedKey = '';
    this.lastCode = '';
    this.lastMessage = '';
    await this.writeStoredKey('');
    this.log.log('License deactivated. Extra MikroTik routers and 3-month/6-month/1-year retention are locked.');
    return this.snapshot();
  }

  async assertRetentionAllowed() {
    void this.refreshIfStale(AMARPIN_REFRESH_MS);
    return this.allowed;
  }

  /** Ask Amarpin every 6 hours (00:00, 06:00, 12:00, 18:00 server time). */
  @Cron('0 0 */6 * * *')
  async scheduledRefresh() {
    if (!this.client || !this.storedKey) {
      return;
    }
    try {
      await this.refreshIfStale(0);
    } catch (err) {
      this.log.warn((err as Error).message);
    }
  }

  private hmacReady() {
    return true;
  }

  private buildClient(licenseKey: string) {
    this.client = new AmarpinLicenseClient({
      apiUrl: (process.env.AMARPIN_API_URL || 'https://license.amarpin.com/api').trim(),
      licenseKey,
      productId: (process.env.AMARPIN_PRODUCT_ID || 'log-server').trim(),
      installationId: (process.env.AMARPIN_INSTALLATION_ID || `log-server-${hostname()}`).trim(),
      version: (process.env.AMARPIN_APP_VERSION || '1.0.0').trim(),
      cachePath:
        (process.env.AMARPIN_CACHE_PATH || '').trim() ||
        join(process.env.LOG_FILE_DIR || join(process.cwd(), 'data'), 'amarpin-license-cache.json'),
      timeoutMs: 20000,
      validationIntervalHours: 6,
    });
  }

  private apply(result: AmarpinLicenseResult | null) {
    const code = String((result && (result.code || result.status)) || '').toUpperCase();
    this.lastCode = code;
    this.lastMessage = String((result && result.message) || '');
    if (code === 'TRANSPORT_ERROR') {
      if (this.storedKey) {
        this.allowed = true;
        this.log.warn(
          `Amarpin unreachable (${this.lastMessage || code}); licensed features stay available`,
        );
        return;
      }
      this.allowed = false;
      return;
    }
    const usable = !!(result && result.valid === true);
    this.allowed = usable;
    if (usable) {
      this.log.log(result?.grace ? 'Amarpin license valid (grace)' : 'Amarpin license valid');
      return;
    }
    this.lastMessage = this.lastMessage || this.lastCode || 'invalid';
    this.log.warn(`Amarpin license not active: ${this.lastMessage}`);
  }

  /**
   * Live check against Amarpin. Does not re-claim a slot unless the
   * installation is missing. License INACTIVE / REVOKED / SUSPENDED
   * from the manager locks this server; ACTIVE unlocks it again.
   */
  private async refresh(claimSlot: boolean) {
    if (!this.client) {
      this.allowed = false;
      return;
    }
    if (claimSlot) {
      const activated = await this.client.activate();
      this.apply(activated);
      if (!this.allowed) {
        return;
      }
    }
    const status = await this.client.validate({ force: true });
    const code = String((status && (status.code || status.status)) || '').toUpperCase();
    if (!status?.valid && code === 'NOT_ACTIVATED') {
      const activated = await this.client.activate();
      this.apply(activated);
      return;
    }
    this.apply(status);
  }

  private async refreshIfStale(maxAgeMs = AMARPIN_REFRESH_MS) {
    if (!this.client || !this.storedKey) {
      return;
    }
    if (this.inflight) {
      return this.inflight;
    }
    if (maxAgeMs > 0 && this.lastRefreshAt && Date.now() - this.lastRefreshAt < maxAgeMs) {
      return;
    }
    this.inflight = this.refresh(false)
      .catch((err) => {
        this.log.warn((err as Error).message);
      })
      .finally(() => {
        this.lastRefreshAt = Date.now();
        this.inflight = null;
      });
    return this.inflight;
  }

  private async ensureLicenseMenu() {
    try {
      let menu = await this.prisma.menu.findFirst({ where: { url: '/license' } });
      if (!menu) {
        menu = await this.prisma.menu.create({
          data: { menuName: 'Activate License Key', url: '/license', position: 11 },
        });
        this.log.log('Added Activate License Key menu');
      } else if (menu.menuName !== 'Activate License Key') {
        menu = await this.prisma.menu.update({
          where: { id: menu.id },
          data: { menuName: 'Activate License Key' },
        });
      }
      const superAdmin = await this.prisma.role.findFirst({ where: { roleName: 'SuperAdmin' } });
      if (superAdmin) {
        await this.prisma.roleMenu.upsert({
          where: { roleId_menuId: { roleId: superAdmin.id, menuId: menu.id } },
          create: { roleId: superAdmin.id, menuId: menu.id },
          update: {},
        });
      }
      const companyMenu = await this.prisma.menu.findFirst({ where: { url: '/company-settings' } });
      if (companyMenu && companyMenu.menuName !== 'Server Settings') {
        await this.prisma.menu.update({
          where: { id: companyMenu.id },
          data: { menuName: 'Server Settings' },
        });
      }
      if (companyMenu) {
        const holders = await this.prisma.roleMenu.findMany({
          where: { menuId: companyMenu.id },
          select: { roleId: true },
        });
        for (const row of holders) {
          await this.prisma.roleMenu.upsert({
            where: { roleId_menuId: { roleId: row.roleId, menuId: menu.id } },
            create: { roleId: row.roleId, menuId: menu.id },
            update: {},
          });
        }
      }
    } catch (err) {
      this.log.warn(`Could not ensure License menu: ${(err as Error).message}`);
    }
  }

  private async readStoredKey() {
    try {
      const row = await this.prisma.companySetting.findFirst({ select: { licenseKey: true } });
      return (row?.licenseKey || '').trim();
    } catch {
      return '';
    }
  }

  private async writeStoredKey(licenseKey: string) {
    const row = await this.prisma.companySetting.findFirst();
    if (row) {
      await this.prisma.companySetting.update({ where: { id: row.id }, data: { licenseKey } });
      await this.webConfig.persistCurrent();
      return;
    }
    await this.prisma.companySetting.create({
      data: { companyName: 'uniqbd.com Log Server', licenseKey },
    });
    await this.webConfig.persistCurrent();
  }
}
