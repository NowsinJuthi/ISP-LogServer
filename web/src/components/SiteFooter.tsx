'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';

const FALLBACK_NAME = 'uniqbd.com Log Server';
const YEAR = new Date().getFullYear();

const VENDOR = {
  whatsapp: '01777139777',
  whatsappLink: 'https://wa.me/8801777139777',
  facebook: 'fb.com/uniqbd.online',
  facebookLink: 'https://fb.com/uniqbd.online',
  website: 'uniqbd.com',
  websiteLink: 'https://uniqbd.com',
} as const;

export default function SiteFooter() {
  const path = usePathname();
  const [companyName, setCompanyName] = useState(FALLBACK_NAME);
  const [licensed, setLicensed] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ companyName?: string; licensed?: boolean }>('/api/branding')
      .then((r) => {
        const name = r.companyName?.trim();
        if (name) setCompanyName(name);
        setLicensed(r.licensed === true);
      })
      .catch(() => {
        setLicensed(false);
      });

    function onCompany(e: Event) {
      const detail = (e as CustomEvent<string | { companyName?: string }>).detail;
      const name = typeof detail === 'string' ? detail : detail?.companyName;
      if (name?.trim()) setCompanyName(name.trim());
    }
    function onLicense(e: Event) {
      setLicensed((e as CustomEvent<{ unlocked?: boolean }>).detail?.unlocked === true);
    }
    window.addEventListener('company-updated', onCompany);
    window.addEventListener('license-updated', onLicense);
    return () => {
      window.removeEventListener('company-updated', onCompany);
      window.removeEventListener('license-updated', onLicense);
    };
  }, []);

  const brandLetter = companyName.trim().charAt(0).toUpperCase() || 'U';
  const showSupport = licensed === false;
  const onLogin = path === '/login';

  return (
    <footer className={`ls-footer${onLogin ? ' ls-footer-login' : ''}`}>
      <div className="ls-footer-inner">
        <div className="ls-footer-brand">
          <span className="ls-footer-mark">{brandLetter}</span>
          <div className="min-w-0">
            <p className="ls-footer-name">{companyName}</p>
            <p className="ls-footer-tag">MikroTik NAT, Access and PPP log collection</p>
          </div>
        </div>
        {showSupport ? (
          <nav className="ls-footer-support" aria-label="Contact administrator">
            <a className="ls-footer-contact" href={VENDOR.whatsappLink} target="_blank" rel="noreferrer">
              <span className="ls-footer-contact-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 20.4 5 21l.7-2.6A8.5 8.5 0 1 1 12 20.5a8.4 8.4 0 0 1-4.5-1.1Z" />
                  <path strokeLinecap="round" d="M9.2 9.8c.3 1.6 1.6 3 3.2 3.4" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="ls-footer-contact-label">WhatsApp</span>
                <span className="ls-footer-contact-value">{VENDOR.whatsapp}</span>
              </span>
            </a>
            <a className="ls-footer-contact" href={VENDOR.facebookLink} target="_blank" rel="noreferrer">
              <span className="ls-footer-contact-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.6 21v-7.2h2.4l.4-2.8h-2.8V9.2c0-.8.2-1.4 1.4-1.4H16.6V5.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 4v2.6H8v2.8h2.5V21h3.1Z" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="ls-footer-contact-label">Facebook</span>
                <span className="ls-footer-contact-value">{VENDOR.facebook}</span>
              </span>
            </a>
            <a className="ls-footer-contact" href={VENDOR.websiteLink} target="_blank" rel="noreferrer">
              <span className="ls-footer-contact-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="8.5" />
                  <path strokeLinecap="round" d="M3.5 12h17M12 3.5c2.4 2.4 3.7 5.4 3.7 8.5s-1.3 6.1-3.7 8.5M12 3.5C9.6 5.9 8.3 8.9 8.3 12s1.3 6.1 3.7 8.5" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="ls-footer-contact-label">Website</span>
                <span className="ls-footer-contact-value">{VENDOR.website}</span>
              </span>
            </a>
          </nav>
        ) : null}
      </div>
      <div className="ls-footer-bar">
        <span>
          © {YEAR} UniQbd · {companyName}
        </span>
        <span className="ls-footer-bar-right">Version 3.8 · Developed for ISP operators</span>
      </div>
    </footer>
  );
}
