import { createHash } from "node:crypto";
import type { DesignPlan } from "@kf/contracts";

/** Canonical durable identity for the exact blueprint revision shown to the user. */
export function hashDesignPlan(plan: DesignPlan, revision: number): string {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("DESIGN_REVISION_INVALID");
  }
  const canonical = stableStringify({ ...plan, revision });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Fail-closed validation shared by every confirmed-blueprint boundary. */
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

/** Deterministic JSON serialization retained for persisted-checkpoint compatibility. */
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
