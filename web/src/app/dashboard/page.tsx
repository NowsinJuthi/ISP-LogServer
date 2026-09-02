'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import HostStats from './HostStats';

type RouterRow = {
  id: number;
  serverName: string;
  url: string;
  type: string;
  disabled: boolean;
  online: boolean;
  logs: number;
};

type RecentRow = {
  id: number;
  receivedAt: string;
  userName?: string | null;
  fromIp?: string | null;
  fromIpPort?: string | null;
  gateway?: string | null;
  toHost?: string | null;
  serverName: string;
};

type Dash = {
  companyName: string;
  greetingName: string;
  syslogRunning: boolean;
  syslogPort: number;
  syslogError?: string;
  syslogReceived: number;
  servers: number;
  online: number;
  offline: number;
  disabled: number;
  users: number;
  activeUsers: number;
  todayLogs: number;
  totalLogs: number;
  daily: { date: string; count: number }[];
  hourly: { hour: number; count: number }[];
  routers: RouterRow[];
  recent: RecentRow[];
  can?: { users?: boolean; servers?: boolean; search?: boolean; stream?: boolean };
};

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Welcome back';
}

function dash(n?: number) {
  return typeof n === 'number' ? n.toLocaleString() : '—';
}

function weekday(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
}

export default function DashboardPage() {
  const [s, setS] = useState<Dash | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  async function load() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await api<Dash>('/api/dashboard');
      setS(data);
      setUpdatedAt(new Date());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(t);
  }, []);

  const maxHour = useMemo(() => Math.max(1, ...(s?.hourly.map((h) => h.count) || [1])), [s]);
  const maxDay = useMemo(() => Math.max(1, ...(s?.daily.map((d) => d.count) || [1])), [s]);
  const currentHour = new Date().getHours();

  return (
    <Shell>
      <section className="ls-page-hero mb-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <span className="ls-page-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" strokeWidth="1.8">
              <path strokeLinecap="round" d="M4 19V5m5 14V9m5 10V7m5 12V3" />
            </svg>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="ls-page-kicker">uniqbd.com Log Server</p>
              <h1 className="ls-page-title">
                {greeting()}, {s?.greetingName || 'there'}
              </h1>
              <p className="ls-page-desc">
                Live status of your MikroTik routers and syslog received today.
              </p>
            </div>
            <div className="shrink-0 sm:text-right">
              <div className={`ls-status-pill ${!s ? '' : s.syslogRunning ? '' : 'ls-status-pill-down'}`}>
                <span className={`h-2 w-2 rounded-full ${!s ? 'bg-slate-300' : s.syslogRunning ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                {!s ? 'Checking syslog…' : s.syslogRunning ? `Syslog live · UDP ${s.syslogPort}` : 'Syslog stopped'}
              </div>
              <div className="ls-page-meta">
                {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading…'} · auto 20s
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3 mb-5">
        <Stat label="Active routers" value={dash(s?.servers)} hint={`${s?.online ?? 0} online`} />
        <Stat label="Online" value={dash(s?.online)} hint={`${s?.offline ?? 0} offline`} tone="ok" />
        <Stat label="Today’s logs" value={dash(s?.todayLogs)} hint={`${dash(s?.totalLogs)} stored`} />
        <Stat label="Users" value={dash(s?.users)} hint={`${s?.activeUsers ?? 0} active`} />
        <Stat label="Disabled" value={dash(s?.disabled)} hint="Hidden from live use" tone="warn" />
        <Stat
          label="Syslog packets"
          value={dash(s?.syslogReceived)}
          hint={!s ? 'Checking…' : s.syslogRunning ? 'Received today' : 'Listener down'}
        />
      </div>

      <HostStats />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {(s?.can?.stream !== false) && (
          <Action href="/log-stream" title="Realtime Log Stream" text="Watch today’s live traffic" />
        )}
        {(s?.can?.search !== false) && (
          <Action href="/search-log" title="Search Log" text="Filter user, IP or MAC" />
        )}
        {(s?.can?.servers !== false) && (
          <Action href="/servers" title="Add MikroTik" text="Register or enable a router" />
        )}
        {(s?.can?.users !== false) && (
          <Action href="/users" title="User Manager" text="Accounts and roles" />
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <article className="xl:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">Today’s hourly activity</span>
            <span className="text-xs text-slate-400">{dash(s?.todayLogs)} events</span>
          </div>
          <div className="px-5 pt-5 pb-2 h-44 flex items-end gap-1">
            {(s?.hourly || Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))).map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group">
                <div
                  className={`w-full max-w-[14px] rounded-t ${
                    h.hour === currentHour ? 'bg-accent' : 'bg-navy-900/80'
                  }`}
                  style={{ height: `${Math.max(h.count ? 8 : 2, (h.count / maxHour) * 100)}%` }}
                  title={`${h.hour}:00 · ${h.count}`}
                />
              </div>
            ))}
          </div>
          <div className="px-5 pb-3 flex justify-between text-[10px] text-slate-400">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </article>

        <article className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-sm font-medium text-slate-800">Last 7 days</div>
          <div className="p-5 space-y-3">
            {(s?.daily || []).map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="w-9 text-xs text-slate-500">{weekday(d.date)}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full"
                    style={{ width: `${Math.max(d.count ? 6 : 0, (d.count / maxDay) * 100)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs tabular-nums text-slate-600">{d.count.toLocaleString()}</span>
              </div>
            ))}
            {!s?.daily?.length && <div className="text-sm text-slate-400 py-8 text-center">No weekly data yet</div>}
          </div>
        </article>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <article className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">Routers</span>
            <Link href="/servers" className="text-xs text-accent hover:underline">
              Manage
            </Link>
          </div>
          <div>
            {!s && <div className="px-5 py-10 text-center text-sm text-slate-400">Loading routers…</div>}
            {s && !s.routers.length && (
              <div className="px-5 py-10 text-center">
                <div className="text-sm font-medium text-slate-700">No MikroTik added</div>
                <Link href="/servers" className="text-xs text-accent hover:underline mt-1 inline-block">
                  Add the first router
                </Link>
              </div>
            )}
            {s?.routers.map((r) => (
              <div key={r.id} className="px-5 py-3 border-t border-slate-100 flex items-center gap-3">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    r.disabled ? 'bg-slate-300' : r.online ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{r.serverName}</div>
                  <div className="text-xs text-slate-400 font-mono truncate">{r.url}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">{r.type}</div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">Latest logs</span>
            <Link href="/log-stream" className="text-xs text-accent hover:underline">
              Open stream
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-4 py-2.5 font-medium">From</th>
                  <th className="px-4 py-2.5 font-medium">To</th>
                </tr>
              </thead>
              <tbody>
                {s && !s.recent.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                      Waiting for syslog…
                    </td>
                  </tr>
                )}
                {s?.recent.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500 tabular-nums">
                      {new Date(r.receivedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.userName || '—'}</div>
                      <div className="text-[11px] text-slate-400">{r.serverName}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                      {r.fromIp || '—'}
                      {r.fromIpPort ? <span className="text-slate-400"> : {r.fromIpPort}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{r.toHost || r.gateway || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </Shell>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'ok' | 'warn';
}) {
  const color = tone === 'ok' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{hint}</div>
    </div>
  );
}

function Action({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 hover:border-accent/40 hover:bg-slate-50 transition-colors"
    >
      <div className="text-sm font-medium text-slate-800">{title}</div>
      <div className="text-xs text-slate-500 mt-0.5">{text}</div>
    </Link>
  );
}
