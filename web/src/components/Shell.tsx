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
  const [navOpen, setNavOpen] = useState(false);

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
    if (path && path !== '/login' && path !== '/change-password' && !allowed.has(path)) {
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

  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 1024) setNavOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNavOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* still leave the session UI */
    }
    router.replace('/login');
  }

  if (!me) {
    return <div className="flex-1 p-6 sm:p-10 text-[rgb(var(--fg-muted))]">Loading…</div>;
  }

  const companyTitle = me.companyName || 'uniqbd.com Log Server';
  const brandLetter = companyTitle.trim().charAt(0).toUpperCase() || 'U';
  const userLetter = (me.userName || 'U').trim().charAt(0).toUpperCase();
  const links = me.menus.filter((m) => m.url !== '/menus' && m.url !== '/faq');

  return (
    <div className="ls-app">
      {navOpen ? (
        <button type="button" className="ls-nav-scrim lg:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)} />
      ) : null}
      <aside className={`ls-sidebar flex w-72 shrink-0 flex-col ${navOpen ? 'ls-sidebar-open' : ''}`}>
        <div className="ls-sidebar-brand">
          <span className="ls-sidebar-brand-mark">{brandLetter}</span>
          <div className="min-w-0 leading-tight">
            <div className="ls-sidebar-title truncate text-[13px] font-semibold tracking-wide">{companyTitle}</div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[rgb(var(--brand))]">
              Log Server
            </div>
          </div>
          <button
            type="button"
            className="ls-menu-btn ml-auto lg:hidden"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeWidth="2" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <nav className="ls-sidebar-nav flex-1 overflow-y-auto">
          {links.map((m) => {
            const href = m.url.startsWith('/') && !m.url.startsWith('//') ? m.url : '/dashboard';
            const active = path === href;
            const gold = href === '/license';
            return (
              <Link
                key={m.id}
                href={href}
                onClick={() => setNavOpen(false)}
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
      <div className="ls-shell-main">
        <header className="ls-topbar">
          <button
            type="button"
            className="ls-menu-btn lg:hidden"
            aria-label="Open menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="ls-topbar-brand min-w-0 lg:hidden">
            <span className="truncate">{companyTitle}</span>
          </div>
          <div className="ls-topbar-actions">
            <ThemeToggle />
            <span className="ls-avatar">{userLetter}</span>
            <span className="ls-topbar-user hidden font-medium sm:inline">{me.userName}</span>
            <Link
              href="/change-password"
              className={`ls-logoff ${path === '/change-password' ? 'ls-logoff-active' : ''}`}
              title="Change Password"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth="2" />
                <path strokeLinecap="round" strokeWidth="2" d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <span className="ls-logoff-text">Change Password</span>
            </Link>
            <button type="button" onClick={logout} className="ls-logoff" title="Log Out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M10 5h6.5A2.5 2.5 0 0 1 19 7.5v9A2.5 2.5 0 0 1 16.5 19H10"
                />
              </svg>
              <span className="ls-logoff-text">Log Out</span>
            </button>
          </div>
        </header>
        <main className="ls-main">{children}</main>
      </div>
    </div>
  );
}
