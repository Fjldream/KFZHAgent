// KF 容器对象（easyui / layout）编译层测试：IR → KF 工程 JSON 序列化结构。
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { parse } from "acorn";
import { describe, expect, it } from "vitest";
import type { ControlIR } from "../ir/client-project-ir.js";
import { deriveGuid } from "./guid-factory.js";
import * as controlCompilerModule from "./control-compiler.js";
import {
  compileControl,
  ModelOutputInvalidError,
  type CompileContext,
} from "./control-compiler.js";

const build = { seed: "test-seed" };
const ctx: CompileContext = {
  variableGroupGuid: "kvariables",
  pageGroupGuid: "kpagegroup",
  resolvePageGuid: (name) => `k${name}`,
  resolveVariableName: (id) => id,
};

const scriptModule = (id: string, source: string, placement: "event" | "configure-data" = "event", ownerInstanceName = "Button1") => ({
  id: `kf$script:${id}`, sourceScriptId: id, placement, ownerInstanceName,
  instanceReferences: [{ semanticId: "go", instanceName: ownerInstanceName }], pageReferences: [], source,
  sourceHash: createHash("sha256").update(source).digest("hex"),
});
const buttonControl: ControlIR = { id: "Button1", type: "button", x: 0, y: 0, width: 120, height: 40, text: "Go" };
const compileButtonScripts = (scripts: Parameters<typeof compileControl>[3]) => compileControl(build, buttonControl, ctx, scripts);
const nativeNavigate = (id: string, ownerInstanceName = "Button1") => ({
  id: `kf$action:${id}`, sourceActionId: id, ownerInstanceName,
  kind: "navigate-page" as const,
  targetPageGuid: "k00000000-0000-4000-8000-000000000001",
});

function decodedModules(source: string) {
  const marker = "// kf-compiled-event/v1 ";
  const result: Array<{ metadata: Record<string, unknown>; body: string }> = [];
  let cursor = 0;
  while (true) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) return result;
    const newline = source.indexOf("\n", start);
    const metadata = JSON.parse(Buffer.from(source.slice(start + marker.length, newline), "base64url").toString("utf8")) as Record<string, unknown>;
    const bodyStartBytes = Buffer.byteLength(source.slice(0, newline + 1));
    const all = Buffer.from(source, "utf8");
    const body = all.subarray(bodyStartBytes, bodyStartBytes + Number(metadata["bodyByteLength"])).toString("utf8");
    result.push({ metadata, body });
    cursor = Buffer.from(source, "utf8").subarray(0, bodyStartBytes + Number(metadata["bodyByteLength"])).toString("utf8").length;
  }
}

describe("control compiler — compiled scripts", () => {
  it("keeps raw script serialization module-private", () => {
    expect(controlCompilerModule).not.toHaveProperty("serializeCompiledControlScripts");
  });

  it("preserves native actions and serializes an evidence-exact event chain in declared module order", () => {
    const first = scriptModule("first", "const first = 1;\n");
    const second = scriptModule("second", "const second = 2;\n");
    const out = compileControl(build, {
      id: "Button1", type: "button", x: 0, y: 0, width: 120, height: 40, text: "Go",
      action: { kind: "navigate", pageId: "detail" },
    }, ctx, {
      ownerInstanceName: "Button1", capabilityId: "button", modules: [second, first],
      bindings: [{
        id: "kf$binding:script-chain", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
        phase: "event", scriptModuleIds: ["kf$script:first", "kf$script:second"], nativeActionIds: [],
      }],
    });

    const links = (out["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList;
    expect(links[0]).toEqual({ action: "navigatePage", pageId: "kdetail" });
    expect(links[1]).toMatchObject({ linkId: 200001, enable: true, name: "onClick" });
    const serialized = decodedModules(String(links[1]!["script"]));
    expect(serialized.map((entry) => entry.body)).toEqual([first.source, second.source]);
    expect(serialized[0]!.metadata).toEqual({
      schema: "kf-compiled-event/v1", moduleId: first.id, sourceScriptId: first.sourceScriptId,
      bodySha256: first.sourceHash, bodyByteLength: Buffer.byteLength(first.source), ownerInstanceName: "Button1",
      placement: "event", kfEvent: "onClick", linkId: 200001, phase: "event",
      instanceReferences: first.instanceReferences, pageReferences: [],
    });
  });

  it("updates a reviewed native event slot in place without discarding its identity or sibling slot", () => {
    const first = scriptModule("first", "const first = 1;\n", "event", "Image1");
    const out = compileControl(build, {
      id: "Image1", type: "image", x: 0, y: 0, width: 120, height: 40, src: "safe.png",
    }, ctx, {
      ownerInstanceName: "Image1", capabilityId: "image", modules: [first], bindings: [{
        id: "kf$binding:script-first", ownerInstanceName: "Image1", kfEvent: "Load", linkId: 200001,
        phase: "event", scriptModuleIds: [first.id], nativeActionIds: [],
      }],
    });
    const links = (out["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList;
    expect(links[0]).toMatchObject({ linkId: 200001, enable: true, name: "Load" });
    expect(decodedModules(String(links[0]!["script"]))[0]!.body).toBe(first.source);
    expect(links[1]).toEqual({ linkId: 200002, enable: false, script: "", name: "Error" });
  });

  it("serializes distinct event groups in authoritative declaration order", () => {
    const zed = scriptModule("zed", "const zed = 1;\n");
    const alpha = scriptModule("alpha", "const alpha = 2;\n");
    const out = compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: [zed, alpha],
      bindings: [
        { id: "kf$binding:zed", ownerInstanceName: "Button1", kfEvent: "Zed", linkId: 200002,
          phase: "event", scriptModuleIds: [zed.id], nativeActionIds: [] },
        { id: "kf$binding:alpha", ownerInstanceName: "Button1", kfEvent: "Alpha", linkId: 200001,
          phase: "event", scriptModuleIds: [alpha.id], nativeActionIds: [] },
      ],
    });
    const links = (out.linkMng as { linkList: Array<Record<string, unknown>> }).linkList;
    expect(links.map((link) => link.name)).toEqual(["Zed", "Alpha"]);
  });

  it("preserves declared binding order across script-only, action-only, combined, and multi-action effects", () => {
    const firstScript = scriptModule("first-order", "const first = 1;\n");
    const combinedScript = scriptModule("combined-order", "const combined = 1;\n");
    const secondA = nativeNavigate("second-a");
    const secondB = nativeNavigate("second-b");
    const third = nativeNavigate("third");
    const out = controlCompilerModule.serializeReviewedNativeInteractions(
      compileControl(build, buttonControl, ctx),
      {
        ownerInstanceName: "Button1", capabilityId: "button",
        modules: [firstScript, combinedScript], actions: [secondA, secondB, third],
        bindings: [
          { id: "kf$binding:first-order", ownerInstanceName: "Button1", kfEvent: "First", linkId: 200001,
            phase: "event", scriptModuleIds: [firstScript.id], nativeActionIds: [] },
          { id: "kf$binding:second-order", ownerInstanceName: "Button1", kfEvent: "Second", linkId: 200002,
            phase: "event", scriptModuleIds: [], nativeActionIds: [secondA.id, secondB.id] },
          { id: "kf$binding:third-order", ownerInstanceName: "Button1", kfEvent: "Third", linkId: 200003,
            phase: "event", scriptModuleIds: [combinedScript.id], nativeActionIds: [third.id] },
        ],
      },
      { ownerInstanceName: "Button1", capabilityId: "button" },
    );
    const links = (out.linkMng as { linkList: Array<Record<string, unknown>> }).linkList;
    expect(links.map((link) => link.kfCompilerAction === undefined
      ? `script:${String(link.name)}`
      : `action:${String((link.kfCompilerAction as Record<string, unknown>)["sourceActionId"])}`))
      .toEqual(["script:First", "action:second-a", "action:second-b", "action:third", "script:Third"]);
  });

  it.each([
    ["script then action", true, ["script:event-script", "action:after-action"]],
    ["action then script", false, ["action:event-action", "script:after-script"]],
  ] as const)("preserves exact same-slot mixed-phase order: %s", (_label, scriptFirst, expected) => {
    const eventScript = scriptModule(scriptFirst ? "event-script" : "after-script", "const phase = 1;\n");
    const eventAction = nativeNavigate(scriptFirst ? "after-action" : "event-action");
    const bindings = scriptFirst ? [
      { id: "kf$binding:event-script", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
        phase: "event" as const, scriptModuleIds: [eventScript.id], nativeActionIds: [] },
      { id: "kf$binding:after-action", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
        phase: "after-event" as const, scriptModuleIds: [], nativeActionIds: [eventAction.id] },
    ] : [
      { id: "kf$binding:event-action", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
        phase: "event" as const, scriptModuleIds: [], nativeActionIds: [eventAction.id] },
      { id: "kf$binding:after-script", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
        phase: "after-event" as const, scriptModuleIds: [eventScript.id], nativeActionIds: [] },
    ];
    const out = controlCompilerModule.serializeReviewedNativeInteractions(
      compileControl(build, buttonControl, ctx),
      { ownerInstanceName: "Button1", capabilityId: "button", modules: [eventScript], actions: [eventAction], bindings },
      { ownerInstanceName: "Button1", capabilityId: "button" },
    );
    const effects = (out.linkMng as { linkList: Array<Record<string, unknown>> }).linkList
      .filter((link) => link["name"] === "onClick")
      .map((link) => {
        const marker = link["kfCompilerAction"] as Record<string, unknown> | undefined;
        if (marker !== undefined) return `action:${String(marker["sourceActionId"])}`;
        return `script:${String(decodedModules(String(link["script"]))[0]?.metadata["moduleId"]).replace("kf$script:", "")}`;
      });
    expect(effects).toEqual(expected);
  });

  it("fails closed when one KF event slot cannot represent declared script-action-script order", () => {
    const before = scriptModule("before", "const before = 1;\n");
    const after = scriptModule("after", "const after = 1;\n");
    const action = nativeNavigate("middle");
    expect(() => controlCompilerModule.serializeReviewedNativeInteractions(
      compileControl(build, buttonControl, ctx),
      {
        ownerInstanceName: "Button1", capabilityId: "button", modules: [before, after], actions: [action],
        bindings: [
          { id: "kf$binding:event", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
            phase: "event", scriptModuleIds: [before.id], nativeActionIds: [] },
          { id: "kf$binding:after", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
            phase: "after-event", scriptModuleIds: [after.id], nativeActionIds: [action.id] },
        ],
      },
      { ownerInstanceName: "Button1", capabilityId: "button" },
    )).toThrow(/UNREPRESENTABLE_KF_EVENT_EFFECT_ORDER.*onClick.*200001/);
  });

  it("rejects native action references without an authoritative actions table", () => {
    expect(() => compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: [], bindings: [{
        id: "kf$binding:missing-actions", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
        phase: "event", scriptModuleIds: [], nativeActionIds: ["kf$action:missing"],
      }],
    })).toThrow(/MODEL_OUTPUT_INVALID.*actions table/i);
  });

  it.each([
    ["event", (link: Record<string, unknown>) => { link["name"] = "Forged"; }],
    ["link", (link: Record<string, unknown>) => { link["linkId"] = 200099; }],
    ["action", (link: Record<string, unknown>) => { link["action"] = "setVariable"; }],
  ])("rejects an existing compiler action marker whose enclosing %s identity drifted", (_label, mutate) => {
    const action = nativeNavigate("old");
    const binding = { id: "kf$binding:old", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
      phase: "event" as const, scriptModuleIds: [], nativeActionIds: [action.id] };
    const first = controlCompilerModule.serializeReviewedNativeInteractions(
      compileControl(build, buttonControl, ctx),
      { ownerInstanceName: "Button1", capabilityId: "button", modules: [], actions: [action], bindings: [binding] },
      { ownerInstanceName: "Button1", capabilityId: "button" },
    );
    const link = (first.linkMng as { linkList: Array<Record<string, unknown>> }).linkList[0]!;
    mutate(link);
    expect(() => controlCompilerModule.serializeReviewedNativeInteractions(first,
      { ownerInstanceName: "Button1", capabilityId: "button", modules: [], actions: [action], bindings: [binding] },
      { ownerInstanceName: "Button1", capabilityId: "button" }))
      .toThrow(/MODEL_OUTPUT_INVALID.*action.*identity/i);
  });

  it("uses configureData only for a capability that explicitly supports it", () => {
    const configure = scriptModule("configure", "Datagrid1.SetData([]);\n", "configure-data", "Datagrid1");
    const configureOutput = compileControl(build, {
      id: "Datagrid1", type: "easyui", proto: 1, x: 0, y: 0, width: 320, height: 200,
    }, ctx, {
      ownerInstanceName: "Datagrid1", capabilityId: "easyui.1", modules: [configure], bindings: [],
    })["configureData"] as string;
    const configureSerialized = decodedModules(configureOutput);
    expect(configureSerialized[0]!.body).toBe(configure.source);
    expect(configureSerialized[0]!.metadata).toMatchObject({ placement: "configure-data", kfEvent: null, linkId: null, phase: null });
    const buttonConfigure = scriptModule("button-configure", "Button1.SetData([]);\n", "configure-data");
    expect(() => compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: [buttonConfigure], bindings: [],
    })).toThrow(/MODEL_OUTPUT_INVALID.*configureData/);
    expect(() => compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "easyui.1", modules: [buttonConfigure], bindings: [],
    })).toThrow(/MODEL_OUTPUT_INVALID.*capability/);
  });

  it("fails closed on duplicate event phases, bad hashes, missing modules, and owner drift", () => {
    const first = scriptModule("first", "const first = 1;\n");
    const binding = {
      id: "kf$binding:script-first", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
      phase: "event" as const, scriptModuleIds: [first.id], nativeActionIds: [],
    };
    expect(() => compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: [first], bindings: [binding, { ...binding, id: "kf$binding:script-copy" }],
    })).toThrow(/MODEL_OUTPUT_INVALID.*duplicate/);
    expect(() => compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: [{ ...first, sourceHash: "0".repeat(64) }], bindings: [binding],
    })).toThrow(/MODEL_OUTPUT_INVALID.*hash/);
    expect(() => compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: [], bindings: [binding],
    })).toThrow(/MODEL_OUTPUT_INVALID.*missing/);
    expect(() => compileButtonScripts({
      ownerInstanceName: "Other1", capabilityId: "button", modules: [first], bindings: [binding],
    })).toThrow(/MODEL_OUTPUT_INVALID.*owner/);
  });

  it("bounds aggregate script fields and rejects hostile serialization descriptors without reading them", () => {
    const unicode = scriptModule("unicode", `//${"中".repeat(11_000)}`);
    const unicodeControl = compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: [unicode], bindings: [{
        id: "kf$binding:script-unicode", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
        phase: "event", scriptModuleIds: [unicode.id], nativeActionIds: [],
      }],
    });
    const unicodeField = ((unicodeControl["linkMng"] as { linkList: Array<{ script: string }> }).linkList[0]!).script;
    expect(unicodeField.length).toBeLessThanOrEqual(32_000);
    expect(Buffer.byteLength(unicodeField, "utf8")).toBeGreaterThan(32_000);

    const longA = scriptModule("long-a", `${"a;".repeat(8_100)}\n`);
    const longB = scriptModule("long-b", `${"b;".repeat(8_100)}\n`);
    expect(() => compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: [longA, longB], bindings: [{
        id: "kf$binding:script-long", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
        phase: "event", scriptModuleIds: [longA.id, longB.id], nativeActionIds: [],
      }],
    })).toThrow(/MODEL_OUTPUT_INVALID.*32000/);

    let reads = 0;
    const hostile = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostile, "modules", { enumerable: true, get() { reads += 1; return []; } });
    expect(() => compileButtonScripts(hostile as never))
      .toThrow(/MODEL_OUTPUT_INVALID.*serialization/);
    expect(reads).toBe(0);
  });

  it("binds serialization owner and capability to the ControlIR instead of caller claims", () => {
    const first = scriptModule("first", "const first = 1;\n");
    const serialization = {
      ownerInstanceName: "Button1", capabilityId: "button", modules: [first], bindings: [{
        id: "kf$binding:script-first", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
        phase: "event" as const, scriptModuleIds: [first.id], nativeActionIds: [],
      }],
    };
    expect(() => compileButtonScripts({ ...serialization, ownerInstanceName: "Other1" })).toThrow(/MODEL_OUTPUT_INVALID.*owner/);
    expect(() => compileButtonScripts({ ...serialization, capabilityId: "easyui.1" })).toThrow(/MODEL_OUTPUT_INVALID.*capability/);
  });

  it("deep-clones serialization arrays and inserts ASI-safe boundaries without changing existing bytes", () => {
    const first = scriptModule("first", "const first = 1;\n");
    let reads = 0;
    const hostileModules: unknown[] = [first];
    Object.defineProperty(hostileModules, "0", { enumerable: true, get() { reads += 1; return first; } });
    expect(() => compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: hostileModules as never, bindings: [],
    })).toThrow(/MODEL_OUTPUT_INVALID.*data properties/);
    expect(reads).toBe(0);

    for (const existing of ["[]", "() => ({})", "`template`", "value"]) {
      const existingModule = scriptModule("existing", existing);
      const out = compileButtonScripts({
        ownerInstanceName: "Button1", capabilityId: "button", modules: [first, existingModule], bindings: [{
          id: "kf$binding:script-first", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
          phase: "event", scriptModuleIds: [existingModule.id, first.id], nativeActionIds: [],
        }],
      });
      const source = ((out["linkMng"] as { linkList: Array<{ script: string }> }).linkList[0]!).script;
      expect(decodedModules(source).map((entry) => entry.body)).toEqual([existing, first.source]);
      expect(() => parse(source, { ecmaVersion: 2022 })).not.toThrow();
    }
  });

  it("replaces only validated compiler-owned event/configureData tails and preserves unrelated native bytes", () => {
    const oldEvent = scriptModule("old-event", "const oldEvent = 1;\n");
    const eventBinding = {
      id: "kf$binding:replace-event", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
      phase: "event" as const, scriptModuleIds: [oldEvent.id], nativeActionIds: [],
    };
    const first = compileButtonScripts({
      ownerInstanceName: "Button1", capabilityId: "button", modules: [oldEvent], bindings: [eventBinding],
    });
    const firstLinks = (first.linkMng as { linkList: Array<Record<string, unknown>> }).linkList;
    const event = firstLinks.find((link) => link.name === "onClick")!;
    event.script = `legacyEvent();\n;\n${String(event.script)}`;
    firstLinks.unshift({ action: "setVariable", variableId: "untouched", value: 1 });
    const newEvent = scriptModule("new-event", "const newEvent = 2;\n");
    const replaced = controlCompilerModule.serializeReviewedNativeInteractions(first, {
      ownerInstanceName: "Button1", capabilityId: "button", modules: [newEvent],
      bindings: [{ ...eventBinding, scriptModuleIds: [newEvent.id] }],
    }, { ownerInstanceName: "Button1", capabilityId: "button" });
    const replacedLinks = (replaced.linkMng as { linkList: Array<Record<string, unknown>> }).linkList;
    expect(replacedLinks[0]).toEqual({ action: "setVariable", variableId: "untouched", value: 1 });
    const replacedEvent = replacedLinks.find((link) => link.name === "onClick")!;
    expect(String(replacedEvent.script)).toMatch(/^legacyEvent\(\);\n;\n/);
    expect(decodedModules(String(replacedEvent.script)).map((entry) => entry.body)).toEqual([newEvent.source]);

    const oldConfigure = scriptModule("old-configure", "Datagrid1.SetData([]);\n", "configure-data", "Datagrid1");
    const datagrid = compileControl(build, {
      id: "Datagrid1", type: "easyui", proto: 1, x: 0, y: 0, width: 320, height: 200,
    }, ctx, {
      ownerInstanceName: "Datagrid1", capabilityId: "easyui.1", modules: [oldConfigure], bindings: [],
    });
    datagrid.configureData = `legacyConfigure();\n;\n${String(datagrid.configureData)}`;
    const newConfigure = scriptModule("new-configure", "Datagrid1.SetData([]);\n\n", "configure-data", "Datagrid1");
    const configured = controlCompilerModule.serializeReviewedNativeInteractions(datagrid, {
      ownerInstanceName: "Datagrid1", capabilityId: "easyui.1", modules: [newConfigure], bindings: [],
    }, { ownerInstanceName: "Datagrid1", capabilityId: "easyui.1" });
    expect(String(configured.configureData)).toMatch(/^legacyConfigure\(\);\n;\n/);
    expect(decodedModules(String(configured.configureData)).map((entry) => entry.body)).toEqual([newConfigure.source]);

    const removed = controlCompilerModule.serializeReviewedNativeInteractions(configured, {
      ownerInstanceName: "Datagrid1", capabilityId: "easyui.1", modules: [], bindings: [],
    }, { ownerInstanceName: "Datagrid1", capabilityId: "easyui.1" });
    expect(removed.configureData).toBe("legacyConfigure();");
    expect(decodedModules(String(removed.configureData))).toEqual([]);
  });
});

describe("control compiler — structured styles", () => {
  it("emits the two disabled native image event slots required by KF runtime", () => {
    const out = compileControl(build, {
      id: "Portrait",
      type: "image",
      x: 10,
      y: 20,
      width: 200,
      height: 160,
      src: "portrait.png",
    }, ctx);
    expect(out["linkMng"]).toEqual({ linkList: [
      { linkId: 200001, enable: false, script: "", name: "Load" },
      { linkId: 200002, enable: false, script: "", name: "Error" },
    ] });
  });

  it("serializes legacy KF controls with the flat size policy shape consumed at runtime", () => {
    const out = compileControl(build, {
      id: "RuntimeLabel",
      type: "text",
      x: 16,
      y: 24,
      width: 320,
      height: 48,
      text: "Visible in KF",
    }, ctx);

    expect(out["sizePolicy"]).toEqual([3, 3, 0, 0]);
    expect(out["fixedSize"]).toEqual([40, 30]);
  });

  it("compiles the same StyleSpec for a new IR button", () => {
    const out = compileControl(build, {
      id: "StyledButton",
      type: "button",
      x: 10,
      y: 20,
      width: 120,
      height: 40,
      text: "Save",
      style: {
        declarations: { backgroundColor: "#2563eb", borderRadius: 8 },
        states: {},
      },
    }, ctx);

    expect(out["backgroundColor"]).toBe("#2563eb");
    expect(out["styleDataNew"]).toContain("border-radius:8px");
  });

  it("rejects direct IR styles that contain unsupported declarations", () => {
    expect(() => compileControl(build, {
      id: "StyledButton",
      type: "button",
      x: 10,
      y: 20,
      width: 120,
      height: 40,
      text: "Save",
      style: {
        declarations: {},
        states: { error: { textColor: "#dc2626" } },
      },
    }, ctx)).toThrow("MODEL_OUTPUT_INVALID: UNSUPPORTED_STYLE_TOKEN");
  });

  it("wraps schema-valid invalid style values as model output errors", () => {
    expect(() => compileControl(build, {
      id: "StyledButton",
      type: "button",
      x: 10,
      y: 20,
      width: 120,
      height: 40,
      text: "Save",
      style: { declarations: { backgroundColor: "red" }, states: {} },
    }, ctx)).toThrow("MODEL_OUTPUT_INVALID: INVALID_STYLE_VALUE");
  });

  it("rejects an empty direct style for a preserve-only capability", () => {
    expect(() => compileControl(build, {
      id: "LegacyTable",
      type: "table",
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      style: { declarations: {}, states: {} },
    }, ctx)).toThrow(/MODEL_OUTPUT_INVALID: UNSUPPORTED_STYLE_CAPABILITY|STYLE_ADAPTER_UNAVAILABLE/);
  });
});

function easyui(overrides: Record<string, unknown> = {}): ControlIR {
  return {
    id: "Datagrid1",
    type: "easyui",
    x: 10,
    y: 20,
    width: 300,
    height: 200,
    proto: 1,
    ...overrides,
  } as unknown as ControlIR;
}

describe("control compiler — easyui controls (objectType=3)", () => {
  it("serializes the KF datagrid envelope (objectType/uiExtendType)", () => {
    const out = compileControl(build, easyui(), ctx);
    expect(out["type"]).toBeUndefined();
    expect(out["uiModelType"]).toBeUndefined();
    expect(out["objectType"]).toBe(3);
    expect(out["uiExtendType"]).toBe(1);
    expect(out["leftTopPt"]).toEqual({ x: 10, y: 20 });
    expect(out["width"]).toBe(300);
    expect(out["height"]).toBe(200);
    expect(out["name"]).toBe("Datagrid1");
    expect(out["guid"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("carries proto whitelist fields from the IR and template defaults", () => {
    const out = compileControl(build, easyui({ striped: true, pagination: true }), ctx);
    // 用户字段（白名单内）透传
    expect(out["striped"]).toBe(true);
    expect(out["pagination"]).toBe(true);
    // 模板静态默认值保留
    expect(out["pageSize"]).toBe(5);
    expect(out["pageList"]).toEqual([10, 20, 30, 40, 50]);
    expect(out["method"]).toBe("post");
    expect(out["version"]).toBe("2.0.0.1");
    expect(out["linkMng"]).toEqual({ linkList: [] });
  });

  it("never serializes complex data/columns content (configureData territory)", () => {
    const out = compileControl(
      build,
      easyui({ data: [{ id: 1, name: "x" }], columns: [[{ title: "A" }]] }),
      ctx,
    );
    // 模板默认空 data/queryParams（KF 加载必需，sidemenu/accordion 对 undefined data 崩溃），
    // 但用户传入的复杂内容（data 行/columns 定义）绝不序列化——走 configureData 脚本。
    expect(out["data"]).toEqual([]);
    expect(out["queryParams"]).toEqual({});
    expect("columns" in out).toBe(false);
    expect(out["data"]).not.toEqual([{ id: 1, name: "x" }]);
  });

  it("rejects unknown protos without a compiled template", () => {
    expect(() => compileControl(build, easyui({ proto: 99 }), ctx)).toThrow(ModelOutputInvalidError);
  });

  it("serializes a linkbutton with its string text field", () => {
    const out = compileControl(
      build,
      easyui({ id: "LinkButton1", proto: 2, width: 151, height: 50, text: "Go", toggle: false }),
      ctx,
    );
    expect(out["uiExtendType"]).toBe(2);
    expect(out["text"]).toBe("Go");
    expect(out["toggle"]).toBe(false);
    expect(out["plain"]).toBe(false);
  });

  it("serializes every proto with a template registered (coverage)", () => {
    const protos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29];
    for (const proto of protos) {
      const out = compileControl(
        build,
        easyui({ id: `E${proto}`, proto, width: 100, height: 50, x: 0, y: 0 }),
        ctx,
      );
      expect(out["uiExtendType"]).toBe(proto);
      // DateBox（proto 11）KF 序列化不带 objectType，其余 proto 均为 objectType=3
      expect(out["objectType"]).toBe(proto === 11 ? undefined : 3);
      expect(out["uiModelType"]).toBeUndefined();
    }
  });

  it("serializes a DateBox (proto 11) without objectType and with datebox fields", () => {
    const out = compileControl(
      build,
      easyui({ id: "DateBox1", proto: 11, width: 278, height: 30, value: "2023-11-07", panelWidth: 250 }),
      ctx,
    );
    // 与参考工程 DateBox 原生形态一致：无 objectType、有 uiExtendType=11
    expect(out["objectType"]).toBeUndefined();
    expect(out["uiExtendType"]).toBe(11);
    expect(out["uiModelType"]).toBeUndefined();
    expect(out["leftTopPt"]).toEqual({ x: 10, y: 20 });
    expect(out["value"]).toBe("2023-11-07");
    expect(out["panelWidth"]).toBe(250);
    // 模板默认值
    expect(out["panelHeight"]).toBe("auto");
    expect(out["sharedCalendar"]).toBe("");
    expect(out["currentText"]).toBe("Today");
    expect(out["closeText"]).toBe("Close");
    expect(out["okText"]).toBe("Ok");
  });
});

describe("control compiler — layout containers (objectType=2)", () => {
  it("serializes a horizontal layout with baseProperty geometry", () => {
    const layout = {
      id: "HorizontalLayout1",
      type: "layout",
      x: 0,
      y: 12,
      width: 300,
      height: 127.8,
      layoutType: 2,
    } as unknown as ControlIR;
    const out = compileControl(build, layout, ctx);
    expect(out["type"]).toBeUndefined();
    expect(out["uiModelType"]).toBeUndefined();
    expect(out["objectType"]).toBe(2);
    expect(out["layoutType"]).toBe(2);
    expect(out["baseProperty"]).toEqual({
      name: "HorizontalLayout1",
      guid: expect.stringMatching(/^[0-9a-f-]+$/),
      leftTopPt: { x: 0, y: 12 },
      width: 300,
      height: 127.8,
      styleData: "",
      styleDataNew: "",
      comment: "",
      lock: false,
      visible: true,
      memberAccess: true,
    });
    // 布局不合并 control 级 base-fields（comment/lock/visible 等在 baseProperty 内）
    expect("comment" in out).toBe(false);
    expect(out["version"]).toBe("2.0.0.1");
    expect(out["sizePolicy"]).toEqual([3, 3, 0, 0]);
  });

  it("stores reviewed layout styles in baseProperty so the KF runtime renders them", () => {
    const layout = {
      id: "StyledHorizontalLayout",
      type: "layout",
      x: 20,
      y: 30,
      width: 480,
      height: 240,
      layoutType: 2,
      style: {
        declarations: { backgroundColor: "#111827", borderRadius: 8, padding: 16 },
        states: {},
      },
    } as unknown as ControlIR;

    const out = compileControl(build, layout, ctx);
    const baseProperty = out["baseProperty"] as Record<string, unknown>;
    expect(baseProperty["backgroundColor"]).toBe("#111827");
    expect(baseProperty["styleDataNew"]).toContain("border-radius:8px");
    expect(baseProperty["styleDataNew"]).toContain("padding:16px");
    expect(out["backgroundColor"]).toBeUndefined();
    expect(out["styleDataNew"]).toBeUndefined();
  });

  it("carries nested children verbatim into insiderObjects and panels into dPanelsOption", () => {
    const child = {
      borderStyle: "",
      baseProperty: { name: "DockingLayout1", leftTopPt: { x: 11, y: 13 }, width: 278, height: 126 },
      layoutType: 5,
      objectType: 2,
    };
    const panel = { region: "center", width: 227, height: 82, split: false };
    const layout = {
      id: "HorizontalLayout1",
      type: "layout",
      x: 0,
      y: 12,
      width: 300,
      height: 127.8,
      layoutType: 2,
      children: [child],
      panels: [panel],
    } as unknown as ControlIR;
    const out = compileControl(build, layout, ctx);
    // 子对象补 guid（KF 要求 insiderObjects 子对象有 guid），其余字段原样保留
    const expectedChild = {
      ...child,
      baseProperty: { ...child.baseProperty, guid: deriveGuid(build, "child:HorizontalLayout1:DockingLayout1") },
    };
    expect(out["insiderObjects"]).toEqual([expectedChild]);
    expect(out["dPanelsOption"]).toEqual([panel]);
  });

  it("normalizes Docking dPanelsOption: size -> width/height per region (easyui ignores 'size')", () => {
    const layout = {
      id: "DockingLayout1",
      type: "layout",
      x: 12,
      y: 90,
      width: 1100,
      height: 560,
      layoutType: 5,
      panels: [
        { region: "north", size: 60, split: true },
        { region: "west", size: 180, split: true },
        { region: "center", size: 900 },
      ],
    } as unknown as ControlIR;
    const out = compileControl(build, layout, ctx);
    expect(out["dPanelsOption"]).toEqual([
      { region: "north", height: 60, split: true },
      { region: "west", width: 180, split: true },
      { region: "center", width: 1100, height: 560 },
    ]);
  });

  it("supports negative coordinates (KF Docking edge docking, x=-1)", () => {
    const layout = {
      id: "DockingLayout1",
      type: "layout",
      x: -1,
      y: 59,
      width: 1920,
      height: 1080,
      layoutType: 5,
    } as unknown as ControlIR;
    const out = compileControl(build, layout, ctx);
    expect((out["baseProperty"] as { leftTopPt: { x: number } }).leftTopPt.x).toBe(-1);
  });

  it("keeps child raw string fields untouched (no injection rejection inside nested JSON)", () => {
    const child = { styleDataNew: "#domId { color: red }", baseProperty: { name: "C" }, layoutType: 5 };
    const layout = {
      id: "L1",
      type: "layout",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      layoutType: 5,
      children: [child],
    } as unknown as ControlIR;
    const out = compileControl(build, layout, ctx);
    expect(out["insiderObjects"]).toEqual([
      { ...child, baseProperty: { name: "C", guid: deriveGuid(build, "child:L1:C") } },
    ]);
  });
});

describe("control compiler — KF special nodes (prototypeName dispatch)", () => {
  function special(overrides: Record<string, unknown> = {}): ControlIR {
    return {
      id: "Special1",
      type: "prototype",
      prototypeName: "TrendChart",
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      ...overrides,
    } as unknown as ControlIR;
  }

  it("serializes a CustomCharts envelope keeping pageProperty and JSON-string objects verbatim", () => {
    const objectsJson = '{"name":"echart","customChartsType":1,"option":{"title":{"text":"供气占比统计"}}}';
    const out = compileControl(
      build,
      special({
        id: "CustomCharts1",
        prototypeName: "CustomCharts",
        x: 5.13,
        y: 35.92,
        width: 396,
        height: 344,
        pageProperty: {
          name: "CustomCharts1",
          pagePos: { x: 5.13, y: 35.92 },
          pageSize: { width: 396, height: 344 },
          windowSize: { width: 1440, height: 900 },
        },
        objects: [objectsJson],
        modlePrototype: { name: "", guid: "k6842b85b", version: "1.0.0.1.1", type: 1 },
        region: "center",
        variableMng: [],
        bordershow: false,
      }),
      ctx,
    );
    // 绝不输出 type/uiModelType；objectType 由 prototypeName 特判
    expect(out["type"]).toBeUndefined();
    expect(out["uiModelType"]).toBeUndefined();
    expect(out["objectType"]).toBe(1);
    expect(out["prototypeName"]).toBe("CustomCharts");
    // pageProperty 保留 + 几何回写
    expect(out["pageProperty"]).toEqual({
      name: "CustomCharts1",
      pagePos: { x: 5.13, y: 35.92 },
      pageSize: { width: 396, height: 344 },
      windowSize: { width: 1440, height: 900 },
    });
    // objects 是 JSON 字符串，原样保留
    expect(out["objects"]).toEqual([objectsJson]);
    expect(typeof (out["objects"] as string[])[0]).toBe("string");
    expect(out["region"]).toBe("center");
    expect(out["variableMng"]).toEqual([]);
    expect(out["bordershow"]).toBe(false);
    expect(out["guid"]).toMatch(/^[0-9a-f-]+$/);
    // 模板公共静态字段
    expect(out["version"]).toBe("2.0.0.1.1");
    expect(out["securityPriority"]).toBe(1);
    expect(out["sizePolicy"]).toEqual([3, 3, 0, 0]);
    expect(out["linkMng"]).toEqual({ linkList: [] });
  });

  it("builds pageProperty from IR geometry when the IR has none", () => {
    const out = compileControl(
      build,
      special({
        id: "CustomCharts1",
        prototypeName: "CustomCharts",
        x: 5,
        y: 35,
        width: 396,
        height: 344,
      }),
      ctx,
    );
    expect(out["pageProperty"]).toEqual({
      name: "CustomCharts1",
      pagePos: { x: 5, y: 35 },
      pageSize: { width: 396, height: 344 },
    });
    expect(out["objectType"]).toBe(1);
  });

  it("serializes chart nodes with top-level geometry and passthrough title/areas", () => {
    const out = compileControl(
      build,
      special({
        id: "XYChart1",
        prototypeName: "XYChart",
        x: 89,
        y: 34,
        width: 749,
        height: 271,
        title: { show: true, text: "XYChart", position: 1 },
        areas: [{ top: 0, left: 0, width: 749, height: 253 }],
        chartComponentType: 5,
        boundRect: { x: 89, y: 34, width: 749, height: 271 },
        comment: "曲线",
      }),
      ctx,
    );
    expect(out["type"]).toBeUndefined();
    expect(out["uiModelType"]).toBeUndefined();
    expect("objectType" in out).toBe(false);
    expect(out["prototypeName"]).toBe("XYChart");
    expect(out["leftTopPt"]).toEqual({ x: 89, y: 34 });
    expect(out["width"]).toBe(749);
    expect(out["height"]).toBe(271);
    expect(out["title"]).toEqual({ show: true, text: "XYChart", position: 1 });
    expect(out["areas"]).toEqual([{ top: 0, left: 0, width: 749, height: 253 }]);
    expect(out["chartComponentType"]).toBe(5);
    expect(out["boundRect"]).toEqual({ x: 89, y: 34, width: 749, height: 271 });
    expect(out["comment"]).toBe("曲线");
    // name 兜底为 IR id
    expect(out["name"]).toBe("XYChart1");
  });

  it("backs up default title/areas for BarChart/PieChart (no jsonToObject guard)", () => {
    const out = compileControl(
      build,
      special({ id: "BarChart1", prototypeName: "BarChart", chartComponentType: 3 }),
      ctx,
    );
    expect(out["title"]).toEqual({ text: "BarChart", show: true });
    expect(out["areas"]).toEqual([]);
    // TrendChart/XYChart 有守卫：缺省不补
    const trend = compileControl(
      build,
      special({ id: "Trend1", prototypeName: "TrendChart" }),
      ctx,
    );
    expect(trend["title"]).toBeUndefined();
    expect(trend["areas"]).toBeUndefined();
  });

  it("serializes an AlarmWindow with top-level geometry and alarm fields", () => {
    const out = compileControl(
      build,
      special({
        id: "AlarmWindow1",
        prototypeName: "AlarmWindow",
        name: "AlarmWindow1",
        alarmWindowType: "实时报警窗",
        columns: [{ field: "alarmTime", title: "时间", width: 100, align: "center" }],
        dateSource: "KS",
        evalconfig: "",
        list: { rowHeight: 24 },
        titleName: "报警",
      }),
      ctx,
    );
    expect(out["type"]).toBeUndefined();
    expect(out["uiModelType"]).toBeUndefined();
    expect("objectType" in out).toBe(false);
    expect(out["prototypeName"]).toBe("AlarmWindow");
    expect(out["leftTopPt"]).toEqual({ x: 10, y: 20 });
    expect(out["width"]).toBe(300);
    expect(out["height"]).toBe(200);
    expect(out["alarmWindowType"]).toBe("实时报警窗");
    expect(out["columns"]).toEqual([{ field: "alarmTime", title: "时间", width: 100, align: "center" }]);
    expect(out["dateSource"]).toBe("KS");
    expect(out["evalconfig"]).toBe("");
    expect(out["list"]).toEqual({ rowHeight: 24 });
    expect(out["titleName"]).toBe("报警");
    expect(out["name"]).toBe("AlarmWindow1");
  });

  it("rejects unknown prototypeName values", () => {
    expect(() =>
      compileControl(build, special({ prototypeName: "FooChart" }), ctx),
    ).toThrow(ModelOutputInvalidError);
  });
});

// ---------------------------------------------------------------------------
// Golden alignment: compile IR derived from REAL reference-project objects and
// assert the serialized KF structure matches the reference layout.
// ---------------------------------------------------------------------------
const REF_DIR = "/tmp/kf_ref/1.0.0.1/project/page";

describe.skipIf(!existsSync(REF_DIR))("golden alignment with the reference project (/tmp/kf_ref)", () => {
  // Optional external KF fixtures have heterogeneous native object shapes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function loadReferenceObject(pageFile: string, predicate: (o: Record<string, any>) => boolean) {
    const page = JSON.parse(await readFile(path.join(REF_DIR, pageFile), "utf8"));
    return page["objects"].find(predicate);
  }

  it("round-trips a real datagrid (数据列表3.json / Datagrid1)", async () => {
    const ref = await loadReferenceObject("数据列表3.json", (o) => o.name === "Datagrid1");
    expect(ref, "reference datagrid not found").toBeDefined();
    const ir = {
      id: ref.name,
      type: "easyui",
      x: ref.leftTopPt.x,
      y: ref.leftTopPt.y,
      width: ref.width,
      height: ref.height,
      proto: ref.uiExtendType,
      striped: ref.striped,
      pagination: ref.pagination,
      pageSize: ref.pageSize,
      pageList: ref.pageList,
      sortOrder: ref.sortOrder,
    } as unknown as ControlIR;
    const out = compileControl(build, ir, ctx);
    // 结构对齐：契约枚举 + 几何 + name/guid 推导
    expect(out["objectType"]).toBe(ref.objectType);
    expect(out["uiExtendType"]).toBe(ref.uiExtendType);
    expect(out["leftTopPt"]).toEqual(ref.leftTopPt);
    expect(out["width"]).toBe(ref.width);
    expect(out["height"]).toBe(ref.height);
    expect(out["name"]).toBe(ref.name);
    // 白名单用户字段与参考对象一致
    expect(out["striped"]).toBe(ref.striped);
    expect(out["pagination"]).toBe(ref.pagination);
    expect(out["pageSize"]).toBe(ref.pageSize);
    expect(out["pageList"]).toEqual(ref.pageList);
    expect(out["sortOrder"]).toBe(ref.sortOrder);
    expect(out["method"]).toBe(ref.method);
    // 参考对象字段集中除了任务契约新增的 type/uiModelType 之外都来自模板
    const allowedExtra = new Set(["type", "uiModelType"]);
    for (const key of Object.keys(out)) {
      if (key in ref || allowedExtra.has(key)) continue;
      expect.fail(`compiled datagrid carries unexpected field "${key}"`);
    }
  });

  it("round-trips a real layout container (区域布局.json / HorizontalLayout1)", async () => {
    const ref = await loadReferenceObject("区域布局.json", (o) => o.layoutType === 2 && o.baseProperty?.name === "HorizontalLayout1");
    expect(ref, "reference horizontal layout not found").toBeDefined();
    const ir = {
      id: ref.baseProperty.name,
      type: "layout",
      x: ref.baseProperty.leftTopPt.x,
      y: ref.baseProperty.leftTopPt.y,
      width: ref.baseProperty.width,
      height: ref.baseProperty.height,
      layoutType: ref.layoutType,
      children: ref.insiderObjects,
      panels: ref.dPanelsOption,
    } as unknown as ControlIR;
    const out = compileControl(build, ir, ctx);
    expect(out["objectType"]).toBe(ref.objectType);
    expect(out["layoutType"]).toBe(ref.layoutType);
    expect(out["baseProperty"]).toEqual({
      ...ref.baseProperty,
      guid: expect.stringMatching(/^k?[0-9a-f-]+$/),
    });
    // Generative compilation owns nested identities and derives the child GUID;
    // every non-identity byte remains aligned with the reference input.
    const originalChildGuid = ref.insiderObjects[0].baseProperty.guid;
    expect(out["insiderObjects"]).toEqual([{
      ...ref.insiderObjects[0],
      baseProperty: {
        ...ref.insiderObjects[0].baseProperty,
        guid: deriveGuid(build, `child:${ref.baseProperty.name}:${ref.insiderObjects[0].baseProperty.name}`),
      },
    }]);
    expect(ref.insiderObjects[0].baseProperty.guid).toBe(originalChildGuid);
    expect(out["dPanelsOption"]).toEqual(ref.dPanelsOption);
    expect(out["version"]).toBe(ref.version);
  });

  it("auto-assigns guids to layout children missing them (KF requires indexed children)", () => {
    // LLM 生成的布局 children（KF JSON 透传）可能不带 guid——inspect 无法索引、
    // LLM 无法引用修改。compileLayoutControl 必须给 easyui 子控件补顶层 guid、
    // 给嵌套布局补 baseProperty.guid（参考工程均有 guid）。
    const out = compileControl(
      build,
      {
        id: "DockingLayout1",
        type: "layout",
        x: 12, y: 90, width: 1100, height: 560,
        layoutType: 5,
        children: [
          { objectType: 3, uiExtendType: 26, name: "SideMenu1", region: "west", width: 180, height: 540 },
          { objectType: 3, uiExtendType: 1, name: "Datagrid1", region: "center", width: 900, height: 540 },
          {
            objectType: 2, layoutType: 4,
            baseProperty: { name: "VerticalLayout1", leftTopPt: { x: 0, y: 0 }, width: 300, height: 200 },
            insiderObjects: [
              { objectType: 3, uiExtendType: 2, name: "Btn1", leftTopPt: { x: 0, y: 0 }, width: 80, height: 30 },
            ],
          },
        ],
        panels: [
          { region: "west", size: 180, split: true },
          { region: "center", size: 900 },
        ],
      } as unknown as ControlIR,
      ctx,
    );
    const children = out["insiderObjects"] as Array<Record<string, unknown>>;
    expect(children).toHaveLength(3);
    // easyui 子控件补顶层 guid
    expect(children[0]!["guid"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(children[1]!["guid"]).toMatch(/^[0-9a-f-]{36}$/);
    // 嵌套布局补 baseProperty.guid 且递归补内部子控件 guid
    const nested = children[2] as Record<string, unknown>;
    const nestedBp = nested["baseProperty"] as Record<string, unknown>;
    expect(nestedBp["guid"]).toMatch(/^[0-9a-f-]{36}$/);
    const nestedInner = nested["insiderObjects"] as Array<Record<string, unknown>>;
    expect(nestedInner[0]!["guid"]).toMatch(/^[0-9a-f-]{36}$/);
    // 同名子控件在不同父布局下 guid 不同（parentId 参与派生）
    const out2 = compileControl(
      build,
      {
        id: "HorizontalLayout1",
        type: "layout",
        x: 12, y: 670, width: 1100, height: 200,
        layoutType: 2,
        children: [{ objectType: 3, uiExtendType: 1, name: "Datagrid1", internalVertex: { left: 0, top: 0 }, width: 540, height: 190 }],
      } as unknown as ControlIR,
      ctx,
    );
    const c2 = (out2["insiderObjects"] as Array<Record<string, unknown>>)[0]!;
    expect(c2["guid"]).not.toBe(children[1]!["guid"]);
  });
});
