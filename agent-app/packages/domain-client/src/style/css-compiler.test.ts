import { describe, expect, it } from "vitest";
import { compileScopedCss } from "./css-compiler.js";
import { KF36_RUNTIME_PROFILE } from "./runtime-profile.js";

describe("compileScopedCss", () => {
  const buttonSelectorRoles = KF36_RUNTIME_PROFILE.selectors.button;

  it("emits deterministic scoped CSS", () => {
    expect(compileScopedCss(KF36_RUNTIME_PROFILE.selectors.button, {
      normal: { borderRadius: 8, boxShadow: "medium" },
      hover: { backgroundColor: "#1d4ed8" },
    })).toBe(
      "#domId{border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18)}" +
      "#domId:hover{background-color:#1d4ed8}",
    );
  });

  it.each(["url(https://evil.invalid/x)", "expression(alert(1))", "javascript:alert(1)", "@import x"])(
    "rejects unsafe value %s",
    (value) => expect(() => compileScopedCss(buttonSelectorRoles, {
      normal: { backgroundColor: value },
    })).toThrow(/unsafe style value/i),
  );

  it("uses only the fixed mapping for numeric pixel fields", () => {
    expect(compileScopedCss(buttonSelectorRoles, {
      normal: { fontWeight: 600, lineHeight: 1.5, opacity: 0.8 },
    })).toBe("#domId{font-weight:600;line-height:1.5;opacity:0.8}");
  });

  it("emits only supported state selectors", () => {
    expect(compileScopedCss(buttonSelectorRoles, {
      disabled: { textColor: "#64748b" },
      selected: { borderColor: "#1d4ed8" },
      error: { backgroundColor: "#fee2e2" },
    })).toBe(
      "#domId:disabled{color:#64748b}" +
      "#domId.is-selected{border-color:#1d4ed8}" +
      "#domId.is-error{background-color:#fee2e2}",
    );
  });

  it.each(["behavior: url(x)", "<style>", "x{color:red}", "https://example.invalid/>"])(
    "rejects other unsafe syntax %s",
    (value) => expect(() => compileScopedCss(buttonSelectorRoles, {
      normal: { textColor: value },
    })).toThrow(/unsafe style value/i),
  );

  it.each([{ root: "#domId" }, { root: "body" }, { root: "#domId, body" }])(
    "rejects untrusted selector roles %o",
    (selectorRoles) => expect(() => compileScopedCss(selectorRoles, {
      normal: { backgroundColor: "#1d4ed8" },
    })).toThrow(/untrusted selector roles/i),
  );

  it.each(["red;position:fixed", "#ffffff/* injected */", "#ffffff!important", "red"])(
    "rejects injected or invalid color value %s",
    (value) => expect(() => compileScopedCss(buttonSelectorRoles, {
      normal: { textColor: value },
    })).toThrow(/unsafe style value|invalid style value/i),
  );

  it.each([
    ["fontSize", 201],
    ["fontWeight", 550.5],
    ["opacity", Number.POSITIVE_INFINITY],
  ] as const)("rejects invalid numeric declaration %s=%s", (key, value) => {
    expect(() => compileScopedCss(buttonSelectorRoles, {
      normal: { [key]: value },
    })).toThrow(/invalid style value/i);
  });
});
