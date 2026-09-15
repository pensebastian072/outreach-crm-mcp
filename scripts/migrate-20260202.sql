-- Migration 2026-02-02: replies columns + status expansion
-- Safe to run multiple times in SQLite (if columns exist, it will error; run once).

ALTER TABLE replies ADD COLUMN contact_id INTEGER;
ALTER TABLE replies ADD COLUMN campaign_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_replies_contact_id ON replies(contact_id);
CREATE INDEX IF NOT EXISTS idx_replies_campaign_id ON replies(campaign_id);

-- Backfill reply contact/campaign from messages
UPDATE replies
SET contact_id = (SELECT contact_id FROM messages WHERE messages.id = replies.message_id),
    campaign_id = (SELECT campaign_id FROM messages WHERE messages.id = replies.message_id)
WHERE contact_id IS NULL OR campaign_id IS NULL;

-- Normalize legacy lowercase statuses if any
UPDATE messages
SET status = UPPER(status)
WHERE status IS NOT NULL;
