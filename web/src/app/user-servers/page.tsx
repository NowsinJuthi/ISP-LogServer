'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Role = { roleName: string };
type User = {
  id: number;
  userName: string;
  firstName?: string | null;
  lastName?: string | null;
  isActivated: boolean;
  userRoles?: { role: Role }[];
};
type Server = {
  id: number;
  serverName: string;
  url: string;
  type?: string;
  disabled: boolean;
  connectivityStatus?: boolean;
};
type MapRow = { user: { id: number }; server: { id: number } };

type UserFilter = 'all' | 'assigned' | 'unassigned';
type RouterFilter = 'all' | 'active' | 'disabled';

function sameIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((id, i) => id === right[i]);
}

function fullName(u: User) {
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

function isSuper(u: User) {
  return u.userRoles?.some((r) => r.role.roleName === 'SuperAdmin') ?? false;
}

export default function UserServersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [routerQuery, setRouterQuery] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [routerFilter, setRouterFilter] = useState<RouterFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = users.find((u) => u.id === selectedId) || null;
  const dirty = selected ? !sameIds(picked, saved) : false;

  const assignedByUser = useMemo(() => {
    const next: Record<number, number[]> = {};
    maps.forEach((m) => {
      next[m.user.id] = [...(next[m.user.id] || []), m.server.id];
    });
    return next;
  }, [maps]);

  const assignedUserCount = users.filter((u) => (assignedByUser[u.id] || []).length > 0).length;
  const unassignedCount = users.filter((u) => !isSuper(u) && !(assignedByUser[u.id] || []).length).length;

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users.filter((u) => {
      const count = (assignedByUser[u.id] || []).length;
      if (userFilter === 'assigned' && count === 0) return false;
      if (userFilter === 'unassigned' && (count > 0 || isSuper(u))) return false;
      if (!q) return true;
      return [u.userName, fullName(u)].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [users, userQuery, userFilter, assignedByUser]);

  const filteredServers = useMemo(() => {
    const q = routerQuery.trim().toLowerCase();
    return servers.filter((s) => {
      if (routerFilter === 'active' && s.disabled) return false;
      if (routerFilter === 'disabled' && !s.disabled) return false;
      if (!q) return true;
      return `${s.serverName} ${s.url}`.toLowerCase().includes(q);
    });
  }, [servers, routerQuery, routerFilter]);

  const groupedServers = useMemo(() => {
    const active = filteredServers.filter((s) => !s.disabled);
    const disabled = filteredServers.filter((s) => s.disabled);
    return [
      { title: 'Active routers', items: active },
      { title: 'Disabled routers', items: disabled },
    ].filter((g) => g.items.length);
  }, [filteredServers]);

  function applyUser(u: User) {
    const ids = assignedByUser[u.id] || [];
    setSelectedId(u.id);
    setPicked(ids);
    setSaved(ids);
  }

  async function load(preferId?: number) {
    setLoading(true);
    setError('');
    try {
      const [us, ss, ms] = await Promise.all([
        api<User[]>('/api/users'),
        api<Server[]>('/api/servers?all=1'),
        api<MapRow[]>('/api/user-servers'),
      ]);
      setUsers(us);
      setServers(ss);
      setMaps(ms);
      const keep = preferId ?? selectedId;
      const next = us.find((u) => u.id === keep) || us[0];
      if (next) {
        const ids = ms.filter((m) => m.user.id === next.id).map((m) => m.server.id);
        setSelectedId(next.id);
        setPicked(ids);
        setSaved(ids);
      } else {
        setSelectedId(null);
        setPicked([]);
        setSaved([]);
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

  function selectUser(u: User) {
    if (u.id === selectedId) return;
    if (dirty && !confirm('You have unsaved changes. Discard them?')) return;
    applyUser(u);
    setNotice('');
    setError('');
  }

  function toggleServer(id: number) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function toggleGroup(ids: number[], allOn: boolean) {
    setPicked((cur) => {
      if (allOn) return cur.filter((id) => !ids.includes(id));
      return [...new Set([...cur, ...ids])];
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api(`/api/users/${selected.id}/servers`, {
        method: 'POST',
        body: JSON.stringify({ serverIds: picked }),
      });
      setSaved(picked);
      setNotice('Router access saved');
      await load(selected.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Server Manager</h1>
        <p className="text-sm text-slate-500 mt-1">
          Choose which MikroTik routers each user can open in Search Log and Add MikroTik.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Users" value={users.length} />
        <Stat label="Routers" value={servers.length} />
        <Stat label="Assigned users" value={assignedUserCount} tone="ok" />
        <Stat label="No routers" value={unassignedCount} tone="warn" />
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
      )}
      {notice && !error && (
        <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        <aside className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">Users</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{filteredUsers.length}</span>
            </div>
            <input
              className="field mt-0"
              placeholder="Search users"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />
            <div className="flex gap-1">
              {(['all', 'assigned', 'unassigned'] as UserFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setUserFilter(s)}
                  className={`flex-1 text-xs capitalize py-1.5 rounded-lg border ${
                    userFilter === s ? 'ls-chip-on border-transparent' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {loading && <div className="px-4 py-10 text-center text-sm text-slate-400">Loading users…</div>}
            {!loading && !filteredUsers.length && (
              <div className="px-4 py-10 text-center text-sm text-slate-400">No users match</div>
            )}
            {!loading &&
              filteredUsers.map((u) => {
                const active = u.id === selectedId;
                const count = (assignedByUser[u.id] || []).length;
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
                        {isSuper(u) && (
                          <span className="text-[10px] uppercase tracking-wide bg-brand-deep text-white px-1.5 py-0.5 rounded">
                            Super
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-500 truncate">{fullName(u) || '—'}</span>
                      <span className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${u.isActivated ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span>
                          {isSuper(u) ? 'All routers' : `${count} router${count === 1 ? '' : 's'}`}
                        </span>
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
              Select a user to assign MikroTik routers.
            </div>
          )}

          {selected && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">{selected.userName}</div>
                  <div className="text-xs text-slate-500">
                    {fullName(selected) || 'Router access'} · {picked.length} of {servers.length} selected
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {dirty && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Unsaved</span>
                  )}
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {picked.length} assigned
                  </span>
                </div>
              </div>

              {isSuper(selected) && (
                <div className="mx-5 mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
                  SuperAdmin already sees every router. Assignments here are optional.
                </div>
              )}

              <div className="px-5 pt-4 flex flex-col sm:flex-row gap-3">
                <input
                  className="field mt-0 flex-1"
                  placeholder="Search routers by name or IP"
                  value={routerQuery}
                  onChange={(e) => setRouterQuery(e.target.value)}
                />
                <div className="flex gap-1">
                  {(['all', 'active', 'disabled'] as RouterFilter[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRouterFilter(s)}
                      className={`text-xs capitalize px-3 py-1.5 rounded-lg border ${
                        routerFilter === s ? 'ls-chip-on border-transparent' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-5 pt-3 flex gap-2">
                <button
                  type="button"
                  className="text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
                  onClick={() => setPicked(filteredServers.map((s) => s.id))}
                  disabled={!filteredServers.length}
                >
                  Select visible
                </button>
                <button
                  type="button"
                  className="text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
                  onClick={() => setPicked([])}
                >
                  Clear all
                </button>
              </div>

              <div className="p-5 space-y-6">
                {!servers.length && (
                  <div className="py-10 text-center text-sm text-slate-400">
                    No MikroTik added yet. Add one from Add MikroTik first.
                  </div>
                )}
                {!!servers.length && !filteredServers.length && (
                  <div className="py-10 text-center text-sm text-slate-400">No routers match this filter.</div>
                )}
                {groupedServers.map((group) => {
                  const ids = group.items.map((s) => s.id);
                  const allOn = ids.every((id) => picked.includes(id));
                  return (
                    <div key={group.title}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</h3>
                        <button
                          type="button"
                          className={`text-xs hover:underline ${allOn ? 'text-accent' : 'text-gold'}`}
                          onClick={() => toggleGroup(ids, allOn)}
                        >
                          {allOn ? 'Unselect group' : 'Select group'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.items.map((s) => {
                          const checked = picked.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${
                                checked ? 'border-brand/30 bg-brand-soft' : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleServer(s.id)} />
                              <span className="min-w-0">
                                <span className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-800 truncate">{s.serverName}</span>
                                  <span
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                      s.connectivityStatus ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                  />
                                </span>
                                <span className="block text-xs text-slate-400 font-mono truncate">{s.url}</span>
                                <span className="block text-[11px] text-slate-400 mt-0.5">
                                  {s.type || 'MikroTik'}
                                  {s.disabled ? ' · Disabled' : ''}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  disabled={!dirty}
                  onClick={() => setPicked(saved)}
                  className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40"
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={() => void save()}
                  className="ls-btn-search text-sm px-4 py-2"
                >
                  {saving ? 'Saving…' : 'Save access'}
                </button>
              </div>
            </div>
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
