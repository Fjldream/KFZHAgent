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
      3, // 组合框
      8, // 刻度
      9, // 列表
      10, // 菜单
      11, // 树形视图
      12, // Web 容器
      30, // 甘特图
      43, // FACTORYCALENDAR
      // ElementUI 新式
      32, // 树
      33, // 下拉菜单
      34, // 导航菜单
      38, // 输入框
      39, // 级联选择器
      40, // 日期时间选择器
      45, // 上传
      46, // 穿梭框
      50, // 标签
      51, // 时间线
      52, // 步骤条
    ];
    const enumValues = new Set(Object.values(KM_UI_MODE_TYPE_ENUM));
    const missing = referenceTypes.filter((ut) => !enumValues.has(ut));
    expect(missing).toEqual([]);
  });
});
