#!/bin/sh
set -e
npx prisma migrate deploy
npx prisma db seed
exec node dist/main.js
