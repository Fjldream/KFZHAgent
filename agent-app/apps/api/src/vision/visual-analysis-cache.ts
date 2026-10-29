// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { canonicalServerHash } from "@kf/contracts";
export type VisualAnalysisCacheIdentity = {
  tenantId: string; workspaceId: string; assetId: string; sourceHash: string; derivativeHash: string;
  analysisVersion: string; modelConfigHash: string; instructionHash: string;
};
/** Also bind workspace/asset/derived pixels: a cached answer must never transplant another source identity. */
export function visualAnalysisCacheKey(input: VisualAnalysisCacheIdentity): string {
  return canonicalServerHash(input);
}
// end
