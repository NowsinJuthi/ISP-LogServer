'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, Me } from '@/lib/api';

type Role = { id: number; roleName: string; description?: string | null };

type User = {
  id: number;
  userName: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isActivated: boolean;
  createdAt?: string;
  userRoles?: { role: Role }[];
  _count?: { userServers: number };
};

type StatusFilter = 'all' | 'active' | 'disabled';

const emptyCreate = {
  userName: '',
  password: '',
  confirm: '',
  firstName: '',
  lastName: '',
  email: '',
  roleId: '',
};

function fullName(u: Pick<User, 'firstName' | 'lastName'>) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
}

function initials(u: User) {
  const name = fullName(u) || u.userName;
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function roleName(u: User) {
  return u.userRoles?.[0]?.role.roleName || '';
}

export default function UsersPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [create, setCreate] = useState(emptyCreate);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    roleId: '',
    password: '',
    confirm: '',
    isActivated: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = rows.find((u) => u.id === selectedId) || null;
  const isSelf = selected?.id === me?.id;
  const isSeedAdmin = selected?.userName === 'sohelonlineit';

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((u) => u.isActivated).length,
      disabled: rows.filter((u) => !u.isActivated).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((u) => {
      if (status === 'active' && !u.isActivated) return false;
      if (status === 'disabled' && u.isActivated) return false;
      if (roleFilter && roleName(u) !== roleFilter) return false;
      if (!q) return true;
      const blob = [u.userName, fullName(u), u.email, roleName(u)].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [rows, query, status, roleFilter]);

  const detailsDirty = selected
    ? form.firstName !== (selected.firstName || '') ||
      form.lastName !== (selected.lastName || '') ||
      form.email !== (selected.email || '') ||
      form.roleId !== String(selected.userRoles?.[0]?.role.id || '') ||
      form.isActivated !== selected.isActivated ||
      !!form.password
    : false;

  function applyUser(u: User) {
    setSelectedId(u.id);
    setForm({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email || '',
      roleId: String(u.userRoles?.[0]?.role.id || ''),
      password: '',
      confirm: '',
      isActivated: u.isActivated,
    });
  }

  async function load(preferId?: number) {
    setLoading(true);
    setError('');
    try {
      const [users, roleRows, profile] = await Promise.all([
        api<User[]>('/api/users'),
        api<Role[]>('/api/roles'),
        api<Me>('/api/auth/me'),
      ]);
      setRows(users);
      setRoles(roleRows);
      setMe(profile);
      const keep = preferId ?? selectedId;
      const next = users.find((u) => u.id === keep) || users[0];
      if (next) applyUser(next);
      else setSelectedId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectUser(u: User) {
    if (u.id === selectedId) return;
    if (detailsDirty && !confirm('You have unsaved changes. Discard them?')) return;
    applyUser(u);
    setNotice('');
    setError('');
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (create.password !== create.confirm) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const created = await api<User>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          userName: create.userName,
          password: create.password,
          firstName: create.firstName,
          lastName: create.lastName,
          email: create.email,
          roleId: create.roleId ? Number(create.roleId) : undefined,
        }),
      });
      setCreate(emptyCreate);
      setCreating(false);
      setNotice('User created');
      await load(created.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    if (!selected || saving) return;
    if (form.password && form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api(`/api/users/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          isActivated: form.isActivated,
          roleId: form.roleId ? Number(form.roleId) : undefined,
          password: form.password || undefined,
        }),
      });
      setNotice('User saved');
      await load(selected.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function askDelete() {
    if (!selected || isSelf || isSeedAdmin) return;
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!selected || isSelf || isSeedAdmin || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await api(`/api/users/${selected.id}`, { method: 'DELETE' });
      setConfirmOpen(false);
      setNotice('User deleted');
      setSelectedId(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Manager</h1>
          <p className="text-sm text-slate-500 mt-1">Create accounts, assign a role, and activate or disable access.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating((v) => !v);
            setError('');
          }}
          className="ls-btn-search text-sm px-4 py-2.5"
        >
          {creating ? 'Close' : 'New user'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Total" value={counts.total} />
        <Stat label="Active" value={counts.active} tone="ok" />
        <Stat label="Disabled" value={counts.disabled} tone="warn" />
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
      )}
      {notice && !error && (
        <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
          {notice}
        </div>
      )}

      {creating && (
        <form onSubmit={createUser} className="bg-white border border-slate-200 rounded-xl shadow-sm mb-5">
          <div className="px-5 py-3 border-b border-slate-100 text-sm font-medium text-slate-800">Create user</div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Username">
              <input
                className="field"
                value={create.userName}
                onChange={(e) => setCreate({ ...create, userName: e.target.value })}
                autoComplete="off"
                autoFocus
              />
            </Field>
            <Field label="First name">
              <input className="field" value={create.firstName} onChange={(e) => setCreate({ ...create, firstName: e.target.value })} />
            </Field>
            <Field label="Last name">
              <input className="field" value={create.lastName} onChange={(e) => setCreate({ ...create, lastName: e.target.value })} />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className="field"
                value={create.email}
                onChange={(e) => setCreate({ ...create, email: e.target.value })}
              />
            </Field>
            <Field label="Role">
              <select className="field" value={create.roleId} onChange={(e) => setCreate({ ...create, roleId: e.target.value })}>
                <option value="">No role yet</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roleName}
                  </option>
                ))}
              </select>
            </Field>
            <div />
            <Field label="Password">
              <input
                type="password"
                className="field"
                value={create.password}
                onChange={(e) => setCreate({ ...create, password: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                className="field"
                value={create.confirm}
                onChange={(e) => setCreate({ ...create, confirm: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <div className="px-5 pb-5 flex gap-2">
            <button
              type="submit"
              disabled={saving || !create.userName.trim() || create.password.length < 4}
              className="ls-btn-search text-sm px-4 py-2"
            >
              {saving ? 'Creating…' : 'Create user'}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="text-sm px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        <aside className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">Users</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{filtered.length}</span>
            </div>
            <input className="field mt-0" placeholder="Search name, email, role" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="flex gap-1">
              {(['all', 'active', 'disabled'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 text-xs capitalize py-1.5 rounded-lg border ${
                    status === s ? 'ls-chip-on border-transparent' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <select className="field mt-0" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.roleName}>
                  {r.roleName}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {loading && <div className="px-4 py-10 text-center text-sm text-slate-400">Loading users…</div>}
            {!loading && !filtered.length && (
              <div className="px-4 py-10 text-center text-sm text-slate-400">No users match</div>
            )}
            {!loading &&
              filtered.map((u) => {
                const active = u.id === selectedId;
                const role = roleName(u);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => selectUser(u)}
                    className={`w-full text-left px-4 py-3 border-t border-slate-100 flex gap-3 ${
                      active ? 'bg-brand-soft' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="h-9 w-9 shrink-0 rounded-full ls-chip-on text-xs font-semibold flex items-center justify-center">
                      {initials(u)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate">{u.userName}</span>
                        {u.id === me?.id && (
                          <span className="text-[10px] uppercase tracking-wide bg-brand-deep text-white px-1.5 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-500 truncate">{fullName(u) || u.email || '—'}</span>
                      <span className="flex items-center gap-2 mt-1">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${u.isActivated ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        />
                        <span className="text-[11px] text-slate-500">{u.isActivated ? 'Active' : 'Disabled'}</span>
                        {role && <span className="text-[11px] text-slate-400">· {role}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
        </aside>

        <section className="min-w-0">
          {!selected && !loading && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-16 text-center text-slate-400">
              Select a user or create a new one.
            </div>
          )}

          {selected && (
            <form onSubmit={saveUser} className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">{selected.userName}</div>
                  <div className="text-xs text-slate-500">
                    {selected.createdAt
                      ? `Created ${new Date(selected.createdAt).toLocaleDateString()}`
                      : 'Account details'}
                    {selected._count ? ` · ${selected._count.userServers} router${selected._count.userServers === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {detailsDirty && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Unsaved</span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      selected.isActivated ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {selected.isActivated ? 'Active' : 'Disabled'}
                  </span>
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Username">
                  <input className="field" value={selected.userName} disabled />
                </Field>
                <Field label="Role">
                  <select className="field" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                    <option value="">No role</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.roleName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="First name">
                  <input className="field" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </Field>
                <Field label="Last name">
                  <input className="field" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    className="field"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="field"
                    value={form.isActivated ? '1' : '0'}
                    disabled={isSelf}
                    onChange={(e) => setForm({ ...form, isActivated: e.target.value === '1' })}
                  >
                    <option value="1">Active</option>
                    <option value="0">Disabled</option>
                  </select>
                </Field>
                <Field label="New password">
                  <input
                    type="password"
                    className="field"
                    value={form.password}
                    placeholder="Leave blank to keep current"
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirm new password">
                  <input
                    type="password"
                    className="field"
                    value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                    autoComplete="new-password"
                  />
                </Field>
              </div>

              <div className="px-5 pb-5 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={!detailsDirty || saving}
                  className="ls-btn-search text-sm px-4 py-2"
                >
                  {saving ? 'Saving…' : 'Save user'}
                </button>
                <button
                  type="button"
                  disabled={!detailsDirty}
                  onClick={() => selected && applyUser(selected)}
                  className="text-sm px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  Discard
                </button>
                {!isSelf && !isSeedAdmin && (
                  <div className="ml-auto relative">
                    <button type="button" onClick={askDelete} className="text-sm text-red-600 px-3 py-2 hover:underline">
                      Delete user
                    </button>
                    {confirmOpen && selected && (
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-user-title"
                        className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-lg shadow-lg border border-red-100 p-3 z-20"
                      >
                        <h2 id="delete-user-title" className="text-sm font-semibold text-slate-900">
                          Delete {selected.userName}?
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">This cannot be undone.</p>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => setConfirmOpen(false)}
                            className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                          >
                            No
                          </button>
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => void confirmDelete()}
                            className="text-xs font-medium px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deleting ? 'Deleting…' : 'Yes, delete'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {(isSelf || isSeedAdmin) && (
                  <span className="ml-auto text-xs text-slate-400">
                    {isSelf ? 'You cannot delete or disable your own account.' : 'The sohelonlineit account cannot be deleted.'}
                  </span>
                )}
              </div>
            </form>
          )}
        </section>
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
        .field:disabled {
          background: #f8fafc;
          color: #64748b;
        }
      `}</style>
    </Shell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
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
