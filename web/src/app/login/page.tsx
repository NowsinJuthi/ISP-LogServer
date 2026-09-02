'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Poppins } from 'next/font/google';
import { api } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';
import ShieldGraphic from './ShieldGraphic';
import styles from './login.module.css';

const FALLBACK_NAME = 'uniqbd.com Log Server';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export default function LoginPage() {
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [companyName, setCompanyName] = useState(FALLBACK_NAME);

  useEffect(() => {
    api<{ companyName?: string; faviconUrl?: string | null }>('/api/branding')
      .then((r) => {
        const name = r.companyName?.trim();
        if (name) {
          setCompanyName(name);
          document.title = name;
        }
        if (r.faviconUrl) {
          let link = document.querySelector<HTMLLinkElement>('link[data-brand-favicon="1"]');
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            link.setAttribute('data-brand-favicon', '1');
            document.head.appendChild(link);
          }
          link.href = r.faviconUrl;
        }
      })
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userName, password }),
      });
      window.location.assign('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.page} ${poppins.className}`}>
      <div className={styles.themeToggle}>
        <ThemeToggle />
      </div>
      <svg className={`${styles.scribble} ${styles.scribbleTop}`} viewBox="0 0 160 70" fill="none">
        <path d="M8 42 C28 8, 58 62, 88 22 S138 8, 152 36" stroke="#26BFB0" strokeWidth="1.4" />
        <circle cx="24" cy="18" r="3" fill="#26BFB0" />
        <circle cx="118" cy="12" r="2.2" fill="#5EEAD4" />
      </svg>
      <svg className={`${styles.scribble} ${styles.scribbleBottom}`} viewBox="0 0 180 80" fill="none">
        <path d="M10 48 C40 8, 70 72, 110 28 S160 18, 172 50" stroke="#0A6258" strokeWidth="1.4" />
        <polygon points="150,18 158,32 142,32" stroke="#26BFB0" fill="none" />
      </svg>

      <div className={styles.card}>
        <div className={styles.art} aria-hidden="true">
          <ShieldGraphic className={styles.shield} />
        </div>
        <div className={styles.right}>
          <form className={styles.form} onSubmit={onSubmit}>
            <h1 className={styles.mobileOnly}>{companyName}</h1>
            <h2 className={styles.formTitle}>{companyName}</h2>
            <p className={styles.formSubtitle}>Sign in to continue</p>
            {error ? (
              <div className={styles.errorBanner} role="alert">
                {error}
              </div>
            ) : null}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Username</span>
              <span className={styles.fieldLine}>
                <input
                  className={styles.nativeInput}
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  autoComplete="username"
                />
              </span>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Password</span>
              <span className={styles.fieldLine}>
                <input
                  className={styles.nativeInput}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </span>
            </label>
            <div className={styles.actions}>
              <button className={styles.login} type="submit" disabled={busy}>
                {busy ? 'Signing in...' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
