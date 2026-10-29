// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { nativePageNameForSemanticId } from "./native-page-name.js";

describe("KF development page names", () => {
  it.each(["page-overview", "page.with.dot", "page with space", "page\nline", "!@#$%^&*()-+;:[{}]|.><,/?`~="])("emits a deterministic development-safe name for %j", semanticId => {
    const actual = nativePageNameForSemanticId(semanticId);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(actual).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,31}$/);
    // end
    expect(actual).toBe(nativePageNameForSemanticId(semanticId));
    expect(nativePageNameForSemanticId(semanticId + "x")).not.toBe(actual);
  });
  it("preserves native-safe names and cannot collapse distinct semantic spellings", () => {
    expect(nativePageNameForSemanticId("PageOverview")).toBe("PageOverview");
    expect(nativePageNameForSemanticId("page_overview")).toBe("page_overview");
    expect(nativePageNameForSemanticId("page-overview")).not.toBe(nativePageNameForSemanticId("page_overview"));
  });
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("preserves the 32-character boundary and safely hashes longer semantic IDs without aliases", () => {
    const safeBoundary = "P" + "a".repeat(31);
    expect(nativePageNameForSemanticId(safeBoundary)).toBe(safeBoundary);
    const names = Array.from({ length: 1000 }, (_, index) => nativePageNameForSemanticId(`${safeBoundary}_${index}`));
    expect(names.every(name => /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name))).toBe(true);
    expect(new Set(names.map(name => name.toLowerCase())).size).toBe(names.length);
  });

  // end
});
// end
