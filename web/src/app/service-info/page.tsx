'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Info = {
  product: {
    name: string;
    website: string;
    operator: string;
    version: string;
    year: number;
  };
  company: { companyName: string };
  syslog: { name: string; running: boolean; port: number; lastError: string; received: number };
  mikrotikApi: { name: string; running: boolean };
  stats: {
    servers: number;
    online: number;
    disabled: number;
    users: number;
    todayLogs: number;
    totalLogs: number;
  };
  stack?: { name: string; version: string; role: string }[];
};

const modules = [
  { name: 'Dashboard', detail: 'Live counts for routers, users and today’s logs.' },
  { name: 'Realtime Log Stream', detail: 'Watch incoming MikroTik syslog as it arrives.' },
  { name: 'Add MikroTik', detail: 'Register NAT, Access or RAW routers and set retention.' },
  { name: 'Search Log', detail: 'Filter by user, IP, NAT, MAC, port and date range.' },
  { name: 'User Manager', detail: 'Create accounts, assign roles and reset passwords.' },
  { name: 'Change Password', detail: 'Signed-in users, including Super Admin, can change their own password from the top bar.' },
  { name: 'Role Manager', detail: 'Control which menus each role can open.' },
  { name: 'Server Manager', detail: 'Assign which MikroTik a user is allowed to see.' },
  { name: 'Server Settings', detail: 'Company name and log server URL used by this site.' },
  { name: 'Activate License Key', detail: 'Activate a license key to add more than one MikroTik and unlock 3-month/6-month/1-year log retention.' },
  { name: 'Activity Logs', detail: 'Audit trail of admin actions on this platform.' },
];

const specs = [
  ['Product', 'Log Server'],
  ['Website', 'uniqbd.com'],
  ['Purpose', 'MikroTik NAT, Access and PPP log collection'],
  ['Syslog', 'UDP 514 (Windows fallback 5514)'],
  ['Log prefixes', 'prerouting:  ·  PPPLOG'],
  ['Retention', '1 month, 3 months, 6 months or 1 year'],
  ['Router types', 'NAT+ACCESS, NAT, ACCESS, RAW'],
  ['Authentication', 'Username / password, role-based menus'],
  ['Purge schedule', 'Daily at 2:15 AM'],
];

const fallbackStack = [
  { name: 'TypeScript', version: '5.8', role: 'Language for the website and API' },
  { name: 'Next.js', version: '16.3.3', role: 'Website (App Router, Turbopack)' },
  { name: 'React', version: '19.2.8', role: 'Website UI' },
  { name: 'Tailwind CSS', version: '3.4.17', role: 'Website styling' },
  { name: 'NestJS', version: '11.1.3', role: 'Backend API' },
  { name: 'Prisma', version: '6.10.1', role: 'Database ORM' },
  { name: 'PostgreSQL', version: '16', role: 'Primary database' },
  { name: 'Node.js', version: '22', role: 'Runtime' },
];

function ver(stack: { name: string; version: string }[] | undefined, name: string, fallback: string) {
  return stack?.find((s) => s.name === name)?.version || fallback;
}

function stackLayers(stack?: { name: string; version: string; role: string }[]) {
  const rows = stack?.length ? stack : fallbackStack;
  return [
    {
      name: 'Frontend',
      title: 'Operator website',
      detail: 'Search, dashboards and settings in the browser.',
      items: [
        { name: 'Next.js', version: ver(rows, 'Next.js', '16.3.3') },
        { name: 'React', version: ver(rows, 'React', '19.2.8') },
        { name: 'Tailwind CSS', version: ver(rows, 'Tailwind CSS', '3.4.17') },
        { name: 'Turbopack', version: 'Bundler' },
      ],
    },
    {
      name: 'Backend',
      title: 'API and syslog',
      detail: 'License, search, users and UDP 514 log intake.',
      items: [
        { name: 'NestJS', version: ver(rows, 'NestJS', '11.1.3') },
        { name: 'TypeScript', version: ver(rows, 'TypeScript', '5.8') },
        { name: 'Node.js', version: ver(rows, 'Node.js', '22') },
      ],
    },
    {
      name: 'Database',
      title: 'Log storage',
      detail: 'NAT, PPP sessions and activity logs.',
      items: [
        { name: 'PostgreSQL', version: ver(rows, 'PostgreSQL', '16') },
        { name: 'Prisma', version: ver(rows, 'Prisma', '6.10.1') },
      ],
    },
  ];
}

const steps = [
  { n: '1', title: 'Add the router', text: 'Save the MikroTik IP, type, API user and listening port from Add MikroTik.' },
  { n: '2', title: 'Point syslog', text: 'On the router, send remote logs to this server IP on UDP 514.' },
  { n: '3', title: 'Tag the rules', text: 'Prefix firewall logs with prerouting: and PPP sessions with PPPLOG.' },
  { n: '4', title: 'Search & export', text: 'Use Search Log to filter by user, IP or MAC and export CSV when needed.' },
];

function dash(n?: number) {
  return typeof n === 'number' ? n.toLocaleString() : '—';
}

export default function ServiceInfoPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Info>('/api/service-info')
      .then(setInfo)
      .catch((e) => setError((e as Error).message));
  }, []);

  const product = info?.product;
  const loading = !info && !error;
  const syslogOk = info?.syslog.running;
  const apiOk = info?.mikrotikApi.running;

  return (
    <Shell>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Service Info</h1>
        <p className="text-sm text-slate-500 mt-1">
          Platform details, live services and how uniqbd.com Log Server collects MikroTik logs.
        </p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>
      )}

      <section className="ls-page-hero mb-5">
        <p className="ls-page-kicker">Product</p>
        <h2 className="ls-page-title">{product?.name || 'uniqbd.com Log Server'}</h2>
        <p className="ls-page-desc max-w-3xl">
          A dedicated MikroTik log platform for ISPs and network operators. It receives syslog from
          routers, stores NAT and access records, and lets staff search by user, IP, MAC or time —
          with role-based access so each operator only sees assigned routers.
        </p>
        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          <span className="bg-brand-soft text-brand-deep px-2.5 py-1 rounded-full">Version 3.8</span>
          <span className="bg-brand-soft text-brand-deep px-2.5 py-1 rounded-full">{product?.year || 2026}</span>
          <span className="bg-brand-soft text-brand-deep px-2.5 py-1 rounded-full">uniqbd.com</span>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="MikroTik routers" value={dash(info?.stats.servers)} />
        <Stat label="Online" value={dash(info?.stats.online)} tone="ok" />
        <Stat label="Users" value={dash(info?.stats.users)} />
        <Stat label="Logs today" value={dash(info?.stats.todayLogs)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <article className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-medium text-slate-800 mb-4">Live services</h3>
          <ServiceRow
            name={info?.syslog.name || 'Syslog listener'}
            ok={syslogOk}
            loading={loading}
            meta={`UDP ${info?.syslog.port ?? '—'} · ${dash(info?.syslog.received)} packets today`}
            warn={info?.syslog.lastError}
          />
          <ServiceRow
            name={info?.mikrotikApi.name || 'MikroTik RouterOS API'}
            ok={apiOk}
            loading={loading}
            meta="Used when adding or probing a router"
          />
          <ServiceRow name="Web application" ok loading={false} meta="Operator portal for search, users and roles" />
          <ServiceRow name="PostgreSQL" ok loading={false} meta="Log events, PPP sessions and admin data" />
        </article>

        <article className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-medium text-slate-800 mb-4">Operator</h3>
          <dl className="space-y-3 text-sm">
            <Row label="Company" value="UniQbd" />
            <Row label="Website" value="uniqbd.com" href="https://uniqbd.com" />
            <Row label="Contact" value={product?.operator || 'Sohel'} />
            <Row label="WhatsApp" value="01777139777" href="https://wa.me/8801777139777" />
            <Row label="Stored logs" value={`${dash(info?.stats.totalLogs)} total`} />
          </dl>
        </article>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-5">
        <div className="px-5 py-3 border-b border-slate-100 text-sm font-medium text-slate-800">How it works</div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s) => (
            <div key={s.n} className="rounded-lg border border-slate-200 p-4">
              <div className="h-7 w-7 rounded-full ls-chip-on text-xs font-semibold flex items-center justify-center">
                {s.n}
              </div>
              <div className="text-sm font-medium text-slate-800 mt-3">{s.title}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm mb-5">
        <div className="px-5 py-3 border-b border-slate-100 text-sm font-medium text-slate-800">Modules</div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {stackLayers(info?.stack).map((layer) => (
            <article
              key={layer.name}
              className="rounded-xl border p-4"
              style={{
                borderColor: 'rgb(var(--brand) / 0.28)',
                background: 'rgb(var(--brand) / 0.08)',
              }}
            >
              <p className="ls-page-kicker">{layer.name}</p>
              <h3 className="text-sm font-semibold mt-2" style={{ color: 'rgb(var(--brand-deep))' }}>
                {layer.title}
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{layer.detail}</p>
              <ul className="mt-3 space-y-2">
                {layer.items.map((item) => (
                  <li key={item.name} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-700">{item.name}</span>
                    <span className="shrink-0 text-[11px] font-mono bg-brand-soft text-brand-deep px-2 py-0.5 rounded-full">
                      {item.version}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="px-5 pb-5">
          <p className="ls-page-kicker mb-3">App features</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {modules.map((m) => (
              <div
                key={m.name}
                className="rounded-lg px-4 py-3"
                style={{
                  border: '1px solid rgb(var(--brand) / 0.22)',
                  background: 'rgb(var(--brand) / 0.05)',
                }}
              >
                <div className="text-sm font-medium text-slate-800">{m.name}</div>
                <p className="text-xs text-slate-500 mt-1">{m.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm font-medium text-slate-800">
          Technical information
        </div>
        <table className="min-w-full text-sm">
          <tbody>
            {specs.map(([k, v]) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="px-5 py-2.5 text-slate-500 w-40 align-top">{k}</td>
                <td className="px-5 py-2.5 text-slate-800">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Shell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${tone === 'ok' ? 'text-emerald-700' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  );
}

function ServiceRow({
  name,
  ok,
  meta,
  warn,
  loading,
}: {
  name: string;
  ok?: boolean;
  meta: string;
  warn?: string;
  loading?: boolean;
}) {
  const label = loading ? 'Checking' : ok ? 'Running' : 'Stopped';
  const tone = loading
    ? 'bg-slate-100 text-slate-500'
    : ok
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-red-50 text-red-700';
  return (
    <div className="py-3 border-t border-slate-100 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-800">{name}</div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${tone}`}>{label}</span>
      </div>
      <div className="text-xs text-slate-500 mt-1">{meta}</div>
      {warn && <div className="text-xs text-amber-700 mt-1">{warn}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-xs' : ''}`}>
        {href && /^(https?:|mailto:)/i.test(href) ? (
          <a href={href} className="text-accent hover:underline" target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
