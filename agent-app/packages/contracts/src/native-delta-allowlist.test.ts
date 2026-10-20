import { describe, expect, it } from "vitest";
import {
  EASYUI_PROTO_FIELDS,
  PROTOTYPE_ALLOWED_FIELDS_BY_NAME,
  allowedFieldsFor,
  type AllowlistLookup,
} from "./native-delta-allowlist.js";

const MUTATION_PROBE = "__runtime_policy_mutation_probe__";

describe("native delta allowlist runtime immutability", () => {
  it.each<[string, AllowlistLookup]>([
    ["page", { kind: "page" }],
    ["variable", { kind: "variable" }],
    ["control without a type", { kind: "control" }],
    ["known control", { kind: "control", controlType: "button" }],
    ["unknown control", { kind: "control", controlType: "unknown" }],
    ["EasyUI control", { kind: "control", controlType: "easyui", easyuiProto: 1 }],
    ["prototype control", { kind: "control", controlType: "prototype", prototypeName: "TrendChart" }],
  ])("returns a fresh policy Set for %s lookups", (_name, lookup) => {
    const returned = allowedFieldsFor(lookup) as Set<string>;

    try {
      returned.add(MUTATION_PROBE);

      const subsequent = allowedFieldsFor(lookup);
      expect(subsequent).not.toBe(returned);
      expect(subsequent.has(MUTATION_PROBE)).toBe(false);
    } finally {
      returned.delete(MUTATION_PROBE);
    }
  });

  it("does not let the exported EasyUI field table widen canonical policy", () => {
    const exportedFields = EASYUI_PROTO_FIELDS[1] as string[];

    try {
      try {
        exportedFields.push(MUTATION_PROBE);
      } catch {
        // 冻结的遗产视图是一个接受的变异边界。
      }

      expect(allowedFieldsFor({
        kind: "control",
        controlType: "easyui",
        easyuiProto: 1,
      }).has(MUTATION_PROBE)).toBe(false);
    } finally {
      const probeIndex = exportedFields.indexOf(MUTATION_PROBE);
      if (probeIndex !== -1) exportedFields.splice(probeIndex, 1);
    }
  });

  it("does not let an exported prototype field array widen canonical policy", () => {
    const exportedFields = PROTOTYPE_ALLOWED_FIELDS_BY_NAME.TrendChart as string[];

    try {
      try {
        exportedFields.push(MUTATION_PROBE);
      } catch {
        // 冻结的遗产视图是一个接受的变异边界。
      }

      expect(allowedFieldsFor({
        kind: "control",
        controlType: "prototype",
        prototypeName: "TrendChart",
      }).has(MUTATION_PROBE)).toBe(false);
    } finally {
      const probeIndex = exportedFields.indexOf(MUTATION_PROBE);
      if (probeIndex !== -1) exportedFields.splice(probeIndex, 1);
    }
  });
});
