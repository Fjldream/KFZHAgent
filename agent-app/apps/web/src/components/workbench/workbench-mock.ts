// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 工作台演示数据（UI 层）：先做界面骨架，后续 T13/T15 再接真实接口。
// 这些数字仅用于评审布局与状态呈现，不代表真实用量或验证结论。
// end
import type {
  ConversationSummary,
  DeliverySummary,
  PlanSummary,
  RegionMapping,
  RevisionSummary,
  ScenarioOption,
  TimelineStep,
  UsageSummaryData,
} from "./workbench-types";

export const workbenchWorkspaceName = "水处理监控工程";

export const workbenchConversations: ConversationSummary[] = [
  {
    id: "conv-energy",
    title: "能耗对比页面改版",
    statusText: "生成组件方案中 · 12 秒",
    status: "RUNNING",
    unread: 2,
    archived: false,
    updatedAt: "2026-10-20T14:02:00+08:00",
    mode: "build",
  },
  {
    id: "conv-filling",
    title: "灌装车间报表",
    statusText: "排队中（本会话完成后执行）",
    status: "QUEUED",
    unread: 0,
    archived: false,
    updatedAt: "2026-10-20T13:58:00+08:00",
    mode: "build",
  },
  {
    id: "conv-boiler",
    title: "锅炉监控大屏",
    statusText: "已完成 · 新版本 v1.4 可下载",
    status: "SUCCEEDED",
    unread: 1,
    archived: false,
    updatedAt: "2026-10-20T11:20:00+08:00",
    mode: "build",
  },
  {
    id: "conv-login",
    title: "登录页样式讨论",
    statusText: "讨论 · 不构建",
    status: null,
    unread: 0,
    archived: false,
    updatedAt: "2026-10-19T16:40:00+08:00",
    mode: "discuss",
  },
  {
    id: "conv-legacy",
    title: "一期历史遗留问题",
    statusText: "归档 · 10-14",
    status: null,
    unread: 0,
    archived: true,
    updatedAt: "2026-10-14T09:10:00+08:00",
    mode: "discuss",
  },
];

export const workbenchScenarioOptions: ScenarioOption[] = [
  { value: "running", label: "运行中", hint: "时间线 + 停止按钮" },
  { value: "waiting-input", label: "等待确认视觉", hint: "WAITING_INPUT" },
  { value: "approval", label: "等待审批方案", hint: "WAITING_APPROVAL" },
  { value: "completed", label: "已交付", hint: "验证等级" },
  { value: "conflict", label: "基线冲突", hint: "stale-base" },
];

export const workbenchUserMessage = {
  text: "参考这张图做一个能耗对比页面，顶部 3 个指标卡，中间趋势图，下面数据表。用我们现有的控件。",
  attachments: [
    { name: "dashboard-v2.png", size: "1.2 MB", purpose: "reference" as const },
    { name: "logo.png", size: "84 KB", purpose: "material" as const },
  ],
};

export const workbenchDecisionSummary =
  "识别到 7 个区域：6 个可由现有 KF 控件实现（其中 5 个有 3.6 运行时验证证据），1 个（趋势图）当前仅有静态实现记录。截图未体现数据来源，需要你确认绑定方式。";

export const workbenchTimelineSteps: TimelineStep[] = [
  {
    id: "upload",
    title: "上传校验",
    detail: "PNG · 1440×900 · 未超限，派生图已生成（长边 2048）",
    duration: "0.3s",
    state: "done",
    tags: [],
  },
  {
    id: "vision",
    title: "视觉结构分析",
    detail: "同图 30 天内已分析过，复用结果（spec v1 · hash 9f2a…01cc）",
    duration: "4.2s",
    state: "done",
    tags: ["cache"],
  },
  {
    id: "capability",
    title: "控件能力匹配",
    detail: "能力目录 v3.6-rc2 · 6/7 区域匹配，趋势图暂无运行时证据",
    duration: "1.1s",
    state: "done",
    tags: [],
  },
  {
    id: "plan",
    title: "方案生成（首次输出未通过 schema 校验）",
    detail: "自动修复 1 次后通过；修复调用已计入本轮预算（5/8）",
    duration: "8.4s",
    state: "warn",
    tags: ["attempt", "repair"],
  },
  {
    id: "implement",
    title: "组件方案实施",
    detail: "生成语义组件计划 → 布局编译（desktop 1440 规则）",
    duration: null,
    state: "run",
    tags: [],
  },
];

export const workbenchRegions: RegionMapping[] = [
  {
    id: "region-1",
    no: 1,
    name: "顶部导航栏",
    control: "容器·导航",
    support: "verified",
    confidence: 0.96,
    box: { left: "0", top: "0", width: "100%", height: "14%" },
  },
  {
    id: "region-2",
    no: 2,
    name: "左侧菜单",
    control: "容器·侧栏",
    support: "verified",
    confidence: 0.93,
    box: { left: "0", top: "14%", width: "16%", height: "86%" },
  },
  {
    id: "region-3",
    no: 3,
    name: "指标卡片 ×3",
    control: "卡片容器",
    support: "verified",
    confidence: 0.91,
    box: { left: "16%", top: "14%", width: "84%", height: "20%" },
  },
  {
    id: "region-4",
    no: 4,
    name: "能耗趋势图",
    control: "XY 曲线",
    support: "unverified",
    confidence: 0.62,
    box: { left: "16%", top: "34%", width: "84%", height: "40%" },
  },
  {
    id: "region-5",
    no: 5,
    name: "能耗明细表",
    control: "表格",
    support: "verified",
    confidence: 0.88,
    box: { left: "16%", top: "74%", width: "84%", height: "26%" },
  },
];

export const workbenchPlan: PlanSummary = {
  page: "能耗对比",
  controlCount: 12,
  layout: "Desktop 1440",
  baseRevision: "v1.3",
  planHash: "a3f9…c21e",
  signed: true,
};

export const workbenchControlList = [
  { name: "卡片容器", count: "×3", support: "已验证" },
  { name: "XY 曲线", count: "×1", support: "未验证" },
  { name: "表格", count: "×2", support: "已验证" },
  { name: "按钮", count: "×2", support: "已验证" },
  { name: "容器·导航/侧栏", count: "×2", support: "已验证" },
  { name: "文本", count: "×2", support: "已验证" },
];

export const workbenchRevisions: RevisionSummary[] = [
  {
    id: "rev-14",
    version: "v1.4",
    source: "来自「锅炉监控大屏」",
    isLatest: true,
    isCurrent: false,
    schemaOk: true,
    compiledOk: true,
    visualWarning: false,
    runtimeVerified: false,
    downloadAvailable: true,
    note: null,
  },
  {
    id: "rev-13",
    version: "v1.3",
    source: "本会话",
    isLatest: false,
    isCurrent: true,
    schemaOk: true,
    compiledOk: true,
    visualWarning: true,
    runtimeVerified: false,
    downloadAvailable: true,
    note: null,
  },
  {
    id: "rev-12",
    version: "v1.2",
    source: "10-16",
    isLatest: false,
    isCurrent: false,
    schemaOk: true,
    compiledOk: true,
    visualWarning: false,
    runtimeVerified: false,
    downloadAvailable: true,
    note: null,
  },
  {
    id: "rev-10",
    version: "v1.0",
    source: "历史导入",
    isLatest: false,
    isCurrent: false,
    schemaOk: true,
    compiledOk: false,
    visualWarning: false,
    runtimeVerified: false,
    downloadAvailable: true,
    note: "无生成快照（snapshot）· 局部修改不可用，可「重新规划可编辑版本」",
  },
];

export const workbenchUsage: UsageSummaryData = {
  invocations: 5,
  maxInvocations: 8,
  cost: "¥0.42",
  inputTokens: "42.3k",
  inputBudget: "120k",
  outputTokens: "6.1k",
  outputBudget: "80k",
  cacheHitRate: 71,
  repairUsed: 1,
  repairMax: 1,
  unknownInvocations: 1,
  details: [
    { label: "视觉结构分析", value: "缓存命中 · 0 次" },
    { label: "方案生成 ×2", value: "42.3k → 6.1k" },
    { label: "决策摘要", value: "1.8k → 0.4k" },
    { label: "组件实施（执行中）", value: "—" },
  ],
};

export const workbenchDelivery: DeliverySummary = {
  revision: "revision v1.3",
  artifact: "artifact 8c1d…77ab",
  badges: [
    { level: "pass", label: "结构验证通过" },
    { level: "pass", label: "编译验证通过" },
    { level: "not-checked", label: "原生运行未验证" },
    { level: "warning", label: "视觉相似度警告" },
  ],
  note: "未接入 KF 测试环境，runtime 级验证未执行（非「通过」）；趋势图字体与参考图存在差异，可发起一轮局部修订，不影响本次下载。",
};

export const workbenchProjectTree = [
  { icon: "📁", name: "水处理监控工程" },
  { icon: "📄", name: "能耗对比（生成中…）" },
  { icon: "🖼", name: "res/images（1 项素材）" },
  { icon: "⚙️", name: "交互脚本（2 项）" },
];
