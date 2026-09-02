-- Additive indexes only. Does not change or delete existing data.
CREATE INDEX IF NOT EXISTS "Audit_createdAt_idx" ON "Audit"("createdAt");
CREATE INDEX IF NOT EXISTS "PppSession_serverId_receivedAt_idx" ON "PppSession"("serverId", "receivedAt");
