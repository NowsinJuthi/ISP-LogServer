'use client';

import { FormEvent, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Row = {
  id: number;
  createdAt: string;
  userName?: string | null;
  type?: string | null;
  tableName?: string | null;
  message?: string | null;
};

type Res = { total: number; today: number; page: number; pageSize: number; rows: Row[] };

const TYPES = ['', 'LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'ALERT'];

function badge(type?: string | null) {
  const t = (type || '').toUpperCase();
  if (t === 'LOGIN') return 'bg-brand-soft text-brand-deep';
  if (t === 'ALERT') return 'bg-red-50 text-red-700';
  if (t === 'CREATE') return 'bg-emerald-50 text-emerald-700';
  if (t === 'UPDATE' || t === 'ASSIGN') return 'bg-amber-50 text-amber-700';
  if (t === 'DELETE') return 'bg-red-50 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

export default function ActivityPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [today, setToday] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pages = Math.max(1, Math.ceil(total / pageSize));

  async function load(nextPage = page, nextType = type, nextQ = q) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
      });
      if (nextQ.trim()) params.set('q', nextQ.trim());
      if (nextType) params.set('type', nextType);
      const res = await api<Res>(`/api/activity-logs?${params}`);
      setRows(res.rows || []);
      setTotal(res.total || 0);
      setToday(res.today || 0);
      setPage(res.page || nextPage);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load(1);
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity Logs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Who signed in and what was changed. Entries older than 30 days are deleted automatically.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
          <div className="text-xs text-slate-500">Today</div>
          <div className="text-xl font-semibold tabular-nums">{today.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
          <div className="text-xs text-slate-500">All records</div>
          <div className="text-xl font-semibold tabular-nums">{total.toLocaleString()}</div>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
      )}

      <form onSubmit={onSearch} className="bg-white border border-slate-200 rounded-xl shadow-sm mb-5 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block text-xs font-medium text-slate-600">
            Search
            <input
              className="field"
              placeholder="User, action or details"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Action
            <select
              className="field"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                void load(1, e.target.value, q);
              }}
            >
              {TYPES.map((t) => (
                <option key={t || 'all'} value={t}>
                  {t || 'All actions'}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="ls-btn-search text-sm px-4 py-2.5">
              Search
            </button>
            <button
              type="button"
              className="text-sm px-4 py-2.5 rounded-lg border hover:bg-slate-50"
              onClick={() => {
                setQ('');
                setType('');
                void load(1, '', '');
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-800">History</span>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {total.toLocaleString()} events
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Area</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-slate-400">
                    Loading activity…
                  </td>
                </tr>
              )}
              {!loading && !rows.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="text-slate-700 font-medium">No activity yet</div>
                    <div className="text-slate-400 text-xs mt-1">
                      Sign in, add a user, or change a router — those actions will appear here.
                    </div>
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular-nums">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{r.userName || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge(r.type)}`}>
                        {r.type || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.tableName || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{r.message || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {page} of {pages} · {pageSize} per page
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => void load(page - 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pages || loading}
                onClick={() => void load(page + 1)}
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
