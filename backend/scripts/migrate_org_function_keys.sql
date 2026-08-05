-- Normalise department function keys onto the declared vocabulary.
--
-- `Department.function_key` is a routing key, not a label. Service Desk
-- row-level visibility resolves it (a stakeholder bucket names the function that
-- owes the next action, and only that department's people can see those
-- tickets), the digest resolves it to find a head to send a desk's whole
-- open-ticket list to, and ticket auto-assignment resolves it to pick an owner.
--
-- Nothing declared the vocabulary, so two modules invented their own and
-- disagreed: `service_desk_industry_templates` shipped `ops_kam` for Operations
-- in the insurance-broking template and `operations` in financial-services, for
-- the same concept. Since the key is unique per workspace, which spelling a
-- workspace ended up with depended on which template its desk was started from —
-- and a mismatch between the two sides has no symptom at all: the queue simply
-- shows nothing, indistinguishable from a quiet day.
--
-- `backend/src/aexy/services/org_functions.py` is now the single registry, with
-- `ops_kam` recorded as a retired spelling of `operations` so reads keep working
-- either way. This moves stored rows forward.
--
-- SAFE TO RE-RUN. Both statements are no-ops once applied.
--
-- WHY THE TWO TABLES MOVE TOGETHER: `service_desk_stakeholders.function_key`
-- points at `departments.function_key`. Rewriting one without the other is
-- exactly the mismatch described above, so they are in one transaction (the
-- migration runner wraps each file).
--
-- WHAT IS DELIBERATELY NOT TOUCHED: `service_desk_tickets.pending_with` and
-- `ticket_pending_segments.pending_with` hold stakeholder *slugs* — `kam`,
-- `insurer` — not function keys. Those slugs are frozen at their legacy enum
-- values on purpose (see the industry-templates module docstring) and are
-- unaffected by anything here.

-- =============================================================================
-- DEPARTMENTS
-- =============================================================================

-- Skipped where the workspace already has an `operations` department: that is a
-- workspace holding both spellings at once, which the unique index would refuse
-- to let us collapse. Left for a human — merging two departments means deciding
-- what happens to their members, and that is not a migration's call. The
-- verification query at the bottom lists any.
UPDATE departments d
SET function_key = 'operations'
WHERE d.function_key = 'ops_kam'
  AND NOT EXISTS (
      SELECT 1 FROM departments other
      WHERE other.workspace_id = d.workspace_id
        AND other.function_key = 'operations'
  );

-- =============================================================================
-- SERVICE DESK STAKEHOLDERS
-- =============================================================================

-- No such guard here: `function_key` is a pointer on this table, not an identity,
-- and several stakeholders legitimately route to one function.
UPDATE service_desk_stakeholders
SET function_key = 'operations'
WHERE function_key = 'ops_kam';

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Expect zero rows. Anything here is a workspace that held both spellings, whose
-- Operations department was left alone on purpose — the two need merging by hand.
SELECT d.workspace_id, d.id, d.name, d.function_key
FROM departments d
WHERE d.function_key = 'ops_kam';

-- Expect zero.
SELECT COUNT(*) AS stakeholders_still_on_retired_key
FROM service_desk_stakeholders
WHERE function_key = 'ops_kam';

-- Every function key in use, with how many departments claim it. Keys that are
-- neither in the registry nor prefixed `x_` are pre-registry values: still
-- honoured on read, and grandfathered by the API so their department stays
-- editable, but worth a look.
SELECT function_key, COUNT(*) AS departments
FROM departments
WHERE function_key IS NOT NULL
GROUP BY function_key
ORDER BY function_key;

-- Internal stakeholders pointing at a function no department in their workspace
-- claims. Each one is a queue whose members can see nothing.
SELECT s.workspace_id, s.slug, s.function_key
FROM service_desk_stakeholders s
WHERE s.semantics = 'internal'
  AND s.function_key IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM departments d
      WHERE d.workspace_id = s.workspace_id
        AND d.function_key = s.function_key
        AND d.is_active
  );
