import {
  LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH,
  UIImplementationControlV2Schema,
  type ApprovedAssetFacts,
  type ComponentStyleSpec,
  type NodeIntent,
  type RegisteredModuleNode,
  type SolutionImplementationPlan,
} from "@kf/contracts";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { validateCreateComponentProperties } from "../implementation/component-properties.js";
import { ModuleRegistry, type ModuleDefinition } from "../modules/module-registry.js";
import {
  ModuleNodeCompileError,
  compileRegisteredModuleNode,
  type SemanticDataRecord,
} from "./module-node-compiler.js";
import type { CompiledLayoutNode } from "./layout-compiler.js";

const theme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

const approvedAsset: ApprovedAssetFacts = {
  workspaceAssetId: "00000000-0000-0000-0000-000000000001",
  targetPath: `project/res/images/${"a".repeat(64)}.png`,
  mediaType: "image/png",
  sha256: "a".repeat(64),
  sizeBytes: 128,
};

function intent(): NodeIntent {
  return {
    importance: "primary", visualWeight: 5, readingOrder: 0, density: "comfortable", groupWith: [],
    width: { mode: "fill" }, height: { mode: "content" }, align: "stretch",
  };
}

function moduleNode(overrides: Partial<RegisteredModuleNode> = {}): RegisteredModuleNode {
  return {
    kind: "registered-module",
    id: "profile-module",
    sourceBlueprintRegionIds: ["main"],
    intent: intent(),
    moduleKind: "test.profile",
    templateVersion: "1.0.0",
    variant: "default",
    title: "访客资料",
    content: { kind: "record", fields: [{ name: "label", value: "陈佳宁" }] },
    eventBindings: [],
    slots: [],
    ...overrides,
  };
}

function definition(overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    kind: "test.profile",
    version: "1.0.0",
    category: "test",
    maturity: "stable",
    variants: ["default"],
    contentSchema: z.object({ label: z.string().min(1).max(200) }).strict(),
    assetSlots: [],
    requiredKfCapabilities: ["layout.2", "text"],
    compilerFingerprint: "test-profile-compiler-v1",
    layoutFingerprint: "test-profile-layout-v1",
    layout: {
      regions: ["main"], minColumnSpan: 1, maxColumnSpan: 12, preferredHeights: ["medium"], interactions: [],
      height: { min: 100, preferred: { compact: 100, small: 120, medium: 200, large: 260, full: 300 }, max: 300 },
    },
    compile: ({ context }) => ({
      components: [{
        id: "surface", role: "surface", capabilityId: "layout.2", critical: true,
        geometry: { x: 0, y: 0, width: context.bounds.width, height: context.bounds.height },
        properties: {}, style: { declarations: {}, states: {} },
      }, {
        id: "title", role: "title", capabilityId: "text", critical: true,
        content: String(context.content.label), geometry: { x: 16, y: 20, width: 220, height: 32 },
        properties: { parentId: "surface" }, style: { declarations: {}, states: {} },
      }],
      deliveryGaps: [],
    }),
    ...overrides,
  };
}

function configurationOnlyTableDefinition(style: ComponentStyleSpec | undefined): ModuleDefinition {
  return definition({
    requiredKfCapabilities: ["easyui.1"],
    compile: () => ({
      components: [{
        id: "datagrid", role: "native-datagrid", capabilityId: "easyui.1", critical: true,
        geometry: { x: 0, y: 0, width: 300, height: 80 },
        properties: {
          striped: true,
          pagination: false,
          pageSize: 20,
          tableData: {
            columns: [{ key: "name", label: "姓名", align: "left" }],
            rows: [{ name: "陈佳宁" }],
            pageSize: 20,
          },
        },
        style: style as ComponentStyleSpec,
      }],
      deliveryGaps: [],
    }),
  });
}

function registryFor(...definitions: ModuleDefinition[]): ModuleRegistry {
  const registry = new ModuleRegistry();
  definitions.forEach((item) => registry.register(item));
  return registry;
}

function plan(node: RegisteredModuleNode, legacy = false): SolutionImplementationPlan {
  return {
    schema: "kf-solution-implementation/v1",
    projectKey: "module-bridge",
    blueprintHash: "b".repeat(64),
    candidateBundleHash: legacy ? LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH : "c".repeat(64),
    theme,
    roleStyles: [],
    mockData: [],
    localState: [],
    pages: [{
      id: "visitor-page", title: "访客页", purpose: "查看访客资料", canvas: "desktop",
      sourceBlueprintPageId: "bp-page", sourceBlueprintRegionIds: ["main"], initialStateIds: [],
      root: {
        kind: "layout", id: "root", layout: "column", sourceBlueprintRegionIds: ["main"], intent: intent(), children: [node],
      },
    }],
    overlays: [], actions: [], scripts: [],
  };
}

function allocatedNode(): CompiledLayoutNode {
  return {
    id: "profile-module", kind: "registered-module", layout: undefined,
    geometry: { x: 100, y: 80, width: 640, height: 220 }, zIndex: 1,
    overflow: "visible", children: [],
  };
}

function compileInput(
  node: RegisteredModuleNode,
  registry: ModuleRegistry = registryFor(definition()),
  legacy = false,
  approvedAssets: readonly ApprovedAssetFacts[] = [],
  currentRecords: ReadonlyMap<string, SemanticDataRecord> = new Map(),
) {
  const inputPlan = plan(node, legacy);
  return {
    plan: inputPlan,
    page: inputPlan.pages[0]!,
    node,
    layoutNode: allocatedNode(),
    moduleRegistry: registry,
    approvedAssets,
    currentRecords,
    parentId: "root",
    depth: 1,
  };
}

function readCompileError(run: () => void): ModuleNodeCompileError {
  try {
    run();
    throw new Error("expected module compilation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ModuleNodeCompileError);
    if (!(error instanceof ModuleNodeCompileError)) throw error;
    return error;
  }
}

describe("compileRegisteredModuleNode", () => {
  it("compiles native record content with prefixed ids, parents, local geometry, and provenance", () => {
    const node = moduleNode();
    const controls = compileRegisteredModuleNode(compileInput(node));

    expect(controls).toHaveLength(2);
    expect(controls.every((item) => UIImplementationControlV2Schema.safeParse(item).success)).toBe(true);
    controls.forEach((item) => {
      expect(validateCreateComponentProperties(item.capabilityId, item.nativeProperties)).toEqual(item.nativeProperties);
    });
    expect(controls[0]).toMatchObject({
      id: "profile-module--surface", parentId: "root", sourceModuleId: "profile-module",
      capabilityId: "layout.2", depth: 1, geometry: { x: 100, y: 80, width: 640, height: 220 },
      sourceSolutionNodeId: "profile-module", sourceBlueprintPageId: "bp-page",
    });
    expect(controls[0]!.compiledLayout).toBeUndefined();
    expect(controls[1]).toMatchObject({
      id: "profile-module--title", parentId: "profile-module--surface", content: "陈佳宁", depth: 2,
      geometry: { x: 116, y: 100, width: 220, height: 32 },
      nativeProperties: { text: "陈佳宁", parentId: "profile-module--surface" },
    });
  });

  it("strictly parses legacy JSON as data and preserves a code-like string", () => {
    const node = moduleNode({ content: JSON.stringify({ label: "const answer = 42;" }) as never });
    const controls = compileRegisteredModuleNode(compileInput(node, registryFor(definition()), true));

    expect(controls[1]).toMatchObject({ content: "const answer = 42;", nativeProperties: { text: "const answer = 42;" } });
  });

  it("does not require module capability ids to appear in a candidate bundle", () => {
    const node = moduleNode();
    expect(() => compileRegisteredModuleNode(compileInput(node))).not.toThrow();
  });

  it("resolves native module content against the explicit current record only", () => {
    const node = moduleNode({
      content: { kind: "record", fields: [{
        name: "label", value: { kind: "repeater-field", itemAlias: "item", field: "name" },
      }] },
    });
    const currentRecords = new Map<string, SemanticDataRecord>([["item", { name: "当前访客" }]]);

    const controls = compileRegisteredModuleNode(compileInput(node, registryFor(definition()), false, [], currentRecords));
    expect(controls[1]).toMatchObject({ content: "当前访客", nativeProperties: { text: "当前访客" } });

    const unresolved = readCompileError(() => compileRegisteredModuleNode(compileInput(node)));
    expect(unresolved).toMatchObject({ code: "REPEATER_FIELD_UNRESOLVED", path: ["profile-module", "content", "fields", 0, "value"] });
  });

  it("requires exact kind, version, and variant", () => {
    expect(() => compileRegisteredModuleNode(compileInput(moduleNode({ templateVersion: "2.0.0" }))))
      .toThrow(/MODULE_DEFINITION_NOT_FOUND.*test\.profile@2\.0\.0/);
    expect(() => compileRegisteredModuleNode(compileInput(moduleNode({ variant: "other" }))))
      .toThrow(/MODULE_VARIANT_UNSUPPORTED.*other/);
    expect(() => compileRegisteredModuleNode(compileInput(moduleNode({ moduleKind: "test.missing" }))))
      .toThrow(/MODULE_DEFINITION_NOT_FOUND.*test\.missing@1\.0\.0/);
  });

  it("validates required KF capabilities against the technical registry", () => {
    const missing = definition({ requiredKfCapabilities: ["layout.2", "missing.capability"] });
    const error = readCompileError(() => compileRegisteredModuleNode(compileInput(moduleNode(), registryFor(missing))));
    expect(error).toMatchObject({ code: "MODULE_KF_CAPABILITY_MISSING", path: ["profile-module", "requiredKfCapabilities"] });
  });

  it("reports required webcontainer authorization before generic capability availability", () => {
    const unauthorized = definition({ requiredKfCapabilities: ["webcontainer", "missing.capability"] });
    const error = readCompileError(() => compileRegisteredModuleNode(
      compileInput(moduleNode(), registryFor(unauthorized)),
    ));

    expect(error.code).toBe("MODULE_WEBCONTAINER_UNAUTHORIZED");
    expect(error.path).toEqual(["profile-module", "requiredKfCapabilities", "webcontainer"]);
  });

  it.each([
    ["layout.0 local parent", "accordion", "layout.0", "MODULE_COMPONENT_CAPABILITY_PRESERVE_ONLY", true],
    ["layout.3 local parent", "tabs", "layout.3", "MODULE_COMPONENT_CAPABILITY_PRESERVE_ONLY", true],
    ["preserve-only local leaf", "legacy-table", "table", "MODULE_COMPONENT_CAPABILITY_PRESERVE_ONLY", false],
    ["unsupported local leaf", "external-page", "webcontainer", "MODULE_COMPONENT_CAPABILITY_UNSUPPORTED", false],
    ["missing local leaf", "invented", "missing.capability", "MODULE_COMPONENT_CAPABILITY_MISSING", false],
  ] as const)("rejects a %s returned by the registered compiler", (_label, outputId, capabilityId, code, parent) => {
    const invalidOutput = definition({
      requiredKfCapabilities: ["text"],
      compile: () => ({
        components: [{
          id: outputId, role: "surface", capabilityId, critical: true,
          geometry: { x: 0, y: 0, width: 300, height: 80 }, properties: {},
          style: { declarations: {}, states: {} },
        }, ...(parent ? [{
          id: "child", role: "body", capabilityId: "text", critical: true, content: "子节点",
          geometry: { x: 8, y: 8, width: 200, height: 24 }, properties: { parentId: outputId },
          style: { declarations: {}, states: {} },
        }] : [])],
        deliveryGaps: [],
      }),
    });

    const error = readCompileError(() => compileRegisteredModuleNode(
      compileInput(moduleNode(), registryFor(invalidOutput)),
    ));
    expect(error.code).toBe(code);
    expect(error.path).toEqual(["profile-module", "components", outputId, "capabilityId", capabilityId]);
  });

  it("accepts a technically available layout.2 parent and supported child even when only the child is required", () => {
    const supportedOutput = definition({ requiredKfCapabilities: ["text"] });
    const controls = compileRegisteredModuleNode(compileInput(moduleNode(), registryFor(supportedOutput)));

    expect(controls.map((control) => [control.id, control.capabilityId, control.parentId])).toEqual([
      ["profile-module--surface", "layout.2", "root"],
      ["profile-module--title", "text", "profile-module--surface"],
    ]);
  });

  it.each([
    ["an absent style", undefined],
    ["a schema-defaulted empty style", {} as never],
    ["empty declarations and state branches", { declarations: {}, states: { hover: undefined, active: {} } }],
  ] as const)("accepts typed easyui.1 table data with %s", (_label, style) => {
    const tableDefinition = configurationOnlyTableDefinition(style);
    const controls = compileRegisteredModuleNode(compileInput(moduleNode(), registryFor(tableDefinition)));

    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({
      id: "profile-module--datagrid",
      capabilityId: "easyui.1",
      nativeProperties: {
        striped: true,
        pagination: false,
        pageSize: 20,
        tableData: {
          columns: [{ key: "name", label: "姓名", align: "left" }],
          rows: [{ name: "陈佳宁" }],
          pageSize: 20,
        },
      },
    });
    expect(controls[0]!.style).not.toHaveProperty("role");
    expect(controls[0]!.style).toMatchObject({ declarations: {} });
  });

  it("does not default an absent style for ordinary module output", () => {
    const missingStyle = definition({
      compile: () => ({
        components: [{
          id: "title", role: "title", capabilityId: "text", critical: true, content: "访客",
          geometry: { x: 0, y: 0, width: 100, height: 24 }, properties: {}, style: undefined as never,
        }],
        deliveryGaps: [],
      }),
    });
    const error = readCompileError(() => compileRegisteredModuleNode(
      compileInput(moduleNode(), registryFor(missingStyle)),
    ));

    expect(error.code).toBe("MODULE_COMPONENT_INVALID");
    expect(error.path).toEqual(["profile-module", "components", 0]);
  });

  it.each([
    ["role", { role: "data", declarations: {}, states: {} }],
    ["background declaration", { declarations: { backgroundColor: "#ffffff" }, states: {} }],
    ["hover opacity", { declarations: {}, states: { hover: { opacity: 0.5 } } }],
    ["parts", { declarations: {}, states: {}, parts: { cell: { declarations: {}, states: {} } } } as never],
  ] as const)("rejects easyui.1 configuration-only output carrying %s style", (_label, style) => {
    const tableDefinition = configurationOnlyTableDefinition(style);
    const error = readCompileError(() => compileRegisteredModuleNode(
      compileInput(moduleNode(), registryFor(tableDefinition)),
    ));

    expect(error.code).toBe("MODULE_COMPONENT_CAPABILITY_PRESERVE_ONLY");
    expect(error.path).toEqual([
      "profile-module", "components", "datagrid", "capabilityId", "easyui.1", "style",
    ]);
  });

  it("resolves an approved image exactly and rejects missing asset integrity", () => {
    const imageDefinition = definition({
      assetSlots: [{ id: "portrait", required: true, allowedKinds: ["image"] }],
      requiredKfCapabilities: ["image"],
      compile: ({ context }) => ({
        components: [{
          id: "portrait", role: "image", capabilityId: "image", critical: true,
          geometry: { x: 0, y: 0, width: context.bounds.width, height: context.bounds.height },
          properties: { src: "asset", fit: "cover", alt: "访客照片" }, style: { declarations: {}, states: {} },
        }],
        deliveryGaps: [],
      }),
    });
    const registry = registryFor(imageDefinition);
    const node = moduleNode({ assetId: "asset-00000000000000000000000000000001" });
    const controls = compileRegisteredModuleNode(compileInput(node, registry, false, [approvedAsset]));

    expect(controls[0]).toMatchObject({
      assetIds: ["asset-00000000000000000000000000000001"],
      nativeProperties: { src: approvedAsset.targetPath, fit: "cover", alt: "访客照片", parentId: "root" },
    });
    expect(() => compileRegisteredModuleNode(compileInput(node, registry)))
      .toThrow(/MODULE_ASSET_NOT_APPROVED.*asset-00000000000000000000000000000001/);
    expect(() => compileRegisteredModuleNode(compileInput(moduleNode(), registry)))
      .toThrow(/MODULE_ASSET_SLOT_REQUIRED.*portrait/);

    const inconsistentFacts: ApprovedAssetFacts = {
      ...approvedAsset,
      targetPath: `project/res/images/${"b".repeat(64)}.png`,
    };
    expect(() => compileRegisteredModuleNode(compileInput(node, registry, false, [inconsistentFacts])))
      .toThrow(/MODULE_ASSET_FACTS_INVALID.*targetPath/);
  });

  it("fails closed for semantic child slots", () => {
    const child = moduleNode({ id: "nested" });
    const node = moduleNode({ slots: [{ slotId: "body", children: [child] }] });
    const error = readCompileError(() => compileRegisteredModuleNode(compileInput(node)));
    expect(error).toMatchObject({ code: "MODULE_CHILD_SLOT_UNSUPPORTED", path: ["profile-module", "slots", 0] });
  });

  it("rejects duplicate, unsafe, orphaned, and out-of-bounds local compiler output", () => {
    const component = {
      id: "title", role: "title", capabilityId: "text", critical: true, content: "访客",
      geometry: { x: 0, y: 0, width: 40, height: 20 }, properties: {}, style: { declarations: {}, states: {} },
    } as const;
    const cases = [
      ["duplicate", [component, component], "MODULE_COMPONENT_ID_DUPLICATE"],
      ["unsafe", [{ ...component, id: "../title" }], "MODULE_COMPONENT_ID_UNSAFE"],
      ["orphan", [{ ...component, properties: { parentId: "missing" } }], "MODULE_COMPONENT_PARENT_MISSING"],
      ["overflow", [{ ...component, geometry: { x: 630, y: 0, width: 40, height: 20 } }], "MODULE_COMPONENT_OUT_OF_BOUNDS"],
    ] as const;
    for (const [label, components, code] of cases) {
      const invalid = definition({ compile: () => ({ components: [...components], deliveryGaps: [] }) });
      expect(() => compileRegisteredModuleNode(compileInput(moduleNode(), registryFor(invalid))), label).toThrow(code);
    }
  });

  it("requires every local parent to be a reviewed layout capability", () => {
    const invalidParent = definition({
      requiredKfCapabilities: ["text"],
      compile: () => ({
        components: [{
          id: "parent", role: "body", capabilityId: "text", critical: true, content: "错误父节点",
          geometry: { x: 0, y: 0, width: 300, height: 80 }, properties: {}, style: { declarations: {}, states: {} },
        }, {
          id: "child", role: "body", capabilityId: "text", critical: true, content: "子节点",
          geometry: { x: 8, y: 8, width: 200, height: 24 }, properties: { parentId: "parent" },
          style: { declarations: {}, states: {} },
        }],
        deliveryGaps: [],
      }),
    });

    const error = readCompileError(() => compileRegisteredModuleNode(compileInput(moduleNode(), registryFor(invalidParent))));
    expect(error).toMatchObject({
      code: "MODULE_COMPONENT_PARENT_NOT_LAYOUT",
      path: ["profile-module", "components", 1, "properties", "parentId"],
    });
  });

  it("reports a direct module parent cycle with its exact structured code", () => {
    const cyclic = definition({
      requiredKfCapabilities: ["layout.2"],
      compile: () => ({
        components: [{
          id: "first", role: "layout", capabilityId: "layout.2", critical: true,
          geometry: { x: 0, y: 0, width: 300, height: 80 }, properties: { parentId: "second" },
          style: { declarations: {}, states: {} },
        }, {
          id: "second", role: "layout", capabilityId: "layout.2", critical: true,
          geometry: { x: 0, y: 0, width: 300, height: 80 }, properties: { parentId: "first" },
          style: { declarations: {}, states: {} },
        }],
        deliveryGaps: [],
      }),
    });

    const error = readCompileError(() => compileRegisteredModuleNode(compileInput(moduleNode(), registryFor(cyclic))));
    expect(error.code).toBe("MODULE_COMPONENT_PARENT_CYCLE");
    expect(error.path.slice(0, 2)).toEqual(["profile-module", "components"]);
  });

  it("routes compiler properties through the reviewed validator", () => {
    const malicious = definition({
      compile: () => ({
        components: [{
          id: "title", role: "title", capabilityId: "text", critical: true, content: "安全文本",
          geometry: { x: 0, y: 0, width: 40, height: 20 },
          properties: { css: "body{display:none}" }, style: { declarations: {}, states: {} },
        }],
        deliveryGaps: [],
      }),
    });
    expect(() => compileRegisteredModuleNode(compileInput(moduleNode(), registryFor(malicious))))
      .toThrow(/INVALID_COMPONENT_PROPERTY|UNSAFE_COMPONENT_PROPERTY/);
  });

  it("never changes the allocated page envelope", () => {
    const allocated = allocatedNode();
    const input = { ...compileInput(moduleNode()), layoutNode: allocated };
    compileRegisteredModuleNode(input);
    expect(allocated.geometry).toEqual({ x: 100, y: 80, width: 640, height: 220 });
  });
});
