-- Collaborative AI Chat: History, Sharing & Multi-User Mode
-- Adds sender attribution, message queuing, participants, and share links

-- 1. Sender attribution on ask_messages
ALTER TABLE ask_messages ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES developers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_ask_messages_sender ON ask_messages(sender_id);

-- Backfill existing user messages
UPDATE ask_messages am SET sender_id = ac.developer_id
FROM ask_conversations ac
WHERE am.conversation_id = ac.id AND am.role = 'user' AND am.sender_id IS NULL;

-- 2. Message status for queuing
ALTER TABLE ask_messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'sent';

-- 3. Collaborative flag on conversations
ALTER TABLE ask_conversations ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Participant join table
CREATE TABLE IF NOT EXISTS ask_conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ask_conversations(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  permission VARCHAR(20) NOT NULL DEFAULT 'write',
  added_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ask_participant UNIQUE (conversation_id, developer_id)
);
CREATE INDEX IF NOT EXISTS ix_ask_part_conv ON ask_conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS ix_ask_part_dev ON ask_conversation_participants(developer_id);

-- Backfill: existing owners become 'owner' participants
INSERT INTO ask_conversation_participants (id, conversation_id, developer_id, permission)
SELECT gen_random_uuid(), id, developer_id, 'owner' FROM ask_conversations
ON CONFLICT DO NOTHING;

-- 5. Share link table
CREATE TABLE IF NOT EXISTS ask_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ask_conversations(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  permission VARCHAR(20) NOT NULL DEFAULT 'read',
  password_hash VARCHAR(255),
  expires_at TIMESTAMPTZ,
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Agent messages sender attribution
ALTER TABLE crm_agent_messages ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES developers(id) ON DELETE SET NULL;
