import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseReviewedTabsInitialization,
  serializeReviewedTabsInitialization,
} from "./component-properties.js";

const OWNER = "ElementTabs1";

function replaceInitializationBody(source: string, body: string): string {
  const prefix = "// kf-compiled-tabs/v1 ";
  const newline = source.indexOf("\n");
  const marker = JSON.parse(Buffer.from(source.slice(prefix.length, newline), "base64url").toString("utf8")) as Record<string, unknown>;
  marker["bodySha256"] = createHash("sha256").update(body, "utf8").digest("hex");
  marker["bodyByteLength"] = Buffer.byteLength(body, "utf8");
  return `${prefix}${Buffer.from(JSON.stringify(marker), "utf8").toString("base64url")}\n${body}`;
}

describe("reviewed KF Tabs initialization", () => {
  it("round-trips only the exact bounded this.tabs payload", () => {
    const source = serializeReviewedTabsInitialization(OWNER, {
      tabs: [{ id: "profile", label: "基本资料" }, { id: "activity", label: "操作记录" }],
      activeId: "activity",
    });

    expect(source).toContain('// kf-compiled-tabs/v1 ');
    expect(source).toContain('this.tabs({"tabData":[{"name":"profile","label":"基本资料"},{"name":"activity","label":"操作记录"}],"activeName":"activity"});\n');
    expect(parseReviewedTabsInitialization(source)).toEqual({
      ownerInstanceName: OWNER,
      uiModelType: 47,
      tabData: [{ name: "profile", label: "基本资料" }, { name: "activity", label: "操作记录" }],
      activeName: "activity",
    });
  });

  it.each([
    ["line separator", "概览\u2028详情", "\\u2028"],
    ["paragraph separator", "概览\u2029详情", "\\u2029"],
  ])("round-trips a %s with script-safe JSON", (_name, label, escaped) => {
    const source = serializeReviewedTabsInitialization(OWNER, {
      tabs: [{ id: "overview", label }],
      activeId: "overview",
    });

    expect(source).toContain(escaped);
    expect(source).not.toContain(label);
    expect(parseReviewedTabsInitialization(source).tabData).toEqual([{ name: "overview", label }]);
  });

  it("rejects unbounded tab lists and active ids outside the tab list", () => {
    expect(() => serializeReviewedTabsInitialization(OWNER, {
      tabs: Array.from({ length: 33 }, (_, index) => ({ id: `tab-${index}`, label: `页签 ${index}` })),
      activeId: "tab-0",
    })).toThrow(/too_big|32|invalid/i);
    expect(() => serializeReviewedTabsInitialization(OWNER, {
      tabs: [{ id: "profile", label: "基本资料" }],
      activeId: "missing",
    })).toThrow(/TAB_ACTIVE_ID_UNKNOWN|invalid/i);
  });

  it.each([
    'this.tree({"tabData":[{"name":"profile","label":"基本资料"}],"activeName":"profile"});\n',
    'this.activeName = "profile";\n',
    'this.tabs(getTabs());\n',
    'tabs({"tabData":[{"name":"profile","label":"基本资料"}],"activeName":"profile"});\n',
  ])("rejects a self-consistently rehashed non-reviewed body: %s", (body) => {
    const source = serializeReviewedTabsInitialization(OWNER, {
      tabs: [{ id: "profile", label: "基本资料" }],
      activeId: "profile",
    });
    expect(() => parseReviewedTabsInitialization(replaceInitializationBody(source, body)))
      .toThrow("INVALID_REVIEWED_TABS_INITIALIZATION");
  });
});
