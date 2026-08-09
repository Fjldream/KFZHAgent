import type { CustomerEffectBlueprint, DesignPlan } from "@kf/contracts";

export function assessBlueprintRevision(
  previous: DesignPlan,
  candidate: CustomerEffectBlueprint,
): string[] {
  const reasons: string[] = [];
  if (previous.schema === "kf-design-plan/v2") {
    if (stableStringify(withoutRevisionNotes(previous)) === stableStringify(withoutRevisionNotes(candidate))) {
      reasons.push("蓝图主体没有实质变化");
    }
  }
  if (candidate.revisionNotes.added.length + candidate.revisionNotes.changed.length === 0) {
    reasons.push("修订没有声明新增或调整内容");
  }
  return reasons;
}

function withoutRevisionNotes(blueprint: CustomerEffectBlueprint): Omit<CustomerEffectBlueprint, "revisionNotes"> {
  const { revisionNotes: _revisionNotes, ...body } = blueprint;
  void _revisionNotes;
  return body;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(typeof value === "string" ? value.trim() : value);
}
