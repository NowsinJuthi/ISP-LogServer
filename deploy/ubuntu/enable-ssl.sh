#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ubuntu/enable-ssl.sh your-domain.com you@email.com"
  exit 1
fi

DOMAIN="${1:-}"
EMAIL="${2:-}"
if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: sudo bash deploy/ubuntu/enable-ssl.sh logs.example.com admin@example.com"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

mkdir -p "$ROOT/deploy/nginx/certbot" "$ROOT/deploy/nginx/certs"

docker compose -f "$ROOT/docker-compose.prod.yml" --profile ssl run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive

sed "s/DOMAIN_NAME/${DOMAIN}/g" \
  "$ROOT/deploy/nginx/logserver.ssl.conf.template" \
  > "$ROOT/deploy/nginx/logserver.ssl.conf"

if grep -q '^NGINX_CONF=' "$ROOT/.env"; then
  sed -i "s|^NGINX_CONF=.*|NGINX_CONF=logserver.ssl.conf|" "$ROOT/.env"
else
  echo "NGINX_CONF=logserver.ssl.conf" >> "$ROOT/.env"
fi

sed -i \
  -e "s|^COOKIE_SECURE=.*|COOKIE_SECURE=true|" \
  -e "s|^WEB_ORIGIN=.*|WEB_ORIGIN=https://${DOMAIN}|" \
  "$ROOT/.env"

docker compose -f "$ROOT/docker-compose.prod.yml" up -d nginx api

echo
echo "HTTPS is on: https://${DOMAIN}"
echo "Renew later: docker compose -f docker-compose.prod.yml --profile ssl run --rm certbot renew"
echo "Then:        docker compose -f docker-compose.prod.yml exec nginx nginx -s reload"
