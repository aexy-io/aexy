-- One tool registry.
--
-- Agents used to name tools from a hand-written LangGraph registry
-- (`search_contacts`, `send_email`, …). That registry is gone; every tool an
-- agent holds is now an MCP catalogue name, run through the governed executor.
-- This rewrites stored tool lists so existing agents keep working:
--
--   search_contacts     -> aexy_crm_records           (routine)
--   get_record          -> get_record_by_id
--   update_record       -> update_record_by_id
--   create_record       -> create_record              (same name, now the catalogue's)
--   get_activities      -> list_activities
--   send_email          -> send_email                 (now POST crm/outreach/email)
--   create_draft        -> send_email                 (a send is held for approval; that is the draft)
--   get_email_history   -> get_email_history          (now GET crm/outreach/email-history)
--   get_writing_style   -> get_writing_style          (already an endpoint)
--   send_slack          -> send_slack_message
--   send_sms            -> send_sms
--   read_document       -> get_document
--   search_documents    -> search_documents
--   create_document     -> create_document
--   propose_docx_edit   -> aexy_docs_propose          (routine)
--   enrich_company, enrich_person, web_search -> removed: they were
--   placeholders that returned canned text and never called a provider.
--
-- Names that are not legacy (catalogue names, and the core actions like
-- `reply`/`escalate`) pass through untouched. Idempotent: safe to re-run.

WITH mapping(old_name, new_name) AS (
    VALUES
        ('search_contacts',   'aexy_crm_records'),
        ('get_record',        'get_record_by_id'),
        ('update_record',     'update_record_by_id'),
        ('get_activities',    'list_activities'),
        ('create_draft',      'send_email'),
        ('send_slack',        'send_slack_message'),
        ('read_document',     'get_document'),
        ('propose_docx_edit', 'aexy_docs_propose'),
        ('enrich_company',    NULL),
        ('enrich_person',     NULL),
        ('web_search',        NULL)
),
rewritten AS (
    SELECT a.id,
           COALESCE(
               (
                   SELECT jsonb_agg(name ORDER BY ord)
                   FROM (
                       SELECT DISTINCT ON (name) name, ord
                       FROM (
                           SELECT COALESCE(m.new_name, t.name) AS name,
                                  t.ord,
                                  (m.old_name IS NOT NULL AND m.new_name IS NULL) AS dropped
                           FROM jsonb_array_elements_text(a.tools) WITH ORDINALITY AS t(name, ord)
                           LEFT JOIN mapping m ON m.old_name = t.name
                       ) x
                       WHERE NOT dropped
                       ORDER BY name, ord
                   ) y
               ),
               '[]'::jsonb
           ) AS tools
    FROM crm_agents a
    WHERE jsonb_typeof(a.tools) = 'array'
)
UPDATE crm_agents a
SET tools = r.tools
FROM rewritten r
WHERE r.id = a.id
  AND a.tools IS DISTINCT FROM r.tools;
