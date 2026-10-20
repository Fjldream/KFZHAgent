// @ts-nocheck -- 测试风格与 container-inspect.test.ts 一致；运行时行为由 vitest 断言验证。
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectClientProject, kfControlToIR, kfObjectToControl } from "./client-inspector.js";
import { ControlIR, SpecialNodeIR } from "../ir/client-project-ir.js";

/**
 * Golden 参考工程（真实 KF 页面）：/tmp/kf_ref/1.0.0.1/project/page/
 * - 驾驶舱demo示例.json：布局 insiderObjects 深层嵌套 5 个 CustomCharts
 *   （objectType=1，几何/name 在 pageProperty）；
 * - 切换趋势曲线的模式.json：顶层 TrendChart（几何在顶层 leftTopPt/width/height）；
 * - 数据源函数.json：AlarmWindow（顶层）+ 大量 Label（uiModelType=6 +
 *   prototypeName="Label"，不得误判为特殊节点）+ easyui + ProjectFlowChart 布局。
 * 若本机无参考工程，测试回退到同构合成页面，保证在任何环境可运行。
 */
const REF_PAGE_DIR = "/tmp/kf_ref/1.0.0.1/project/page";
const hasRefPages = existsSync(REF_PAGE_DIR);

function makeCustomCharts(name, guid, pagePos, pageSize, extra) {
  return {
    prototypeName: "CustomCharts",
    objectType: 1,
    pageProperty: {
      name,
      pagePos,
      pageSize,
      windowSize: { width: 1440, height: 900 },
      title: "",
      titleBar: true,
    },
    objects: [
      JSON.stringify({
        name: "echart",
        bordershow: true,
        customChartsType: 1,
        leftTopPt: { x: 0, y: 0 },
        width: pageSize.width,
        height: pageSize.height,
        option: { title: { text: name } },
        scriptTxt: "",
      }),
    ],
    modlePrototype: { name: "", guid: "kcc" + guid, version: "2.0.0.1.1", type: 1 },
    linkMng: { linkList: [] },
    variableMng: [],
    depender: { dependObjects: [] },
    bordershow: true,
    toolTipEnable: true,
    toolTipText: "",
    fixedSize: [pageSize.width, pageSize.height],
    sizePolicy: [3, 3, 0, 0],
    visible: true,
    lock: false,
    memberAccess: true,
    isControl: false,
    resDescription: {},
    guid,
    version: "2.0.0.1.1",
    securityPriority: 0,
    securitySection: [],
    resourceGroup: [],
    region: "center",
    internalVertex: null,
    ...extra,
  };
}

function makeChart(prototypeName, name, leftTopPt, width, height, extra) {
  return {
    name,
    prototypeName,
    chartComponentType: 2,
    leftTopPt,
    width,
    height,
    boundRect: { ...leftTopPt, width, height },
    relativePt: { x: 0, y: 0 },
    absolutePt: { x: leftTopPt.x + width / 2, y: leftTopPt.y + height / 2 },
    isEditLocked: false,
    isEditVisible: true,
    visible: true,
    enable: true,
    runVisible: true,
    toolTipEnable: false,
    toolTipText: "",
    securityPriority: 1,
    securitySection: [],
    resourceGroup: [],
    title: { show: true, text: prototypeName, position: 1, textStyle: { fontSize: 20 } },
    areas: [{ top: 0, left: 0, width, height, series: [{ name: "s1" }] }],
    areasNumStr: "1,0,0,0",
    trendMode: true,
    refreshMode: true,
    refreshFrequance: 1000,
    sizePolicy: [3, 3, 0, 0],
    fixedSize: [width, height],
    guid: "k" + name,
    comment: "",
    memberAccess: true,
    lock: false,
    isControl: false,
    resDescription: {},
    ...extra,
  };
}

function makeAlarmWindow() {
  return {
    name: "AlarmWindow2",
    prototypeName: "AlarmWindow",
    realAWModel: 0,
    alarmWindowType: "实时报警窗",
    leftTopPt: { x: 566, y: 451 },
    width: 540,
    height: 184,
    columns: [{ field: "alarmTime", title: "时间", width: 100, align: "left" }],
    list: { rowHeight: 24 },
    toolBar: { show: true },
    statusBar: { show: true },
    dateSource: "KS",
    dateType: "YYYY/MM/DD",
    timeType: ["小时", "分钟", "秒"],
    filterMsg: "",
    filterDataSource: "all",
    pageSizeNum: 7,
    historyNumber: 100,
    evalconfig: "",
    alarmMsgColor: "rgba(255,0,0,1)",
    backGroundColor: "rgba(255,255,255,1)",
    confirmRemark: false,
    confirmCertification: false,
    showAlarmTitle: true,
    showToolBar: true,
    showStatusBar: true,
    showTree: false,
    enable: true,
    runVisible: true,
    visible: true,
    lock: false,
    memberAccess: true,
    toolTipEnable: true,
    toolTipText: "",
    securityPriority: 1,
    securitySection: [],
    resourceGroup: [],
    fixedSize: [540, 184],
    sizePolicy: [3, 3, 0, 0],
    internalVertex: { left: 0, top: 90 },
    linkMng: { linkList: [] },
    guid: "k873423ad-f856-4ffe-9d56-6071447b524c",
    comment: "",
    isControl: false,
    resDescription: {},
  };
}

const SYNTHETIC_PAGES = {
  "驾驶舱demo示例.json": {
    pageProperty: { name: "驾驶舱demo示例" },
    version: "2.0.0.1",
    guid: "kcc-demo",
    objectType: 6,
    objects: [
      {
        layoutType: 5,
        objectType: 2,
        baseProperty: { name: "DockingLayout1", leftTopPt: { x: 0, y: 0 }, width: 1440, height: 900 },
        insiderObjects: [
          {
            layoutType: 4,
            objectType: 2,
            baseProperty: { name: "VerticalLayout1", leftTopPt: { x: 0, y: 0 }, width: 1440, height: 900 },
            insiderObjects: [
              {
                layoutType: 5,
                objectType: 2,
                baseProperty: { name: "DockingLayout2", leftTopPt: { x: 0, y: 0 }, width: 1440, height: 900 },
                insiderObjects: [makeCustomCharts("CustomCharts1", "kcc-1", { x: 5.13, y: 35.92 }, { width: 396, height: 344 })],
              },
            ],
          },
        ],
      },
    ],
  },
  "切换趋势曲线的模式.json": {
    pageProperty: { name: "切换趋势曲线的模式" },
    version: "2.0.0.1",
    guid: "k-trend",
    objectType: 6,
    objects: [
      makeChart("TrendChart", "TrendChart1", { x: 473, y: 33 }, 900, 400),
      { uiModelType: 35, name: "Button1", guid: "kbtn1", text: "模式一" },
      { uiModelType: 35, name: "Button2", guid: "kbtn2", text: "模式二" },
      { name: "Textbox1", guid: "ktb1", objectType: 3, uiExtendType: 1, leftTopPt: { x: 473, y: 450 }, width: 100, height: 24 },
    ],
  },
  "数据源函数.json": {
    pageProperty: { name: "数据源函数" },
    version: "2.0.0.1",
    guid: "k-alarm",
    objectType: 6,
    objects: [
      // Label：uiModelType=6 + objectType=3 + prototypeName="Label"（不在特殊节点集合）
      { uiModelType: 6, objectType: 3, prototypeName: "Label", name: "Label2", guid: "klbl2", leftTopPt: { x: 10, y: 10 }, width: 100, height: 20 },
      // easyui 链接按钮（objectType=3）
      { name: "LinkButton6", guid: "klb6", objectType: 3, uiExtendType: 1, leftTopPt: { x: 10, y: 40 }, width: 60, height: 24 },
      // ProjectFlowChart 布局（layoutType=6, 无 objectType）
      {
        layoutType: 6,
        baseProperty: { name: "ProjectFlowChart1", guid: "kpfc", leftTopPt: { x: 0, y: 100 }, width: 100, height: 100 },
        insiderObjects: [],
      },
      makeAlarmWindow(),
    ],
  },
};

async function readRefPage(file) {
  if (hasRefPages) {
    return JSON.parse(await readFile(join(REF_PAGE_DIR, file), "utf8"));
  }
  return SYNTHETIC_PAGES[file];
}

/** 递归查找 KF 页面树中第一个指定 prototypeName 的原始对象。 */
function findPrototype(node, prototypeName) {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPrototype(item, prototypeName);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== "object" || node === null) return undefined;
  if (node["prototypeName"] === prototypeName) return node;
  for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
    const found = findPrototype(node[key], prototypeName);
    if (found) return found;
  }
  return undefined;
}

/** 构造只含所选真实页面的临时 KF 工程，供 inspectClientProject 集成测试。 */
async function makeRefFixture(pageFiles) {
  const root = await mkdtemp(join(tmpdir(), "kf-inspect-special-"));
  const versionDir = join(root, "1.0.0.1");
  await mkdir(join(versionDir, "project", "page"), { recursive: true });
  await writeFile(join(versionDir, "project.json"), JSON.stringify({ name: "特殊节点参考", version: "1.0.0.1" }));
  await writeFile(join(versionDir, "project", "pageManager.json"), JSON.stringify({ Pages: [] }));
  for (const file of pageFiles) {
    const page = await readRefPage(file);
    await writeFile(join(versionDir, "project", "page", file), JSON.stringify(page));
  }
  return root;
}

describe("KF 特殊节点识别（prototypeName → SpecialNodeIR）", () => {
  it("识别单个 CustomCharts：几何从 pageProperty.pagePos/pageSize 提取，其余字段 passthrough 保留", () => {
    const kf = makeCustomCharts("CustomCharts1", "kcc-1", { x: 5.13, y: 35.92 }, { width: 396, height: 344 });
    const { control, unknownFields } = kfObjectToControl(kf);
    expect(control).not.toBeNull();
    expect(control.type).toBe("prototype");
    expect(control.prototypeName).toBe("CustomCharts");
    expect(control.id).toBe("CustomCharts1");
    expect(control.x).toBeCloseTo(5.13);
    expect(control.y).toBeCloseTo(35.92);
    expect(control).toMatchObject({ width: 396, height: 344 });
    // passthrough：pageProperty（含 title）/ objects JSON 字符串 / modlePrototype / region 原样保留
    expect(control.pageProperty).toEqual(kf.pageProperty);
    expect(control.pageProperty.title).toBe("");
    expect(typeof control.objects[0]).toBe("string");
    expect(JSON.parse(control.objects[0]).option.title.text).toBe("CustomCharts1");
    expect(control.modlePrototype.type).toBe(1);
    expect(control.region).toBe("center");
    expect(control.objectType).toBe(1);
    expect(SpecialNodeIR.safeParse(control).success).toBe(true);
    expect(unknownFields).toEqual([]);
  });

  it("识别单个 TrendChart：几何从顶层 leftTopPt/width/height 提取，title/areas/chartComponentType/comment 保留", () => {
    const kf = makeChart("TrendChart", "TrendChart1", { x: 473, y: 33 }, 900, 400);
    const { control, unknownFields } = kfObjectToControl(kf);
    expect(control).not.toBeNull();
    expect(control.type).toBe("prototype");
    expect(control.prototypeName).toBe("TrendChart");
    expect(control.id).toBe("TrendChart1");
    expect(control).toMatchObject({ x: 473, y: 33, width: 900, height: 400 });
    expect(control.chartComponentType).toBe(2);
    expect(control.title).toMatchObject({ show: true, text: "TrendChart" });
    expect(control.areas).toHaveLength(1);
    expect(control.areas[0]).toMatchObject({ top: 0, left: 0, width: 900, height: 400 });
    expect(control.comment).toBe("");
    expect(control.refreshFrequance).toBe(1000);
    expect(SpecialNodeIR.safeParse(control).success).toBe(true);
    expect(unknownFields).toEqual([]);
  });

  it("识别单个 AlarmWindow：几何从顶层提取，告警字段（columns/dateSource/list/...）保留", () => {
    const kf = makeAlarmWindow();
    const { control, unknownFields } = kfObjectToControl(kf);
    expect(control).not.toBeNull();
    expect(control.type).toBe("prototype");
    expect(control.prototypeName).toBe("AlarmWindow");
    expect(control.id).toBe("AlarmWindow2");
    expect(control).toMatchObject({ x: 566, y: 451, width: 540, height: 184 });
    expect(control.alarmWindowType).toBe("实时报警窗");
    expect(control.columns).toHaveLength(1);
    expect(control.columns[0].field).toBe("alarmTime");
    expect(control.dateSource).toBe("KS");
    expect(control.list).toEqual({ rowHeight: 24 });
    expect(control.linkMng).toEqual({ linkList: [] });
    expect(SpecialNodeIR.safeParse(control).success).toBe(true);
    expect(unknownFields).toEqual([]);
  });

  it("uiModelType 判型优先：prototypeName=Label 的普通控件不被误判为特殊节点", () => {
    // 真实工程 Label：uiModelType=6 + objectType=3 + prototypeName="Label"（不在集合内）。
    const kf = { uiModelType: 6, objectType: 3, prototypeName: "Label", name: "Label2", text: "hello" };
    const { control } = kfObjectToControl(kf);
    expect(control).toBeNull(); // 静态控件由 index 层 uiModelType 分支识别
  });

  it("拒绝同时声明布局与特殊 prototype 的互斥原生 envelope", () => {
    const kf = {
      prototypeName: "CustomCharts",
      layoutType: 5,
      objectType: 2,
      baseProperty: { name: "DockingLayout1", leftTopPt: { x: 20, y: 98 }, width: 1243, height: 548 },
      insiderObjects: [],
    };
    const { control } = kfObjectToControl(kf);
    expect(control).toBeNull();
  });

  it("prototypeName 不在特殊节点集合内 → 不识别（返回 null）", () => {
    const kf = { name: "X", prototypeName: "CustomWindow1", leftTopPt: { x: 0, y: 0 }, width: 100, height: 50 };
    const { control } = kfObjectToControl(kf);
    expect(control).toBeNull();
  });
});

describe("真实页面 golden round-trip（KF JSON → IR）", () => {
  it("驾驶舱demo示例：布局 insiderObjects 深层递归识别全部 CustomCharts，unknownFields 不累积", async () => {
    const page = await readRefPage("驾驶舱demo示例.json");
    const { controls, unknownFields } = kfControlToIR(page.objects);
    const customCharts = controls.filter((c) => c.type === "prototype" && c.prototypeName === "CustomCharts");
    if (hasRefPages) {
      expect(customCharts).toHaveLength(4); // 真实页面 4 个 CustomCharts，全部嵌套在布局 insiderObjects 深层
    } else {
      expect(customCharts).toHaveLength(1);
    }
    for (const control of customCharts) {
      expect(control.type).toBe("prototype");
      expect(SpecialNodeIR.safeParse(control).success).toBe(true);
      expect(ControlIR.safeParse(control).success).toBe(true);
    }
    // 与真实 KF 对象逐字段对账：IR 几何 == 原始对象 pageProperty.pagePos/pageSize
    const first = customCharts[0];
    const original = findPrototype(page.objects, "CustomCharts");
    expect(first.id).toBe(original.pageProperty.name);
    expect(first.x).toBeCloseTo(original.pageProperty.pagePos.x);
    expect(first.y).toBeCloseTo(original.pageProperty.pagePos.y);
    expect(first.width).toBe(original.pageProperty.pageSize.width);
    expect(first.height).toBe(original.pageProperty.pageSize.height);
    expect(first.pageProperty).toEqual(original.pageProperty);
    // objects[0] 是 JSON 字符串（KMUIChart 序列化），字符串保留
    expect(typeof first.objects[0]).toBe("string");
    expect(first.region).toBe("center");
    expect(unknownFields).toEqual([]);
  });

  it("切换趋势曲线的模式：TrendChart 识别，Button/Textbox 不受影响", async () => {
    const page = await readRefPage("切换趋势曲线的模式.json");
    const { controls, unknownFields } = kfControlToIR(page.objects);
    const trend = controls.find((c) => c.type === "prototype" && c.prototypeName === "TrendChart");
    expect(trend).toBeDefined();
    expect(trend.id).toBe("TrendChart1");
    expect(trend).toMatchObject({ x: 473, y: 33, width: 900, height: 400 });
    expect(trend.chartComponentType).toBe(2);
    expect(trend.title).toMatchObject({ show: true, text: "TrendChart" });
    expect(trend.areas).toHaveLength(1);
    expect(SpecialNodeIR.safeParse(trend).success).toBe(true);
    expect(unknownFields).toEqual([]);
  });

  it("数据源函数：AlarmWindow 识别为唯一特殊节点，Label/easyui/布局不受影响，unknownFields 不累积", async () => {
    const page = await readRefPage("数据源函数.json");
    const { controls, unknownFields } = kfControlToIR(page.objects);
    // 特殊节点只可能是 AlarmWindow（Label 的 prototypeName="Label" 不在集合内）
    const prototypes = controls.filter((c) => c.type === "prototype");
    expect(prototypes).toHaveLength(1);
    const alarm = prototypes[0];
    expect(alarm.prototypeName).toBe("AlarmWindow");
    expect(alarm.id).toBe("AlarmWindow2");
    expect(alarm).toMatchObject({ x: 566, y: 451, width: 540, height: 184 });
    expect(alarm.alarmWindowType).toBe("实时报警窗");
    expect(alarm.columns.length).toBeGreaterThan(0);
    expect(SpecialNodeIR.safeParse(alarm).success).toBe(true);
    // 其余控件类型不受影响：easyui + layout
    const types = controls.map((c) => c.type);
    expect(types).toContain("easyui");
    expect(types).toContain("layout");
    // 每个控件都通过 IR 联合校验
    for (const control of controls) {
      expect(ControlIR.safeParse(control).success).toBe(true);
    }
    expect(unknownFields).toEqual([]);
  });
});

describe("inspectClientProject 特殊节点索引", () => {
  it("CustomCharts / TrendChart / AlarmWindow 进入索引（type=prototype），unknownFields 不累积", async () => {
    const root = await makeRefFixture(["驾驶舱demo示例.json", "切换趋势曲线的模式.json", "数据源函数.json"]);
    const result = await inspectClientProject(root);

    const prototypeEntries = Object.values(result.index.controls).filter((c) => c.type === "prototype");
    expect(prototypeEntries.length).toBeGreaterThanOrEqual(3);
    expect(prototypeEntries.every((c) => c.unknownFields.length === 0)).toBe(true);

    // CustomCharts：id 取自 pageProperty.name，几何在 summary 中来自 pageProperty。
    // 注意：参考工程里 CustomCharts1 与 CustomCharts4 的 guid 相同（k925f91f8-...），
    // 索引层以 guid 为 key，后者覆盖前者——故只断言 CustomCharts 族存在即可。
    const ccEntries = prototypeEntries.filter((c) => c.type === "prototype");
    const ccNames = ccEntries.map((c) => c.id);
    const customChartsCount = ccNames.filter((n) => n.startsWith("CustomCharts")).length;
    if (hasRefPages) {
      expect(customChartsCount).toBeGreaterThanOrEqual(2);
    } else {
      expect(customChartsCount).toBeGreaterThanOrEqual(1);
    }
    expect(ccNames).toContain("TrendChart1");
    expect(ccNames).toContain("AlarmWindow2");

    // summary 中同样可见且几何正确
    const summaryControls = result.summary.pages.flatMap((p) => p.controls);
    const ccSummary = summaryControls.find((c) => c.id === "CustomCharts1");
    expect(ccSummary).toBeDefined();
    expect(ccSummary.type).toBe("prototype");
    expect(ccSummary.unknownFields).toEqual([]);
    expect(ccSummary.width).toBeGreaterThan(0);
    expect(ccSummary.height).toBeGreaterThan(0);
    const trendSummary = summaryControls.find((c) => c.id === "TrendChart1");
    expect(trendSummary).toMatchObject({ type: "prototype", x: 473, y: 33, width: 900, height: 400 });

    // Label（uiModelType=6）仍走静态控件索引，type 不是 prototype
    const label = result.index.controls["klbl2"];
    if (label) {
      expect(label.type).not.toBe("prototype");
    }
  });
});
