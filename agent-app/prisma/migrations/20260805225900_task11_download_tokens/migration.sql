-- Task 11: HTTP/SSE API, upload, confirmation, and download.
-- - Conversation.summary: rolling conversation summary written by the agent
--   graph's load-context node (persisted across requests).
-- - DownloadToken: short-lived single-use artifact download tokens. Only the
--   SHA-256 hash of each token is stored; plaintext tokens are returned once.

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "summary" TEXT;

-- CreateTable
CREATE TABLE "DownloadToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DownloadToken_tokenHash_key" ON "DownloadToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DownloadToken_tenantId_expiresAt_idx" ON "DownloadToken"("tenantId", "expiresAt");
