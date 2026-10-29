// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import type { PrismaClient } from "@prisma/client";
import { GenerationSnapshotContentSchema, canonicalServerHash } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { MAX_NATIVE_DEVELOPMENT_NAME_LENGTH } from "@kf/domain-client";
// end

/** Privacy preflight; runs before graph handlers, caches and all provider access. */
export async function assertTextRunBaseMaySend(prisma: Pick<PrismaClient, "generationSnapshot">,
  input: { tenantId: string; workspaceId: string; baseRevisionId: string | null }): Promise<void> {
  if (!input.baseRevisionId) return;
  const snapshots = await prisma.generationSnapshot.findMany({ where: { tenantId: input.tenantId,
    workspaceId: input.workspaceId, revisionId: input.baseRevisionId }, take: 2,
    select: { visualSpecId: true, content: true, contentHash: true } });
  if (!snapshots.length) return;
  for (const snapshot of snapshots) {
    const content = snapshot.content;
    if (snapshot.visualSpecId !== null || content !== null && typeof content === "object" && !Array.isArray(content)
      && Object.hasOwn(content, "visual") && content["visual"] !== null) {
      throw new Error("VISUAL_EXISTING_CONTENT_RECONSENT_REQUIRED");
    }
  }
  if (snapshots.length !== 1) throw new Error("SOLUTION_EXISTING_CONTEXT_INVALID");
  const snapshot = snapshots[0]!;
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  let hasOverlongGeneratedName = false;
  // end
  try {
    if (Buffer.byteLength(JSON.stringify(snapshot.content), "utf8") > 16 * 1024 * 1024) throw new Error("context budget");
    const content = GenerationSnapshotContentSchema.parse(snapshot.content);
    if (canonicalServerHash(content) !== snapshot.contentHash) throw new Error("context hash");
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    hasOverlongGeneratedName = content.artifact.implementation.runtimeCorrelation?.controls
      .some(control => control.instanceName.length > MAX_NATIVE_DEVELOPMENT_NAME_LENGTH) ?? false;
    // end
  } catch { throw new Error("SOLUTION_EXISTING_CONTEXT_INVALID"); }
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  if (hasOverlongGeneratedName) throw new Error("CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED");
  // end
}
// end
