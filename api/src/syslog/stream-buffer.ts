export type StreamRow = {
  id: number;
  serverId: number;
  receivedAt: Date;
  deviceReportedTime: Date | null;
  userName: string | null;
  gateway: string | null;
  gatewayPort: string | null;
  toHost: string | null;
  toHostPort: string | null;
  fromIp: string | null;
  fromIpPort: string | null;
  macAddress: string | null;
  rawMessage: string | null;
};

const MAX = 200;
const buffers = new Map<number, StreamRow[]>();

export function pushStreamRow(row: StreamRow) {
  const cur = buffers.get(row.serverId) || [];
  if (cur[0]?.id === row.id) return;
  cur.unshift(row);
  if (cur.length > MAX) cur.length = MAX;
  buffers.set(row.serverId, cur);
}

export function seedStreamBuffer(serverId: number, rows: StreamRow[]) {
  if (!rows.length) return;
  const cur = buffers.get(serverId);
  if (cur && cur.length) return;
  buffers.set(serverId, rows.slice(0, MAX));
}

export function readStreamBuffer(serverId: number, afterId?: number) {
  const cur = buffers.get(serverId) || [];
  if (!afterId) return cur;
  return cur.filter((r) => r.id > afterId);
}

export function streamBufferSize(serverId: number) {
  return buffers.get(serverId)?.length || 0;
}
