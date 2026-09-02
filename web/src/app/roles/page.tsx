'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Role = {
  id: number;
  roleName: string;
  description?: string | null;
  roleMenus?: { menuId: number }[];
  _count?: { userRoles: number; roleMenus: number };
};

type Menu = { id: number; menuName: string; url: string; position: number };

const MENU_GROUPS: { title: string; urls: string[] }[] = [
  { title: 'Operations', urls: ['/dashboard', '/search-log', '/log-stream', '/servers'] },
  { title: 'Administration', urls: ['/users', '/roles', '/user-servers'] },
  { title: 'Organization', urls: ['/company-settings', '/activity-logs', '/service-info'] },
];

function sameIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((id, i) => id === right[i]);
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [savedMenus, setSavedMenus] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingMenus, setSavingMenus] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = roles.find((r) => r.id === selectedId) || null;
  const dirty = selected ? !sameIds(picked, savedMenus) : false;
  const detailsDirty = selected
    ? name.trim() !== selected.roleName || (description.trim() || '') !== (selected.description || '')
    : false;
  const isSuper = selected?.roleName === 'SuperAdmin';

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.roleName.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q),
    );
  }, [roles, query]);

  const groupedMenus = useMemo(() => {
    const used = new Set<number>();
    const groups = MENU_GROUPS.map((g) => {
      const items = menus.filter((m) => g.urls.includes(m.url));
      items.forEach((m) => used.add(m.id));
      return { title: g.title, items };
    }).filter((g) => g.items.length);
    const other = menus.filter((m) => !used.has(m.id));
    if (other.length) groups.push({ title: 'Other', items: other });
    return groups;
  }, [menus]);

  function applyRole(role: Role) {
    const ids = role.roleMenus?.map((rm) => rm.menuId) ?? [];
    setSelectedId(role.id);
    setPicked(ids);
    setSavedMenus(ids);
    setName(role.roleName);
    setDescription(role.description || '');
  }

  async function load(preferId?: number) {
    setLoading(true);
    setError('');
    try {
      const [rs, ms] = await Promise.all([api<Role[]>('/api/roles'), api<Menu[]>('/api/menus')]);
      setRoles(rs);
      setMenus(ms);
      const keep = preferId ?? selectedId;
      const next = rs.find((r) => r.id === keep) || rs[0];
      if (next) applyRole(next);
      else {
        setSelectedId(null);
        setPicked([]);
        setSavedMenus([]);
      }
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

  function selectRole(role: Role) {
    if (role.id === selectedId) return;
    if ((dirty || detailsDirty) && !confirm('You have unsaved changes. Discard them?')) return;
    applyRole(role);
    setConfirmOpen(false);
    setNotice('');
    setError('');
  }

  function toggleMenu(id: number) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function toggleGroup(ids: number[], allOn: boolean) {
    setPicked((cur) => {
      if (allOn) return cur.filter((id) => !ids.includes(id));
      return [...new Set([...cur, ...ids])];
    });
  }

  async function saveMenus() {
    if (!selected) return;
    if (isSuper && picked.length === 0) {
      if (!confirm('Saving SuperAdmin with no menus will hide the sidebar. Continue?')) return;
    }
    setSavingMenus(true);
    setError('');
    setNotice('');
    try {
      await api(`/api/roles/${selected.id}/menus`, {
        method: 'POST',
        body: JSON.stringify({ menuIds: picked }),
      });
      setSavedMenus(picked);
      setNotice('Menu access saved');
      await load(selected.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingMenus(false);
    }
  }

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!selected || savingRole) return;
    setSavingRole(true);
    setError('');
    setNotice('');
    try {
      await api(`/api/roles/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({ roleName: name, description }),
      });
      setNotice('Role details saved');
      await load(selected.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingRole(false);
    }
  }

  async function createRole(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim() || creatingBusy) return;
    setCreatingBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await api<Role>('/api/roles', {
        method: 'POST',
        body: JSON.stringify({ roleName: newName, description: newDescription }),
      });
      setNewName('');
      setNewDescription('');
      setCreating(false);
      setNotice('Role created');
      await load(created.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingBusy(false);
    }
  }

  function askDelete() {
    if (!selected || isSuper) return;
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!selected || isSuper || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await api(`/api/roles/${selected.id}`, { method: 'DELETE' });
      setConfirmOpen(false);
      setNotice('Role deleted');
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
          <h1 className="text-2xl font-semibold tracking-tight">Role Manager</h1>
          <p className="text-sm text-slate-500 mt-1">
            Create roles and choose which menus each role can open.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating((v) => !v);
            setError('');
          }}
          className="ls-btn-search text-sm px-4 py-2.5"
        >
          {creating ? 'Close' : 'New role'}
        </button>
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
        <form onSubmit={createRole} className="bg-white border border-slate-200 rounded-xl shadow-sm mb-5 p-5">
          <div className="text-sm font-medium text-slate-800 mb-3">Create role</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-slate-600">
              Role name
              <input
                className="field"
                placeholder="e.g. Operator"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Description
              <input
                className="field"
                placeholder="What this role is for"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={!newName.trim() || creatingBusy}
              className="ls-btn-search text-sm px-4 py-2"
            >
              {creatingBusy ? 'Creating…' : 'Create role'}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-sm px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
        <aside className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-800">Roles</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {roles.length}
              </span>
            </div>
            <input
              className="field mt-0"
              placeholder="Search roles"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {loading && <div className="px-4 py-10 text-center text-sm text-slate-400">Loading roles…</div>}
            {!loading && !filteredRoles.length && (
              <div className="px-4 py-10 text-center text-sm text-slate-400">No roles found</div>
            )}
            {!loading &&
              filteredRoles.map((r) => {
                const active = r.id === selectedId;
                const count = r._count?.roleMenus ?? r.roleMenus?.length ?? 0;
                const users = r._count?.userRoles ?? 0;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectRole(r)}
                    className={`w-full text-left px-4 py-3 border-t border-slate-200 ${
                      active ? 'bg-brand-soft' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {r.roleName}
                      </span>
                      {r.roleName === 'SuperAdmin' && (
                        <span className="text-[10px] uppercase tracking-wide bg-brand-deep text-white px-1.5 py-0.5 rounded">
                          System
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 truncate">{r.description || 'No description'}</div>
                    <div className="flex gap-3 mt-2 text-[11px] text-slate-500">
                      <span>{count} menus</span>
                      <span>
                        {users} user{users === 1 ? '' : 's'}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </aside>

        <section className="space-y-5 min-w-0">
          {!selected && !loading && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-16 text-center text-slate-400">
              Select a role or create a new one.
            </div>
          )}

          {selected && (
            <>
              <form onSubmit={saveDetails} className="bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">Role details</span>
                  {isSuper && <span className="text-xs text-slate-500">Protected system role</span>}
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block text-xs font-medium text-slate-600">
                    Role name
                    <input
                      className="field"
                      value={name}
                      disabled={isSuper}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Description
                    <input
                      className="field"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
                <div className="px-5 pb-5 flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={!detailsDirty || savingRole || !name.trim()}
                    className="ls-btn-search text-sm px-4 py-2"
                  >
                    {savingRole ? 'Saving…' : 'Save details'}
                  </button>
                  {!isSuper && (
                    <div className="ml-auto relative">
                      <button type="button" onClick={askDelete} className="text-sm text-red-600 px-3 py-2 hover:underline">
                        Delete role
                      </button>
                      {confirmOpen && selected && (
                        <div
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="delete-role-title"
                          className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-lg shadow-lg border border-red-100 p-3 z-20"
                        >
                          <h2 id="delete-role-title" className="text-sm font-semibold text-slate-900">
                            Delete {selected.roleName}?
                          </h2>
                          <p className="text-xs text-slate-500 mt-1">
                            {(selected._count?.userRoles ?? 0) > 0
                              ? `Assigned to ${selected._count?.userRoles} user${selected._count?.userRoles === 1 ? '' : 's'}. This cannot be undone.`
                              : 'This cannot be undone.'}
                          </p>
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
                </div>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-800">Menu access</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {picked.length} of {menus.length} selected
                    </span>
                    {dirty && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Unsaved</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
                      onClick={() => setPicked(menus.map((m) => m.id))}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
                      onClick={() => setPicked([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-6">
                  {groupedMenus.map((group) => {
                    const ids = group.items.map((m) => m.id);
                    const allOn = ids.every((id) => picked.includes(id));
                    return (
                      <div key={group.title}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {group.title}
                          </h3>
                          <button
                            type="button"
                            className={`text-xs hover:underline ${allOn ? 'text-gold' : 'text-accent'}`}
                            onClick={() => toggleGroup(ids, allOn)}
                          >
                            {allOn ? 'Unselect group' : 'Select group'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {group.items.map((m) => {
                            const checked = picked.includes(m.id);
                            return (
                              <label
                                key={m.id}
                                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${
                                  checked ? 'border-slate-200 bg-brand-soft' : 'border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={checked}
                                  onChange={() => toggleMenu(m.id)}
                                />
                                <span>
                                  <span className="block text-sm font-medium text-slate-800">{m.menuName}</span>
                                  <span className="block text-xs text-slate-400 font-mono">{m.url}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={!dirty}
                    onClick={() => setPicked(savedMenus)}
                    className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40"
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    disabled={!dirty || savingMenus}
                    onClick={() => void saveMenus()}
                    className="ls-btn-search text-sm px-4 py-2"
                  >
                    {savingMenus ? 'Saving…' : 'Save menus'}
                  </button>
                </div>
              </div>
            </>
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
