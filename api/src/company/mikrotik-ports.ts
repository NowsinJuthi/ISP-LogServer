import { PrismaService } from '../prisma.service';

export const DEFAULT_MIKROTIK_API_PORT = 1122;

export function clampTcpPort(value: unknown, fallback = DEFAULT_MIKROTIK_API_PORT) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}

export type MikrotikPorts = {
  api: number;
  winbox: number;
  firewall: number;
};

let cache: { at: number; ports: MikrotikPorts } | null = null;

export function invalidateMikrotikPortsCache() {
  cache = null;
}

export async function readMikrotikPorts(prisma: PrismaService): Promise<MikrotikPorts> {
  if (cache && Date.now() - cache.at < 10_000) return cache.ports;
  const row = await prisma.companySetting.findFirst({
    select: {
      mikrotikApiPort: true,
      mikrotikWinboxPort: true,
      mikrotikFirewallPort: true,
    },
  });
  const ports: MikrotikPorts = {
    api: clampTcpPort(row?.mikrotikApiPort),
    winbox: clampTcpPort(row?.mikrotikWinboxPort),
    firewall: clampTcpPort(row?.mikrotikFirewallPort),
  };
  cache = { at: Date.now(), ports };
  return ports;
}
