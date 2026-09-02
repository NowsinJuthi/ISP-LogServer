'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type HostMetrics = {
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  cpuPercent: number;
  cpuHistory: number[];
  load1: number;
  load5: number;
  load15: number;
  memory: { total: number; used: number; available: number; percent: number };
  swap: { total: number; used: number; percent: number };
  disk: { total: number; used: number; free: number; percent: number };
  network: { rxBps: number; txBps: number };
  uptimeSec: number;
  sampledAt: string;
};

function fmtBytes(n: number, digits = 1) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : digits)} ${units[i]}`;
}

function fmtBps(n: number) {
  return `${fmtBytes(n)}/s`;
}

function fmtUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function tone(pct: number) {
  if (pct >= 90) return { bar: 'bg-rose-500', text: 'text-rose-600' };
  if (pct >= 75) return { bar: 'bg-amber-500', text: 'text-amber-600' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-600' };
}

export default function HostStats() {
  const [h, setH] = useState<HostMetrics | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const data = await api<HostMetrics>('/api/dashboard/host');
        if (alive) setH(data);
      } catch {
        /* keep last snapshot */
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-5 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800">Log server</div>
          <div className="text-[11px] text-slate-400 truncate">
            {h
              ? `${h.hostname} · ${h.cpuCores} cores · up ${fmtUptime(h.uptimeSec)} · load ${h.load1.toFixed(2)}`
              : 'Reading host metrics…'}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        <Metric
          label="CPU"
          value={h ? `${h.cpuPercent.toFixed(0)}%` : '—'}
          hint={h ? h.cpuModel : 'Processor'}
          percent={h?.cpuPercent ?? 0}
          history={h?.cpuHistory}
        />
        <Metric
          label="Memory"
          value={h ? `${h.memory.percent.toFixed(0)}%` : '—'}
          hint={h ? `${fmtBytes(h.memory.used)} / ${fmtBytes(h.memory.total)}` : 'RAM'}
          percent={h?.memory.percent ?? 0}
          extra={h && h.swap.total ? `Swap ${h.swap.percent.toFixed(0)}%` : undefined}
        />
        <Metric
          label="Storage"
          value={h ? `${h.disk.percent.toFixed(0)}%` : '—'}
          hint={h ? `${fmtBytes(h.disk.used)} / ${fmtBytes(h.disk.total)}` : 'Disk'}
          percent={h?.disk.percent ?? 0}
          extra={h ? `${fmtBytes(h.disk.free)} free` : undefined}
        />
        <Metric
          label="Network"
          value={h ? fmtBps(h.network.rxBps + h.network.txBps) : '—'}
          hint={h ? `↓ ${fmtBps(h.network.rxBps)}  ↑ ${fmtBps(h.network.txBps)}` : 'Throughput'}
          percent={h ? Math.min(100, ((h.network.rxBps + h.network.txBps) / (50 * 1024 * 1024)) * 100) : 0}
          noTone
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  percent,
  extra,
  history,
  noTone,
}: {
  label: string;
  value: string;
  hint: string;
  percent: number;
  extra?: string;
  history?: number[];
  noTone?: boolean;
}) {
  const t = tone(percent);
  const bar = noTone ? 'bg-accent' : t.bar;
  const text = noTone ? 'text-slate-900' : t.text;
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${text}`}>{value}</div>
          <div className="text-[11px] text-slate-400 mt-1 truncate" title={hint}>
            {hint}
          </div>
          {extra ? <div className="text-[11px] text-slate-400">{extra}</div> : null}
        </div>
        {history && history.length > 1 ? <Sparkline values={history} /> : null}
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
        <div
          className={`h-full rounded-full ${bar} transition-all duration-700`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 72;
  const h = 28;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 mt-1" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.6" points={pts} className="text-brand" />
    </svg>
  );
}
