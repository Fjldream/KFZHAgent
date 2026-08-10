import { describe, expect, it } from "vitest";
import { mergeManagedStyleData } from "./style-data-merge.js";

const START = "/* KF_AGENT_MANAGED_STYLE_V1_START */";
const END = "/* KF_AGENT_MANAGED_STYLE_V1_END */";

describe("mergeManagedStyleData", () => {
  it("ignores marker text inside a quoted CSS declaration value", () => {
    const customerCss = `#domId::before{content:"${START}"}`;

    const merged = mergeManagedStyleData(customerCss, "#domId{font-size:16px}");

    expect(merged).toBe(`${customerCss}\n${START}#domId{font-size:16px}${END}`);
  });

  it("ignores marker text nested inside an ordinary customer comment", () => {
    const customerCss = `/* customer note ${START} remains customer-owned */`;

    const merged = mergeManagedStyleData(customerCss, "#domId{border-radius:8px}");

    expect(merged).toBe(`${customerCss}\n${START}#domId{border-radius:8px}${END}`);
  });

  it.each([
    `${START}#domId{font-size:14px}`,
    `${END}`,
    `${START}#domId{font-size:14px}${END}${END}`,
    `${START}#domId{font-size:14px}${START}${END}`,
  ])("rejects corrupt or ambiguous top-level marker ownership", (existing) => {
    expect(() => mergeManagedStyleData(existing, "#domId{font-size:16px}"))
      .toThrow(/MANAGED_STYLE_DATA_INVALID/);
  });

  it("merges the unique owned envelope and preserves every byte outside it", () => {
    const before = "/* customer-before */\n#customer{content:'unchanged'}\n";
    const after = "\n/* customer-after */\n";
    const existing = `${before}${START}#domId{font-size:14px}${END}${after}`;

    expect(mergeManagedStyleData(existing, "#domId:hover{color:#ffffff}"))
      .toBe(`${before}${START}#domId{font-size:14px}#domId:hover{color:#ffffff}${END}${after}`);
  });
});
