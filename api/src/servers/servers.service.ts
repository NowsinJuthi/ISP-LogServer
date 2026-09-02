import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServerType } from '@prisma/client';
import { AuthUser, canAccessServer } from '../auth/auth-user';
import { PrismaService } from '../prisma.service';
import { assertSafeProbeTarget } from '../security/net-guard';
import { DUMMY_ROUTER_PASSWORD, publicServer } from '../security/redact';
import { readMikrotikPorts } from '../company/mikrotik-ports';
import { WebConfigService } from '../company/web-config.service';
import { parseRetention } from './retention';

const typeMap: Record<string, ServerType> = {
  'NAT+ACCESS': ServerType.NAT_ACCESS,
  NAT: ServerType.NAT,
  ACCESS: ServerType.ACCESS,
  RAW: ServerType.RAW,
};

export function displayType(t: ServerType) {
  if (t === ServerType.NAT_ACCESS) return 'NAT+ACCESS';
  return t;
}

@Injectable()
export class ServersService {
  constructor(
    private prisma: PrismaService,
    private webConfig: WebConfigService,
  ) {}

  async list(user: AuthUser, filter: 'all' | 'active' | 'disabled') {
    const where: Prisma.ServerWhereInput = {};
    if (filter === 'active') where.disabled = false;
    if (filter === 'disabled') where.disabled = true;
    if (!user.isAdmin) {
      where.id = { in: user.serverIds };
    }
    const rows = await this.prisma.server.findMany({
      where,
      orderBy: { serverName: 'asc' },
    });
    return rows.map((s) => ({ ...publicServer(s), type: displayType(s.type) }));
  }

  countAll() {
    return this.prisma.server.count();
  }

  async get(id: number, user: AuthUser) {
    const s = await this.prisma.server.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Server not found');
    if (!canAccessServer(user, id)) throw new ForbiddenException();
    return { ...publicServer(s), type: displayType(s.type) };
  }

  private async getRaw(id: number) {
    const s = await this.prisma.server.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Server not found');
    return s;
  }

  async create(data: {
    serverName: string;
    url: string;
    userName?: string;
    password?: string;
    port?: string;
    type: string;
    natIp?: string;
    listeningPort?: number;
    logServerUrl?: string;
    retention: string;
  }) {
    const type = typeMap[data.type] || ServerType.NAT_ACCESS;
    const retention = parseRetention(data.retention);
    const url = data.url.trim();
    const defaults = await readMikrotikPorts(this.prisma);
    const port = type === ServerType.RAW ? undefined : data.port?.trim() || String(defaults.api);
    if (type !== ServerType.RAW) {
      await assertSafeProbeTarget(url, port);
      if (data.natIp?.trim()) await assertSafeProbeTarget(data.natIp.trim(), port);
    }
    const duplicate = await this.prisma.server.findFirst({ where: { url } });
    if (duplicate) {
      throw new BadRequestException('This MikroTik IP is already added');
    }
    const created = await this.prisma.server.create({
      data: {
        serverName: data.serverName.trim().slice(0, 120),
        url,
        userName: type === ServerType.RAW ? null : data.userName?.trim() || null,
        password: type === ServerType.RAW ? DUMMY_ROUTER_PASSWORD : data.password,
        port: type === ServerType.RAW ? null : port,
        type,
        natIp: data.natIp?.trim() || url,
        listeningPort: type === ServerType.ACCESS ? 514 : Number(data.listeningPort || 514),
        logServerUrl: (data.logServerUrl?.trim() || 'localhost').slice(0, 253),
        retention,
        connectivityStatus: false,
      },
    });
    void this.webConfig.persistServers();
    return { ...publicServer(created), type: displayType(created.type) };
  }

  async update(id: number, data: Parameters<ServersService['create']>[0], user: AuthUser) {
    const existing = await this.getRaw(id);
    if (!canAccessServer(user, id)) throw new ForbiddenException();
    const type = typeMap[data.type] || ServerType.NAT_ACCESS;
    const retention = parseRetention(data.retention);
    const url = data.url.trim();
    const defaults = await readMikrotikPorts(this.prisma);
    const port = type === ServerType.RAW ? undefined : data.port?.trim() || existing.port || String(defaults.api);
    const password =
      type === ServerType.RAW
        ? DUMMY_ROUTER_PASSWORD
        : data.password?.trim()
          ? data.password
          : existing.password;
    if (type !== ServerType.RAW) {
      await assertSafeProbeTarget(url, port);
      if (data.natIp?.trim()) await assertSafeProbeTarget(data.natIp.trim(), port);
    }
    const updated = await this.prisma.server.update({
      where: { id },
      data: {
        serverName: data.serverName.trim().slice(0, 120),
        url,
        userName: type === ServerType.RAW ? null : data.userName?.trim() || existing.userName,
        password,
        port: type === ServerType.RAW ? null : port,
        type,
        natIp: data.natIp?.trim() || url,
        listeningPort: type === ServerType.ACCESS ? 514 : Number(data.listeningPort || existing.listeningPort || 514),
        logServerUrl: (data.logServerUrl?.trim() || existing.logServerUrl || 'localhost').slice(0, 253),
        retention,
      },
    });
    void this.webConfig.persistServers();
    return { ...publicServer(updated), type: displayType(updated.type) };
  }

  async toggle(id: number, user: AuthUser) {
    const s = await this.getRaw(id);
    if (!canAccessServer(user, id)) throw new ForbiddenException();
    const updated = await this.prisma.server.update({
      where: { id },
      data: { disabled: !s.disabled },
    });
    void this.webConfig.persistServers();
    return { ...publicServer(updated), type: displayType(updated.type) };
  }

  async remove(id: number, user: AuthUser) {
    await this.getRaw(id);
    if (!canAccessServer(user, id)) throw new ForbiddenException();
    await this.prisma.server.delete({ where: { id } });
    void this.webConfig.persistServers();
    return { ok: true };
  }

  async connectedCount(id: number, user: AuthUser) {
    if (!canAccessServer(user, id)) throw new ForbiddenException();
    await this.getRaw(id);
    const since = new Date(Date.now() - 10 * 60 * 1000);
    return this.prisma.pppSession.count({
      where: { serverId: id, receivedAt: { gte: since } },
    });
  }

  async probeServer(s: {
    url: string;
    userName?: string | null;
    password?: string | null;
    port?: string | null;
    type: ServerType;
  }) {
    return this.probeMikroTik(
      {
        url: s.url,
        userName: s.userName || undefined,
        password: s.password || undefined,
        port: s.port || undefined,
      },
      s.type,
    );
  }

  private async probeMikroTik(
    data: { url: string; userName?: string; password?: string; port?: string },
    type: ServerType,
  ) {
    if (type === ServerType.RAW) return false;
    try {
      const defaults = await readMikrotikPorts(this.prisma);
      const target = await assertSafeProbeTarget(data.url, data.port || String(defaults.api));
      const user = data.userName || '';
      const pass = data.password || '';
      const auth = Buffer.from(`${user}:${pass}`).toString('base64');
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(`http://${target.ip}:${target.port}/rest/system/resource`, {
          headers: { Authorization: `Basic ${auth}` },
          signal: controller.signal,
          redirect: 'manual',
        });
        return res.ok;
      } finally {
        clearTimeout(t);
      }
    } catch {
      return false;
    }
  }
}
