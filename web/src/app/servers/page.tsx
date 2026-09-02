'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { useLicenseGate } from '@/lib/useLicenseGate';

type Retention = 'ONE_MONTH' | 'THREE_MONTHS' | 'SIX_MONTHS' | 'ONE_YEAR';

type ServerRow = {
  id: number;
  serverName: string;
  url: string;
  userName?: string;
  passwordSet?: boolean;
  port?: string;
  type: string;
  natIp?: string;
  listeningPort: number;
  logServerUrl: string;
  retention: Retention;
  connectivityStatus: boolean;
  disabled: boolean;
};

const empty = {
  serverName: '',
  url: '',
  userName: '',
  password: '',
  port: '1122',
  type: 'NAT+ACCESS',
  natIp: '',
  listeningPort: 514,
  logServerUrl: 'localhost',
  retention: 'ONE_MONTH' as Retention,
};

function retentionLabel(r: Retention) {
  if (r === 'ONE_MONTH') return '1 month';
  if (r === 'THREE_MONTHS') return '3 months';
  if (r === 'ONE_YEAR') return '1 year';
  return '6 months';
}

function retentionRequiresLicense(r: Retention) {
  return r === 'THREE_MONTHS' || r === 'SIX_MONTHS' || r === 'ONE_YEAR';
}

function blankForm(apiPort: string, licensed: boolean) {
  return { ...empty, port: apiPort, retention: (licensed ? 'SIX_MONTHS' : 'ONE_MONTH') as Retention };
}

type MtPorts = { api: string; winbox: string; firewall: string };

export default function ServersPage() {
  const [rows, setRows] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ports, setPorts] = useState<MtPorts>({ api: '1122', winbox: '1122', firewall: '1122' });
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const { unlocked: licensed } = useLicenseGate();
  const raw = form.type === 'RAW';
  const access = form.type === 'ACCESS';
  const atRouterLimit = !licensed && rows.length >= 1;

  function load() {
    api<ServerRow[]>('/api/servers?all=1')
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  useEffect(() => {
    api<{ mikrotikApiPort?: number; mikrotikWinboxPort?: number; mikrotikFirewallPort?: number }>('/api/branding')
      .then((r) => {
        const next = {
          api: String(r.mikrotikApiPort || 1122),
          winbox: String(r.mikrotikWinboxPort || 1122),
          firewall: String(r.mikrotikFirewallPort || 1122),
        };
        setPorts(next);
        setForm((f) => (f.port === '1122' || !f.port ? { ...f, port: next.api } : f));
      })
      .catch(() => {});
  }, []);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      if (!editId && !licensed && rows.length >= 1) {
        setError('Unlicensed servers can add only one MikroTik. Activate a license key to add more.');
        return;
      }
      if (!licensed && retentionRequiresLicense(form.retention)) {
        setError('3 months, 6 months and 1 year require an active license. Activate a license key or choose 1 month.');
        return;
      }
      const body = {
        ...form,
        listeningPort: Number(form.listeningPort),
        password: form.password.trim() || undefined,
      };
      if (editId) await api(`/api/servers/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/servers', { method: 'POST', body: JSON.stringify(body) });
      setOpen(false);
      setEditId(null);
      setForm(blankForm(ports.api, licensed));
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r: ServerRow) {
    setEditId(r.id);
    setForm({
      serverName: r.serverName,
      url: r.url,
      userName: r.userName || '',
      password: '',
      port: r.port || '1122',
      type: r.type,
      natIp: r.natIp || '',
      listeningPort: r.listeningPort,
      logServerUrl: r.logServerUrl || 'localhost',
      retention: r.retention,
    });
    setOpen(true);
  }

  return (
    <Shell>
      <section className={`ls-page-hero mb-5 ${atRouterLimit ? 'ls-page-hero-gold' : ''}`}>
        <div className="flex items-start gap-3 sm:gap-4">
          <span className={`ls-page-icon ${atRouterLimit ? 'ls-page-icon-gold' : ''}`} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" strokeWidth="1.8">
              <rect x="3.5" y="7" width="17" height="11" rx="2" />
              <path strokeLinecap="round" d="M7 7V5.8A1.8 1.8 0 0 1 8.8 4h6.4A1.8 1.8 0 0 1 17 5.8V7M8 18v2M16 18v2" />
              <path strokeLinecap="round" d="M8 12.5h.01M12 12.5h.01M16 12.5h.01" />
            </svg>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className={`ls-page-kicker ${atRouterLimit ? 'ls-page-kicker-gold' : ''}`}>MikroTik routers</p>
              <h1 className="ls-page-title">Add MikroTik</h1>
              <p className="ls-page-desc">
                Register NAT, Access or RAW routers and collect log transactions. Disabled routers stay
                in this list — use Enable to turn them back on.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="ls-port-chip">
                  <span className="ls-port-chip-key">API</span>
                  {ports.api}
                </span>
                <span className="ls-port-chip">
                  <span className="ls-port-chip-key">Winbox</span>
                  {ports.winbox}
                </span>
                <span className="ls-port-chip">
                  <span className="ls-port-chip-key">Firewall</span>
                  {ports.firewall}
                </span>
              </div>
            </div>
            <button
              className="ls-btn-search shrink-0 self-start"
              disabled={atRouterLimit}
              title={atRouterLimit ? 'Activate a license key to add more than one MikroTik' : undefined}
              onClick={() => {
                if (atRouterLimit) return;
                setEditId(null);
                setForm(blankForm(ports.api, licensed));
                setError('');
                setOpen(true);
              }}
            >
              Add Server
            </button>
          </div>
        </div>
        {atRouterLimit ? (
          <div className="ls-license-note">
            <p>Without a license you can keep one MikroTik. Activate a key to add more routers.</p>
            <Link href="/license">Activate License Key</Link>
          </div>
        ) : null}
      </section>
      <div className="flex gap-2 mb-3 text-sm">
        {(['all', 'active', 'disabled'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg border ${
              filter === f ? 'ls-chip-on border-transparent' : 'bg-white border-slate-200'
            }`}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Disabled'}
          </button>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Server Name</th>
              <th className="p-3">IP</th>
              <th className="p-3">NAT IP</th>
              <th className="p-3">Type</th>
              <th className="p-3">Listening Port</th>
              <th className="p-3">Auto Log Delete</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => filter === 'all' || (filter === 'disabled' ? r.disabled : !r.disabled))
              .map((r) => (
              <tr key={r.id} className={`border-t border-slate-100 ${r.disabled ? 'bg-slate-50 text-slate-500' : ''}`}>
                <td className="p-3">{r.serverName}</td>
                <td className="p-3">{r.url}</td>
                <td className="p-3">{r.natIp}</td>
                <td className="p-3">{r.type}</td>
                <td className="p-3">{r.listeningPort}</td>
                <td className="p-3">{retentionLabel(r.retention)}</td>
                <td className="p-3">
                  {r.disabled ? 'Disabled' : r.connectivityStatus ? 'Online' : 'Offline'}
                </td>
                <td className="p-3 text-right space-x-2">
                  <button className="ls-btn-edit" onClick={() => startEdit(r)}>
                    Edit
                  </button>
                  <button
                    className="text-slate-600 disabled:opacity-40"
                    disabled={busyId === r.id}
                    onClick={async () => {
                      if (busyId) return;
                      setBusyId(r.id);
                      try {
                        await api(`/api/servers/${r.id}/toggle`, { method: 'POST' });
                        load();
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {r.disabled ? 'Enable' : 'Disable'}
                  </button>
                  <button
                    className="text-red-600 disabled:opacity-40"
                    disabled={busyId === r.id}
                    onClick={async () => {
                      if (busyId) return;
                      if (!confirm('Delete this server?')) return;
                      setBusyId(r.id);
                      try {
                        await api(`/api/servers/${r.id}`, { method: 'DELETE' });
                        load();
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td className="p-6 text-slate-400" colSpan={8}>
                  Loading routers…
                </td>
              </tr>
            )}
            {!loading && !rows.length && (
              <tr>
                <td className="p-6 text-slate-400" colSpan={8}>
                  No servers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={save} className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">{editId ? 'Edit Server' : 'Add Server'}</h2>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Server Name">
                <input required className="input" value={form.serverName} onChange={(e) => set('serverName', e.target.value)} />
              </Field>
              <Field label="IP / Url">
                <input required className="input" value={form.url} onChange={(e) => set('url', e.target.value)} />
              </Field>
              <Field label="Type">
                <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
                  <option>NAT+ACCESS</option>
                  <option>NAT</option>
                  <option>ACCESS</option>
                  <option>RAW</option>
                </select>
              </Field>
              <Field label="NAT Router's IP">
                <input className="input" value={form.natIp} onChange={(e) => set('natIp', e.target.value)} />
              </Field>
              {!raw && (
                <>
                  <Field label="UserName">
                    <input className="input" value={form.userName} onChange={(e) => set('userName', e.target.value)} />
                  </Field>
                  <Field label="Password">
                    <input type="password" className="input" value={form.password} placeholder={editId ? 'Leave blank to keep' : ''} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
                  </Field>
                  <Field label={`MikroTik API port (${ports.api})`}>
                    <input className="input" value={form.port} onChange={(e) => set('port', e.target.value)} />
                  </Field>
                </>
              )}
              {!access && (
                <Field label="Listening Port">
                  <input
                    className="input"
                    value={form.listeningPort}
                    onChange={(e) => set('listeningPort', Number(e.target.value))}
                  />
                </Field>
              )}
              <Field label="Log Server URL (this PC, e.g. 192.168.133.12)">
                <input className="input" value={form.logServerUrl} onChange={(e) => set('logServerUrl', e.target.value)} />
              </Field>
              <div className="col-span-2">
                <Field label="Auto Log Delete">
                  <select
                    className="input"
                    value={form.retention}
                    onChange={(e) => set('retention', e.target.value as Retention)}
                  >
                    <option value="ONE_MONTH">1 month</option>
                    <option value="THREE_MONTHS" disabled={!licensed}>
                      {licensed ? '3 months' : '3 months — license required'}
                    </option>
                    <option value="SIX_MONTHS" disabled={!licensed}>
                      {licensed ? '6 months' : '6 months — license required'}
                    </option>
                    <option value="ONE_YEAR" disabled={!licensed}>
                      {licensed ? '1 year' : '1 year — license required'}
                    </option>
                  </select>
                </Field>
                {!licensed ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Only 1 month is free. 3 months, 6 months and 1 year stay locked until a license key is active.{' '}
                    <Link href="/license" className="text-accent underline">
                      Activate License Key
                    </Link>
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-4 py-2 border border-slate-200 rounded-lg" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className="ls-btn-search px-4 py-2">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          padding: 0.5rem 0.7rem;
          font-size: 0.875rem;
          background: #fff;
        }
        .input:focus {
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
    <label className="block text-sm">
      <span className="block mb-1 text-slate-600">{label}</span>
      {children}
    </label>
  );
}
