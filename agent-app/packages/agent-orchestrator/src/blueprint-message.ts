import {
  CustomerEffectBlueprintSchema,
  type CustomerEffectBlueprint,
} from "@kf/contracts";

const BLUEPRINT_MESSAGE_PREFIX = "KF_BLUEPRINT_MESSAGE/1\n";

export interface DecodedBlueprintMessage {
  blueprint: CustomerEffectBlueprint;
  revision: number;
}

export function encodeBlueprintMessage(
  blueprint: CustomerEffectBlueprint,
  revision: number,
): string {
  return `${BLUEPRINT_MESSAGE_PREFIX}${JSON.stringify({
    kind: "kf-customer-effect-blueprint",
    version: 1,
    revision,
    blueprint,
  })}`;
}

export function decodeBlueprintMessage(content: string): DecodedBlueprintMessage | null {
  if (!content.startsWith(BLUEPRINT_MESSAGE_PREFIX)) return null;
  try {
    const value = JSON.parse(content.slice(BLUEPRINT_MESSAGE_PREFIX.length)) as Record<string, unknown>;
    const revision = value["revision"];
    const blueprint = CustomerEffectBlueprintSchema.safeParse(value["blueprint"]);
    if (
      value["kind"] !== "kf-customer-effect-blueprint" ||
      value["version"] !== 1 ||
      typeof revision !== "number" ||
      !Number.isInteger(revision) ||
      revision < 1 ||
      !blueprint.success
    ) {
      return null;
    }
    return { blueprint: blueprint.data, revision };
  } catch {
    return null;
  }
}
