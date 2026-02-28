-- Migration: Seed the MCP API token for the first developer
-- Date: 2026-02-28

INSERT INTO api_tokens (id, developer_id, name, token_hash, token_prefix, is_active)
SELECT
    gen_random_uuid(),
    d.id,
    'MCP Server',
    'e95245e6f9962449d390b580ab1f835311fd3a866923e2e745b955a89c99dc8f',
    'aexy_ae69556',
    TRUE
FROM developers d
ORDER BY d.created_at ASC
LIMIT 1
ON CONFLICT (token_hash) DO NOTHING;
