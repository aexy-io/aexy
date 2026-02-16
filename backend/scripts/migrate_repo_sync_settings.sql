-- Add repo_sync_settings JSONB column to developers table
-- Stores auto-sync preferences: {"enabled": bool, "frequency": "1h"|"30m"|"6h"|"12h"|"24h"}

ALTER TABLE developers
ADD COLUMN IF NOT EXISTS repo_sync_settings JSONB;
