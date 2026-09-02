import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';

const HOST_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.?$/;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIpv4(ip: string): [number, number, number, number] | null {
  const m = ip.trim().match(IPV4_RE);
  if (!m) return null;
  const parts = m.slice(1).map(Number) as [number, number, number, number];
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

export function isBlockedProbeIp(ip: string): boolean {
  const p = parseIpv4(ip);
  if (!p) return true;
  const [a, b] = p;
  if (a === 0 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const p = parseIpv4(ip);
  if (!p) return true;
  const [a, b] = p;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224) return true;
  return false;
}

export function parseHostAndPort(host: string, portRaw?: string | number) {
  const h = (host || '').trim();
  if (!h || h.length > 253) throw new BadRequestException('Invalid host');
  if (/[\s/@?#\\[\]]/.test(h) || h.includes(':')) throw new BadRequestException('Invalid host');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(h)) throw new BadRequestException('Host must not include a protocol');
  const asIp = parseIpv4(h);
  if (!asIp && !HOST_RE.test(h)) throw new BadRequestException('Invalid host');
  const port = Number(portRaw ?? 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new BadRequestException('Invalid port');
  return { host: h, port };
}

export async function resolveIpv4(host: string): Promise<string> {
  const literal = parseIpv4(host);
  if (literal) return host;
  const found = await lookup(host, { family: 4 });
  return found.address;
}

/** MikroTik probes may target RFC1918 routers. Loopback, link-local, and multicast are blocked. */
export async function assertSafeProbeTarget(host: string, portRaw?: string | number) {
  const parsed = parseHostAndPort(host, portRaw);
  let ip: string;
  try {
    ip = await resolveIpv4(parsed.host);
  } catch {
    throw new BadRequestException('Could not resolve router host');
  }
  if (isBlockedProbeIp(ip)) {
    throw new BadRequestException('This address cannot be used for connectivity checks');
  }
  return { ...parsed, ip };
}

export function assertSafeSmsUrl(raw: string, allowlist: string[]) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('Invalid SMS provider URL');
  }
  if (url.protocol !== 'https:') throw new BadRequestException('SMS provider URL must use HTTPS');
  if (url.username || url.password) throw new BadRequestException('SMS provider URL must not contain credentials');
  const host = url.hostname.toLowerCase();
  const allowed = new Set(allowlist.map((h) => h.trim().toLowerCase()).filter(Boolean));
  if (!allowed.has(host)) {
    throw new BadRequestException('SMS provider host is not allowlisted');
  }
  return url;
}

export function smsAllowlist() {
  const extra = (process.env.SMS_URL_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ['api.smsq.global', ...extra];
}

export function smtpHostAllowlist() {
  return (process.env.SMTP_HOST_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function smtpAllowPrivate() {
  return process.env.SMTP_ALLOW_PRIVATE === 'true';
}

function isAlwaysBlockedSmtpIp(ip: string) {
  const p = parseIpv4(ip);
  if (!p) return true;
  const [a, b] = p;
  if (a === 0 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

const SMTP_PORTS = new Set([25, 465, 587, 2525]);

export function assertSafeSmtpPort(port: number) {
  const extra = (process.env.SMTP_PORT_ALLOWLIST || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));
  if (SMTP_PORTS.has(port) || extra.includes(port)) return port;
  throw new BadRequestException('SMTP port is not allowed');
}

/** Outbound mail: block loopback, metadata, multicast, and private IPs unless allowlisted. */
export async function assertSafeSmtpTarget(host: string, portRaw?: string | number) {
  const parsed = parseHostAndPort(host, portRaw ?? 587);
  if (parsed.host.toLowerCase() === 'localhost') {
    throw new BadRequestException('SMTP host is not allowed');
  }
  assertSafeSmtpPort(parsed.port);
  const listed = smtpHostAllowlist().includes(parsed.host.toLowerCase());
  let ip: string;
  try {
    ip = await resolveIpv4(parsed.host);
  } catch {
    throw new BadRequestException('Could not resolve SMTP host');
  }
  if (isAlwaysBlockedSmtpIp(ip)) {
    throw new BadRequestException('SMTP host is not allowed');
  }
  if (isPrivateOrLocalIp(ip) && !listed && !smtpAllowPrivate()) {
    throw new BadRequestException('SMTP host is not allowed');
  }
  return { ...parsed, ip };
}

export function redactSecretMessage(message: string) {
  return message
    .replace(/(pass(word)?|pwd|secret|api[_-]?key|authorization)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 180);
}
