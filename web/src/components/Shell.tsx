'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, Me } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>('/api/auth/me')
      .then(setMe)
      .catch((err) => {
        if ((err as Error).message === 'Unauthorized') router.replace('/login');
      });
  }, [router]);

  useEffect(() => {
    if (!me) return;
    const allowed = new Set(me.menus.map((m) => m.url));
    if (path === '/servers/disabled') {
      router.replace('/servers');
      return;
    }
    if (path && path !== '/login' && !allowed.has(path)) {
      router.replace(me.menus[0]?.url || '/dashboard');
    }
  }, [me, path, router]);

  useEffect(() => {
    function onCompany(e: Event) {
      const detail = (e as CustomEvent<string | { companyName?: string }>).detail;
      const name = typeof detail === 'string' ? detail : detail?.companyName;
      if (name) setMe((m) => (m ? { ...m, companyName: name } : m));
    }
    window.addEventListener('company-updated', onCompany);
    return () => window.removeEventListener('company-updated', onCompany);
  }, []);

  useEffect(() => {
    if (me?.companyName) document.title = me.companyName;
  }, [me?.companyName]);

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* still leave the session UI */
    }
    router.replace('/login');
  }

  if (!me) {
    return <div className="flex-1 p-10 text-[rgb(var(--fg-muted))]">Loading…</div>;
  }

  const companyTitle = me.companyName || 'uniqbd.com Log Server';
  const brandLetter = companyTitle.trim().charAt(0).toUpperCase() || 'U';
  const userLetter = (me.userName || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="flex flex-1 min-h-full">
      <aside className="ls-sidebar flex w-72 shrink-0 flex-col">
        <div className="ls-sidebar-brand">
          <span className="ls-sidebar-brand-mark">{brandLetter}</span>
          <div className="min-w-0 leading-tight">
            <div className="ls-sidebar-title truncate text-[13px] font-semibold tracking-wide">
              {companyTitle}
            </div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[rgb(var(--brand))]">
              Log Server
            </div>
          </div>
        </div>
        <nav className="ls-sidebar-nav overflow-y-auto">
          {me.menus.filter((m) => m.url !== '/menus' && m.url !== '/faq').map((m) => {
            const href = m.url.startsWith('/') && !m.url.startsWith('//') ? m.url : '/dashboard';
            const active = path === href;
            const gold = href === '/license';
            return (
              <Link
                key={m.id}
                href={href}
                className={`ls-nav-link ${active ? 'ls-nav-link-active' : ''} ${gold ? 'ls-nav-link-gold' : ''}`}
              >
                {active ? <span className="ls-nav-indicator" /> : null}
                <span className={`ls-nav-icon ${active ? 'ls-nav-icon-active' : ''}`}>
                  {m.menuName.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.menuName}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="ls-topbar h-14 flex items-center justify-end px-6">
          <div className="flex items-center gap-3 text-sm">
            <ThemeToggle />
            <span className="ls-avatar">{userLetter}</span>
            <span className="ls-topbar-user font-medium">{me.userName}</span>
            <button type="button" onClick={logout} className="ls-logoff">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M10 5h6.5A2.5 2.5 0 0 1 19 7.5v9A2.5 2.5 0 0 1 16.5 19H10"
                />
              </svg>
              Log Out
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
