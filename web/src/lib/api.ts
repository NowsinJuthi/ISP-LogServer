export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401 && typeof window !== 'undefined' && !path.includes('/auth/')) {
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const raw = body.message || body.error;
    const joined = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').join('; ') : raw;
    const message = typeof joined === 'string' && joined.length < 240 ? joined : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}

export type MenuItem = { id: number; menuName: string; url: string; position: number };

export type Me = {
  id: number;
  userName: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  roles: string[];
  menus: MenuItem[];
};
