import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

/**
 * E2E 数据库种子（Task 12）：清空 kf_agent_e2e 业务表并创建两个租户，
 * 供 new-project / modify-project / tenant-isolation 三个 spec 使用。
 * 运行方式：pnpm --filter api exec tsx src/e2e-seed.ts
 */

const BUSINESS_TABLES = [
  "DownloadToken",
  "AuditLog",
  "ValidationReport",
  "Artifact",
  "BuildJob",
  "DomainProjectRevision",
  "SolutionRevision",
  "ChangePlan",
  "ChangeRequest",
  "Message",
  "Conversation",
  "SolutionWorkspace",
  "UserSession",
  "User",
  "Tenant",
];

const CHECKPOINT_TABLES = [
  "checkpoint_writes",
  "checkpoint_blobs",
  "checkpoints",
  "checkpoint_migrations",
];

async function tableExists(prisma: PrismaClient, table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

async function truncate(prisma: PrismaClient, table: string): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    for (const table of BUSINESS_TABLES) {
      await truncate(prisma, table);
    }
    for (const table of CHECKPOINT_TABLES) {
      if (await tableExists(prisma, table)) {
        await truncate(prisma, table);
      }
    }

    const hash = (password: string): Promise<string> =>
      argon2.hash(password, { type: argon2.argon2id });

    const acme = await prisma.tenant.create({ data: { name: "E2E Acme" } });
    await prisma.user.create({
      data: {
        tenantId: acme.id,
        username: "alice",
        passwordHash: await hash("TempPass-123"),
        role: "tenant_admin",
        mustChangePassword: true,
      },
    });

    const globex = await prisma.tenant.create({ data: { name: "E2E Globex" } });
    await prisma.user.create({
      data: {
        tenantId: globex.id,
        username: "bob",
        passwordHash: await hash("TempPass-123"),
        role: "tenant_admin",
        mustChangePassword: true,
      },
    });

    console.log("[e2e-seed] seeded tenants E2E Acme (alice) / E2E Globex (bob)");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error("[e2e-seed] failed:", error);
  process.exit(1);
});
