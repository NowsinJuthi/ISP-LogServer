'use client';

import { FormEvent, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setOk('');
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirm) {
      setError('New password and confirm password do not match');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current password');
      return;
    }
    setBusy(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setOk('Password changed. Use the new password the next time you sign in.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <section className="ls-page-hero mb-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <span className="ls-page-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" strokeWidth="1.8">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="ls-page-kicker">Account</p>
            <h1 className="ls-page-title">Change Password</h1>
            <p className="ls-page-desc">
              Super Admin and other signed-in users can change their own password here. Enter the current password first.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-xl bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-medium text-slate-800">Your password</h2>
          <p className="text-xs text-slate-500 mt-0.5">This does not sign you out of the current session.</p>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <label className="block text-xs font-medium text-slate-600">
            Current password
            <input
              className="field mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            New password
            <input
              className="field mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Confirm new password
            <input
              className="field mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          ) : null}
          {ok ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{ok}</p>
          ) : null}
          <button type="submit" disabled={busy} className="ls-btn-search text-sm px-4 py-2.5">
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </section>
    </Shell>
  );
}
