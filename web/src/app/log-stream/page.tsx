'use client';

import { useEffect, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Server = { id: number; serverName: string; url?: string; connectivityStatus?: boolean };
type Row = {
  id: number;
  receivedAt: string;
  userName?: string | null;
  fromIp?: string | null;
  fromIpPort?: string | null;
  gateway?: string | null;
  gatewayPort?: string | null;
  toHost?: string | null;
  toHostPort?: string | null;
  macAddress?: string | null;
};

function dash(v?: string | null) {
  return v && v.trim() ? v : '—';
}

export default function LogStreamPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [serverId, setServerId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const knownIds = useRef<Set<number>>(new Set());
  const newestId = useRef(0);
  const firstLoad = useRef(true);
  const inFlight = useRef(false);

  const selected = servers.find((s) => String(s.id) === serverId);
  const latest = rows[0];

  useEffect(() => {
    api<Server[]>('/api/servers')
      .then((s) => {
        setServers(s);
        if (s[0]) setServerId(String(s[0].id));
      })
      .catch(() => setServers([]));
  }, []);

  async function load(mode: 'replace' | 'silent') {
    if (!serverId || inFlight.current) return;
    inFlight.current = true;
    if (mode === 'replace') setLoading(true);
    try {
      const q = new URLSearchParams({
        serverId,
        pageSize: '80',
      });
      if (mode === 'silent' && newestId.current) {
        q.set('afterId', String(newestId.current));
      }
      const res = await api<{ total: number; rows: Row[] }>(`/api/log-stream?${q}`);
      const incoming = res.rows || [];
      setError('');
      setUpdatedAt(new Date());

      if (incoming.length) {
        newestId.current = Math.max(newestId.current, ...incoming.map((r) => r.id));
      }

      if (mode === 'replace' || firstLoad.current || !knownIds.current.size) {
        firstLoad.current = false;
        knownIds.current = new Set(incoming.map((r) => r.id));
        setRows(incoming);
        return;
      }

      const fresh = incoming.filter((r) => !knownIds.current.has(r.id));
      if (!fresh.length) return;
      for (const r of fresh) knownIds.current.add(r.id);
      if (knownIds.current.size > 2000) {
        knownIds.current = new Set([...knownIds.current].slice(-800));
      }
      setRows((prev) => {
        const seen = new Set(fresh.map((r) => r.id));
        const next = [...fresh, ...prev.filter((r) => !seen.has(r.id))].slice(0, 120);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!serverId) return;
    firstLoad.current = true;
    knownIds.current = new Set();
    newestId.current = 0;
    setRows([]);
    void load('replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  useEffect(() => {
    if (!serverId || !live) return undefined;
    const timer = window.setInterval(() => void load('silent'), 2000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, live]);

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Realtime Log Stream</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live syslog from the selected MikroTik, newest first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
              live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {live ? 'Live' : 'Paused'}
          </span>
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className="text-xs font-medium border rounded-lg px-3 py-1.5 hover:bg-slate-50"
          >
            {live ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            onClick={() => void load('replace')}
            disabled={loading || !serverId}
            className="text-xs font-medium border rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-5 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block text-xs font-medium text-slate-600">
            MikroTik server
            <select
              className="field"
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
            >
              {servers.length === 0 && <option value="">No server added</option>}
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.serverName}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="text-xs font-medium text-slate-600">Router IP</div>
            <div className="field bg-slate-50 font-mono text-slate-600">{selected?.url || '—'}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600">On screen</div>
            <div className="field bg-slate-50 tabular-nums">{rows.length.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600">Last received</div>
            <div className="field bg-slate-50 text-slate-600">
              {latest ? new Date(latest.receivedAt).toLocaleTimeString() : '—'}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-800">Live stream</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              Latest {rows.length.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-slate-400">
            {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : loading ? 'Loading…' : ''}
            {live ? ' · auto every 2s' : ''}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm log-stream-table">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Source IP</th>
                <th className="px-4 py-3 font-medium">Source Port</th>
                <th className="px-4 py-3 font-medium">NAT IP</th>
                <th className="px-4 py-3 font-medium">NAT Port</th>
                <th className="px-4 py-3 font-medium">Dest IP</th>
                <th className="px-4 py-3 font-medium">Dest Port</th>
                <th className="px-4 py-3 font-medium">MAC</th>
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-slate-400">
                    Loading stream…
                  </td>
                </tr>
              )}
              {!loading && !serverId && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-slate-400">
                    Add a MikroTik first, then open Realtime Log Stream.
                  </td>
                </tr>
              )}
              {!loading && serverId && !rows.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="text-slate-700 font-medium">Waiting for syslog…</div>
                    <div className="text-slate-400 text-xs mt-1">
                      Point MikroTik remote syslog to this server on UDP 514. Prefix firewall with
                      prerouting: and PPP with PPPLOG.
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular-nums">
                    {new Date(r.receivedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium">{dash(r.userName)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{dash(r.fromIp)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{dash(r.fromIpPort)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{dash(r.gateway)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{dash(r.gatewayPort)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{dash(r.toHost)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{dash(r.toHostPort)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{dash(r.macAddress)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx global>{`
        .field {
          width: 100%;
          margin-top: 0.35rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          padding: 0.5rem 0.7rem;
          font-size: 0.875rem;
          background: #fff;
        }
        .field:focus {
          outline: none;
          border-color: #26bfb0;
          box-shadow: 0 0 0 3px rgba(38, 191, 176, 0.22);
        }
        .log-stream-table {
          border-collapse: separate;
          border-spacing: 0;
        }
      `}</style>
    </Shell>
  );
}
