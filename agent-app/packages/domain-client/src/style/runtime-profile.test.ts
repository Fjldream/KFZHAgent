import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  KF36_RUNTIME_PROFILE,
  isTrustedKF36RuntimeProfile,
  isTrustedKF36StylePart,
} from "./runtime-profile.js";

const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

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

  it("does not trust caller-created selector mappings", () => {
    expect(isTrustedKF36RuntimeProfile(KF36_RUNTIME_PROFILE)).toBe(true);
    expect(isTrustedKF36RuntimeProfile({
      runtimeFamily: "kingfusion-client",
      runtimeVersion: "3.6",
      selectors: KF36_RUNTIME_PROFILE.selectors,
    })).toBe(false);
    expect(isTrustedKF36StylePart({
      semanticPart: "root",
      selector: "#domId",
      stateSelectors: {},
      evidence: KF36_RUNTIME_PROFILE.selectors.button!.parts.root!.evidence,
    })).toBe(false);
  });
});
