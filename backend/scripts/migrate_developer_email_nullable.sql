-- Make developers.email nullable for ghost developers
-- (external contributors discovered during sync who don't have accounts)
ALTER TABLE developers ALTER COLUMN email DROP NOT NULL;
