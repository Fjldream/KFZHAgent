import { createHash } from "node:crypto";
import type { DesignPlan } from "@kf/contracts";

/** 为显示给用户的确切蓝图修订保留了唯一的可持久身份。 */
export function hashDesignPlan(plan: DesignPlan, revision: number): string {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("DESIGN_REVISION_INVALID");
  }
  const canonical = stableStringify({ ...plan, revision });
  return createHash("sha256").update(canonical).digest("hex");
}

/** 所有已确认蓝图边界共享的故障关闭式校验。 */
export function hasCurrentDesignPlanVersion(
  plan: DesignPlan,
  revision: unknown,
  hash: unknown,
): boolean {
  return typeof revision === "number"
    && Number.isSafeInteger(revision)
    && revision >= 1
    && typeof hash === "string"
    && hash === hashDesignPlan(plan, revision);
}

/** 保持了确定的 JSON 序列化，以保留持久检查点兼容性。 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}
