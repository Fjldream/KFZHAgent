import { describe, expect, it } from "vitest";
import { mergeControlTemplate } from "./merge-template.js";

const baseFields = {
  comment: "",
  memberAccess: true,
  lock: false,
  visible: true,
  runVisible: true,
  enable: true,
  isControl: false,
  resDescription: {},
  configureData: "",
  styleData: "",
  linkMng: { linkList: [] },
};

const textTemplate = {
  uiModelType: 6,
  text: "Text",
  layoutStyle: "居左",
  sizePolicy: [3, 3, 0, 0],
  fixedSize: [40, 30],
};

const buttonTemplate = {
  uiModelType: 35,
  text: "button",
  titleShow: false,
  sizePolicy: {
    sizePolicy: [3, 3, 0, 0],
    maxSize: [16777215, 16777215],
    minSize: [5, 5],
    fixedSize: [90, 60],
  },
};

describe("control template merge rule", () => {
  it("merges base fields with the control template (template wins)", () => {
    const merged = mergeControlTemplate(baseFields, textTemplate);
    expect(merged.comment).toBe("");
    expect(merged.visible).toBe(true);
    expect(merged.uiModelType).toBe(6);
    expect(merged.text).toBe("Text");
  });

  it("keeps the legacy flat-array sizePolicy shape for text controls", () => {
    const merged = mergeControlTemplate(baseFields, textTemplate);
    expect(merged.sizePolicy).toEqual([3, 3, 0, 0]);
    expect(merged.fixedSize).toEqual([40, 30]);
    expect(Array.isArray(merged.sizePolicy)).toBe(true);
  });

  it("keeps the object sizePolicy shape for element-style controls", () => {
    const merged = mergeControlTemplate(baseFields, buttonTemplate);
    expect(merged.sizePolicy).toEqual({
      sizePolicy: [3, 3, 0, 0],
      maxSize: [16777215, 16777215],
      minSize: [5, 5],
      fixedSize: [90, 60],
    });
    expect(typeof merged.sizePolicy).toBe("object");
    expect(Array.isArray(merged.sizePolicy)).toBe(false);
  });

  it("replaces base scalar/object fields wholesale instead of deep-merging", () => {
    const baseWithComment = { ...baseFields, comment: "base comment" };
    const templateWithComment = { uiModelType: 6, comment: "template comment" };
    const merged = mergeControlTemplate(baseWithComment, templateWithComment);
    expect(merged.comment).toBe("template comment");
  });

  it("does not leak base sizePolicy into control templates", () => {
    // base-fields intentionally carries no sizePolicy; the merged result must
    // contain exactly the control template's shape.
    const merged = mergeControlTemplate(baseFields, textTemplate);
    expect(Object.hasOwn(merged, "sizePolicy")).toBe(true);
    const mergedButton = mergeControlTemplate(baseFields, buttonTemplate);
    expect(Object.hasOwn(mergedButton, "sizePolicy")).toBe(true);
  });
});
