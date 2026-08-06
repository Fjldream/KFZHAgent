/**
 * KF 客户端工程元数据文件的确定性生成。
 *
 * 内容参照 KF 3.6 `ProjectService.createProject` 的初始化逻辑与服务器真实
 * 工程（AA）结构：KF 原生开发界面打开工程时要初始化页面组树、配置树
 * （GraphicModelManager）、脚本管理（globalScriptManager）、权限、资源、
 * 报表、数据源、安全分区等，缺文件会导致工程无法打开。编译器必须让产物
 * 自包含这些文件。
 *
 * 所有值均为 (IR, seed) 的纯函数：无时间戳、无随机数，保持字节级确定性。
 */

/** KF 系统变量（id 1-10）。客户端打开工程时变量树依赖这些内置变量。 */
export const KF_SYSTEM_VARIABLES: ReadonlyArray<Record<string, unknown>> = [
  { name: "$Year", dataType: 1, id: 1, comment: "Year", defaultValue: 0, isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
  { name: "$Month", dataType: 1, id: 2, comment: "Month", defaultValue: 0, isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
  { name: "$Day", dataType: 1, id: 3, comment: "Day", defaultValue: 0, isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
  { name: "$Hour", dataType: 1, id: 4, comment: "Hour", defaultValue: 0, isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
  { name: "$Minute", dataType: 1, id: 5, comment: "Minute", defaultValue: 0, isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
  { name: "$Second", dataType: 1, id: 6, comment: "Second", defaultValue: 0, isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
  { name: "$MilliSecond", dataType: 1, id: 7, comment: "MilliSecond", defaultValue: 0, isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
  { name: "$Date", dataType: 2, id: 8, comment: "Date", defaultValue: "", isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
  { name: "$Time", dataType: 2, id: 9, comment: "Time", defaultValue: "", isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
  { name: "$DayofWeek", dataType: 1, id: 10, comment: "DayofWeek", defaultValue: 0, isMap: false, basicItem: { defaultValue: 0, maxValue: 999999, minValue: -999999, deadZone: 0 } },
];

/** 安全分区列表（createProject 初始化，id 0-63）。 */
export const KF_SECURITY_SECTIONS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "0", name: "None" },
  { id: "1", name: "A" },
  { id: "2", name: "B" },
  { id: "3", name: "C" },
  { id: "4", name: "D" },
  { id: "5", name: "E" },
  { id: "6", name: "F" },
  { id: "7", name: "G" },
  { id: "8", name: "H" },
  { id: "9", name: "I" },
  { id: "10", name: "J" },
  { id: "11", name: "K" },
  { id: "12", name: "L" },
  { id: "13", name: "M" },
  { id: "14", name: "N" },
  { id: "15", name: "O" },
  { id: "16", name: "P" },
  { id: "17", name: "Q" },
  { id: "18", name: "R" },
  { id: "19", name: "S" },
  { id: "20", name: "T" },
  { id: "21", name: "U" },
  { id: "22", name: "V" },
  { id: "23", name: "W" },
  { id: "24", name: "X" },
  { id: "25", name: "Y" },
  { id: "26", name: "Z" },
  { id: "27", name: "AA" },
  { id: "28", name: "BB" },
  { id: "29", name: "CC" },
  { id: "30", name: "DD" },
  { id: "31", name: "EE" },
  { id: "32", name: "FF" },
  { id: "33", name: "GG" },
  { id: "34", name: "HH" },
  { id: "35", name: "II" },
  { id: "36", name: "JJ" },
  { id: "37", name: "KK" },
  { id: "38", name: "LL" },
  { id: "39", name: "MM" },
  { id: "40", name: "NN" },
  { id: "41", name: "OO" },
  { id: "42", name: "PP" },
  { id: "43", name: "QQ" },
  { id: "44", name: "RR" },
  { id: "45", name: "SS" },
  { id: "46", name: "TT" },
  { id: "47", name: "UU" },
  { id: "48", name: "VV" },
  { id: "49", name: "WW" },
  { id: "50", name: "XX" },
  { id: "51", name: "YY" },
  { id: "52", name: "ZZ" },
  { id: "53", name: "AAA" },
  { id: "54", name: "BBB" },
  { id: "55", name: "CCC" },
  { id: "56", name: "DDD" },
  { id: "57", name: "EEE" },
  { id: "58", name: "FFF" },
  { id: "59", name: "GGG" },
  { id: "60", name: "HHH" },
  { id: "61", name: "III" },
  { id: "62", name: "JJJ" },
  { id: "63", name: "KKK" },
];

/** 登录配置（createProject 初始化）。 */
export const KF_LOGIN_CONFIG: Record<string, unknown> = {
  config: {
    title: "Client Runtime System",
    login: {
      isCustom: false,
      customBK: {
        loginBackground: { name: "", isUsing: true },
        pageBackground: { name: "", isUsing: true },
      },
      customPage: "",
    },
    logoff: { url: "" },
    redirection: { url: "" },
  },
};

/** 全局脚本管理（createProject 初始化：系统启动/运行/关闭 + 空分类）。 */
export const KF_GLOBAL_SCRIPT_MANAGER: Record<string, unknown> = {
  system: [
    { name: "系统启动时", code: "", encrypt: "" },
    { name: "系统运行时", code: "", interval: "4000", encrypt: "" },
    { name: "系统关闭时", code: "", encrypt: "" },
  ],
  timer: [],
  dataChange: [],
  event: [],
  hotKey: [],
  custom: [],
};

/** HT 数据模型默认场景（服务器真实工程 default.json 结构）。 */
export const KF_HT_DEFAULT_SCENE: Record<string, unknown> = {
  v: "7.0.7",
  p: { autoAdjustIndex: true, hierarchicalRendering: true, postProcessingData: {} },
  d: [],
  scene: {
    eye: [0, 300, 1000],
    center: [0, 0, 0],
    near: 10,
    far: 10000,
    gridVisible: true,
    gridSize: 50,
    gridGap: 50,
    gridColor: [0.4, 0.75, 0.85, 1],
    editHelperDisabled: false,
  },
};

/**
 * createProject 会创建的工程目录（相对 `project/`）。
 * KF 客户端在初始化时会读写这些目录，缺失可能导致异常。
 */
export const KF_METADATA_EMPTY_DIRS: ReadonlyArray<string> = [
  "config/Picture",
  "dataSource",
  "svgs",
  "res/graphicGroup",
  "res/graphicModel_associated",
  "res/graphicModel_base",
  "res/graphicModel_combined",
  "res/iconimages",
  "res/imageResource",
  "res/images",
  "res/professionalModel_base",
  "htDataModel/storage/assets",
  "htDataModel/storage/components",
  "htDataModel/storage/materials",
  "htDataModel/storage/displays",
  "htDataModel/storage/models",
  "htDataModel/storage/previews",
  "htDataModel/storage/symbols",
  "htDataModel/storage/temp",
  "report",
  "dataSet",
];

export interface KfMetadataInput {
  /** 页面组 GUID（pageGroupManager.Groups.id，与 pageManager Pages[].groupId 一致）。 */
  pageGroupGuid: string;
  /** 各页面的 KF GUID（顺序与 pageManager.Pages 一致）。 */
  pageGuids: string[];
}

/**
 * 生成 KF 开发界面所需的元数据文件集合（相对 `project/` 的路径 → JSON 值）。
 * 不含页面/变量/脚本（由编译器各自写入）。
 */
export function buildKfMetadataFiles(input: KfMetadataInput): Record<string, unknown> {
  return {
    "config/GraphicModelManager.json": { 图形模型库: {} },
    "config/loginConfig.json": KF_LOGIN_CONFIG,
    // 预定义图形组库（KF extension/Predefined/GraphicGroupManager.json，约 566KB）。
    // 编译器不内嵌该资源库，生成空占位；用户可在 KF 内从标准库导入图形组。
    "config/GraphicGroupManager.json": {},
    "ImgResourceManager.json": { projectRes: [] },
    "reportManager.json": {},
    "reportGroupManager.json": [
      { id: "default_reportGroup", name: "默认报表组", parentId: "report-library" },
    ],
    "resourceGroupManager.json": {
      name: "资源管理",
      id: "10000000000000000000000000000001",
      children: [],
    },
    "userManager.json": [],
    "datasourceManager.json": {},
    "diffusionManager.json": {
      page: Object.fromEntries(input.pageGuids.map((guid) => [guid, []])),
      model: [],
      isAddId: true,
    },
    "globalScriptManager.json": KF_GLOBAL_SCRIPT_MANAGER,
    "authManager.json": { currentAuth: 1, roleResourceList: [] },
    "resourceManager.json": {},
    "securitySectionManager.json": KF_SECURITY_SECTIONS,
    "pageGroupManager.json": {
      Groups: { name: "页面管理", id: input.pageGroupGuid, pages: input.pageGuids, groups: [] },
    },
    "dataSet/dataSet.json": { dataSet: {}, dataItem: {} },
    "htDataModel/storage/scenes/default.json": KF_HT_DEFAULT_SCENE,
  };
}
