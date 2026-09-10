'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Server = { id: number; serverName: string; url?: string };
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

function today() {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function dash(v?: string | null) {
  return v && v.trim() ? v : '—';
}

function cell(v?: string | null) {
  return dash(v);
}

export default function SearchLogPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [serverId, setServerId] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [fromTime, setFromTime] = useState('00:00');
  const [toTime, setToTime] = useState('23:59');
  const [userName, setUserName] = useState('');
  const [fromIp, setFromIp] = useState('');
  const [fromPort, setFromPort] = useState('');
  const [gateway, setGateway] = useState('');
  const [toHost, setToHost] = useState('');
  const [toPort, setToPort] = useState('');
  const [mac, setMac] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const selected = servers.find((s) => String(s.id) === serverId);

  useEffect(() => {
    api<Server[]>('/api/servers')
      .then((s) => {
        setServers(s);
        if (s[0]) setServerId(String(s[0].id));
      })
      .catch(() => setServers([]));
  }, []);

  async function runSearch(nextPage = 1) {
    if (!serverId) {
      setError('Select a MikroTik server first.');
      return;
    }
    setLoading(true);
    setError('');
    setPage(nextPage);
    try {
      const q = new URLSearchParams({
        serverId,
        from: `${from}T${fromTime}:00`,
        to: `${to}T${toTime}:59`,
        userName,
        fromIp,
        fromPort,
        gateway,
        toHost,
        toPort,
        mac,
        page: String(nextPage),
        pageSize: String(pageSize),
      });
      const res = await api<{ total: number; rows: Row[] }>(`/api/search-log?${q}`);
      setRows(res.rows);
      setTotal(res.total);
      setSearched(true);
    } catch (e) {
      const msg = (e as Error).message || 'Search failed';
      setError(msg);
      setSearched(true);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch(1);
  }

  function clearFilters() {
    setFrom(today());
    setTo(today());
    setFromTime('00:00');
    setToTime('23:59');
    setUserName('');
    setFromIp('');
    setFromPort('');
    setGateway('');
    setToHost('');
    setToPort('');
    setMac('');
    setRows([]);
    setTotal(0);
    setSearched(false);
    setPage(1);
  }

  const activeFilters = useMemo(() => {
    const items: string[] = [];
    if (userName) items.push(`User: ${userName}`);
    if (fromIp) items.push(`Source: ${fromIp}`);
    if (fromPort) items.push(`Src port: ${fromPort}`);
    if (gateway) items.push(`NAT: ${gateway}`);
    if (toHost) items.push(`Dest: ${toHost}`);
    if (toPort) items.push(`Dest port: ${toPort}`);
    if (mac) items.push(`MAC: ${mac}`);
    return items;
  }, [userName, fromIp, fromPort, gateway, toHost, toPort, mac]);

  function exportCsv() {
    const header = ['Time', 'User', 'From', 'From Port', 'Gateway', 'Gateway Port', 'To', 'To Port', 'MAC'];
    const lines = rows.map((r) =>
      [
        new Date(r.receivedAt).toLocaleString(),
        r.userName ?? '',
        r.fromIp ?? '',
        r.fromIpPort ?? '',
        r.gateway ?? '',
        r.gatewayPort ?? '',
        r.toHost ?? '',
        r.toHostPort ?? '',
        r.macAddress ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `search-log-${from}-p${page}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Search Log</h1>
          <p className="text-sm text-slate-500 mt-1">
            Filter NAT and access logs by router, time, user, IP or MAC.
          </p>
        </div>
        {selected && (
          <div className="text-left text-xs text-slate-500 sm:text-right">
            <div className="font-medium text-slate-700">{selected.serverName}</div>
            <div className="font-mono">{selected.url}</div>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="bg-white border border-slate-200 rounded-xl shadow-sm mb-5">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Search filters</span>
          <button type="button" onClick={clearFilters} className="text-xs text-slate-500 hover:text-accent">
            Clear all
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="MikroTik server">
            <select className="field" value={serverId} onChange={(e) => setServerId(e.target.value)}>
              {servers.length === 0 && <option value="">No server added</option>}
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.serverName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From date">
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To date">
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From time">
              <input type="time" className="field" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
            </Field>
            <Field label="To time">
              <input type="time" className="field" value={toTime} onChange={(e) => setToTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Username">
            <input className="field" placeholder="PPPoE / hotspot user" value={userName} onChange={(e) => setUserName(e.target.value)} />
          </Field>
          <Field label="Source IP">
            <input className="field font-mono" placeholder="Optional" value={fromIp} onChange={(e) => setFromIp(e.target.value)} />
          </Field>
          <Field label="Source Port">
            <input className="field font-mono" placeholder="Optional" value={fromPort} onChange={(e) => setFromPort(e.target.value)} />
          </Field>
          <Field label="Dest IP">
            <input className="field font-mono" placeholder="Optional" value={toHost} onChange={(e) => setToHost(e.target.value)} />
          </Field>
          <Field label="Dest Port">
            <input className="field font-mono" placeholder="Optional" value={toPort} onChange={(e) => setToPort(e.target.value)} />
          </Field>
          <Field label="MAC address">
            <input className="field font-mono" placeholder="Optional" value={mac} onChange={(e) => setMac(e.target.value)} />
          </Field>
          <Field label="NAT / Gateway IP">
            <input className="field font-mono" placeholder="Optional" value={gateway} onChange={(e) => setGateway(e.target.value)} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-2 flex items-end gap-2">
            <button
              className="ls-btn-search"
              type="submit"
              disabled={loading || !serverId}
            >
              {loading ? 'Searching…' : 'Search logs'}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-800">Results</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {searched ? `${total.toLocaleString()} records` : 'No search yet'}
            </span>
            {activeFilters.map((f) => (
              <span key={f} className="text-xs bg-brand-soft text-brand-deep px-2 py-0.5 rounded-full">
                {f}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
            className="text-xs font-medium border rounded-lg px-3 py-1.5 disabled:opacity-40 hover:bg-slate-50"
          >
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
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
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-slate-400">
                    Searching logs…
                  </td>
                </tr>
              )}
              {!loading && searched && !rows.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="text-slate-700 font-medium">No matching logs</div>
                    <div className="text-slate-400 text-xs mt-1">
                      Try a wider date range or check MikroTik syslog is reaching this server.
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !searched && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-slate-400">
                    Choose a router and date, then search.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular-nums">
                      {new Date(r.receivedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{cell(r.userName)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{cell(r.fromIp)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{cell(r.fromIpPort)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{cell(r.gateway)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{cell(r.gatewayPort)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{cell(r.toHost)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{cell(r.toHostPort)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{cell(r.macAddress)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {searched && total > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {page} of {pages} · {pageSize} per page
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => void runSearch(page - 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pages || loading}
                onClick={() => void runSearch(page + 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
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
      `}</style>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}
