import { createHash } from 'crypto';
import * as net from 'net';
import { normalizeMac, parseUser } from '../syslog/syslog.parse';
import type { PppActive } from './mikrotik-ppp';

function encodeLen(len: number) {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) return Buffer.from([(len >> 8) | 0x80, len & 0xff]);
  if (len < 0x200000) return Buffer.from([(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
  if (len < 0x10000000) {
    return Buffer.from([(len >> 24) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }
  const b = Buffer.alloc(5);
  b[0] = 0xf0;
  b.writeUInt32BE(len, 1);
  return b;
}

class ApiSocket {
  private buf = Buffer.alloc(0);

  constructor(private sock: net.Socket) {}

  writeSentence(words: string[]) {
    const parts = words.map((w) => {
      const body = Buffer.from(w, 'utf8');
      return Buffer.concat([encodeLen(body.length), body]);
    });
    this.sock.write(Buffer.concat([...parts, encodeLen(0)]));
  }

  async readSentence(timeoutMs: number): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    const words: string[] = [];
    while (true) {
      const len = await this.readLen(deadline);
      if (len === 0) return words;
      const body = await this.readExact(len, deadline);
      words.push(body.toString('utf8'));
    }
  }

  private async readLen(deadline: number) {
    const first = (await this.readExact(1, deadline))[0];
    if (first < 0x80) return first;
    if (first < 0xc0) {
      const next = (await this.readExact(1, deadline))[0];
      return ((first & 0x7f) << 8) + next;
    }
    if (first < 0xe0) {
      const extra = await this.readExact(2, deadline);
      return ((first & 0x1f) << 16) + (extra[0] << 8) + extra[1];
    }
    if (first < 0xf0) {
      const extra = await this.readExact(3, deadline);
      return ((first & 0x0f) << 24) + (extra[0] << 16) + (extra[1] << 8) + extra[2];
    }
    const extra = await this.readExact(4, deadline);
    return extra.readUInt32BE(0);
  }

  private readExact(n: number, deadline: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const take = () => {
        if (this.buf.length >= n) {
          const out = this.buf.subarray(0, n);
          this.buf = this.buf.subarray(n);
          resolve(out);
          return true;
        }
        return false;
      };
      if (take()) return;
      const onData = (chunk: Buffer) => {
        this.buf = Buffer.concat([this.buf, chunk]);
        if (take()) cleanup();
      };
      const onErr = (e: Error) => {
        cleanup();
        reject(e);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('MikroTik API timeout'));
      }, Math.max(200, deadline - Date.now()));
      const cleanup = () => {
        clearTimeout(timer);
        this.sock.off('data', onData);
        this.sock.off('error', onErr);
      };
      this.sock.on('data', onData);
      this.sock.on('error', onErr);
    });
  }
}

function attrs(words: string[]) {
  const row: Record<string, string> = {};
  for (const w of words) {
    const eq = w.indexOf('=', 1);
    if (w.startsWith('=') && eq > 0) row[w.slice(1, eq)] = w.slice(eq + 1);
  }
  return row;
}

function connect(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port }, () => resolve(sock));
    sock.setTimeout(timeoutMs);
    sock.once('error', reject);
    sock.once('timeout', () => {
      sock.destroy();
      reject(new Error(`API ${host}:${port} timeout`));
    });
  });
}

async function login(api: ApiSocket, user: string, pass: string) {
  api.writeSentence(['/login', `=name=${user}`, `=password=${pass}`]);
  const first = await api.readSentence(4000);
  if (first[0] === '!done') return;
  const ret = attrs(first).ret;
  if (ret) {
    const hash = createHash('md5')
      .update(Buffer.concat([Buffer.from([0]), Buffer.from(pass, 'utf8'), Buffer.from(ret, 'hex')]))
      .digest('hex');
    api.writeSentence(['/login', `=name=${user}`, `=response=00${hash}`]);
    const second = await api.readSentence(4000);
    if (second[0] === '!done') return;
    throw new Error(attrs(second).message || 'API login failed');
  }
  throw new Error(attrs(first).message || first.join(' ') || 'API login failed');
}

async function print(api: ApiSocket, path: string) {
  api.writeSentence([`${path}/print`]);
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < 20000; i += 1) {
    const words = await api.readSentence(8000);
    if (!words.length) continue;
    if (words[0] === '!re') rows.push(attrs(words));
    if (words[0] === '!done') break;
    if (words[0] === '!trap' || words[0] === '!fatal') {
      throw new Error(attrs(words).message || words.join(' '));
    }
  }
  return rows;
}

export async function fetchViaRouterOsApi(
  host: string,
  port: number,
  user: string,
  pass: string,
): Promise<PppActive[]> {
  const sock = await connect(host, port, 4000);
  const api = new ApiSocket(sock);
  try {
    await login(api, user, pass);
    const ppp = await print(api, '/ppp/active').catch(() => []);
    const arp = await print(api, '/ip/arp').catch(() => []);
    const leases = await print(api, '/ip/dhcp-server/lease').catch(() => []);
    const out: PppActive[] = [];
    for (const item of ppp) {
      out.push({
        user: item.name || item.user || null,
        fromIp: item.address || null,
        mac: normalizeMac(item['caller-id'] || item['mac-address'] || ''),
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
    try {
      api.writeSentence(['/quit']);
    } catch {
      /* ignore */
    }
    return out.filter((r) => r.fromIp || r.mac || r.user);
  } finally {
    sock.destroy();
  }
}
