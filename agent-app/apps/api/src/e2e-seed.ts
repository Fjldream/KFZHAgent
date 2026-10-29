import { loadAfterE2eDestructiveResetGuard } from "../../../tests/e2e/helpers/destructive-reset.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { TENANT_A_ID, TENANT_B_ID, TENANT_C_ID } from "../../../tests/e2e/helpers/config.js";
// end

const RESET_ENVIRONMENT = {
  databaseUrl: process.env.DATABASE_URL,
  allowDestructiveReset: process.env.KF_E2E_ALLOW_DESTRUCTIVE_RESET,
};

type PrismaClient = import("@prisma/client").PrismaClient;

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
  // This file is also runnable directly. The shared loader guarantees the
  // guard completes before argon2/Prisma loading, connection, seed, or reset.
  const [argon2, { PrismaClient }] = await loadAfterE2eDestructiveResetGuard(
    RESET_ENVIRONMENT,
    async () => Promise.all([import("argon2"), import("@prisma/client")]),
  );
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  const { DEFAULT_INITIAL_IR } = await import("./workspaces/workspace.service.js");
  // end
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

    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const acme = await prisma.tenant.create({ data: { id: TENANT_A_ID, name: "E2E Acme" } });
    // end
    await prisma.user.create({
      data: {
        tenantId: acme.id,
        username: "alice",
        passwordHash: await hash("TempPass-123"),
        role: "tenant_admin",
        // E2E 用户视为已激活账号：I2 的首次强制改密闭环由 auth 集成测试与
        // 前端组件测试覆盖；E2E 流程本身直接以完整会话登录工作区。
        mustChangePassword: false,
      },
    });

    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const globex = await prisma.tenant.create({ data: { id: TENANT_B_ID, name: "E2E Globex" } });
    // end
    await prisma.user.create({
      data: {
        tenantId: globex.id,
        username: "bob",
        passwordHash: await hash("TempPass-123"),
        role: "tenant_admin",
        mustChangePassword: false,
      },
    });

    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const readonly = await prisma.tenant.create({ data: { id: TENANT_C_ID, name: "E2E Readonly" } });
    await prisma.user.create({ data: { tenantId: readonly.id, username: "carol", passwordHash: await hash("TempPass-123"), role: "tenant_admin", mustChangePassword: false } });
    const moduleWorkspace = await prisma.solutionWorkspace.create({ data: { tenantId: acme.id, name: "E2E module-v1 fixture", mode: "new", generationWorkflow: "module-v1" } });
    const moduleRevision = await prisma.solutionRevision.create({ data: { tenantId: acme.id, workspaceId: moduleWorkspace.id, revisionNumber: 1, kind: "initial", state: DEFAULT_INITIAL_IR } });
    await prisma.solutionWorkspace.update({ where: { id: moduleWorkspace.id }, data: { currentRevisionId: moduleRevision.id } });
    console.log("[e2e-seed] seeded two enabled tenants, one readonly tenant and a module-v1 fixture");
    // end
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error("[e2e-seed] failed:", error);
  process.exit(1);
});
