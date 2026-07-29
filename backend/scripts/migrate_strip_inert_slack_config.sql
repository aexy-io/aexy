-- Remove send_slack config that no executor ever read.
--
-- The workflow builder's Slack step carried a "Headers (JSON)" field and a
-- "Timeout (seconds)" field, copy-pasted from webhook_call. Neither slack
-- executor reads either key — a Slack message goes out over the workspace's
-- Slack integration, so there is no HTTP request for a header to attach to.
--
-- The headers one is why this migration exists rather than just deleting the
-- field. Its placeholder was `{"Authorization": "Bearer ..."}`, so it invited
-- a credential, stored it verbatim in the workflow definition — which reading
-- needs only `member` — and then did nothing with it. Deleting the field stops
-- new ones arriving and the service strips it on save, but neither reaches a
-- graph that is never opened again. This does.
--
-- Three tables hold canvas nodes, and version history matters as much as the
-- live definition: a credential in an old snapshot is just as readable.
--
-- Narrow on purpose. Only `data.headers` and `data.timeout_seconds`, only on
-- nodes whose `data.action_type` is exactly 'send_slack', and only rows that
-- actually carry one — so the row count reported is the number of graphs that
-- really held this, not the number scanned.

-- Rebuild the nodes array, dropping the two keys from send_slack nodes only.
-- jsonb_agg over WITH ORDINALITY keeps node order, which the canvas relies on.
CREATE OR REPLACE FUNCTION pg_temp.strip_inert_slack_config(nodes JSONB)
RETURNS JSONB AS $$
    SELECT COALESCE(
        jsonb_agg(
            CASE
                WHEN node #>> '{data,action_type}' = 'send_slack'
                THEN jsonb_set(
                    node,
                    '{data}',
                    (node -> 'data') - 'headers' - 'timeout_seconds'
                )
                ELSE node
            END
            ORDER BY ordinality
        ),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(nodes) WITH ORDINALITY AS t(node, ordinality);
$$ LANGUAGE SQL IMMUTABLE;

-- Matches a graph holding at least one send_slack node with either key, so
-- untouched rows are not rewritten (and their updated_at is left alone).
CREATE OR REPLACE FUNCTION pg_temp.has_inert_slack_config(nodes JSONB)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(nodes) AS node
        WHERE node #>> '{data,action_type}' = 'send_slack'
          AND (
              node -> 'data' ? 'headers'
              OR node -> 'data' ? 'timeout_seconds'
          )
    );
$$ LANGUAGE SQL IMMUTABLE;

UPDATE crm_workflow_definitions
SET nodes = pg_temp.strip_inert_slack_config(nodes)
WHERE jsonb_typeof(nodes) = 'array'
  AND pg_temp.has_inert_slack_config(nodes);

UPDATE crm_workflow_versions
SET nodes = pg_temp.strip_inert_slack_config(nodes)
WHERE jsonb_typeof(nodes) = 'array'
  AND pg_temp.has_inert_slack_config(nodes);

UPDATE crm_workflow_templates
SET nodes = pg_temp.strip_inert_slack_config(nodes)
WHERE jsonb_typeof(nodes) = 'array'
  AND pg_temp.has_inert_slack_config(nodes);
