import {
  DesignPlanSchema,
  type DesignPlan,
} from "@kf/contracts";

const BLUEPRINT_MESSAGE_PREFIX = "KF_BLUEPRINT_MESSAGE/1\n";
const BLUEPRINT_CONFIRM_PREFIX = "KF_BLUEPRINT_CONFIRM/1\n";
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface DecodedBlueprintMessage {
  blueprint: DesignPlan;
  revision: number;
  designPlanHash: string;
}

export interface BlueprintConfirmation {
  revision: number;
  designPlanHash: string;
}

export function encodeBlueprintMessage(
  blueprint: DesignPlan,
  revision: number,
  designPlanHash: string,
): string {
  return `${BLUEPRINT_MESSAGE_PREFIX}${JSON.stringify({
    kind: "kf-customer-effect-blueprint",
    version: 1,
    revision,
    designPlanHash,
    blueprint,
  })}`;
}

export function decodeBlueprintMessage(content: string): DecodedBlueprintMessage | null {
  if (!content.startsWith(BLUEPRINT_MESSAGE_PREFIX)) return null;
  try {
    const value = JSON.parse(content.slice(BLUEPRINT_MESSAGE_PREFIX.length)) as Record<string, unknown>;
    const revision = value["revision"];
    const designPlanHash = value["designPlanHash"];
    const blueprint = DesignPlanSchema.safeParse(value["blueprint"]);
    if (
      value["kind"] !== "kf-customer-effect-blueprint" ||
      value["version"] !== 1 ||
      typeof revision !== "number" ||
      !Number.isInteger(revision) ||
      revision < 1 ||
      typeof designPlanHash !== "string" ||
      !SHA256_HEX.test(designPlanHash) ||
      !blueprint.success
    ) {
      return null;
    }
    return { blueprint: blueprint.data, revision, designPlanHash };
  } catch {
    return null;
  }
}

export function encodeBlueprintConfirmation(
  revision: number,
  designPlanHash: string,
): string {
  return `${BLUEPRINT_CONFIRM_PREFIX}${JSON.stringify({ revision, designPlanHash })}`;
}

export function decodeBlueprintConfirmation(content: string): BlueprintConfirmation | null {
  if (!content.startsWith(BLUEPRINT_CONFIRM_PREFIX)) return null;
  try {
    const value = JSON.parse(content.slice(BLUEPRINT_CONFIRM_PREFIX.length)) as Record<string, unknown>;
    const revision = value["revision"];
    const designPlanHash = value["designPlanHash"];
    return typeof revision === "number"
      && Number.isInteger(revision)
      && revision >= 1
      && typeof designPlanHash === "string"
      && SHA256_HEX.test(designPlanHash)
      ? { revision, designPlanHash }
      : null;
  } catch {
    return null;
  }
}
