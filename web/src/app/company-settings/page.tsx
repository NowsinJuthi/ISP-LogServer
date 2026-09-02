'use client';

import { FormEvent, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Company = {
  companyName?: string;
  logServerUrl?: string | null;
  mobileNumber?: string | null;
  contactEmail?: string | null;
  smsSendingEnable?: boolean;
  smsProviderUserId?: string | null;
  smsProviderSender?: string | null;
  smsProviderId?: string | null;
  smsPasswordSet?: boolean;
  smsSentToday?: number;
  lastSmsSend?: string | null;
  emailSendingEnable?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
  smtpPasswordSet?: boolean;
  mikrotikApiPort?: number | null;
  mikrotikWinboxPort?: number | null;
  mikrotikFirewallPort?: number | null;
  faviconUrl?: string | null;
};

const empty = {
  companyName: 'uniqbd.com Log Server',
  logServerUrl: 'localhost',
  mobileNumber: '',
  contactEmail: '',
  smsSendingEnable: false,
  smsProviderUserId: '',
  smsProviderSender: '',
  smsProviderId: '',
  smsProviderPassword: '',
  emailSendingEnable: false,
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: true,
  smtpUser: '',
  smtpPassword: '',
  smtpFromEmail: '',
  smtpFromName: '',
  mikrotikApiPort: '1122',
  mikrotikWinboxPort: '1122',
  mikrotikFirewallPort: '1122',
};

export default function CompanyPage() {
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState(empty);
  const [smsPasswordSet, setSmsPasswordSet] = useState(false);
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smsSentToday, setSmsSentToday] = useState(0);
  const [lastSmsSend, setLastSmsSend] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [testWarn, setTestWarn] = useState<{ kind: 'email' | 'sms'; message: string } | null>(null);

  const dirty =
    form.companyName !== saved.companyName ||
    form.logServerUrl !== saved.logServerUrl ||
    form.mobileNumber !== saved.mobileNumber ||
    form.contactEmail !== saved.contactEmail ||
    form.smsSendingEnable !== saved.smsSendingEnable ||
    form.smsProviderUserId !== saved.smsProviderUserId ||
    form.smsProviderSender !== saved.smsProviderSender ||
    form.smsProviderId !== saved.smsProviderId ||
    !!form.smsProviderPassword ||
    form.emailSendingEnable !== saved.emailSendingEnable ||
    form.smtpHost !== saved.smtpHost ||
    form.smtpPort !== saved.smtpPort ||
    form.smtpSecure !== saved.smtpSecure ||
    form.smtpUser !== saved.smtpUser ||
    form.smtpFromEmail !== saved.smtpFromEmail ||
    form.smtpFromName !== saved.smtpFromName ||
    form.mikrotikApiPort !== saved.mikrotikApiPort ||
    form.mikrotikWinboxPort !== saved.mikrotikWinboxPort ||
    form.mikrotikFirewallPort !== saved.mikrotikFirewallPort ||
    !!form.smtpPassword;

  function apply(r: Company) {
    const next = {
      companyName: r.companyName || 'uniqbd.com Log Server',
      logServerUrl: r.logServerUrl || '',
      mobileNumber: r.mobileNumber || '',
      contactEmail: r.contactEmail || '',
      smsSendingEnable: !!r.smsSendingEnable,
      smsProviderUserId: r.smsProviderUserId || '',
      smsProviderSender: r.smsProviderSender || '',
      smsProviderId: r.smsProviderId || '',
      smsProviderPassword: '',
      emailSendingEnable: !!r.emailSendingEnable,
      smtpHost: r.smtpHost || '',
      smtpPort: r.smtpPort ? String(r.smtpPort) : '587',
      smtpSecure: r.smtpSecure !== false,
      smtpUser: r.smtpUser || '',
      smtpPassword: '',
      smtpFromEmail: r.smtpFromEmail || '',
      smtpFromName: r.smtpFromName || '',
      mikrotikApiPort: String(r.mikrotikApiPort || 1122),
      mikrotikWinboxPort: String(r.mikrotikWinboxPort || 1122),
      mikrotikFirewallPort: String(r.mikrotikFirewallPort || 1122),
    };
    setForm(next);
    setSaved(next);
    setSmsPasswordSet(!!r.smsPasswordSet);
    setSmtpPasswordSet(!!r.smtpPasswordSet);
    setSmsSentToday(r.smsSentToday || 0);
    setLastSmsSend(r.lastSmsSend || null);
    setFaviconUrl(r.faviconUrl || '');
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api<Company>('/api/company-settings');
      apply(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setNotice('');
    setTestWarn(null);
  }

  async function uploadFavicon(file: File) {
    if (faviconBusy) return;
    setFaviconBusy(true);
    setError('');
    setNotice('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/company-settings/favicon', {
        method: 'POST',
        credentials: 'include',
        body,
      });
      const data = (await res.json().catch(() => ({}))) as Company & { message?: string };
      if (!res.ok) {
        throw new Error(typeof data.message === 'string' ? data.message : `Upload failed (${res.status})`);
      }
      const nextUrl = data.faviconUrl || '';
      setFaviconUrl(nextUrl);
      window.dispatchEvent(
        new CustomEvent('company-updated', {
          detail: { companyName: form.companyName, faviconUrl: nextUrl || null },
        }),
      );
      setNotice('Browser favicon saved');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFaviconBusy(false);
    }
  }

  async function clearFavicon() {
    if (faviconBusy) return;
    setFaviconBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/company-settings/favicon', { method: 'DELETE' });
      setFaviconUrl('');
      window.dispatchEvent(
        new CustomEvent('company-updated', {
          detail: { companyName: form.companyName, faviconUrl: null },
        }),
      );
      setNotice('Browser favicon removed');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFaviconBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (saving || !form.companyName.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
          companyName: form.companyName,
          logServerUrl: form.logServerUrl,
          mobileNumber: form.mobileNumber,
          contactEmail: form.contactEmail.trim(),
          smsSendingEnable: form.smsSendingEnable,
          smsProviderUserId: form.smsProviderUserId,
          smsProviderSender: form.smsProviderSender,
          smsProviderId: form.smsProviderId,
          smsProviderPassword: form.smsProviderPassword || undefined,
          emailSendingEnable: form.emailSendingEnable,
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort ? Number(form.smtpPort) : undefined,
          smtpSecure: form.smtpSecure,
          smtpUser: form.smtpUser,
          smtpPassword: form.smtpPassword || undefined,
          smtpFromEmail: form.smtpFromEmail,
          smtpFromName: form.smtpFromName,
          mikrotikApiPort: Number(form.mikrotikApiPort),
          mikrotikWinboxPort: Number(form.mikrotikWinboxPort),
          mikrotikFirewallPort: Number(form.mikrotikFirewallPort),
      };
      let r: Company;
      try {
        r = await api<Company>('/api/company-settings', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } catch {
        const { mikrotikApiPort: _a, mikrotikWinboxPort: _b, mikrotikFirewallPort: _c, ...rest } = payload;
        r = await api<Company>('/api/company-settings', {
          method: 'PUT',
          body: JSON.stringify(rest),
        });
      }
      apply(r);
      window.dispatchEvent(
        new CustomEvent('company-updated', {
          detail: { companyName: r.companyName || form.companyName, faviconUrl: r.faviconUrl || faviconUrl || null },
        }),
      );
      setNotice('Server settings saved');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function testChannel(kind: 'email' | 'sms') {
    const notSent =
      kind === 'email' ? 'Test email was not sent.' : 'Test SMS was not sent.';
    function warn(detail: string) {
      const message = detail.trim() ? `${notSent} ${detail.trim()}` : notSent;
      setTestWarn({ kind, message });
      setError('');
      setNotice('');
      window.alert(`Warning\n\n${message}`);
    }
    if (dirty) {
      warn('Save settings first, then test.');
      return;
    }
    if (kind === 'email') {
      if (testingEmail) return;
      setTestingEmail(true);
    } else {
      if (testingSms) return;
      setTestingSms(true);
    }
    setError('');
    setNotice('');
    setTestWarn(null);
    try {
      const path = kind === 'email' ? '/api/company-settings/test-email' : '/api/company-settings/test-sms';
      const r = await api<{ ok?: boolean; message: string; smsSentToday?: number; lastSmsSend?: string | null }>(
        path,
        { method: 'POST' },
      );
      if (r.ok === false) {
        warn(r.message || 'The server did not accept the message.');
        return;
      }
      setNotice(r.message || (kind === 'email' ? 'Test email sent' : 'Test SMS sent'));
      setTestWarn(null);
      if (kind === 'sms') {
        if (typeof r.smsSentToday === 'number') setSmsSentToday(r.smsSentToday);
        if (r.lastSmsSend !== undefined) setLastSmsSend(r.lastSmsSend);
      }
    } catch (err) {
      warn((err as Error).message || 'Check host, port, user and password.');
    } finally {
      if (kind === 'email') setTestingEmail(false);
      else setTestingSms(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Server Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Branding, contact, email SMTP and optional SMS for uniqbd.com Log Server.
          </p>
        </div>
        {dirty && (
          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Unsaved</span>
        )}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
      )}
      {notice && !error && (
        <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-16 text-center text-slate-400">
          Loading settings…
        </div>
      ) : (
        <form onSubmit={onSave} className="space-y-5">
          <section className="ls-page-hero">
            <p className="ls-page-kicker">Preview</p>
            <div className="ls-page-title">{form.companyName || 'Company name'}</div>
            <div className="ls-page-desc font-mono">
              {form.logServerUrl || 'Log server URL not set'}
            </div>
            <p className="ls-page-meta">
              This company name is the browser tab title. The favicon is the small icon in the tab.
            </p>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 text-sm font-medium text-slate-800">
              Company profile
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company name">
                <input
                  className="field"
                  value={form.companyName}
                  onChange={(e) => set('companyName', e.target.value)}
                  placeholder="Company name"
                />
              </Field>
              <div className="block text-xs font-medium text-slate-600">
                Browser favicon
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {faviconUrl ? (
                      <img src={faviconUrl} alt="" className="h-8 w-8 object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400">None</span>
                    )}
                  </span>
                  <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                    {faviconBusy ? 'Uploading…' : 'Choose icon'}
                    <input
                      type="file"
                      accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/webp,image/jpeg"
                      className="hidden"
                      disabled={faviconBusy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void uploadFavicon(file);
                      }}
                    />
                  </label>
                  {faviconUrl ? (
                    <button
                      type="button"
                      disabled={faviconBusy}
                      onClick={() => void clearFavicon()}
                      className="text-xs text-slate-500 hover:text-red-600 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] font-normal text-slate-400">PNG, ICO, SVG, WEBP or JPG. Max 200 KB.</p>
              </div>
              <Field label="Log Server URL">
                <input
                  className="field font-mono"
                  value={form.logServerUrl}
                  onChange={(e) => set('logServerUrl', e.target.value)}
                  placeholder="localhost or public IP / hostname"
                />
              </Field>
              <Field label="Mobile number">
                <input
                  className="field"
                  value={form.mobileNumber}
                  onChange={(e) => set('mobileNumber', e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </Field>
              <Field label="Contact email">
                <input
                  type="email"
                  className="field"
                  value={form.contactEmail}
                  onChange={(e) => set('contactEmail', e.target.value)}
                  placeholder="sohelonlineit@gmail.com"
                />
                <span className="block mt-1 text-[11px] text-slate-500">
                  MikroTik disconnect warnings are sent to this address.
                </span>
              </Field>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="text-sm font-medium text-slate-800">MikroTik ports</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Used as the default when adding a router, and for API / MAC sync. Saving API port
                also updates every MikroTik already added. Winbox and firewall must still be set on
                the router itself.
              </div>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="API port">
                <input
                  className="field font-mono"
                  inputMode="numeric"
                  value={form.mikrotikApiPort}
                  onChange={(e) => set('mikrotikApiPort', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="1122"
                />
              </Field>
              <Field label="Winbox port">
                <input
                  className="field font-mono"
                  inputMode="numeric"
                  value={form.mikrotikWinboxPort}
                  onChange={(e) => set('mikrotikWinboxPort', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="1122"
                />
              </Field>
              <Field label="Firewall port">
                <input
                  className="field font-mono"
                  inputMode="numeric"
                  value={form.mikrotikFirewallPort}
                  onChange={(e) => set('mikrotikFirewallPort', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="1122"
                />
              </Field>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Email / SMTP</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  When a MikroTik goes down, the warning email is sent to Contact email below — not
                  the From email. Password is never shown after save.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.emailSendingEnable}
                    onChange={(e) => set('emailSendingEnable', e.target.checked)}
                  />
                  Enable email
                </label>
                <button
                  type="button"
                  disabled={testingEmail || saving || dirty}
                  title={dirty ? 'Save settings first' : 'Send a test email to Contact email'}
                  onClick={() => void testChannel('email')}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  {testingEmail ? 'Sending…' : 'Test email'}
                </button>
              </div>
            </div>
            {testWarn?.kind === 'email' ? <TestFailWarning message={testWarn.message} /> : null}
            <div className="p-5 space-y-4">
              <div className="rounded-xl border px-4 py-3 ls-alert-inbox">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/30">
                    Alert inbox
                  </span>
                </div>
                <Field label="Disconnect warning email (To)">
                  <input
                    type="email"
                    className="field"
                    value={form.contactEmail}
                    onChange={(e) => set('contactEmail', e.target.value)}
                    placeholder="alerts@yourcompany.com"
                    autoComplete="email"
                  />
                </Field>
                <p className="text-[11px] text-slate-500 mt-2">
                  Put the inbox that should receive MikroTik down alerts. Same as Contact email.
                  Enable email below for SMTP. From email is only the sender on the message.
                </p>
              </div>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${form.emailSendingEnable ? '' : 'opacity-60'}`}>
              <Field label="SMTP host">
                <input
                  className="field font-mono"
                  disabled={!form.emailSendingEnable}
                  value={form.smtpHost}
                  onChange={(e) => set('smtpHost', e.target.value)}
                  placeholder="smtp.gmail.com"
                />
              </Field>
              <Field label="SMTP port">
                <input
                  className="field font-mono"
                  disabled={!form.emailSendingEnable}
                  value={form.smtpPort}
                  onChange={(e) => set('smtpPort', e.target.value)}
                  placeholder="587"
                />
              </Field>
              <Field label="SMTP username">
                <input
                  className="field"
                  disabled={!form.emailSendingEnable}
                  value={form.smtpUser}
                  onChange={(e) => set('smtpUser', e.target.value)}
                  placeholder="account@gmail.com"
                  autoComplete="off"
                />
              </Field>
              <Field label="SMTP password">
                <input
                  type="password"
                  className="field"
                  disabled={!form.emailSendingEnable}
                  value={form.smtpPassword}
                  placeholder={smtpPasswordSet ? 'Saved — type to replace' : 'App password'}
                  onChange={(e) => set('smtpPassword', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="From email (sender only — not the inbox that receives alerts)">
                <input
                  type="email"
                  className="field"
                  disabled={!form.emailSendingEnable}
                  value={form.smtpFromEmail}
                  onChange={(e) => set('smtpFromEmail', e.target.value)}
                  placeholder="noreply@uniqbd.com"
                />
              </Field>
              <Field label="From name">
                <input
                  className="field"
                  disabled={!form.emailSendingEnable}
                  value={form.smtpFromName}
                  onChange={(e) => set('smtpFromName', e.target.value)}
                  placeholder="uniqbd.com Log Server"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2 pt-1">
                <input
                  type="checkbox"
                  disabled={!form.emailSendingEnable}
                  checked={form.smtpSecure}
                  onChange={(e) => set('smtpSecure', e.target.checked)}
                />
                Use TLS / SSL (recommended for port 587 or 465)
              </label>
            </div>
            </div>
            {smtpPasswordSet && (
              <div className="px-5 pb-5 text-xs text-slate-500">
                <span className="bg-slate-100 px-2 py-0.5 rounded-full">SMTP password saved</span>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-800">SMS alerts</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Sent automatically when a MikroTik API connection goes down.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.smsSendingEnable}
                    onChange={(e) => set('smsSendingEnable', e.target.checked)}
                  />
                  Enable SMS
                </label>
                <button
                  type="button"
                  disabled={testingSms || saving || dirty}
                  title={dirty ? 'Save settings first' : 'Send a test SMS to the mobile number'}
                  onClick={() => void testChannel('sms')}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  {testingSms ? 'Sending…' : 'Test SMS'}
                </button>
              </div>
            </div>
            {testWarn?.kind === 'sms' ? <TestFailWarning message={testWarn.message} /> : null}
            <div className={`p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 ${form.smsSendingEnable ? '' : 'opacity-60'}`}>
              <Field label="Provider user ID">
                <input
                  className="field"
                  disabled={!form.smsSendingEnable}
                  value={form.smsProviderUserId}
                  onChange={(e) => set('smsProviderUserId', e.target.value)}
                />
              </Field>
              <Field label="Sender ID">
                <input
                  className="field"
                  disabled={!form.smsSendingEnable}
                  value={form.smsProviderSender}
                  onChange={(e) => set('smsProviderSender', e.target.value)}
                />
              </Field>
              <Field label="Provider ID or API URL">
                <input
                  className="field"
                  disabled={!form.smsSendingEnable}
                  value={form.smsProviderId}
                  onChange={(e) => set('smsProviderId', e.target.value)}
                />
              </Field>
              <Field label="Provider password">
                <input
                  type="password"
                  className="field"
                  disabled={!form.smsSendingEnable}
                  value={form.smsProviderPassword}
                  placeholder={smsPasswordSet ? 'Saved — type to replace' : 'Optional'}
                  onChange={(e) => set('smsProviderPassword', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <div className="px-5 pb-5 flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="bg-slate-100 px-2 py-0.5 rounded-full">Sent today: {smsSentToday}</span>
              <span className="bg-slate-100 px-2 py-0.5 rounded-full">
                Last send: {lastSmsSend ? new Date(lastSmsSend).toLocaleString() : 'Never'}
              </span>
              {smsPasswordSet && <span className="bg-slate-100 px-2 py-0.5 rounded-full">Password saved</span>}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!dirty || saving || !form.companyName.trim()}
              className="ls-btn-search text-sm px-4 py-2.5"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                setForm(saved);
                setNotice('');
              }}
              className="text-sm px-4 py-2.5 rounded-lg border hover:bg-slate-50 disabled:opacity-40"
            >
              Discard
            </button>
          </div>
        </form>
      )}

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
        .field:disabled {
          background: #f8fafc;
          color: #64748b;
        }
        .ls-alert-inbox {
          border-color: rgb(var(--brand) / 0.28);
          background: rgb(var(--brand) / 0.08);
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

function TestFailWarning({ message }: { message: string }) {
  return (
    <div role="alert" className="mx-5 mt-3 mb-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="font-semibold tracking-tight">Warning</div>
      <p className="mt-1 leading-relaxed">{message}</p>
    </div>
  );
}
