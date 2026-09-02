import { Injectable } from '@nestjs/common';
import { applyWanNat, isPrivateIp, sanitizeNat } from './syslog.parse';

export type SessionFields = {
  userName?: string | null;
  fromIp?: string | null;
  fromIpPort?: string | null;
  gateway?: string | null;
  gatewayPort?: string | null;
  macAddress?: string | null;
};

type Sess = {
  user: string | null;
  mac: string | null;
  gateway: string | null;
  gatewayPort: string | null;
  fromIp: string | null;
};

function blank(): Sess {
  return { user: null, mac: null, gateway: null, gatewayPort: null, fromIp: null };
}

function pick(a?: string | null, b?: string | null) {
  const left = a?.trim();
  if (left) return left;
  const right = b?.trim();
  return right || null;
}

function mergeSess(a: Sess, b: Partial<Sess>): Sess {
  return {
    user: pick(a.user, b.user),
    mac: pick(a.mac, b.mac),
    gateway: pick(a.gateway, b.gateway),
    gatewayPort: pick(a.gatewayPort, b.gatewayPort),
    fromIp:
      (isPrivateIp(a.fromIp) ? a.fromIp : null) ||
      (isPrivateIp(b.fromIp) ? b.fromIp : null) ||
      pick(a.fromIp, b.fromIp),
  };
}

/**
 * In-memory PPP / NAT / MAC join table. MikroTik sends user on one line,
 * MAC on another — this stitches them by private IP, MAC, and username.
 * Shared WAN/NAT IPs are never used as keys (many customers share one).
 */
@Injectable()
export class SessionTable {
  private readonly byIp = new Map<string, Sess>();
  private readonly byMac = new Map<string, Sess>();
  private readonly byUser = new Map<string, Sess>();

  remember(serverId: number, f: SessionFields) {
    const incoming: Sess = {
      user: pick(f.userName),
      mac: pick(f.macAddress),
      gateway: pick(f.gateway),
      gatewayPort: pick(f.gatewayPort),
      fromIp: pick(f.fromIp),
    };
    if (!incoming.fromIp && !incoming.mac && !incoming.user) return;

    const prev = this.lookupRaw(serverId, incoming);
    this.store(serverId, mergeSess(incoming, prev));
  }

  apply<T extends SessionFields>(serverId: number, fields: T, wanIp?: string | null): T {
    const clean = sanitizeNat(fields);
    this.remember(serverId, clean);
    const hit = this.lookupRaw(serverId, {
      user: clean.userName,
      mac: clean.macAddress,
      fromIp: clean.fromIp,
    });
    const merged = {
      ...clean,
      userName: pick(clean.userName, hit.user),
      macAddress: pick(clean.macAddress, hit.mac),
      fromIp: pick(clean.fromIp, isPrivateIp(hit.fromIp) ? hit.fromIp : null),
      gateway: pick(clean.gateway, hit.gateway),
      gatewayPort:
        pick(clean.gatewayPort, hit.gatewayPort) ||
        (pick(clean.gateway, hit.gateway) ? pick(clean.fromIpPort) : null),
    };
    const withWan = applyWanNat(sanitizeNat(merged), wanIp);
    this.remember(serverId, withWan);
    return withWan;
  }

  stitch<T extends SessionFields>(serverId: number, rows: T[], wanIp?: string | null): T[] {
    const clean = rows.map((row) => sanitizeNat(row));
    for (const row of clean) this.remember(serverId, row);
    const byIp = new Map<string, Sess>();
    const byMac = new Map<string, Sess>();
    const byUser = new Map<string, Sess>();

    const absorb = (row: SessionFields) => {
      const piece: Sess = {
        user: pick(row.userName),
        mac: pick(row.macAddress),
        gateway: pick(row.gateway),
        gatewayPort: pick(row.gatewayPort),
        fromIp: pick(row.fromIp),
      };
      const keys: Sess[] = [];
      if (piece.fromIp && isPrivateIp(piece.fromIp)) keys.push(byIp.get(piece.fromIp) || blank());
      if (piece.mac) keys.push(byMac.get(piece.mac.toLowerCase()) || blank());
      if (piece.user) keys.push(byUser.get(piece.user.toLowerCase()) || blank());
      let next = piece;
      for (const k of keys) next = mergeSess(next, k);
      if (next.fromIp && isPrivateIp(next.fromIp)) byIp.set(next.fromIp, next);
      if (next.mac) byMac.set(next.mac.toLowerCase(), next);
      if (next.user) byUser.set(next.user.toLowerCase(), next);
    };

    for (const row of clean) absorb(row);
    for (const row of clean) absorb(row);

    return clean.map((row) => {
      const fromPage =
        (row.fromIp && isPrivateIp(row.fromIp) && byIp.get(row.fromIp)) ||
        (row.macAddress && byMac.get(row.macAddress.toLowerCase())) ||
        (row.userName && byUser.get(row.userName.toLowerCase())) ||
        blank();
      return this.apply(
        serverId,
        {
          ...row,
          userName: pick(row.userName, fromPage.user),
          macAddress: pick(row.macAddress, fromPage.mac),
          fromIp: pick(row.fromIp, fromPage.fromIp),
          gateway: pick(row.gateway, fromPage.gateway),
          gatewayPort: pick(row.gatewayPort, fromPage.gatewayPort),
        },
        wanIp,
      );
    });
  }

  ipsMatchingUser(serverId: number, userName: string): string[] {
    const needle = userName.trim().toLowerCase();
    if (!needle) return [];
    const ips = new Set<string>();
    const userPrefix = `${serverId}|user|`;
    for (const [key, sess] of this.byUser) {
      if (!key.startsWith(userPrefix)) continue;
      if (key.slice(userPrefix.length).includes(needle) && sess.fromIp) ips.add(sess.fromIp);
    }
    const ipPrefix = `${serverId}|ip|`;
    for (const [key, sess] of this.byIp) {
      if (!key.startsWith(ipPrefix)) continue;
      if (sess.user?.toLowerCase().includes(needle) && sess.fromIp) ips.add(sess.fromIp);
    }
    return [...ips];
  }

  private lookupRaw(serverId: number, s: Partial<Sess>): Sess {
    if (s.fromIp && isPrivateIp(s.fromIp)) {
      const hit = this.byIp.get(this.ipKey(serverId, s.fromIp));
      if (hit) return hit;
    }
    if (s.mac) {
      const hit = this.byMac.get(this.macKey(serverId, s.mac));
      if (hit) return hit;
    }
    if (s.user) {
      const hit = this.byUser.get(this.userKey(serverId, s.user));
      if (hit) return hit;
    }
    return blank();
  }

  private store(serverId: number, next: Sess) {
    if (next.fromIp && isPrivateIp(next.fromIp)) this.byIp.set(this.ipKey(serverId, next.fromIp), next);
    if (next.mac) this.byMac.set(this.macKey(serverId, next.mac), next);
    if (next.user) this.byUser.set(this.userKey(serverId, next.user), next);
    this.prune();
  }

  private prune() {
    if (this.byIp.size < 50000) return;
    let n = 0;
    for (const k of this.byIp.keys()) {
      this.byIp.delete(k);
      if (++n > 10000) break;
    }
  }

  private ipKey(serverId: number, ip: string) {
    return `${serverId}|ip|${ip}`;
  }

  private macKey(serverId: number, mac: string) {
    return `${serverId}|mac|${mac.toLowerCase()}`;
  }

  private userKey(serverId: number, user: string) {
    return `${serverId}|user|${user.toLowerCase()}`;
  }
}
