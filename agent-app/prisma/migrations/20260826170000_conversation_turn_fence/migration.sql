-- A stuck graph cancellation must fence only its conversation without
-- retaining one scarce PostgreSQL lease-pool client per stuck turn.
CREATE TABLE "ConversationTurnFence" (
    "conversationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "fencedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTurnFence_pkey" PRIMARY KEY ("conversationId")
);

CREATE UNIQUE INDEX "ConversationTurnFence_leaseId_key"
ON "ConversationTurnFence"("leaseId");

CREATE INDEX "ConversationTurnFence_ownerId_idx"
ON "ConversationTurnFence"("ownerId");

ALTER TABLE "ConversationTurnFence"
ADD CONSTRAINT "ConversationTurnFence_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
