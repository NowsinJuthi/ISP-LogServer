'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { api } from '@/lib/api';

type LicenseStatus = { searchUnlocked?: boolean };

const CACHE_KEY = 'ls-license-unlocked';

function readCache(): boolean | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(unlocked: boolean) {
  try {
    sessionStorage.setItem(CACHE_KEY, unlocked ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function rememberLicenseUnlocked(unlocked: boolean) {
  const prev = readCache();
  writeCache(unlocked);
  if (prev === unlocked) return;
  try {
    window.dispatchEvent(new CustomEvent('license-updated', { detail: { unlocked } }));
  } catch {
    /* ignore */
  }
}

async function readStatus(): Promise<LicenseStatus> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 4000);
  try {
    return await api<LicenseStatus>('/api/license/status', { signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/** Live license gate. Status is cached on the API so the page opens immediately. */
export function useLicenseGate() {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useLayoutEffect(() => {
    const cached = readCache();
    if (cached !== null) {
      setUnlocked(cached);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const r = await readStatus();
        if (cancelled) return;
        const next = r.searchUnlocked === true;
        rememberLicenseUnlocked(next);
        setUnlocked(next);
        setReady(true);
      } catch {
        if (cancelled) return;
        setReady(true);
      }
    }

    void tick();
    const id = window.setInterval(tick, 15_000);
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return { ready, unlocked };
}
