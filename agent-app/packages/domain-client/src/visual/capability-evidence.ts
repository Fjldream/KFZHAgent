// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { z } from "zod";
export type CapabilityEvidence = {
  id: string; controlType: string; properties: string[]; interactions: string[];
  runtimeVersion: string; status: "verified" | "failed" | "unverified";
  artifactHash: string | null; reportId: string | null;
};
export function evaluateCapabilityEvidence(input: {
  controlType: string; properties: readonly string[]; interactions: readonly string[];
  targetRuntimeVersion: string; evidence: readonly CapabilityEvidence[];
}): { support: "verified" | "supported_unverified"; evidenceIds: string[]; reason: string } {
  const identity = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
  const schema = z.object({
    id: identity, controlType: z.string().min(1).max(128),
    properties: z.array(z.string().min(1).max(128)).max(200),
    interactions: z.array(z.string().min(1).max(128)).max(100),
    runtimeVersion: z.string().min(1).max(128), status: z.enum(["verified", "failed", "unverified"]),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(), reportId: identity.nullable(),
  }).strict();
  // Reports are supplied by trusted server-side evidence lookup, never by a model or browser.
  // This only checks coverage; it cannot authenticate a runtime report or artifact by itself.
  const scoped = input.evidence.flatMap(item => {
    const parsed = schema.safeParse(item);
    if (!parsed.success) return [];
    const report = parsed.data;
    return report.controlType === input.controlType && report.runtimeVersion === input.targetRuntimeVersion
      && input.properties.every(property => report.properties.includes(property))
      && input.interactions.every(interaction => report.interactions.includes(interaction)) ? [report] : [];
  });
  const failed = scoped.filter(report => report.status === "failed");
  if (failed.length > 0) return {
    support: "supported_unverified", evidenceIds: [...new Set(failed.map(report => report.id))].sort(),
    reason: "目标运行时存在匹配的失败证据，不能标为已验证。",
  };
  const verified = scoped.filter(report => report.status === "verified" && report.artifactHash !== null && report.reportId !== null);
  return verified.length > 0
    ? { support: "verified", evidenceIds: [...new Set(verified.map(report => report.id))].sort(),
      reason: "目标运行时报告覆盖本区域所列属性与交互；不代表整个控件或页面均已验证。" }
    : { support: "supported_unverified", evidenceIds: [], reason: "缺少覆盖全部所需属性、交互和目标运行时的有效制品报告。" };
}
// end
