'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

type Branding = { companyName?: string; faviconUrl?: string | null };

function applyBrand(name?: string, faviconUrl?: string | null) {
  const title = name?.trim();
  if (title) document.title = title;
  let link = document.querySelector<HTMLLinkElement>('link[data-brand-favicon="1"]');
  if (faviconUrl) {
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.setAttribute('data-brand-favicon', '1');
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
    return;
  }
  if (faviconUrl === null && link) link.remove();
}

export default function BrandHead() {
  useEffect(() => {
    let cancelled = false;
    api<Branding>('/api/branding')
      .then((r) => {
        if (!cancelled) applyBrand(r.companyName, r.faviconUrl);
      })
      .catch(() => {});

    function onCompany(e: Event) {
      const detail = (e as CustomEvent<string | Branding>).detail;
      if (typeof detail === 'string') {
        applyBrand(detail);
        return;
      }
      applyBrand(detail?.companyName, detail?.faviconUrl);
    }
    window.addEventListener('company-updated', onCompany);
    return () => {
      cancelled = true;
      window.removeEventListener('company-updated', onCompany);
    };
  }, []);
  return null;
}
