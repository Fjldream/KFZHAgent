import { describe, expect, it } from "vitest";
import { EasyuiControlIR } from "./client-project-ir.js";
import { EASYUI_ALL_FIELDS, EASYUI_PROTO_FIELDS, EASYUI_PROTO_TYPES } from "./easyui-types.js";

describe("EASYUI_PROTO_TYPES", () => {
  it("maps the KF easyui protos (uiExtendType) to semantic type names", () => {
    // 依据：参考工程 test_最新_2 真实 easyui 对象（objectType=3），
    // 控件 name 前缀 = easyui 组件名（Datagrid/TreeGrid/Tree/Combobox/...）。
    expect(EASYUI_PROTO_TYPES[0]).toBe("combobox");
    expect(EASYUI_PROTO_TYPES[1]).toBe("datagrid");
    expect(EASYUI_PROTO_TYPES[2]).toBe("linkbutton");
    expect(EASYUI_PROTO_TYPES[5]).toBe("propertygrid");
    expect(EASYUI_PROTO_TYPES[9]).toBe("textbox");
    expect(EASYUI_PROTO_TYPES[10]).toBe("timespinner");
    // proto 11 = DateBox：KF 序列化不带 objectType（KMUIExtendBase 系），参考工程 8 例
    expect(EASYUI_PROTO_TYPES[11]).toBe("datebox");
    expect(EASYUI_PROTO_TYPES[17]).toBe("tree");
    expect(EASYUI_PROTO_TYPES[18]).toBe("treegrid");
    expect(EASYUI_PROTO_TYPES[26]).toBe("sidemenu");
  });

  it("covers every proto observed in the reference project", () => {
    const observed = [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      20, 21, 22, 24, 25, 26, 27, 28, 29,
    ];
    for (const proto of observed) {
      expect(EASYUI_PROTO_TYPES[proto], `missing mapping for proto ${proto}`).toBeTruthy();
    }
  });

  it("exposes a per-proto field whitelist with datagrid core options", () => {
    const datagrid = EASYUI_PROTO_FIELDS[1];
    expect(datagrid).toBeDefined();
    for (const field of [
      "striped",
      "pagination",
      "showHeader",
      "singleSelect",
      "fitColumns",
      "rownumbers",
      "pageSize",
      "pageList",
      "sortOrder",
    ]) {
      expect(datagrid).toContain(field);
    }
    // sidemenu / combobox / treegrid 也有可修改字段清单
    expect(EASYUI_PROTO_FIELDS[26]).toContain("floatMenuPosition");
    expect(EASYUI_PROTO_FIELDS[0]).toContain("editable");
    expect(EASYUI_PROTO_FIELDS[18]).toContain("treeField");
  });

  it("keeps the EasyuiControlIR schema in sync with the field whitelist", () => {
    // EasyuiControlIR 的 strict() 只放行白名单字段，二者必须一致，防止漂移。
    const shapeKeys = new Set(Object.keys(EasyuiControlIR.shape));
    for (const field of EASYUI_ALL_FIELDS) {
      expect(shapeKeys.has(field), `EasyuiControlIR missing whitelisted field: ${field}`).toBe(true);
    }
  });
});
