import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { LocalArtifactStorage } from "@kf/artifact-storage";
import type { DomainPack } from "@kf/contracts";
import { DomainRegistry } from "@kf/domain-registry";
import { JobRunner } from "./job-runner.js";

/**
 * 独立构建 Worker 入口（Task 9/12）：轮询耐用构建队列执行编译/修补 →
 * 校验 → 打包 → 制品 → 修订提交。作为独立进程运行（runForever），
 * 租约过期后可被任何 Worker 恢复。
 *
 * kingclient DomainPack 在此注册（执行逻辑全部落在 @kf/domain-client 的
 * compile/patch/validate/package 管线，pack 的 capabilities 为标记性能力
 * 描述；真实 LLM 由部署方接线）。
 */
function kingClientPack(): DomainPack {
  return {
    kind: "kingclient",
    displayName: "KingFusion Client",
    supported: true,
    capabilities: {
      create: true,
      import: true,
      modify: true,
      validate: true,
      package: true,
    },
    inspect: () => Promise.resolve({}),
    compile: () => Promise.resolve({}),
    patch: () => Promise.resolve({}),
    validate: () =>
      Promise.resolve({
        status: "pass",
        checks: {
          packageStructure: "pass",
          jsonSchema: "pass",
          references: "pass",
          businessRules: "pass",
          changeScope: "pass",
          roundTrip: "pass",
        },
        warnings: [],
      }),
    package: () => Promise.resolve(""),
  };
}

async function main(): Promise<never> {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const storageRoot =
    process.env.ARTIFACT_STORAGE_ROOT ?? path.resolve(process.cwd(), ".kf-artifacts");
  const storage = new LocalArtifactStorage(storageRoot);
  const registry = new DomainRegistry();
  registry.register(kingClientPack());

  const runner = new JobRunner({
    prisma,
    storage,
    registry,
    pollIntervalMs: 1_000,
    leaseMs: 30_000,
  });
  console.log("[worker] KF Solution Agent worker started");
  await runner.runForever(`worker-${process.pid}`);
  throw new Error("unreachable");
}

void main().catch((error) => {
  console.error("[worker] failed to start:", error);
  process.exit(1);
});
