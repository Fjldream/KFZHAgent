import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as runtimeProfileModule from "./runtime-profile.js";
import {
  KF36_RUNTIME_PROFILE,
  isTrustedKF36RuntimeProfile,
  isTrustedKF36StylePart,
  verifySelectorSourceBytes,
} from "./runtime-profile.js";

const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

function simulateEvidencedKFSetStyleFormat(styleData: string, componentDomId: string): string {
  return styleData.replace(/domId/g, componentDomId);
}

describe("KF 3.6 runtime style profile", () => {
  it("owns the exact reviewed semantic-part selector inventory", () => {
    const expectedParts = {
      button: ["root"],
      input: ["root", "input", "placeholder"],
      inputnumber: ["root", "input", "indicator", "placeholder"],
      select: ["root", "input", "indicator", "placeholder"],
      tabs: ["root", "tab", "active-indicator", "panel"],
      "easyui.1": ["root", "header", "row", "cell"],
      tree: ["root", "node"],
      list: ["root", "item"],
      image: ["root", "media"],
      tag: ["root", "label", "icon"],
      navmenu: ["root", "item", "group"],
      "easyui.12": ["root", "header", "content"],
      "easyui.19": ["root", "header", "content"],
      "layout.2": ["root"],
      "layout.4": ["root"],
      "layout.5": ["root"],
      "layout.6": ["root"],
    } as const;

    for (const [capabilityId, semanticParts] of Object.entries(expectedParts)) {
      expect(Object.keys(KF36_RUNTIME_PROFILE.selectors[capabilityId]!.parts)).toEqual(semanticParts);
      semanticParts.forEach((semanticPart) => {
        expect(isTrustedKF36StylePart(
          KF36_RUNTIME_PROFILE.selectors[capabilityId]!.parts[semanticPart]!,
        )).toBe(true);
      });
    }
  });

  it("pins every promoted selector to an existing template, exact template fields, and product source markers", () => {
    for (const roles of Object.values(KF36_RUNTIME_PROFILE.selectors)) {
      for (const part of Object.values(roles.parts)) {
        const templatePath = `${repositoryRoot}${part.evidence.templatePath}`;
        const runtimePath = `${repositoryRoot}${part.evidence.runtimePath}`;
        const selectorSourcePath = `${repositoryRoot}${part.evidence.selectorSourcePath}`;
        expect(existsSync(templatePath), templatePath).toBe(true);
        expect(existsSync(runtimePath), runtimePath).toBe(true);
        expect(existsSync(selectorSourcePath), selectorSourcePath).toBe(true);

        const template = JSON.parse(readFileSync(templatePath, "utf8")) as Readonly<Record<string, string | number | boolean>>;
        for (const [field, value] of Object.entries(part.evidence.templateFields)) {
          expect(template[field], `${templatePath}#${field}`).toBe(value);
        }
        const runtimeSource = readFileSync(runtimePath, "utf8");
        part.evidence.runtimeMarkers.forEach((marker) =>
          expect(runtimeSource, `${runtimePath}#${marker}`).toContain(marker));
        const selectorSource = readFileSync(selectorSourcePath, "utf8");
        part.evidence.selectorMarkers.forEach((marker) =>
          expect(selectorSource, `${selectorSourcePath}#${marker}`).toContain(marker));
      }
    }
  });

  it("pins Button pointer cursor support to the shipped ElementUI stylesheet", () => {
    const evidence = KF36_RUNTIME_PROFILE.selectors.button!.parts.root!.evidence;
    expect(evidence.selectorSourcePath).toBe(
      "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/ThirdParty/element-ui/lib/theme-chalk/button.css",
    );
    expect(evidence.selectorMarkers).toEqual(expect.arrayContaining([".el-button", "cursor:pointer"]));
    expect(evidence.selectorSourceSha256).toBe("d84fba6badd5a88ff80a6af85cc35ddb59d3832ea47faeec8ca3fac277e85bbc");
    const source = readFileSync(`${repositoryRoot}${evidence.selectorSourcePath}`);
    expect(source.toString("utf8")).toContain(".el-button");
    expect(source.toString("utf8")).toContain("cursor:pointer");
    expect(verifySelectorSourceBytes(evidence, source)).toBe(true);
  });

  it("rejects Button cursor evidence when complete bytes drift but both markers remain", () => {
    const evidence = KF36_RUNTIME_PROFILE.selectors.button!.parts.root!.evidence;
    const source = readFileSync(`${repositoryRoot}${evidence.selectorSourcePath}`);
    const drifted = Buffer.concat([source, Buffer.from("\n/* marker-preserving drift */\n")]);
    expect(drifted.toString("utf8")).toContain(".el-button");
    expect(drifted.toString("utf8")).toContain("cursor:pointer");
    expect(verifySelectorSourceBytes(evidence, drifted)).toBe(false);
  });

  it("maps reviewed component states to evidence-owned selectors instead of generic model selectors", () => {
    expect(KF36_RUNTIME_PROFILE.selectors.tabs!.parts.tab!.stateSelectors).toEqual({
      hover: "#domId .el-tabs__item:hover",
      selected: "#domId .el-tabs__item.is-active",
    });
    expect(KF36_RUNTIME_PROFILE.selectors.tree!.parts.node!.stateSelectors).toEqual({
      hover: "#domId .el-tree-node__content:hover",
      selected: "#domId .el-tree-node.is-current > .el-tree-node__content",
    });
    expect(KF36_RUNTIME_PROFILE.selectors["easyui.1"]!.parts.row!.stateSelectors).toEqual({
      hover: "#domId .datagrid-row-over",
      selected: "#domId .datagrid-row-selected",
    });
  });

  it("maps form states to proved descendant hosts and fails closed for unproved states", () => {
    expect(KF36_RUNTIME_PROFILE.selectors.checkbox!.parts.root!.selector)
      .toBe("#domId .el-checkbox, #domId .el-checkbox-button");
    expect(KF36_RUNTIME_PROFILE.selectors.radio!.parts.root!.selector)
      .toBe("#domId .el-radio, #domId .el-radio-button");
    expect(KF36_RUNTIME_PROFILE.selectors.checkbox!.parts.root!.stateSelectors).toEqual({
      hover: "#domId .el-checkbox:hover, #domId .el-checkbox-button:hover",
      focus: "#domId .el-checkbox__input.is-focus, #domId .el-checkbox-button.is-focus",
      disabled: "#domId .el-checkbox.is-disabled, #domId .el-checkbox-button.is-disabled",
      selected: "#domId .el-checkbox.is-checked, #domId .el-checkbox-button.is-checked",
    });
    expect(KF36_RUNTIME_PROFILE.selectors.radio!.parts.root!.stateSelectors).toEqual({
      hover: "#domId .el-radio:hover, #domId .el-radio-button:hover",
      focus: "#domId .el-radio.is-focus, #domId .el-radio-button.is-focus",
      disabled: "#domId .el-radio.is-disabled, #domId .el-radio-button.is-disabled",
      selected: "#domId .el-radio.is-checked, #domId .el-radio-button.is-active",
    });
    expect(KF36_RUNTIME_PROFILE.selectors.switch!.parts.root!.stateSelectors).toEqual({
      disabled: "#domId .el-switch.is-disabled",
      selected: "#domId .el-switch.is-checked",
    });
    expect(KF36_RUNTIME_PROFILE.selectors.datetimepicker!.parts.root!.stateSelectors).toEqual({
      hover: "#domId .el-date-editor:hover",
      disabled: "#domId .el-date-editor.is-disabled",
    });
    for (const capabilityId of ["text", "richtext"]) {
      expect(KF36_RUNTIME_PROFILE.selectors[capabilityId]!.parts.root!.stateSelectors,
        capabilityId).toEqual({});
    }
    for (const capabilityId of ["checkbox", "radio", "switch", "datetimepicker"]) {
      for (const selector of Object.values(KF36_RUNTIME_PROFILE.selectors[capabilityId]!.parts.root!.stateSelectors)) {
        expect(selector, capabilityId).toMatch(/^#domId\s+\./);
      }
    }
  });

  it("pins every state selector class to the same product source that proves its runtime host", () => {
    for (const roles of Object.values(KF36_RUNTIME_PROFILE.selectors)) {
      for (const part of Object.values(roles.parts)) {
        const selectorSourcePath = `${repositoryRoot}${part.evidence.selectorSourcePath}`;
        const selectorSource = readFileSync(selectorSourcePath, "utf8");
        for (const [state, selector] of Object.entries(part.stateSelectors)) {
          const classTokens = [...selector.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)]
            .map((match) => match[1]!);
          for (const classToken of classTokens) {
            expect(selectorSource, `${part.semanticPart}.${state} host .${classToken} in ${selectorSourcePath}`)
              .toContain(classToken);
          }
        }
      }
    }
  });

  it("pins runtime-owned #domId replacement without exposing a project-time materializer", () => {
    expect(Reflect.has(runtimeProfileModule, "materializeKF36StyleData")).toBe(false);
    expect(KF36_RUNTIME_PROFILE.styleMaterialization).toMatchObject({
      mechanism: "setStyleFormat-dom-id-replacement",
      persistedPlaceholder: "domId",
      styleElementIdPrefix: "cssStyle",
    });
    expect(KF36_RUNTIME_PROFILE.styleMaterialization.evidence.map((entry) => entry.runtimePath)).toEqual([
      "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Graphic/UI/kmui_uibase.js",
      "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Graphic/Layout/kmui_layoutcomponentbase.js",
      "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Graphic/Layout/kmui_componentbase.js",
      "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Util/km_idmanage.js",
    ]);
    for (const sourceEvidence of KF36_RUNTIME_PROFILE.styleMaterialization.evidence) {
      const sourcePath = `${repositoryRoot}${sourceEvidence.runtimePath}`;
      expect(existsSync(sourcePath), sourcePath).toBe(true);
      const source = readFileSync(sourcePath, "utf8");
      sourceEvidence.runtimeMarkers.forEach((marker) =>
        expect(source, `${sourcePath}#${marker}`).toContain(marker));
    }
    const persisted = "#domId .el-button{color:#ffffff}";
    const first = simulateEvidencedKFSetStyleFormat(persisted, "k11111111-1111-4111-8111-111111111111");
    const second = simulateEvidencedKFSetStyleFormat(persisted, "k22222222-2222-4222-8222-222222222222");
    expect(first).toBe("#k11111111-1111-4111-8111-111111111111 .el-button{color:#ffffff}");
    expect(second).toBe("#k22222222-2222-4222-8222-222222222222 .el-button{color:#ffffff}");
    expect(first).not.toContain("k22222222-2222-4222-8222-222222222222");
    expect(second).not.toContain("k11111111-1111-4111-8111-111111111111");
  });

  it("does not trust caller-created selector mappings", () => {
    expect(isTrustedKF36RuntimeProfile(KF36_RUNTIME_PROFILE)).toBe(true);
    expect(isTrustedKF36RuntimeProfile({
      runtimeFamily: "kingfusion-client",
      runtimeVersion: "3.6",
      selectors: KF36_RUNTIME_PROFILE.selectors,
      styleMaterialization: KF36_RUNTIME_PROFILE.styleMaterialization,
    })).toBe(false);
    expect(isTrustedKF36StylePart({
      semanticPart: "root",
      selector: "#domId",
      stateSelectors: {},
      evidence: KF36_RUNTIME_PROFILE.selectors.button!.parts.root!.evidence,
    })).toBe(false);
  });
});
