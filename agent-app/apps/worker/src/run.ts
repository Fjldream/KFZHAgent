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
 *
 * `supported` 语义（发布门槛，见 docs/kf-native-acceptance.md）：
 *   - `supported` 表示「KF 原生验收已通过」这一对外宣称状态，不是
 *     「Agent 侧能力是否可用」；
 *   - 只有环境变量 `KINGCLIENT_NATIVE_ACCEPTED=true`（显式确认在真实 KF
 *     测试服务器上完成原生导入/导出 cycle）才注册 `supported: true`，
 *     默认（未设置）为 `false`；
 *   - 该开关不影响构建链路：DomainRegistry.require 只检查域已注册，
 *     不检查 supported，因此 new/modify 流程在 `supported: false` 下
 *     依旧完整可用（worker 仍能执行编译/修补/校验/打包）。
 */
const NATIVE_ACCEPTED_ENV = "KINGCLIENT_NATIVE_ACCEPTED";

function kingClientPack(nativeAccepted: boolean): DomainPack {
  return {
    kind: "kingclient",
    displayName: "KingFusion Client",
    supported: nativeAccepted,
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
  // 原生验收门槛：仅当 KINGCLIENT_NATIVE_ACCEPTED=true 才宣称 supported。
  const nativeAccepted = process.env[NATIVE_ACCEPTED_ENV] === "true";
  registry.register(kingClientPack(nativeAccepted));
  console.log(
    `[worker] registered kingclient (supported=${nativeAccepted}; set ${NATIVE_ACCEPTED_ENV}=true after native KF acceptance)`,
  );

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
