-- Company-wide MikroTik API / Winbox / firewall ports (defaults 1122).
ALTER TABLE "CompanySetting" ADD COLUMN IF NOT EXISTS "mikrotikApiPort" INTEGER NOT NULL DEFAULT 1122;
ALTER TABLE "CompanySetting" ADD COLUMN IF NOT EXISTS "mikrotikWinboxPort" INTEGER NOT NULL DEFAULT 1122;
ALTER TABLE "CompanySetting" ADD COLUMN IF NOT EXISTS "mikrotikFirewallPort" INTEGER NOT NULL DEFAULT 1122;
