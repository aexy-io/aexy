-- A CRM agent may run its catalogue tools as an agent principal.
--
-- Null keeps today's behaviour: the tools act as whoever triggered the run.
-- Set, they act as the principal — which is what a scheduled or event-driven
-- run needs, since nobody triggered it.
--
-- Idempotent: safe to re-run.

ALTER TABLE crm_agents
    ADD COLUMN IF NOT EXISTS principal_id UUID REFERENCES agent_principals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_crm_agents_principal_id ON crm_agents (principal_id);
