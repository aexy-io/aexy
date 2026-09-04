-- Service Desk reporting: the owner performance scorecard's configuration.
--
-- Two reports are being added — a per-ticket TAT report and a weighted per-owner
-- scorecard. The TAT report needs no schema at all: every figure in it is
-- derived from service_desk_tickets and ticket_pending_segments, which already
-- record the hand-offs it counts.
--
-- The scorecard does, because it has numbers that are a business's opinion
-- rather than a fact: what each KPI is worth, what "fast enough" is, how steeply
-- a miss is punished, and where the rating boundaries sit. In the reference
-- practice those are numbers somebody edits. As module constants they
-- would have been a deploy per opinion, so they are rows.
--
-- Defaults are NOT inserted here. They come from the workspace's industry
-- template and are seeded lazily on first read, the same way the taxonomy is
-- (services/service_desk_scorecard_config.py::load_scorecard_config). A
-- migration that seeded every workspace would also seed the ones that never
-- open the report.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. KPI rows
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_desk_scorecard_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Names a computation registered in services/service_desk_scorecard.py.
    -- The one column a workspace cannot invent a value for: a KPI without a
    -- compute function has no figure to score.
    metric_key VARCHAR(64) NOT NULL,
    label VARCHAR(100) NOT NULL,

    -- Share of the weighted total. Enabled weights must sum to 1; enforced in
    -- the service on write rather than by a constraint, because the invariant
    -- is across rows and only holds between complete replacements.
    weight DOUBLE PRECISION NOT NULL DEFAULT 0,

    -- 'higher_is_better' | 'lower_is_better'. Decides which of the two curves
    -- below applies.
    direction VARCHAR(20) NOT NULL DEFAULT 'higher_is_better',

    -- lower_is_better: full marks at or under `benchmark`, then
    -- `penalty_per_unit` points off per unit over.
    -- higher_is_better: `target` is the value scoring 100.
    -- Nullable because each direction uses one pair and ignores the other.
    benchmark DOUBLE PRECISION,
    penalty_per_unit DOUBLE PRECISION,
    target DOUBLE PRECISION,

    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    position INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_service_desk_scorecard_kpi_metric'
    ) THEN
        ALTER TABLE service_desk_scorecard_kpis
            ADD CONSTRAINT uq_service_desk_scorecard_kpi_metric
            UNIQUE (workspace_id, metric_key);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_service_desk_scorecard_kpis_workspace_id
    ON service_desk_scorecard_kpis (workspace_id);

-- ---------------------------------------------------------------------------
-- 2. Rating bands
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_desk_scorecard_bands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- 5..1 by convention, but only the ordering is load-bearing: bands are read
    -- highest floor first and the first match wins.
    rating INTEGER NOT NULL,
    min_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    label VARCHAR(100) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_service_desk_scorecard_band_rating'
    ) THEN
        ALTER TABLE service_desk_scorecard_bands
            ADD CONSTRAINT uq_service_desk_scorecard_band_rating
            UNIQUE (workspace_id, rating);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_service_desk_scorecard_bands_workspace_id
    ON service_desk_scorecard_bands (workspace_id);

-- ---------------------------------------------------------------------------
-- 3. Reporting reads
-- ---------------------------------------------------------------------------

-- The TAT report reads every segment for a page of tickets in one query,
-- ordered by (ticket_id, entered_at). Without this it is a sequential scan of
-- the ledger per report.
CREATE INDEX IF NOT EXISTS ix_ticket_pending_segments_ticket_entered
    ON ticket_pending_segments (ticket_id, entered_at);

-- ---------------------------------------------------------------------------
-- 4. Per-KPI threshold
-- ---------------------------------------------------------------------------

-- A number inside the metric's own question — "resolved in at most N hand-offs"
-- — as opposed to `benchmark`, which grades the figure that question produces.
-- It was `CLEAN_HANDSHAKE_LIMIT = 2` in the scorecard module: the one figure on
-- this report a desk could not tune, and it belongs in the KPI's own title
-- ("Handshake Efficiency (<=2 hand-offs)").
--
-- Nullable: only the metrics that declare `uses_threshold` read it, and one
-- written before this column existed falls back to its template default rather
-- than scoring every owner identically.
ALTER TABLE service_desk_scorecard_kpis
    ADD COLUMN IF NOT EXISTS threshold DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- 5. Custom KPIs
-- ---------------------------------------------------------------------------

-- A desk can define its own KPI as a sentence over a closed vocabulary — see
-- services/service_desk_formula.py. `source` says which kind a row is:
--   'builtin' — metric_key names a computation in service_desk_scorecard
--   'custom'  — definition holds the sentence, metric_key is a workspace slug
--
-- No expression is ever stored or parsed: `definition` is a structured object
-- whose every slot is validated against the same vocabulary the builder was
-- served, which is why there is nothing here to sanitise.
ALTER TABLE service_desk_scorecard_kpis
    ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'builtin';
ALTER TABLE service_desk_scorecard_kpis
    ADD COLUMN IF NOT EXISTS definition JSONB;

-- Bumped whenever `definition` changes. Editing a KPI retroactively changes what
-- last quarter's scores meant, so a rendered scorecard reports the version it
-- was computed under and a review conversation stays reproducible.
ALTER TABLE service_desk_scorecard_kpis
    ADD COLUMN IF NOT EXISTS definition_version INTEGER NOT NULL DEFAULT 1;

-- 'draft' | 'published'. A draft is visible in the builder and its preview and
-- is never scored: a half-built KPI must not move anybody's rating while
-- somebody is still deciding what it means.
ALTER TABLE service_desk_scorecard_kpis
    ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'published';
