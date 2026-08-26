-- Existing rows represent graphs that may already have executed and must stay
-- fail-closed. New acquisitions begin PENDING and become ADMITTED only at the
-- final hand-off boundary.
ALTER TABLE "ConversationTurnFence"
ADD COLUMN "state" TEXT NOT NULL DEFAULT 'QUARANTINED';

ALTER TABLE "ConversationTurnFence"
ALTER COLUMN "state" SET DEFAULT 'PENDING';

ALTER TABLE "ConversationTurnFence"
ADD CONSTRAINT "ConversationTurnFence_state_check"
CHECK ("state" IN ('PENDING', 'ADMITTED', 'QUARANTINED'));
