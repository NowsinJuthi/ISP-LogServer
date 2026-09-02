import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const COMPANY_FILE = 'company-settings.json';
const SERVERS_FILE = 'servers.json';

export function webConfigDir() {
  const fromEnv = (process.env.WEB_CONFIG_DIR || '').trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), '..', 'data', 'web-config');
}

export function companySettingsPath() {
  return join(webConfigDir(), COMPANY_FILE);
}

export function serversPath() {
  return join(webConfigDir(), SERVERS_FILE);
}

export type CompanySnapshot = {
  companyName?: string;
  companyLogoDirectory?: string | null;
  logServerUrl?: string | null;
  mobileNumber?: string | null;
  smsSendingEnable?: boolean;
  smsProviderUserId?: string | null;
  smsProviderSender?: string | null;
  smsProviderPassword?: string | null;
  smsProviderId?: string | null;
  smsSentToday?: number;
  lastSmsSend?: string | Date | null;
  contactEmail?: string | null;
  emailSendingEnable?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
  mikrotikApiPort?: number;
  mikrotikWinboxPort?: number;
  mikrotikFirewallPort?: number;
  licenseKey?: string | null;
};

export function readCompanySnapshot(): CompanySnapshot | null {
  const file = companySettingsPath();
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as CompanySnapshot;
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

export function writeCompanySnapshot(row: CompanySnapshot) {
  const dir = webConfigDir();
  mkdirSync(dir, { recursive: true });
  const payload = {
    companyName: row.companyName ?? 'uniqbd.com Log Server',
    companyLogoDirectory: row.companyLogoDirectory ?? null,
    logServerUrl: row.logServerUrl ?? null,
    mobileNumber: row.mobileNumber ?? null,
    smsSendingEnable: !!row.smsSendingEnable,
    smsProviderUserId: row.smsProviderUserId ?? null,
    smsProviderSender: row.smsProviderSender ?? null,
    smsProviderPassword: row.smsProviderPassword ?? null,
    smsProviderId: row.smsProviderId ?? null,
    smsSentToday: Number(row.smsSentToday || 0),
    lastSmsSend: row.lastSmsSend ? new Date(row.lastSmsSend).toISOString() : null,
    contactEmail: row.contactEmail ?? null,
    emailSendingEnable: !!row.emailSendingEnable,
    smtpHost: row.smtpHost ?? null,
    smtpPort: row.smtpPort ?? null,
    smtpSecure: row.smtpSecure ?? true,
    smtpUser: row.smtpUser ?? null,
    smtpPassword: row.smtpPassword ?? null,
    smtpFromEmail: row.smtpFromEmail ?? null,
    smtpFromName: row.smtpFromName ?? null,
    mikrotikApiPort: row.mikrotikApiPort ?? 1122,
    mikrotikWinboxPort: row.mikrotikWinboxPort ?? 1122,
    mikrotikFirewallPort: row.mikrotikFirewallPort ?? 1122,
    licenseKey: row.licenseKey ?? null,
  };
  writeJson(companySettingsPath(), payload);
}

export type ServerSnapshot = {
  serverName?: string;
  url?: string;
  logServerUrl?: string | null;
  userName?: string | null;
  password?: string | null;
  port?: string | null;
  type?: string;
  type1?: string | null;
  natIp?: string | null;
  natRouterId?: string | null;
  listeningPort?: number;
  retention?: string;
  disabled?: boolean;
};

export function readServersSnapshot(): ServerSnapshot[] | null {
  const file = serversPath();
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return Array.isArray(raw) ? (raw as ServerSnapshot[]) : null;
  } catch {
    return null;
  }
}

export function writeServersSnapshot(rows: ServerSnapshot[]) {
  mkdirSync(webConfigDir(), { recursive: true });
  const payload = rows.map((row) => ({
    serverName: row.serverName ?? '',
    url: row.url ?? '',
    logServerUrl: row.logServerUrl ?? 'localhost',
    userName: row.userName ?? null,
    password: row.password ?? null,
    port: row.port ?? null,
    type: row.type ?? 'NAT_ACCESS',
    type1: row.type1 ?? null,
    natIp: row.natIp ?? null,
    natRouterId: row.natRouterId ?? null,
    listeningPort: Number(row.listeningPort || 514),
    retention: row.retention ?? 'SIX_MONTHS',
    disabled: !!row.disabled,
  }));
  writeJson(serversPath(), payload);
}

function writeJson(file: string, payload: unknown) {
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function snapshotToPrisma(data: CompanySnapshot) {
  return {
    companyName: data.companyName?.trim() || 'uniqbd.com Log Server',
    companyLogoDirectory: data.companyLogoDirectory || null,
    logServerUrl: data.logServerUrl || null,
    mobileNumber: data.mobileNumber || null,
    smsSendingEnable: !!data.smsSendingEnable,
    smsProviderUserId: data.smsProviderUserId || null,
    smsProviderSender: data.smsProviderSender || null,
    smsProviderPassword: data.smsProviderPassword || null,
    smsProviderId: data.smsProviderId || null,
    smsSentToday: Number(data.smsSentToday || 0),
    lastSmsSend: data.lastSmsSend ? new Date(data.lastSmsSend) : null,
    contactEmail: data.contactEmail || null,
    emailSendingEnable: !!data.emailSendingEnable,
    smtpHost: data.smtpHost || null,
    smtpPort: data.smtpPort ?? null,
    smtpSecure: data.smtpSecure ?? true,
    smtpUser: data.smtpUser || null,
    smtpPassword: data.smtpPassword || null,
    smtpFromEmail: data.smtpFromEmail || null,
    smtpFromName: data.smtpFromName || null,
    mikrotikApiPort: data.mikrotikApiPort ?? 1122,
    mikrotikWinboxPort: data.mikrotikWinboxPort ?? 1122,
    mikrotikFirewallPort: data.mikrotikFirewallPort ?? 1122,
    licenseKey: data.licenseKey || null,
  };
}
