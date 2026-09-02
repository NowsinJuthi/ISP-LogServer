export function normalizeMac(raw?: string | null): string | null {
  if (!raw) return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 12) return null;
  return hex.toLowerCase().match(/.{2}/g)!.join(':');
}

const FAKE_USERS = new Set([
  'from',
  'to',
  'src',
  'dst',
  'mac',
  'out',
  'info',
  'in',
  'bridge',
  'forward',
  'unknown',
  'pppoe',
  'ppp',
  'dhcp',
  'topic',
  'logged',
]);

function isRealUser(name?: string | null) {
  if (!name) return false;
  if (FAKE_USERS.has(name.toLowerCase())) return false;
  if (/^(out|in|ether|wlan|sfp|vlan|pppoe-out)\d*$/i.test(name)) return false;
  return name.length >= 2;
}

export function parseMac(raw: string): string | null {
  const src = raw.match(/src-mac[=:\s]+([0-9a-fA-F:.\-]{11,21})/i)?.[1];
  if (src) return normalizeMac(src);
  const caller = raw.match(/caller-id[=:\s]+([0-9a-fA-F:.\-]{11,21})/i)?.[1];
  if (caller) return normalizeMac(caller);
  const labeled = raw.match(/\bmac(?:-address)?\s*[=:]\s*([0-9a-fA-F:.\-]{11,21})/i)?.[1];
  if (labeled) return normalizeMac(labeled);
  const dotted = raw.match(/\b([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\b/);
  if (dotted) return normalizeMac(dotted[1]);
  const colon = raw.match(
    /\b([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})\b/,
  );
  return normalizeMac(colon?.[1] ?? null);
}

export function parseUser(raw: string): string | null {
  const pppoe = raw.match(/<pppoe-([^>]+)>/i)?.[1];
  if (isRealUser(pppoe)) return pppoe!.trim();
  const iface = raw.match(/\b(?:in|out):<?pppoe-([A-Za-z0-9._@-]{2,64})>?/i)?.[1];
  if (isRealUser(iface)) return iface!.trim();
  const barePppoe = raw.match(/\bpppoe-([A-Za-z0-9._@-]{2,64})/i)?.[1];
  if (isRealUser(barePppoe)) return barePppoe!.trim();
  const labeled = raw.match(/\buser(?:name)?\s*[=:]\s*<?([A-Za-z0-9._@-]{2,64})>?/i)?.[1];
  if (isRealUser(labeled)) return labeled!;
  const auth = raw.match(/<([A-Za-z0-9._@-]{2,64})>\s*:\s*(?:authenticated|connected|logged)/i)?.[1];
  if (isRealUser(auth)) return auth!;
  const userWord = raw.match(/\buser\s+([A-Za-z0-9._@-]{2,64})\s+(?:logged|authenticated|connected)/i)?.[1];
  if (isRealUser(userWord)) return userWord!;
  const evt = raw.match(
    /<?(?:pppoe-)?([A-Za-z0-9._@-]{2,64})>?\s*:\s*(?:authenticated|connected|disconnected|logged[\s-]in)/i,
  )?.[1];
  if (isRealUser(evt)) return evt!;
  const logged = raw.match(/\b(?:logged in|login success)\b[^A-Za-z0-9._@-]{0,12}([A-Za-z0-9._@-]{2,64})/i)?.[1];
  return isRealUser(logged) ? logged! : null;
}

export function parseDhcp(raw: string) {
  const assigned = raw.match(
    /assigned\s+(\d{1,3}(?:\.\d{1,3}){3})\s+to\s+([0-9a-fA-F:.\-]{11,21})/i,
  );
  if (!assigned) return null;
  return { fromIp: assigned[1], mac: normalizeMac(assigned[2]), user: parseUser(raw) };
}

export function isSessionLine(raw: string) {
  if (/PPPLOG/i.test(raw)) return true;
  if (/assigned\s+\d{1,3}(?:\.\d{1,3}){3}\s+to\s+/i.test(raw)) return true;
  if (/\b(ppp|pppoe)\b/i.test(raw) && /(authenticated|connected|logged\s*in|disconnected)/i.test(raw)) {
    return true;
  }
  return false;
}

export function isPrivateIp(ip?: string | null): boolean {
  if (!ip) return false;
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (p[0] === 10) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  return false;
}

export function applyWanNat<
  T extends {
    fromIp?: string | null;
    fromIpPort?: string | null;
    gateway?: string | null;
    gatewayPort?: string | null;
  },
>(row: T, wanIp?: string | null): T {
  if (row.gateway || !wanIp || !isPrivateIp(row.fromIp)) return row;
  return {
    ...row,
    gateway: wanIp,
    gatewayPort: row.gatewayPort || row.fromIpPort || null,
  };
}

export function sanitizeNat<
  T extends {
    gateway?: string | null;
    gatewayPort?: string | null;
    toHost?: string | null;
    toHostPort?: string | null;
  },
>(row: T): T {
  if (row.gateway && row.toHost && row.gateway === row.toHost) {
    return {
      ...row,
      gateway: null,
      gatewayPort: row.gatewayPort && row.gatewayPort === row.toHostPort ? null : row.gatewayPort,
    };
  }
  return row;
}

export function parseNat(raw: string) {
  const arrows = [
    ...raw.matchAll(
      /(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})\s*(?:->|=>|→)\s*(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})/g,
    ),
  ];
  const nat = raw.match(
    /NAT\s*\((\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})\s*->\s*(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})\)/i,
  );
  const first = arrows[0];
  let fromIp: string | null = first?.[1] ?? null;
  let fromIpPort: string | null = first?.[2] ?? null;
  let toHost: string | null = first?.[3] ?? null;
  let toHostPort: string | null = first?.[4] ?? null;
  let gateway: string | null = nat?.[3] ?? null;
  let gatewayPort: string | null = nat?.[4] ?? null;
  if (nat) {
    fromIp = nat[1] || fromIp;
    fromIpPort = nat[2] || fromIpPort;
  }
  if (!gateway) {
    const toSrc = raw.match(
      /\b(?:to-src|to-source)\s*[:=]?\s*(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?/i,
    );
    if (toSrc) {
      gateway = toSrc[1];
      gatewayPort = toSrc[2] || gatewayPort;
    }
  }
  if (!gateway) {
    const natLoose = raw.match(
      /NAT\s+(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})\s*->\s*(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})/i,
    );
    if (natLoose) {
      fromIp = fromIp || natLoose[1];
      fromIpPort = fromIpPort || natLoose[2];
      gateway = natLoose[3];
      gatewayPort = natLoose[4];
    }
  }
  if (!gateway && arrows.length >= 2) {
    const second = arrows[1];
    if (isPrivateIp(second[1]) && !isPrivateIp(second[3])) {
      fromIp = fromIp || second[1];
      fromIpPort = fromIpPort || second[2];
      gateway = second[3];
      gatewayPort = second[4];
    }
  }
  if (!first) {
    const pairs = [...raw.matchAll(/(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})/g)];
    fromIp = pairs[0]?.[1] ?? null;
    fromIpPort = pairs[0]?.[2] ?? null;
    toHost = pairs[1]?.[1] ?? null;
    toHostPort = pairs[1]?.[2] ?? null;
  }
  if (gateway && toHost && gateway === toHost) {
    gateway = null;
    gatewayPort = null;
  }
  if (!fromIp) {
    const ips = [...raw.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g)].map((m) => m[1]);
    fromIp = ips.find((ip) => isPrivateIp(ip)) ?? null;
  }
  return {
    userName: parseUser(raw),
    fromIp,
    fromIpPort,
    gateway,
    gatewayPort,
    toHost,
    toHostPort,
    macAddress: parseMac(raw),
    deviceReportedTime: new Date(),
  };
}

export function fillFromRaw<T extends {
  userName?: string | null;
  fromIp?: string | null;
  fromIpPort?: string | null;
  gateway?: string | null;
  gatewayPort?: string | null;
  toHost?: string | null;
  toHostPort?: string | null;
  macAddress?: string | null;
  rawMessage?: string | null;
}>(row: T): T {
  if (!row.rawMessage) return row;
  const parsed = parseNat(row.rawMessage);
  const ppp = parsePpp(row.rawMessage);
  const dhcp = parseDhcp(row.rawMessage);
  return sanitizeNat({
    ...row,
    userName: row.userName || parsed.userName || ppp.user || dhcp?.user || null,
    fromIp: row.fromIp || parsed.fromIp || dhcp?.fromIp || ppp.fromIp,
    fromIpPort: row.fromIpPort || parsed.fromIpPort,
    gateway: row.gateway || parsed.gateway,
    gatewayPort: row.gatewayPort || parsed.gatewayPort,
    toHost: row.toHost || parsed.toHost,
    toHostPort: row.toHostPort || parsed.toHostPort,
    macAddress: row.macAddress || parsed.macAddress || dhcp?.mac || ppp.mac,
  });
}

export function parsePpp(raw: string) {
  const labeled = raw.match(/\b(?:address|from-ip|src-address)\s*[=:]\s*(\d{1,3}(?:\.\d{1,3}){3})/i)?.[1];
  const ips = [...raw.matchAll(/(\d{1,3}(?:\.\d{1,3}){3})/g)].map((m) => m[1]);
  const privateIp = ips.find((ip) => isPrivateIp(ip)) ?? null;
  return { user: parseUser(raw), mac: parseMac(raw), fromIp: labeled || privateIp || ips[0] || null };
}
