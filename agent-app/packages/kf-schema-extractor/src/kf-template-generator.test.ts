import { describe, expect, it } from "vitest";
import { KM_UI_MODE_TYPE_ENUM } from "./template-extractor.js";

describe("kf-template-generator coverage", () => {
  it("covers all reference-project control types in the uiModelType enum", () => {
    // 参考工程 test_最新_2 出现、现有 12 种之外的 uiModelType 必须都能映射到
    // KF 源码枚举，模板生成才有据可依。
    const referenceTypes = [
      // 老式控件
      0, // RADIO（旧）
      1, // CHECKBOX（旧）
      3, // COMBOBOX
      8, // SCALE
      9, // LIST
      10, // MENU
      11, // TREEVIEW
      12, // WEBCONTAINER
      30, // GANTT
      43, // FACTORYCALENDAR
      // ElementUI 新式
      32, // TREE
      33, // DROPDOWN
      34, // NAVMENU
      38, // INPUT
      39, // CASCADER
      40, // DATETIMEPICKER
      45, // UPLOAD
      46, // TRANSFER
      50, // TAG
      51, // TIMELINE
      52, // STEPS
    ];
    const enumValues = new Set(Object.values(KM_UI_MODE_TYPE_ENUM));
    const missing = referenceTypes.filter((ut) => !enumValues.has(ut));
    expect(missing).toEqual([]);
  });
});
