-- 任务 11：HTTP/SSE API、上传、确认和下载。
-- - Conversation.summary：由 Agent 图的 load-context 节点写入的滚动会话摘要（跨请求持久化）。
-- - DownloadToken：短期、一次性的制品下载令牌。每个令牌只存储 SHA-256 哈希；明文令牌只返回一次。

-- 修改表
ALTER TABLE "Conversation" ADD COLUMN "summary" TEXT;

-- 创建表
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

-- 创建索引
CREATE UNIQUE INDEX "DownloadToken_tokenHash_key" ON "DownloadToken"("tokenHash");

-- 创建索引
CREATE INDEX "DownloadToken_tenantId_expiresAt_idx" ON "DownloadToken"("tenantId", "expiresAt");
