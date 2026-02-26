-- =============================================================================
-- GTM record_id Foreign Key Constraints Migration
-- =============================================================================
-- Adds FK constraints on record_id columns across GTM tables to reference
-- crm_records(id). This ensures referential integrity and prevents orphaned
-- records when CRM records are deleted.
--
-- Uses ON DELETE SET NULL for nullable columns, ON DELETE CASCADE for NOT NULL.
-- All constraints use IF NOT EXISTS (via DO blocks) for idempotent execution.
--
-- Date: 2026-02-26
-- =============================================================================

BEGIN;

-- Helper: Add FK constraint only if it doesn't already exist
-- gtm_lead_assignments.record_id → crm_records(id) [NOT NULL → CASCADE]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_gtm_lead_assignments_record_id'
    ) THEN
        ALTER TABLE gtm_lead_assignments
            ADD CONSTRAINT fk_gtm_lead_assignments_record_id
            FOREIGN KEY (record_id) REFERENCES crm_records(id) ON DELETE CASCADE;
    END IF;
END $$;

-- gtm_health_scores.record_id → crm_records(id) [NOT NULL → CASCADE]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_gtm_health_scores_record_id'
    ) THEN
        ALTER TABLE gtm_health_scores
            ADD CONSTRAINT fk_gtm_health_scores_record_id
            FOREIGN KEY (record_id) REFERENCES crm_records(id) ON DELETE CASCADE;
    END IF;
END $$;

-- gtm_expansion_enrollments.record_id → crm_records(id) [NOT NULL → CASCADE]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_gtm_expansion_enrollments_record_id'
    ) THEN
        ALTER TABLE gtm_expansion_enrollments
            ADD CONSTRAINT fk_gtm_expansion_enrollments_record_id
            FOREIGN KEY (record_id) REFERENCES crm_records(id) ON DELETE CASCADE;
    END IF;
END $$;

-- gtm_handoffs.record_id → crm_records(id) [NOT NULL → CASCADE]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_gtm_handoffs_record_id'
    ) THEN
        ALTER TABLE gtm_handoffs
            ADD CONSTRAINT fk_gtm_handoffs_record_id
            FOREIGN KEY (record_id) REFERENCES crm_records(id) ON DELETE CASCADE;
    END IF;
END $$;

-- outreach_enrollments.record_id → crm_records(id) [NOT NULL → CASCADE]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_outreach_enrollments_record_id'
    ) THEN
        ALTER TABLE outreach_enrollments
            ADD CONSTRAINT fk_outreach_enrollments_record_id
            FOREIGN KEY (record_id) REFERENCES crm_records(id) ON DELETE CASCADE;
    END IF;
END $$;

-- abm_accounts.record_id → crm_records(id) [NOT NULL → CASCADE]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_abm_accounts_record_id'
    ) THEN
        ALTER TABLE abm_accounts
            ADD CONSTRAINT fk_abm_accounts_record_id
            FOREIGN KEY (record_id) REFERENCES crm_records(id) ON DELETE CASCADE;
    END IF;
END $$;

-- intent_signals.record_id → crm_records(id) [NULLABLE → SET NULL]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_intent_signals_record_id'
    ) THEN
        ALTER TABLE intent_signals
            ADD CONSTRAINT fk_intent_signals_record_id
            FOREIGN KEY (record_id) REFERENCES crm_records(id) ON DELETE SET NULL;
    END IF;
END $$;

-- seo_audits.record_id → crm_records(id) [NULLABLE → SET NULL]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_seo_audits_record_id'
    ) THEN
        ALTER TABLE seo_audits
            ADD CONSTRAINT fk_seo_audits_record_id
            FOREIGN KEY (record_id) REFERENCES crm_records(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMIT;
