-- 现有记录表示图可能已经执行，因此必须保持故障关闭。新的申领取得 PENDING 状态，仅在最终交接边界变为 ADMITTED。
ALTER TABLE "ConversationTurnFence"
ADD COLUMN "state" TEXT NOT NULL DEFAULT 'QUARANTINED';

ALTER TABLE "ConversationTurnFence"
ALTER COLUMN "state" SET DEFAULT 'PENDING';

ALTER TABLE "ConversationTurnFence"
ADD CONSTRAINT "ConversationTurnFence_state_check"
CHECK ("state" IN ('PENDING', 'ADMITTED', 'QUARANTINED'));
