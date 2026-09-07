# ISP-LogServer 3.8

**MikroTik NAT, Access and PPP log platform for ISPs and network operators.**

Collects syslog from MikroTik routers, stores NAT and access records, and lets staff search by user, IP, MAC, port or time — with role-based access so each operator only sees assigned routers.

[![Version](https://img.shields.io/badge/version-3.8-26bfb0)](#)
[![Frontend](https://img.shields.io/badge/Next.js-16-black)](#)
[![Backend](https://img.shields.io/badge/NestJS-11-ea2845)](#)
[![Database](https://img.shields.io/badge/PostgreSQL-16-336791)](#)
[![Runtime](https://img.shields.io/badge/Docker-Compose-2496ed)](#)

**Product:** Log Server · **Version:** 3.8 · **Company:** [UniQbd](https://uniqbd.com)

Contact: [WhatsApp 01777139777](https://wa.me/8801777139777) · [Facebook](https://fb.com/uniqbd.online) · [uniqbd.com](https://uniqbd.com)

---

## GitHub repository description

Paste this in **GitHub → Settings → General → Description**:

```text
MikroTik NAT, Access and PPP log server for ISPs — live syslog, search, roles, and Docker hosting on Ubuntu.
```

Suggested topics: `mikrotik` `syslog` `isp` `nestjs` `nextjs` `postgresql` `docker` `log-management` `networking`

---

## What this project does

ISPs need a dedicated place to keep MikroTik logs instead of scrolling RouterOS windows. This app:

- Listens on **UDP 514** for syslog (`prerouting:` firewall / NAT and `PPPLOG` PPP sessions)
- Stores events in **PostgreSQL** with Asia/Dhaka timestamps
- Shows a live stream and historical Search Log
- Scopes every user to the routers they are allowed to see

---

## Features

| Module | What it does |
| --- | --- |
| Dashboard | Live router, user and today’s log counts |
| Realtime Log Stream | Incoming MikroTik syslog as it arrives |
| Add MikroTik | Register NAT, Access or RAW routers and set Auto Log Delete |
| Search Log | Filter by user, IP, NAT, MAC, port and date range |
| User Manager | Accounts, roles and password reset |
| Role Manager | Menu-level permissions |
| Server Manager | Which MikroTik each operator can see |
| Server Settings | Company name, branding, favicon, MikroTik ports, SMTP and SMS |
| Activate License Key | Unlock extra routers and longer log retention |
| Activity Logs | Admin audit trail (auto-delete after 30 days) |

Router types: `NAT+ACCESS`, `NAT`, `ACCESS`, `RAW`.

Auto Log Delete packages: **1 month**, **3 months**, **6 months**, **1 year**. Nightly purge at **02:15 Asia/Dhaka**.

---

## License

Activate a key from the **Activate License Key** menu. Keys are validated against [license.amarpin.com](https://license.amarpin.com) over IPv4. Paste the key in the website — do not put it in `.env`. The server must be able to reach Amarpin. The license cache refreshes about every 6 hours. If the internet is down for a while but a key is already stored, licensed features stay unlocked.

Deactivating a key locks licensed features again. Routers that were already added are **not** deleted.

### Without a license key — what you get

These features work with no key:

| Feature | Without a license |
| --- | --- |
| Dashboard | Available |
| Realtime Log Stream | Available |
| Search Log | Available |
| User / Role / Server Manager | Available |
| Server Settings (branding, SMTP, SMS, ports) | Available |
| Activity Logs | Available |
| Add MikroTik | **One router only** |
| Auto Log Delete | **1 month only** |

### Without a license key — what you do not get

These stay locked until a valid key is active:

| Feature | Without a license |
| --- | --- |
| **Second (or more) MikroTik** | Cannot add another router |
| **Auto Log Delete — 3 months** | Option locked |
| **Auto Log Delete — 6 months** | Option locked |
| **Auto Log Delete — 1 year** | Option locked |

While the key is inactive, the site footer shows WhatsApp, Facebook and uniqbd.com so you can request a license.

### After you activate a license key — what you get

You keep every free feature above, and these unlock:

| Feature | With an active license |
| --- | --- |
| **Unlimited MikroTik routers** | Add as many routers as you need |
| **Auto Log Delete — 3 months** | Keep logs for 3 months |
| **Auto Log Delete — 6 months** | Keep logs for 6 months |
| **Auto Log Delete — 1 year** | Keep logs for 1 year |

---

## Tech stack

### Frontend (website)

| Tool | Version | Role |
| --- | --- | --- |
| Next.js | 16.3 | App Router website |
| React | 19.2 | UI |
| Tailwind CSS | 3.4 | Styling |
| TypeScript | 5.8 | Language |
| Turbopack | — | Bundler |

### Backend (API)

| Tool | Version | Role |
| --- | --- | --- |
| NestJS | 11.1 | REST API |
| Node.js | 22 | Runtime |
| TypeScript | 5.8 | Language |
| Prisma | 6.10 | ORM |
| BullMQ / Redis | 7 | Jobs and cache |

### Database and edge

| Tool | Version | Role |
| --- | --- | --- |
| PostgreSQL | 16 | Primary database |
| nginx | 1.27 | Reverse proxy (port 80 / 443) |
| Docker Compose | — | Production runtime |

**Architecture**

```text
Browser  →  nginx :80/:443
              ├─ /        →  Next.js web :3000
              └─ /api/    →  NestJS API  :4000  (host network)
                              ├─ PostgreSQL :5432
                              ├─ Redis      :6379
                              └─ Syslog UDP :514  ← MikroTik
```

---

## Server requirements

| Item | Minimum | Better |
| --- | --- | --- |
| OS | Ubuntu 22.04 or 24.04 (64-bit) | Same |
| RAM | 2 GB | 4 GB+ |
| Disk | Size for your log volume | Grow with traffic |
| Network | Public or LAN IP | MikroTik must reach UDP 514 |
| Access | root or `sudo` | SSH port open |

**Ports to keep open**

| Port | Protocol | Why |
| --- | --- | --- |
| 22 | TCP | SSH |
| 80 | TCP | Website |
| 443 | TCP | HTTPS (if you use a domain) |
| 514 | **UDP** | MikroTik syslog |

If Apache or nginx is already using port 80 on the host, stop it before install.

---

## Repository layout

```text
.
├── web/                      Next.js operator website
├── api/                      NestJS API, Prisma, syslog listener
├── deploy/nginx/             nginx configs
├── deploy/ubuntu/setup.sh    first-time Ubuntu installer
├── docker-compose.prod.yml   production stack
└── .env.production.example   env template (never commit a real .env)
```

Install path on the server: **`/opt/logserver`**

Do **not** copy `web/node_modules`, `api/node_modules`, `web/.next`, `api/dist`, or overwrite production `.env` / `data/` on later updates.

---

## First install on Ubuntu

SSH into the server:

```bash
cd /opt/logserver
sudo bash deploy/ubuntu/setup.sh
```

The script:

1. Installs Docker and Docker Compose
2. Creates `.env` from `.env.production.example` with random passwords if `.env` is missing
3. Opens firewall ports 22, 80, 443 and UDP 514
4. Creates `data/logs` and `data/web-config`
5. Builds and starts all containers

Save the **First admin password** printed on screen.

Create the first admin user (once):

```bash
cd /opt/logserver
sudo docker compose -f docker-compose.prod.yml exec api npx prisma db seed
```

Open:

```text
http://YOUR_SERVER_IP
```

Example: `http://192.168.133.12`

- **Username:** `SEED_ADMIN_USERNAME` in `.env` (default `admin`)
- **Password:** the value printed by `setup.sh`

Change the password after first login.

Health check:

```text
http://YOUR_SERVER_IP/api/health
```

`{"ok":true}` means the API is up.

---

## Environment (do not commit secrets)

File: `/opt/logserver/.env`  
Template: `.env.production.example`

| Variable | Purpose |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database user, password, name |
| `REDIS_PASSWORD` | Redis password |
| `JWT_SECRET` | Login token secret (32+ characters) |
| `WEB_ORIGIN` | Public site URL, e.g. `http://192.168.1.10` |
| `COOKIE_SECURE` | `false` on HTTP, `true` on HTTPS |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | First admin only |
| `ALLOW_DESTRUCTIVE_SEED` | Keep `false` on production |
| `SMS_URL_ALLOWLIST` | Extra HTTPS SMS provider hosts (optional) |
| `SMS_DAILY_LIMIT` | Max SMS per day (default 30) |
| `SMTP_HOST_ALLOWLIST` / `SMTP_ALLOW_PRIVATE` / `SMTP_PORT_ALLOWLIST` | SMTP safety (optional) |

Replace any `CHANGE_ME` values, then run setup again if needed.

**Do not overwrite `.env` on updates.** Passwords and secrets live there.

---

## Docker services

| Service | Role | Port |
| --- | --- | --- |
| `postgres` | Database | 127.0.0.1:5432 |
| `redis` | Cache | 127.0.0.1:6379 |
| `api` | Backend + syslog (host network) | TCP 4000, UDP 514 |
| `web` | Frontend | 3000 (Docker network only) |
| `nginx` | Public website | 80, 443 |

Browser → **nginx :80** → pages go to **web**, `/api/` goes to **api**.

The API uses **host network** so MikroTik syslog on UDP 514 reaches it directly.

---

## MikroTik syslog

1. In the website, open **Add MikroTik** — router IP, API user/password, type (NAT / ACCESS / RAW).
2. On the MikroTik, set Remote Logging:

| Setting | Value |
| --- | --- |
| Remote address | Log Server IP |
| Remote port | **514** |
| Protocol | UDP |

3. Firewall log prefix: `prerouting:`  
   PPP log prefix: `PPPLOG`

UDP **514** from the router to this server must not be blocked. Keep the log server running.

Without a license you can add **one** MikroTik. Activate a key to add more.

---

## Daily commands

All commands on the server, folder: `/opt/logserver`

### Status

```bash
cd /opt/logserver
sudo docker compose -f docker-compose.prod.yml ps
```

`api` should be **healthy**.

### Logs

```bash
sudo docker compose -f docker-compose.prod.yml logs -f --tail=80 api
sudo docker compose -f docker-compose.prod.yml logs -f --tail=80 web
sudo docker compose -f docker-compose.prod.yml logs -f --tail=80 nginx
```

### Stop / start

```bash
sudo docker compose -f docker-compose.prod.yml stop
sudo docker compose -f docker-compose.prod.yml start
```

---

## Update after a code change

1. Copy changed source (WinSCP or git). Do **not** overwrite `/opt/logserver/.env` or `data/`.
2. Rebuild:

Website only:

```bash
cd /opt/logserver
sudo docker compose -f docker-compose.prod.yml up -d --build --force-recreate --no-deps web
```

Website and API:

```bash
cd /opt/logserver
sudo docker compose -f docker-compose.prod.yml up -d --build --force-recreate --no-deps api web
sudo docker compose -f docker-compose.prod.yml restart nginx
```

Wait until `api` is healthy, then hard-refresh the browser (**Ctrl+F5**).

---

## HTTPS (optional)

Skip this if you use a raw IP. If you have a domain:

1. Point a DNS A record at the server IP.
2. Run:

```bash
cd /opt/logserver
sudo bash deploy/ubuntu/enable-ssl.sh logs.example.com you@email.com
```

The script sets `WEB_ORIGIN=https://YOUR_DOMAIN` and `COOKIE_SECURE=true` in `.env`.

---

## Backup

**Never run:**

```bash
sudo docker compose -f docker-compose.prod.yml down -v
```

`-v` deletes the database volume and all logs.

Keep copies of:

| Item | Where |
| --- | --- |
| Passwords / secrets | `/opt/logserver/.env` |
| Favicon and web config | `/opt/logserver/data/web-config` |
| File logs / license cache | `/opt/logserver/data/logs` |
| PostgreSQL data | Docker volume `pgdata` |

Database dump:

```bash
cd /opt/logserver
sudo docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U logserver logserver > ~/logserver-backup-$(date +%F).sql
```

---

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Site does not load | `sudo docker compose -f docker-compose.prod.yml ps` — nginx/web up? Port 80 free: `sudo ss -tlnp \| grep ':80'` |
| `/api/health` fails | Check API logs. Confirm `JWT_SECRET` and `DATABASE_URL` in `.env` |
| Login fails | Seed ran once? `WEB_ORIGIN` matches the URL? HTTP needs `COOKIE_SECURE=false` |
| No syslog | `sudo ss -ulnp \| grep 514` — API listening? Stop host rsyslog if it owns 514: `sudo systemctl stop rsyslog`. Check MikroTik remote IP/port |
| Cannot add a second MikroTik | Activate a license key |
| 3 months / 6 months / 1 year Auto Log Delete locked | Activate a license key, or use **1 month** without a key |
| Email / SMS test warning | Save settings first. Check SMTP/SMS host, user, password, contact email / mobile |
| Stale UI after deploy | Ctrl+F5. Confirm the `web` container rebuilt |
| `api` unhealthy | Wait for postgres to be healthy, then check `logs api` |

---

## Do not

- Commit `.env` or publish secrets
- Overwrite production `.env` with WinSCP
- Run `docker compose down -v`
- Set `ALLOW_DESTRUCTIVE_SEED=true` on production (it wipes users)
- Install Node.js on the host and run `npm start` — Docker is enough

---

## Author

**Nowsin Juthi** · UniQbd

Website: [uniqbd.com](https://uniqbd.com) · WhatsApp: [01777139777](https://wa.me/8801777139777) · Facebook: [fb.com/uniqbd.online](https://fb.com/uniqbd.online)
