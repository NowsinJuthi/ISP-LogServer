'use client';

import { FormEvent, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { rememberLicenseUnlocked } from '@/lib/useLicenseGate';

const VENDOR = {
  name: 'License administrator',
  whatsapp: '01777139777',
  whatsappLink: 'https://wa.me/8801777139777',
  facebook: 'fb.com/uniqbd.online',
  facebookLink: 'https://fb.com/uniqbd.online',
  website: 'uniqbd.com',
  websiteLink: 'https://uniqbd.com',
} as const;

type LicenseStatus = {
  searchUnlocked?: boolean;
  keySet?: boolean;
  licenseKeyMasked?: string;
  configured?: boolean;
  code?: string;
  message?: string;
};

export default function LicensePage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function load() {
    try {
      const next = await api<LicenseStatus>('/api/license/status');
      rememberLicenseUnlocked(next.searchUnlocked === true);
      setStatus(next);
    } catch (e) {
      setStatus({ searchUnlocked: false });
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 10_000);
    const onVis = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !licenseKey.trim()) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      const next = await api<LicenseStatus>('/api/license/activate', {
        method: 'POST',
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });
      rememberLicenseUnlocked(next.searchUnlocked === true);
      setStatus({ ...next, keySet: true });
      setLicenseKey('');
      setOk('License activated. Extra MikroTik routers and longer Auto Log Delete packages are unlocked.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate() {
    if (busy) return;
    if (!window.confirm('Deactivate this license? Extra MikroTik routers and 3-month/6-month/1-year Auto Log Delete will lock until a key is activated again.')) {
      return;
    }
    setBusy(true);
    setError('');
    setOk('');
    try {
      const next = await api<LicenseStatus>('/api/license/deactivate', { method: 'POST' });
      rememberLicenseUnlocked(next.searchUnlocked === true);
      setStatus(next);
      setLicenseKey('');
      setOk('License deactivated. Extra MikroTik routers and longer Auto Log Delete packages are locked.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const active = status?.searchUnlocked === true;
  const checking = status === null;

  return (
    <Shell>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">License</h1>
        <p className="text-sm text-slate-500 mt-1">
          Activate or deactivate this Log Server. Extra MikroTik routers and 3-month/6-month/1-year Auto Log Delete stay locked until a valid key is active.
        </p>
      </div>

      <section className="ls-page-hero ls-page-hero-gold mb-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <span className="ls-page-icon ls-page-icon-gold" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" strokeWidth="1.8">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="ls-page-kicker ls-page-kicker-gold">uniqbd.com Log Server</p>
              <h2 className="ls-page-title">{checking ? 'Checking license…' : active ? 'License active' : 'License required'}</h2>
              <p className="ls-page-desc">
                {checking
                  ? 'Reading the current license status from this server.'
                  : active
                    ? 'This installation is licensed. Extra MikroTik routers, 3-month, 6-month and 1-year log retention, and other licensed features are available.'
                    : 'Paste a valid license key below to unlock extra MikroTik routers and longer Auto Log Delete packages.'}
              </p>
            </div>
            <div className="shrink-0 sm:text-right">
              <div className={`ls-status-pill ${checking ? '' : active ? '' : 'ls-status-pill-warn'}`}>
                <span
                  className={`h-2 w-2 rounded-full ${
                    checking ? 'bg-slate-300' : active ? 'bg-emerald-400 animate-pulse' : 'bg-gold'
                  }`}
                />
                {checking ? 'Checking…' : active ? 'Active' : 'Locked'}
              </div>
              <div className="ls-page-meta">
                {status?.licenseKeyMasked ? `Key ${status.licenseKeyMasked}` : 'No key saved yet'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <article className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
          <div className="text-xs text-slate-500">Status</div>
          <div className={`text-lg font-semibold mt-1 ${active ? 'text-emerald-700' : 'text-slate-900'}`}>
            {checking ? '—' : active ? 'Unlocked' : 'Locked'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {active ? 'Licensed features can be used' : 'Licensed features stay locked'}
          </div>
        </article>
        <article className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
          <div className="text-xs text-slate-500">Saved key</div>
          <div className="text-lg font-semibold mt-1 font-mono tracking-wide">
            {status?.licenseKeyMasked || 'None'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {status?.keySet ? 'Stored on this server' : 'Activate a key to save it'}
          </div>
        </article>
        <article className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
          <div className="text-xs text-slate-500">License server</div>
          <div className="text-lg font-semibold mt-1">{status?.configured === false ? 'Not configured' : 'Ready'}</div>
          <div className="text-[11px] text-slate-400 mt-1">Amarpin validation for this site</div>
        </article>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <section className="xl:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-medium text-slate-800">{active ? 'License key' : 'Activate license key'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {active
                ? 'This license is active. The key stays hidden with stars. Deactivate to lock extra MikroTik routers and 3-month/6-month/1-year Auto Log Delete.'
                : 'License is not active. Paste the key and press Activate.'}
            </p>
          </div>
          <form onSubmit={onSubmit} className="p-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">License key</span>
              {active ? (
                <input
                  className="field w-full font-mono text-lg tracking-[0.45em] text-slate-800"
                  type="text"
                  value="************************"
                  readOnly
                  disabled
                  autoComplete="off"
                  aria-label="License key saved and hidden"
                />
              ) : (
                <input
                  className="field w-full font-mono"
                  placeholder="Paste license key"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {active ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeactivate()}
                  className="ls-btn-danger min-w-[10rem]"
                >
                  {busy ? 'Please wait…' : 'Deactivate'}
                </button>
              ) : (
                <button type="submit" disabled={busy || !licenseKey.trim()} className="ls-btn-search min-w-[10rem]">
                  {busy ? 'Checking…' : 'Activate'}
                </button>
              )}
            </div>
            {error ? (
              <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            ) : null}
            {ok ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{ok}</p>
            ) : null}
            {status?.configured === false ? (
              <p className="text-xs text-slate-500">License server is not configured on this API.</p>
            ) : null}
            {status?.message && !active && !error ? (
              <p className="text-xs text-slate-500">{status.message}</p>
            ) : null}
          </form>
        </section>

        <div className="xl:col-span-2 space-y-5">
          <section className="ls-contact-panel">
            <div className="ls-contact-head">
              <p className="ls-page-kicker ls-page-kicker-gold">Support</p>
              <h2 className="ls-contact-title mt-2 text-base font-semibold tracking-tight">Contact administrator</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Need a license key? Reach us on WhatsApp, Facebook or uniqbd.com.
              </p>
            </div>
            <a className="ls-contact-row" href={VENDOR.whatsappLink} target="_blank" rel="noreferrer">
              <span className="ls-contact-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 20.4 5 21l.7-2.6A8.5 8.5 0 1 1 12 20.5a8.4 8.4 0 0 1-4.5-1.1Z" />
                  <path strokeLinecap="round" d="M9.2 9.8c.3 1.6 1.6 3 3.2 3.4" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="ls-contact-label">WhatsApp</span>
                <span className="ls-contact-value block truncate">{VENDOR.whatsapp}</span>
              </span>
            </a>
            <a className="ls-contact-row" href={VENDOR.facebookLink} target="_blank" rel="noreferrer">
              <span className="ls-contact-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.6 21v-7.2h2.4l.4-2.8h-2.8V9.2c0-.8.2-1.4 1.4-1.4H16.6V5.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 4v2.6H8v2.8h2.5V21h3.1Z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="ls-contact-label">Facebook</span>
                <span className="ls-contact-value block truncate">{VENDOR.facebook}</span>
              </span>
            </a>
            <a className="ls-contact-row" href={VENDOR.websiteLink} target="_blank" rel="noreferrer">
              <span className="ls-contact-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="8.5" />
                  <path strokeLinecap="round" d="M3.5 12h17M12 3.5c2.4 2.4 3.7 5.4 3.7 8.5s-1.3 6.1-3.7 8.5M12 3.5C9.6 5.9 8.3 8.9 8.3 12s1.3 6.1 3.7 8.5" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="ls-contact-label">Website</span>
                <span className="ls-contact-value block truncate">{VENDOR.website}</span>
              </span>
            </a>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 text-sm font-medium text-slate-800">
              What this license covers
            </div>
            <ul className="p-5 space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                <div>
                  <div className="font-medium text-slate-800">More than one MikroTik</div>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Without a license you can add one router. Extra MikroTik routers unlock after a valid key is active.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                <div>
                  <div className="font-medium text-slate-800">3 months, 6 months and 1 year Auto Log Delete</div>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Add MikroTik keeps 1 month free. Longer retention unlocks after a valid key is active.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                <div>
                  <div className="font-medium text-slate-800">This installation</div>
                  <p className="text-slate-500 text-xs mt-0.5">
                    The key is stored on this server and checked against the license service.
                  </p>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}
