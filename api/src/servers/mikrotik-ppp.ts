import * as http from 'http';
import * as https from 'https';
import { assertSafeProbeTarget } from '../security/net-guard';
import { fetchViaRouterOsApi } from './mikrotik-api';
import { normalizeMac, parseUser } from '../syslog/syslog.parse';

export type PppActive = { user: string | null; fromIp: string | null; mac: string | null };
export type ClientMapResult = { rows: PppActive[]; error?: string };

type RouterRow = Record<string, string>;

function restGet(url: string, auth: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body: unknown = text;
          try {
            body = JSON.parse(text);
          } catch {
            /* keep text */
          }
          resolve({ status: res.statusCode || 0, body });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
    req.end();
  });
}

function asRows(body: unknown): RouterRow[] {
  return Array.isArray(body) ? (body as RouterRow[]) : [];
}

function basesFor(ip: string, port: number) {
  const ports = [...new Set([port === 1122 || port === 8728 ? 80 : port, 80])];
  return ports.map((p) => `http://${ip}:${p}`);
}

function mapRows(ppp: RouterRow[], arp: RouterRow[], leases: RouterRow[]): PppActive[] {
  const out: PppActive[] = [];
  for (const item of ppp) {
    out.push({
      user: item.name || item.user || null,
      fromIp: item.address || item['remote-address'] || null,
      mac: normalizeMac(item['caller-id'] || item.callerid || item['mac-address'] || ''),
    });
  }
  for (const item of arp) {
    const iface = item.interface || '';
    out.push({
      user: parseUser(`in:${iface}`) || parseUser(iface),
      fromIp: item.address || null,
      mac: normalizeMac(item['mac-address'] || ''),
    });
  }
  for (const item of leases) {
    if (item.status && item.status !== 'bound') continue;
    out.push({
      user: parseUser(item['host-name'] || '') || parseUser(item.comment || ''),
      fromIp: item.address || null,
      mac: normalizeMac(item['mac-address'] || item['active-mac-address'] || ''),
    });
  }
  return out.filter((r) => r.fromIp || r.mac || r.user);
}

/**
 * Live client map from the router: PPP + ARP + DHCP.
 * Tries HTTP/HTTPS on the saved port, then 80 and 443.
 */
export async function fetchPppActive(
  server: {
    url: string;
    userName?: string | null;
    password?: string | null;
    port?: string | null;
  },
  defaultApiPort = 1122,
): Promise<ClientMapResult> {
  if (!server.userName || !server.password) {
    return { rows: [], error: 'MikroTik API user/password not saved' };
  }
  const fallback = String(defaultApiPort || 1122);
  const target = await assertSafeProbeTarget(server.url, server.port || fallback);
  const auth = Buffer.from(`${server.userName}:${server.password}`).toString('base64');
  const errors: string[] = [];

  for (const base of basesFor(target.ip, target.port)) {
    try {
      const probe = await restGet(`${base}/rest/system/resource`, auth, 2500);
      if (probe.status === 401 || probe.status === 403) {
        return { rows: [], error: `${base} returned ${probe.status} (user/password or REST permission)` };
      }
      if (!probe.status || probe.status >= 400) {
        errors.push(`${base} → ${probe.status || 'no response'}`);
        continue;
      }
      const [ppp, arp, leases] = await Promise.all([
        restGet(`${base}/rest/ppp/active`, auth, 4000),
        restGet(`${base}/rest/ip/arp`, auth, 4000),
        restGet(`${base}/rest/ip/dhcp-server/lease`, auth, 4000),
      ]);
      const rows = mapRows(asRows(ppp.body), asRows(arp.body), asRows(leases.body));
      if (rows.length) return { rows };
      errors.push(`${base} reachable but PPP/ARP/DHCP empty`);
    } catch (e) {
      errors.push(`${base} ${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  const apiPorts = [
    ...new Set([
      target.port,
      defaultApiPort,
    ].filter((p) => p && p !== 80 && p !== 443)),
  ];
  for (const apiPort of apiPorts) {
    try {
      const rows = await fetchViaRouterOsApi(target.ip, apiPort, server.userName, server.password);
      if (rows.length) return { rows };
      errors.push(`API ${target.ip}:${apiPort} login ok but PPP/ARP empty`);
    } catch (e) {
      errors.push(`API ${target.ip}:${apiPort} ${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  return { rows: [], error: errors.slice(0, 6).join('; ') || 'could not reach MikroTik' };
}
