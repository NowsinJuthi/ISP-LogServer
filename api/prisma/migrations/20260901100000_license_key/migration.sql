-- Store operator-entered Amarpin license key (not the HMAC site secret).
ALTER TABLE "CompanySetting" ADD COLUMN IF NOT EXISTS "licenseKey" TEXT;
