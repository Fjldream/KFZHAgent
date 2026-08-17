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

  it("preserves the reviewed image event identifiers from the native template", () => {
    expect(requireScriptCapabilityProfile("image").events).toMatchObject([
      { semanticEvent: "load", kfEvent: "Load", linkId: 200001 },
      { semanticEvent: "error", kfEvent: "Error", linkId: 200002 },
    ]);
  });

  it("records the reviewed button restricted actions", () => {
    const button = requireScriptCapabilityProfile("button");
    expect(button.actions.map((action) => action.semanticAction)).toEqual([
      "navigate-page", "set-variable", "open-dialog",
    ]);
    expect(button.actions.every((action) => action.implementation === "restricted-action")).toBe(true);
    expect(button.actions.find((action) => action.semanticAction === "open-dialog")?.availability)
      .toBe("planned");
    expect(button.actions.filter((action) => action.availability === "supported")
      .map((action) => action.semanticAction)).toEqual(["navigate-page", "set-variable"]);
  });

  it("does not claim planned datagrid methods as supported", () => {
    const table = requireScriptCapabilityProfile("easyui.1");
    expect(table.availability).toBe("planned");
    expect(table.methods.every((method) => method.availability === "planned")).toBe(true);
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
      if (profile.capabilityId === "image") continue;
      expect(profile.events.every((event) => event.linkId === undefined)).toBe(true);
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
