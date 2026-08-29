import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getScriptCapabilityProfile,
  listScriptCapabilityProfiles,
  requireScriptCapabilityProfile,
} from "./script-capability-registry.js";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const baselineProfiles = listScriptCapabilityProfiles();

function resolveEvidence(ref: string): { readonly file: string; readonly fragment: string | undefined } {
  const [relativePath, fragment] = ref.split("#", 2);
  return { file: path.resolve(REPOSITORY_ROOT, relativePath!), fragment };
}

function readEvidenceContent(ref: string): string {
  const { file, fragment } = resolveEvidence(ref);
  if (fragment === undefined) return readFileSync(file, "utf8");
  let value: unknown = JSON.parse(readFileSync(file, "utf8"));
  for (const segment of fragment.split(".")) {
    if (value === null || typeof value !== "object") throw new Error(`evidence fragment not found: ${ref}`);
    value = (value as Record<string, unknown>)[segment];
  }
  if (typeof value !== "string") throw new Error(`evidence fragment is not string content: ${ref}`);
  return value;
}

function objectAt(value: unknown, pathSegments: readonly (string | number)[]): Record<string, unknown> {
  let current = value;
  for (const segment of pathSegments) {
    if (current === null || typeof current !== "object") throw new Error(`object path not found: ${pathSegments.join(".")}`);
    current = (current as Record<string | number, unknown>)[segment];
  }
  if (current === null || typeof current !== "object" || Array.isArray(current)) throw new Error(`object path is not a record: ${pathSegments.join(".")}`);
  return current as Record<string, unknown>;
}

describe("script capability knowledge", () => {
  it("records every phase-one control even when behavior is only planned", () => {
    expect(listScriptCapabilityProfiles()).toHaveLength(26);
  });

  it("ties supported select events to the native template", () => {
    const select = requireScriptCapabilityProfile("select");
    expect(select.events.map((event) => event.kfEvent)).toEqual([
      "Change", "visible-Change", "Remove-Tag", "Clear", "Blur", "Focus",
    ]);
    expect(select.events.every((event) => event.evidence.some((item) =>
      item.ref === "agent-app/packages/domain-client/src/templates/control-templates/select.json#connectArray",
    ))).toBe(true);
  });

  it("binds the Select read to an exact active GetCheckedNodes product script", () => {
    const method = requireScriptCapabilityProfile("select").methods.find((candidate) => candidate.semanticMethod === "read-value");
    expect(method).toMatchObject({
      kfMethod: "GetCheckedNodes",
      availability: "supported",
      parameters: [],
      returns: "unknown",
    });
    expect(method?.evidence).toEqual([{
      kind: "product-source",
      ref: "KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/e4dbfd40-2359-11f1-a6b7-99f0fd275345/pagerecord/recordpages/历史报警120240306091033.json#linkMng.linkList.3.script",
      contentSha256: "6c4badcb9b32bf8e2273ef992258c04bb844e87a913705128c6cb92c35c7e4d8",
    }]);
    const source = readEvidenceContent(method!.evidence[0]!.ref);
    expect(createHash("sha256").update(source).digest("hex")).toBe(method!.evidence[0]!.contentSha256);
    expect(source).toContain("var tag_comment = Select1.GetCheckedNodes();");
    const { file } = resolveEvidence(method!.evidence[0]!.ref);
    const page = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const select = objectAt(page, ["objects", 0, "insiderObjects", 0, "insiderObjects", 0, "insiderObjects", 0,
      "insiderObjects", 0, "insiderObjects", 0, "insiderObjects", 1]);
    expect(select).toMatchObject({ name: "Select1", uiModelType: 44 });
    expect((select["linkMng"] as { linkList: Array<{ name: string }> }).linkList.map((entry) => entry.name))
      .toEqual(["Change", "visible-Change", "Remove-Tag", "Clear", "Blur", "Focus"]);
  });

  it("preserves the reviewed image event identifiers from the native template", () => {
    expect(requireScriptCapabilityProfile("image").events).toMatchObject([
      { semanticEvent: "load", kfEvent: "Load", linkId: 200001 },
      { semanticEvent: "error", kfEvent: "Error", linkId: 200002 },
    ]);
  });

  it("records the reviewed button restricted actions", () => {
    const button = requireScriptCapabilityProfile("button");
    expect(button.actions.map((action) => action.semanticAction)).toEqual([
      "navigate-page", "set-variable", "open-dialog", "close-dialog",
    ]);
    expect(button.actions.every((action) => action.implementation === "restricted-action")).toBe(true);
    expect(button.actions.filter((action) => action.availability === "supported")
      .map((action) => action.semanticAction)).toEqual(["navigate-page", "set-variable", "open-dialog", "close-dialog"]);
  });

  it("binds overlay visibility to the exact reviewed KF layout setVisible runtime evidence", () => {
    const expectedEvidence = {
      kind: "product-source",
      ref: "KingFusion3.6_Node/kingexedb/kingclient/exe/public/javascripts/Common/Graphic/Layout/kmui_layoutcomponentbase.js",
      contentSha256: "04831c1bd9feb0d19eaac07e0aee5af7df07bd4fba8072b6630dd1c4689b0aff",
    };
    for (const capabilityId of ["layout.2", "layout.4", "layout.5"]) {
      const profile = requireScriptCapabilityProfile(capabilityId);
      expect(profile.availability).toBe("supported");
      expect(profile.actions).toEqual([
        expect.objectContaining({ semanticAction: "open-dialog", implementation: "restricted-action", availability: "supported", evidence: [expectedEvidence] }),
        expect.objectContaining({ semanticAction: "close-dialog", implementation: "restricted-action", availability: "supported", evidence: [expectedEvidence] }),
      ]);
      expect(profile.methods).toEqual([
        expect.objectContaining({ semanticMethod: "set-visible", kfMethod: "setVisible", parameters: ["visible"], returns: "void", availability: "supported", evidence: [expectedEvidence] }),
      ]);
      expect(profile.properties).toEqual([]);
      const runtimeSource = readEvidenceContent(expectedEvidence.ref);
      expect(runtimeSource).toContain("KMLayoutCompBase.prototype.setVisible=function(e){e?this.thisElement.style.display=\"\":this.thisElement.style.display=\"none\",this.visible=e}");
      expect(runtimeSource).not.toContain('defineScriptProperty(this,"Visible"');
    }
  });

  it("promotes the exact product-evidenced button click trigger", () => {
    const click = requireScriptCapabilityProfile("button").events.find((event) => event.semanticEvent === "click");
    expect(click).toMatchObject({ kfEvent: "onClick", linkId: 200001, availability: "supported", arguments: [] });
    expect(click?.evidence).toEqual([{
      kind: "product-source",
      ref: "KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/9fdd3be0-2d91-11f1-b60a-4937cd79e5a1/pagerecord/recordpages/数据模型管理_属性定义20230511104433.json#objects.0.insiderObjects.0.insiderObjects.0.insiderObjects.4.linkMng.linkList.0.script",
      contentSha256: "5e1d9bef9570288238adbb8dfa6bfc2be3ec04c7105b11b4caedbd6fe35e2088",
    }]);
  });

  it("fails the button click evidence predicate for host, spelling, link, or content drift", () => {
    const evidence = requireScriptCapabilityProfile("button").events.find((event) => event.semanticEvent === "click")!.evidence[0]!;
    const { file } = resolveEvidence(evidence.ref);
    const page = JSON.parse(readFileSync(file, "utf8")) as {
      objects: Array<{ insiderObjects: Array<{ insiderObjects: Array<{ insiderObjects: Array<{
        name: string; uiModelType: number; linkMng: { linkList: Array<{ name: string; linkId: number; script: string }> };
      }> }> }> }>;
    };
    const button = page.objects[0]!.insiderObjects[0]!.insiderObjects[0]!.insiderObjects[4]!;
    const matches = (candidate: typeof button): boolean => {
      const event = candidate.linkMng.linkList[0];
      return candidate.name === "Button1"
        && candidate.uiModelType === 35
        && event?.name === "onClick"
        && event.linkId === 200001
        && createHash("sha256").update(event.script).digest("hex") === evidence.contentSha256;
    };
    expect(matches(button)).toBe(true);
    expect(matches({ ...button, name: "Input1" })).toBe(false);
    expect(matches({ ...button, uiModelType: 38 })).toBe(false);
    expect(matches({ ...button, linkMng: { linkList: [{ ...button.linkMng.linkList[0]!, name: "OnClick" }] } })).toBe(false);
    expect(matches({ ...button, linkMng: { linkList: [{ ...button.linkMng.linkList[0]!, linkId: 200002 }] } })).toBe(false);
    expect(matches({ ...button, linkMng: { linkList: [{ ...button.linkMng.linkList[0]!, script: "$Variable.other = true" }] } })).toBe(false);
  });

  it("promotes only the exact input read and datagrid write capabilities", () => {
    const input = requireScriptCapabilityProfile("input");
    expect(input.availability).toBe("supported");
    expect(input.properties).toEqual([expect.objectContaining({
      semanticProperty: "value", kfProperty: "Value", readable: true, writable: false, availability: "supported",
    })]);

    const table = requireScriptCapabilityProfile("easyui.1");
    expect(table.availability).toBe("supported");
    expect(table.methods).toMatchObject([
      { semanticMethod: "set-data", kfMethod: "SetData", availability: "supported" },
      { semanticMethod: "get-data", kfMethod: "GetData", availability: "planned" },
      { semanticMethod: "get-selected", kfMethod: "GetSelected", availability: "planned" },
    ]);
  });

  it("pins Datagrid SetData to the exact objectType=3/uiExtendType=1 product target", () => {
    const inputEvidence = requireScriptCapabilityProfile("input").properties[0]!.evidence[0]!;
    const datagridEvidence = requireScriptCapabilityProfile("easyui.1").methods[0]!.evidence[0]!;
    expect(datagridEvidence).not.toEqual(inputEvidence);
    const { file, fragment } = resolveEvidence(datagridEvidence.ref);
    expect(fragment).toBe("objects.2.linkMng.linkList.0.script");
    const page = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const datagridPath = ["objects", 6] as const;

    const matches = (candidate: Record<string, unknown>): boolean => {
      const event = objectAt(candidate, ["objects", 2, "linkMng", "linkList", 0]);
      const datagrid = objectAt(candidate, datagridPath);
      const script = event.script;
      return event.name === "onClick"
        && event.linkId === 200001
        && datagrid.name === "Datagrid1"
        && datagrid.objectType === 3
        && datagrid.uiExtendType === 1
        && typeof script === "string"
        && script.includes("Datagrid1.SetData(a);")
        && createHash("sha256").update(script).digest("hex") === datagridEvidence.contentSha256;
    };
    expect(matches(page)).toBe(true);
    for (const mutate of [
      (candidate: Record<string, unknown>) => { objectAt(candidate, datagridPath).name = "Table1"; },
      (candidate: Record<string, unknown>) => { objectAt(candidate, datagridPath).objectType = 2; },
      (candidate: Record<string, unknown>) => { objectAt(candidate, datagridPath).uiExtendType = 2; },
      (candidate: Record<string, unknown>) => { objectAt(candidate, ["objects", 2, "linkMng", "linkList", 0]).name = "Click"; },
      (candidate: Record<string, unknown>) => { objectAt(candidate, ["objects", 2, "linkMng", "linkList", 0]).script = "Datagrid1.SetData([]);"; },
    ]) {
      const candidate = structuredClone(page);
      mutate(candidate);
      expect(matches(candidate)).toBe(false);
    }
  });

  it("maps semantic row click only to the exact evidenced onClickRow record argument", () => {
    const event = requireScriptCapabilityProfile("easyui.1").events.find((candidate) => candidate.semanticEvent === "row-click");
    expect(event).toMatchObject({
      kfEvent: "onClickRow",
      linkId: 200024,
      availability: "supported",
      arguments: [
        { name: "record", position: 3, valueKind: "record" },
      ],
    });
    expect(requireScriptCapabilityProfile("easyui.1").events.some((candidate) =>
      candidate.semanticEvent === "selection-change" || candidate.kfEvent === "Selection-change",
    )).toBe(false);
  });

  it("pins onClickRow record position and kind to the exact Datagrid1 product event", () => {
    const eventProfile = requireScriptCapabilityProfile("easyui.1").events.find((candidate) => candidate.semanticEvent === "row-click")!;
    const evidence = eventProfile.evidence[0]!;
    const { file, fragment } = resolveEvidence(evidence.ref);
    expect(fragment).toBe("objects.0.linkMng.linkList.23.script");
    const page = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const hostPath = ["objects", 0] as const;
    const matches = (candidate: Record<string, unknown>, position = 3, valueKind = "record"): boolean => {
      const host = objectAt(candidate, hostPath);
      const event = objectAt(host, ["linkMng", "linkList", 23]);
      return host.name === "Datagrid1"
        && host.objectType === 3
        && host.uiExtendType === 1
        && event.name === "onClickRow"
        && event.linkId === 200024
        && position === eventProfile.arguments[0]?.position
        && valueKind === eventProfile.arguments[0]?.valueKind
        && typeof event.script === "string"
        && event.script.includes("arguments[3]")
        && createHash("sha256").update(event.script).digest("hex") === evidence.contentSha256;
    };
    expect(matches(page)).toBe(true);
    const mutations: Array<(candidate: Record<string, unknown>) => void> = [
      (candidate) => { objectAt(candidate, hostPath).name = "Table1"; },
      (candidate) => { objectAt(candidate, hostPath).objectType = 2; },
      (candidate) => { objectAt(candidate, hostPath).uiExtendType = 2; },
      (candidate) => { objectAt(objectAt(candidate, hostPath), ["linkMng", "linkList", 23]).name = "onClickCell"; },
      (candidate) => { objectAt(objectAt(candidate, hostPath), ["linkMng", "linkList", 23]).linkId = 200026; },
      (candidate) => { objectAt(objectAt(candidate, hostPath), ["linkMng", "linkList", 23]).script = "console.log(arguments[4])"; },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(page);
      mutate(candidate);
      expect(matches(candidate)).toBe(false);
    }
    expect(matches(page, 1, "record")).toBe(false);
    expect(matches(page, 3, "scalar")).toBe(false);
  });

  it("pins every new supported product claim to its exact matched string content", () => {
    const supportedProductEvidence = ["button", "input", "easyui.1"].flatMap((capabilityId) => {
      const profile = requireScriptCapabilityProfile(capabilityId);
      return [...profile.events, ...profile.methods, ...profile.properties]
        .filter((member) => member.availability === "supported")
        .flatMap((member) => member.evidence.filter((item) => item.kind === "product-source"));
    });
    expect(supportedProductEvidence.length).toBeGreaterThanOrEqual(4);
    for (const evidence of supportedProductEvidence) {
      expect(evidence.contentSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(createHash("sha256").update(readEvidenceContent(evidence.ref)).digest("hex"))
        .toBe(evidence.contentSha256);
    }
  });

  it("ties each supported button action to its own compiler regression evidence", () => {
    const compilerTestPath = "agent-app/packages/domain-client/src/compile/client-compiler.test.ts";
    const expectedTestRefs = {
      "navigate-page": `${compilerTestPath}#navigatePage`,
      "set-variable": `${compilerTestPath}#setVariable`,
    } as const;
    const button = requireScriptCapabilityProfile("button");

    for (const [semanticAction, expectedRef] of Object.entries(expectedTestRefs)) {
      const action = button.actions.find((candidate) => candidate.semanticAction === semanticAction);
      const otherRef = Object.values(expectedTestRefs).find((ref) => ref !== expectedRef);
      expect(action?.evidence.map((item) => item.ref)).toContain(expectedRef);
      expect(action?.evidence.map((item) => item.ref)).not.toContain(otherRef);

      const { file, fragment } = resolveEvidence(expectedRef);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8")).toContain(fragment);
    }
  });

  it("keeps unevidenced datagrid reads planned after promoting SetData", () => {
    const table = requireScriptCapabilityProfile("easyui.1");
    expect(table.methods.filter((method) => method.availability === "planned").map((method) => method.semanticMethod))
      .toEqual(["get-data", "get-selected"]);
  });

  it("gives every supported member repository evidence", () => {
    for (const profile of baselineProfiles) {
      for (const member of [...profile.actions, ...profile.events, ...profile.methods]) {
        if (member.availability !== "supported") continue;
        expect(member.evidence.length).toBeGreaterThan(0);
        for (const evidence of member.evidence) {
          expect(existsSync(resolveEvidence(evidence.ref).file)).toBe(true);
        }
      }
    }
  });

  it("ties each supported template event to a real template field and event value", () => {
    for (const profile of baselineProfiles) {
      for (const event of profile.events.filter((member) => member.availability === "supported")) {
        for (const evidence of event.evidence.filter((item) => item.kind === "template")) {
          const { file, fragment } = resolveEvidence(evidence.ref);
          expect(fragment).toBeDefined();
          const template = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
          expect(template).toHaveProperty(fragment!);

          if (fragment === "connectArray") {
            expect(template[fragment]).toContain(event.kfEvent);
          } else if (fragment === "linkMng") {
            const links = (template[fragment] as { linkList: readonly Record<string, unknown>[] }).linkList;
            expect(links).toContainEqual(expect.objectContaining({ name: event.kfEvent, linkId: event.linkId }));
          }
        }
      }
    }
  });

  it("preserves checkbox and tabs template event ordering", () => {
    expect(requireScriptCapabilityProfile("checkbox").events.map((event) => event.kfEvent)).toEqual(["Change"]);
    expect(requireScriptCapabilityProfile("tabs").events.map((event) => event.kfEvent)).toEqual([
      "Tab-click", "Tab-remove", "Tab-add", "Edit",
    ]);
  });

  it("does not invent link identifiers for connectArray events", () => {
    for (const profile of baselineProfiles) {
      for (const event of profile.events) {
        if (event.evidence.some((evidence) => evidence.ref.endsWith("#connectArray"))) {
          expect(event.linkId).toBeUndefined();
        }
      }
    }
  });

  it("limits configureData support to the reviewed EasyUI control family", () => {
    for (const profile of baselineProfiles) {
      expect(profile.initialization.supportsConfigureData).toBe(profile.capabilityId.startsWith("easyui."));
    }
  });

  it("returns undefined for an optional absent lookup and identifies required lookup failures", () => {
    expect(getScriptCapabilityProfile("prototype.Unknown")).toBeUndefined();
    expect(() => requireScriptCapabilityProfile("prototype.Unknown"))
      .toThrow("SCRIPT_CAPABILITY_PROFILE_NOT_FOUND: prototype.Unknown");
  });
});
