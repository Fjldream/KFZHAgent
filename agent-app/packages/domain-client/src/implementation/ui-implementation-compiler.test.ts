import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UIImplementationSpec } from "@kf/contracts";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { applyClientPatch } from "../patch/client-patcher.js";
import { compileUiImplementation } from "./ui-implementation-compiler.js";

const pkgDir = fileURLToPath(new URL(".", import.meta.url));
const fixturesRoot = join(pkgDir, "../../../../tests/fixtures");

async function copyFixture(name: string): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), "kf-ui-implementation-"));
  await cp(join(fixturesRoot, name), destination, { recursive: true });
  return destination;
}

async function controlField(root: string, guid: string, field: string): Promise<unknown> {
  const inspection = await inspectClientProject(root);
  const entry = inspection.index.controls[guid];
  if (entry === undefined) throw new Error(`fixture does not contain control ${guid}`);
  const page = JSON.parse(await readFile(join(root, "1.0.0.1", "project", "page", "Page1.json"), "utf8")) as Record<string, unknown>;
  let node: unknown = page;
  for (const segment of entry.rawPath.split("#")[1]!.split("/").filter(Boolean)) {
    node = (node as Record<string, unknown>)[Number.isNaN(Number(segment)) ? segment : Number(segment)];
  }
  return (node as Record<string, unknown>)[field];
}

const theme = {
  background: "#0b1220",
  surface: "#131d2e",
  primary: "#2563eb",
  accent: "#22c55e",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  fontFamily: "Microsoft YaHei",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 12 },
} as const;

const context = {
  workspaceId: "w-1",
  pageGuidById: { overview: "page-guid-1" },
  existingControlGuidByComponentId: { ExistingTitle: "title-guid-1" },
  existingControlCapabilityIdByComponentId: { ExistingTitle: "text" },
  existingControlGeometryByComponentId: {
    ExistingTitle: { x: 40, y: 32, width: 320, height: 48 },
  },
} as const;

const specFixture: UIImplementationSpec = {
  schema: "kf-ui-implementation/v1",
  theme,
  pages: [{
    id: "overview",
    width: 1440,
    height: 900,
    components: [
      {
        id: "ExistingTitle",
        role: "page-title",
        capabilityId: "text",
        critical: true,
        geometry: { x: 40, y: 32, width: 320, height: 48 },
        properties: {},
        style: { declarations: { fontSize: 28 }, states: {} },
      },
      {
        id: "SubmitButton",
        role: "primary-action",
        capabilityId: "button",
        critical: true,
        content: "提交",
        geometry: { x: 40, y: 120, width: 120, height: 40 },
        properties: {},
        style: {
          declarations: { backgroundColor: "{theme.primary}", borderRadius: 8 },
          states: { hover: { backgroundColor: "#1d4ed8" } },
        },
      },
    ],
  }],
};

describe("compileUiImplementation", () => {
  it.each([
    ["no source module", undefined, {}, /CONFIGURATION_ONLY_DATA/],
    ["forged source module", "forged-module", {}, /VERIFIED_MODULE_COMPILATION_ARTIFACT_REQUIRED/],
    ["empty semantic properties", "forged-module", { tableData: { columns: [], rows: [] } }, /VERIFIED_MODULE_COMPILATION_ARTIFACT_REQUIRED/],
  ])("rejects untrusted configuration-only datagrid data (%s)", (_label, sourceModuleId, properties, error) => {
    const dataTable: UIImplementationSpec = {
      schema: "kf-ui-implementation/v1", theme,
      pages: [{ id: "overview", width: 1440, height: 900, components: [{
        id: "DataTable", role: "data-table", capabilityId: "easyui.1", critical: true,
        ...(sourceModuleId === undefined ? {} : { sourceModuleId }),
        geometry: { x: 40, y: 40, width: 600, height: 300 }, properties,
        style: { declarations: {}, states: {} },
      }] }],
    };
    expect(() => compileUiImplementation(dataTable, {
      ...context,
      existingControlGuidByComponentId: {},
      existingControlCapabilityIdByComponentId: {},
    })).toThrow(error);
  });

  it("creates new controls and styles existing controls in stable page and component order", () => {
    const result = compileUiImplementation(specFixture, context);

    expect(result.plan).toEqual({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [
        {
          op: "applyStyle",
          entityId: "title-guid-1",
          entityType: "control",
          style: { declarations: { fontSize: 28 }, states: {} },
        },
        {
          op: "create",
          entityId: "SubmitButton",
          entityType: "control",
          properties: {
            pageId: "page-guid-1",
            type: "button",
            x: 40,
            y: 120,
            width: 120,
            height: 40,
            text: "提交",
            style: {
              declarations: { backgroundColor: "#2563eb", borderRadius: 8 },
              states: { hover: { backgroundColor: "#1d4ed8" } },
            },
          },
        },
      ],
    });
  });

  it("updates existing control content only when the spec declares content", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{ ...specFixture.pages[0]!.components[0]!, content: "新的标题" }],
      }],
    }, context);

    expect(result.plan.operations).toEqual([
      expect.objectContaining({ op: "applyStyle", entityId: "title-guid-1" }),
      {
        op: "update",
        entityId: "title-guid-1",
        entityType: "control",
        changes: [{ path: "/text", value: "新的标题" }],
      },
    ]);
  });

  it("updates existing control geometry and reviewed semantic properties", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[0]!,
          capabilityId: "input",
          geometry: { x: 900, y: 500, width: 360, height: 44 },
          properties: { placeholder: "请输入姓名", clearable: true },
          style: { declarations: {}, states: {} },
        }],
      }],
    }, {
      ...context,
      existingControlCapabilityIdByComponentId: { ExistingTitle: "input" },
    });

    expect(result.plan.operations).toEqual([{
      op: "update",
      entityId: "title-guid-1",
      entityType: "control",
      changes: [
        { path: "/x", value: 900 },
        { path: "/y", value: 500 },
        { path: "/width", value: 360 },
        { path: "/height", value: 44 },
        { path: "/placeholder", value: "请输入姓名" },
        { path: "/clearable", value: true },
      ],
    }]);
  });

  it("does not reapply unchanged properties, parent placement, content, or style from the prior spec", () => {
    const checkbox: UIImplementationSpec = {
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          id: "Agree",
          role: "consent",
          capabilityId: "checkbox",
          critical: true,
          geometry: { x: 40, y: 120, width: 160, height: 32 },
          properties: { label: "同意", checked: false, parentId: "FormLayout" },
          style: { declarations: { fontSize: 14 }, states: {} },
        }],
      }],
    };

    const result = compileUiImplementation(checkbox, {
      ...context,
      existingControlGuidByComponentId: { Agree: "checkbox-guid-1" },
      existingControlCapabilityIdByComponentId: { Agree: "checkbox" },
      existingControlGeometryByComponentId: {
        Agree: { x: 40, y: 120, width: 160, height: 32 },
      },
      previousImplementation: checkbox,
    });

    expect(result.plan.operations).toEqual([]);
  });

  it("preserves parentId for non-module controls", () => {
    const nested: UIImplementationSpec = {
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "NestedButton",
          properties: { parentId: "HandAuthoredLayout" },
        }],
      }],
    };
    const result = compileUiImplementation(nested, {
      ...context,
      existingControlGuidByComponentId: {},
      existingControlCapabilityIdByComponentId: {},
    });
    expect(result.plan.operations).toContainEqual(expect.objectContaining({
      op: "create",
      entityId: "NestedButton",
      properties: expect.objectContaining({ parentId: "HandAuthoredLayout" }),
    }));
  });

  it("maps a changed checkbox value to reviewed KF native fields", () => {
    const previous: UIImplementationSpec = {
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          id: "Agree",
          role: "consent",
          capabilityId: "checkbox",
          critical: true,
          geometry: { x: 40, y: 120, width: 160, height: 32 },
          properties: { label: "同意", checked: false },
          style: { declarations: {}, states: {} },
        }],
      }],
    };
    const revised: UIImplementationSpec = {
      ...previous,
      pages: [{
        ...previous.pages[0]!,
        components: [{
          ...previous.pages[0]!.components[0]!,
          properties: { label: "同意", checked: true },
        }],
      }],
    };

    const result = compileUiImplementation(revised, {
      ...context,
      existingControlGuidByComponentId: { Agree: "checkbox-guid-1" },
      existingControlCapabilityIdByComponentId: { Agree: "checkbox" },
      existingControlGeometryByComponentId: {
        Agree: { x: 40, y: 120, width: 160, height: 32 },
      },
      previousImplementation: previous,
    });

    expect(result.plan.operations).toEqual([{
      op: "update",
      entityId: "checkbox-guid-1",
      entityType: "control",
      changes: [{ path: "/checkedData", value: ["同意"] }],
    }]);
  });

  it("keeps checkedData synchronized when a checked checkbox label changes", () => {
    const previous: UIImplementationSpec = {
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          id: "Agree",
          role: "consent",
          capabilityId: "checkbox",
          critical: true,
          geometry: { x: 40, y: 120, width: 160, height: 32 },
          properties: { label: "旧标签", checked: true },
          style: { declarations: {}, states: {} },
        }],
      }],
    };
    const revised: UIImplementationSpec = {
      ...previous,
      pages: [{
        ...previous.pages[0]!,
        components: [{
          ...previous.pages[0]!.components[0]!,
          properties: { label: "新标签", checked: true },
        }],
      }],
    };

    const result = compileUiImplementation(revised, {
      ...context,
      existingControlGuidByComponentId: { Agree: "checkbox-guid-1" },
      existingControlCapabilityIdByComponentId: { Agree: "checkbox" },
      existingControlGeometryByComponentId: {
        Agree: { x: 40, y: 120, width: 160, height: 32 },
      },
      previousImplementation: previous,
    });

    expect(result.plan.operations).toEqual([{
      op: "update",
      entityId: "checkbox-guid-1",
      entityType: "control",
      changes: [
        {
          path: "/checkboxData",
          value: [{ text: "新标签", label: "新标签", disabled: false, visible: true }],
        },
        { path: "/checkedData", value: ["新标签"] },
      ],
    }]);
  });

  it("fails on a critical unsupported control", () => {
    const unsupportedCriticalSpec: UIImplementationSpec = {
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "UnsupportedWebContainer",
          capabilityId: "webcontainer",
          content: undefined,
          properties: {},
          style: { declarations: {}, states: {} },
        }],
      }],
    };

    expect(() => compileUiImplementation(unsupportedCriticalSpec, context))
      .toThrow(/UNSUPPORTED_CRITICAL_CAPABILITY/);
  });

  it("uses an explicit reviewed fallback for an empty-style non-critical capability gap", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "FallbackWebContainer",
          capabilityId: "webcontainer",
          critical: false,
          fallbackCapabilityId: "text",
          content: undefined,
          properties: {},
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context);

    expect(result.plan.operations).toContainEqual(expect.objectContaining({
      op: "create",
      entityId: "FallbackWebContainer",
      properties: expect.objectContaining({ type: "text" }),
    }));
    expect(result.capabilityReport.deliveryGaps).toContainEqual(expect.objectContaining({
      componentId: "FallbackWebContainer",
      fallback: "text",
    }));
  });

  it("records every unsupported token against a verified non-critical fallback", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "LegacyTable",
          capabilityId: "table",
          critical: false,
          fallbackCapabilityId: "text",
          properties: {},
          style: { declarations: { backgroundColor: "#172338", fontSize: 16 }, states: {} },
        }],
      }],
    }, context);

    expect(result.plan.operations).toContainEqual(expect.objectContaining({
      op: "create",
      entityId: "LegacyTable",
      properties: expect.objectContaining({ type: "text" }),
    }));
    expect(result.capabilityReport.deliveryGaps).toContainEqual(expect.objectContaining({
      componentId: "LegacyTable",
      capability: "table",
      severity: "non-critical",
      fallback: "text",
      reason: expect.stringContaining("declarations.backgroundColor"),
    }));
    expect(result.capabilityReport.unsupported).toEqual([
      "LegacyTable:table:declarations.backgroundColor",
      "LegacyTable:table:declarations.fontSize",
      "LegacyTable:table:style",
    ]);
  });

  it("resolves theme tokens in emitted styles before the plan reaches the patcher", async () => {
    const base = await copyFixture("client-unknown-field");
    const result = compileUiImplementation({
      ...specFixture,
      theme: { ...theme, primary: "#e11d48", accent: "#14b8a6" },
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[0]!,
          capabilityId: "button",
          style: {
            declarations: { backgroundColor: "{theme.primary}", borderRadius: 8 },
            states: { hover: { backgroundColor: "{theme.accent}" } },
          },
        }],
      }],
    }, {
      workspaceId: "w-theme",
      pageGuidById: { overview: "page-guid-1" },
      existingControlGuidByComponentId: { ExistingTitle: "button-guid-1" },
      existingControlCapabilityIdByComponentId: { ExistingTitle: "button" },
    });

    expect(result.plan.operations[0]).toMatchObject({
      style: {
        declarations: { backgroundColor: "#e11d48", borderRadius: 8 },
        states: { hover: { backgroundColor: "#14b8a6" } },
      },
    });
    const candidate = await applyClientPatch(base, result.plan);
    expect(await controlField(candidate.rootDir, "button-guid-1", "backgroundColor")).toBe("#e11d48");
    expect(await controlField(candidate.rootDir, "button-guid-1", "styleDataNew")).toContain("background-color:#14b8a6");
  });

  it("rejects raw nested layout children instead of forwarding native style fields", () => {
    expect(() => compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "UnsafeLayoutChildren",
          capabilityId: "layout.2",
          content: undefined,
          properties: { children: [{ styleDataNew: "#domId{display:none}" }] },
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context)).toThrow(/UNSAFE_COMPONENT_PROPERTY/);
  });

  it("rejects raw nested layout panels instead of forwarding CSS-shaped values", () => {
    expect(() => compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "UnsafeLayoutPanels",
          capabilityId: "layout.2",
          content: undefined,
          properties: { panels: [{ css: "body{display:none}" }] },
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context)).toThrow(/UNSAFE_COMPONENT_PROPERTY/);
  });

  it("accepts geometry exactly at the page boundary and rejects overflow", () => {
    const atBoundary = {
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          geometry: { x: 1320, y: 860, width: 120, height: 40 },
        }],
      }],
    };
    expect(() => compileUiImplementation(atBoundary, context)).not.toThrow();

    const overflowing = {
      ...atBoundary,
      pages: [{
        ...atBoundary.pages[0]!,
        components: [{ ...atBoundary.pages[0]!.components[0]!, geometry: { x: 1321, y: 860, width: 120, height: 40 } }],
      }],
    };
    expect(() => compileUiImplementation(overflowing, context)).toThrow(/COMPONENT_OUT_OF_PAGE_BOUNDS/);
  });

  it("rejects duplicate page ids before emitting operations", () => {
    expect(() => compileUiImplementation({
      ...specFixture,
      pages: [
        { ...specFixture.pages[0]!, components: [{ ...specFixture.pages[0]!.components[0]!, id: "FirstTitle" }] },
        { ...specFixture.pages[0]!, components: [{ ...specFixture.pages[0]!.components[0]!, id: "SecondTitle" }] },
      ],
    }, context)).toThrow(/DUPLICATE_PAGE_ID/);
  });

  it("validates capability-specific property values and preserves valid semantic properties", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "StatusSelect",
          capabilityId: "select",
          content: undefined,
          properties: {
            options: [{ label: "Ready", value: "ready" }],
            value: "ready",
            multiple: false,
          },
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context);

    expect(result.plan.operations).toContainEqual(expect.objectContaining({
      op: "create",
      entityId: "StatusSelect",
      properties: expect.objectContaining({
        type: "select",
        options: [{ label: "Ready", value: "ready" }],
        value: "ready",
        multiple: false,
      }),
    }));
  });

  it.each([
    { name: "input inputType", capabilityId: "input", properties: { inputType: "password" } },
    { name: "datetime pickerType", capabilityId: "datetimepicker", properties: { pickerType: "date" } },
    { name: "inputnumber variableId", capabilityId: "inputnumber", properties: { variableId: "$Temp" } },
    { name: "inputnumber decimals", capabilityId: "inputnumber", properties: { decimals: 2 } },
  ])("rejects direct-only $name from the ChangePlan surface", ({ capabilityId, properties }) => {
    expect(() => compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "UnsupportedPatchSemantic",
          capabilityId,
          content: undefined,
          properties,
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context)).toThrow(/UNSUPPORTED_COMPONENT_PROPERTY|INVALID_COMPONENT_PROPERTY/);
  });

  it("accepts only the restricted declarative button action DSL", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "NavigateButton",
          properties: { action: { kind: "navigate", pageId: "overview" } },
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context);
    expect(result.plan.operations).toContainEqual(expect.objectContaining({
      op: "create", entityId: "NavigateButton", properties: expect.objectContaining({ action: { kind: "navigate", pageId: "overview" } }),
    }));
  });

  it("emits a semantic button action delta and an explicit clear for an existing control", () => {
    const button = { ...specFixture.pages[0]!.components[1]!, id: "ExistingTitle", properties: { action: { kind: "navigate" as const, pageId: "overview" } }, style: { declarations: {}, states: {} } };
    const actionResult = compileUiImplementation({ ...specFixture, pages: [{ ...specFixture.pages[0]!, components: [button] }] }, {
      ...context, existingControlCapabilityIdByComponentId: { ExistingTitle: "button" },
      previousImplementation: { ...specFixture, pages: [{ ...specFixture.pages[0]!, components: [{ ...button, properties: {} }] }] },
    });
    expect(actionResult.plan.operations).toContainEqual(expect.objectContaining({ op: "update", changes: expect.arrayContaining([{ path: "/linkMng", value: { kind: "navigate", pageId: "overview" } }]) }));
    const clearResult = compileUiImplementation({ ...specFixture, pages: [{ ...specFixture.pages[0]!, components: [{ ...button, properties: {} }] }] }, {
      ...context, existingControlCapabilityIdByComponentId: { ExistingTitle: "button" },
      previousImplementation: { ...specFixture, pages: [{ ...specFixture.pages[0]!, components: [button] }] },
    });
    expect(clearResult.plan.operations).toContainEqual(expect.objectContaining({ op: "update", changes: expect.arrayContaining([{ path: "/linkMng", value: null }]) }));
  });

  it.each([
    {
      name: "nested styleDataNew",
      properties: { options: [{ label: "Ready", value: "ready", styleDataNew: "#domId{display:none}" }] },
    },
    {
      name: "nested raw native payload",
      properties: { options: [{ label: "Ready", value: "ready", raw: { native: { backgroundColor: "#000000" } } }] },
    },
    {
      name: "wrong semantic value type",
      properties: { options: [{ label: "Ready", value: { nativeFields: { backgroundColor: "#000000" } } }] },
    },
    {
      name: "unknown nested native fields",
      properties: { options: [{ label: "Ready", value: "ready", objectType: 3, linkMng: {}, script: "evil()" }] },
    },
  ])("rejects $name in capability-specific properties", ({ properties }) => {
    expect(() => compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "UnsafeSelect",
          capabilityId: "select",
          content: undefined,
          properties,
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context)).toThrow(/UNSAFE_COMPONENT_PROPERTY|INVALID_COMPONENT_PROPERTY/);
  });

  it.each([
    "fill",
    "contain",
    "cover",
    "none",
    "scale-down",
  ])("accepts reviewed image fit %s", (fit) => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "SafeImage",
          capabilityId: "image",
          content: undefined,
          properties: { src: "static/images/example.png", fit, alt: "Example" },
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context);

    expect(result.plan.operations[0]).toMatchObject({
      op: "create",
      properties: { src: "static/images/example.png", fit, alt: "Example" },
    });
  });

  it.each([
    { name: "CSS declaration fit", properties: { src: "static/images/example.png", fit: "fill;background:url(javascript:evil)" } },
    { name: "javascript image URL", properties: { src: "javascript:alert(1)", fit: "fill" } },
    { name: "CSS url() image payload", properties: { src: "url(https://attacker.invalid/a.png)", fit: "fill" } },
  ])("rejects $name", ({ properties }) => {
    expect(() => compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "UnsafeImage",
          capabilityId: "image",
          content: undefined,
          properties,
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context)).toThrow(/INVALID_COMPONENT_PROPERTY/);
  });

  it("compiles existing controls against their actual capability and reports that capability", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[0]!,
          capabilityId: "button",
          style: { declarations: { borderRadius: 8 }, states: {} },
        }],
      }],
    }, {
      workspaceId: "w-existing",
      pageGuidById: { overview: "page-guid-1" },
      existingControlGuidByComponentId: { ExistingTitle: "button-guid-1" },
      existingControlCapabilityIdByComponentId: { ExistingTitle: "button" },
    });

    expect(result.plan.operations[0]).toMatchObject({ op: "applyStyle", entityId: "button-guid-1" });
    expect(result.capabilityReport.partial).toEqual(["button"]);
  });

  it("rejects a requested capability that does not match the actual existing control", () => {
    expect(() => compileUiImplementation(specFixture, {
      ...context,
      existingControlCapabilityIdByComponentId: { ExistingTitle: "button" },
    })).toThrow(/EXISTING_CAPABILITY_MISMATCH/);
  });

  it("requires an own, non-empty actual capability id for every existing control", () => {
    expect(() => compileUiImplementation(specFixture, {
      ...context,
      existingControlCapabilityIdByComponentId: {},
    })).toThrow(/MISSING_EXISTING_CONTROL_CAPABILITY/);

    expect(() => compileUiImplementation(specFixture, {
      ...context,
      existingControlCapabilityIdByComponentId: { ExistingTitle: "" },
    })).toThrow(/INVALID_EXISTING_CONTROL_CAPABILITY/);
  });

  it("does not resolve page or existing-control ids through object prototypes", () => {
    const inheritedPageMap = Object.create({ overview: "prototype-page-guid" }) as Record<string, string>;
    expect(() => compileUiImplementation(specFixture, {
      ...context,
      pageGuidById: inheritedPageMap,
    })).toThrow(/UNKNOWN_PAGE_ID/);

    const inheritedExistingMap = Object.create({ ExistingTitle: "prototype-control-guid" }) as Record<string, string>;
    const result = compileUiImplementation(specFixture, {
      ...context,
      existingControlGuidByComponentId: inheritedExistingMap,
      existingControlCapabilityIdByComponentId: {},
    });
    expect(result.plan.operations[0]).toMatchObject({ op: "create", entityId: "ExistingTitle" });
  });

  it("rejects empty or non-string ids in context maps", () => {
    expect(() => compileUiImplementation(specFixture, {
      ...context,
      pageGuidById: { overview: "" },
    })).toThrow(/INVALID_PAGE_GUID/);

    expect(() => compileUiImplementation(specFixture, {
      ...context,
      existingControlGuidByComponentId: { ExistingTitle: 42 } as unknown as Record<string, string>,
    })).toThrow(/INVALID_EXISTING_CONTROL_GUID/);
  });

  it("skips an empty style delta for an existing supported control", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[0]!,
          style: { declarations: {}, states: {} },
        }],
      }],
    }, context);

    expect(result.plan.operations).toEqual([]);
  });
});
