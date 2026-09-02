#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ubuntu/setup.sh"
  exit 1
fi

. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This script is for Ubuntu (found ID=${ID:-unknown})."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg openssl ufw

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-jammy} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

systemctl enable --now docker

rand() {
  openssl rand -base64 48 | tr -d '\n/+= ' | head -c 40
}

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
SERVER_IP="${SERVER_IP:-127.0.0.1}"

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.production.example" "$ROOT/.env"
  PG_PASS="$(rand)"
  REDIS_PASS="$(rand)"
  JWT="$(openssl rand -base64 48 | tr -d '\n')"
  ADMIN_PASS="$(rand)"
  sed -i \
    -e "s|CHANGE_ME_STRONG_DB_PASSWORD|${PG_PASS}|g" \
    -e "s|CHANGE_ME_STRONG_REDIS_PASSWORD|${REDIS_PASS}|g" \
    -e "s|CHANGE_ME_AT_LEAST_32_RANDOM_CHARS|${JWT}|g" \
    -e "s|CHANGE_ME_STRONG_ADMIN_PASSWORD|${ADMIN_PASS}|g" \
    -e "s|http://YOUR_SERVER_IP|http://${SERVER_IP}|g" \
    "$ROOT/.env"
  echo
  echo "Created $ROOT/.env with generated secrets."
  echo "First admin password (change after login): ${ADMIN_PASS}"
  echo
else
  echo "Using existing $ROOT/.env"
fi

if grep -q 'CHANGE_ME' "$ROOT/.env"; then
  echo "Replace every CHANGE_ME value in $ROOT/.env, then run this script again."
  exit 1
fi

mkdir -p "$ROOT/deploy/nginx/certbot" "$ROOT/deploy/nginx/certs"
chmod 700 "$ROOT/deploy/nginx/certs"

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 514/udp
ufw --force enable || true

docker compose -f "$ROOT/docker-compose.prod.yml" up -d --build

echo
echo "Log Server is up."
echo "Website:  http://${SERVER_IP}"
echo "Health:   http://${SERVER_IP}/api/health"
echo "Syslog:   UDP ${SERVER_IP}:514  (MikroTik remote logging)"
echo
echo "After HTTPS (certbot on the host or a domain):"
echo "  1. Set WEB_ORIGIN=https://your-domain.com"
echo "  2. Set COOKIE_SECURE=true"
echo "  3. docker compose -f docker-compose.prod.yml up -d"
