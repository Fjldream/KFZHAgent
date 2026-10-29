// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
/**
 * 前端 API 契约类型（与 Task 11 契约一致；字段名逐字来自 API 响应）。
 */

export interface SessionUser {
  id: string;
  username: string;
  role: string;
  tenantId: string;
}

export interface LoginResult {
  user: SessionUser;
  mustChangePassword: boolean;
}

/** /api/me 响应：额外携带必须改密标志（I2 会话恢复用）。 */
export interface MeResult extends SessionUser {
  mustChangePassword: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  mode: string;
  /** 服务器持有的工作流判别器；绝不根据制品类型推断。 */
  generationWorkflow?: "legacy" | "module-v1" | "creative-v2";
  currentRevisionId?: string | null;
  /** 后端 SolutionWorkspace 返回含这些字段（前端仅展示用）。 */
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChangeOperation {
  op: "create" | "update" | "delete";
  entityId: string;
  entityType?: string;
  changes?: { path: string; value: unknown }[];
  properties?: Record<string, unknown>;
  destructiveConfirmed?: boolean;
}

/** 计划摘要：用于确认 UX 展示的规范化计划。 */
export interface ChangePlanDisplay {
  schema?: string;
  workspaceId?: string;
  operations: ChangeOperation[];
}

/**
 * 计划中涉及 linkMng（控件事件脚本）子树的变更（I5）。服务端在
 * change-plan 响应里单独标注，确认视图必须把它与普通字段变更分开展示。
 */
export interface ScriptChange {
  op: string;
  entityId: string;
  entityType?: string;
  paths: string[];
}

export type ModuleDeliveryStatus = "ready" | "ready_with_warnings" | "blocked";

export interface ModuleDeliveryGap {
  moduleId: string;
  requirement: string;
  severity: "info" | "warning" | "blocking";
  status: "unresolved" | "mitigated" | "accepted";
  reason: string;
  alternatives?: string[];
}

export interface ModuleDeliveryResult {
  modulePlanHash?: string;
  projectKey: string;
  status: ModuleDeliveryStatus;
  gaps: ModuleDeliveryGap[];
  implementedModules: Array<{ pageId: string; moduleId: string; kind: string }>;
  repairCount: number;
  revisionDiff: { changedModules: string[]; preservedModules: string[] };
}

export interface CreativeProjectDelivery {
  workflow: "creative-v2";
  projectKey: string;
  status: "downloadable" | "building" | "failed" | "blocked";
  artifactId: string | null;
  revisionId: string | null;
  download: { available: boolean; tokenEndpoint: string | null };
  kf36RuntimeVerification: {
    status: "not_performed";
    notice: "尚未经过人工 KingFusion 3.6 运行态验证";
  };
}

export interface PersistedModuleDelivery {
  tenantId: string;
  workspaceId: string;
  conversationId: string;
  buildJobId: string | null;
  modulePlanHash: string | null;
  artifactId: string | null;
  revisionId: string | null;
  result: ModuleDeliveryResult | null;
  projectDelivery: CreativeProjectDelivery | null;
  buildJob: BuildJob | null;
  artifact: ({ buildJobId: string } & Pick<ArtifactRow, "id" | "kind" | "sizeBytes" | "sha256">) | null;
  revision: Pick<Revision, "id" | "revisionNumber" | "kind"> & { parentRevisionId: string | null } | null;
}

export interface Revision {
  id: string;
  revisionNumber: number;
  kind: string;
  createdAt: string;
}

export type BuildJobStatus = "QUEUED" | "RUNNING" | "VALIDATING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface BuildJob {
  id: string;
  workspaceId: string;
  status: BuildJobStatus;
  planHash: string;
  baseRevisionId: string;
  changePlanId: string;
  projectKey?: string;
}

export interface ArtifactRow {
  id: string;
  kind: string;
  storageKey: string;
  sizeBytes: number | null;
  sha256: string | null;
}

export interface ValidationReport {
  outcome: "pass" | "fail";
  summary?: string;
  details?: Record<string, unknown>;
}

export interface SolutionTreeNode {
  label: string;
  domain?: string;
  supported?: boolean;
  children: SolutionTreeNode[];
}

export interface UploadResult {
  revision: Revision;
  packageUrl: string;
  summary: { project?: { name?: string } };
}

// ---------------------------------------------------------------------------
// 对话消息的展示层解析（Task 10）
//
// 后端 SSE 消息就是纯文本 content：澄清追问按「问题\n①选项\n②选项」写入
// （clarify 节点），设计计划按 formatDesignPlan 的「设计计划 vN\n工程名：…
// \n分区：\n  区名：控件…」写入。前端不做协议变更，而是用下面的纯函数在
// 渲染层识别文本并增强展示（可点选选项 / 结构化卡片）。返回类型仅用于展示，
// 不进入任何后端契约。
// ---------------------------------------------------------------------------

/** 澄清追问的识别结果：问题正文 + 可点选的选项文本（含前缀原样保留）。 */
export interface ClarifyingQuestionView {
  question: string;
  options: string[];
}

/** 设计计划文本（Task 6 formatDesignPlan 输出）的展示视图。 */
export interface DesignPlanView {
  /** 「设计计划 v1」中的版本号，无版本时为 null。 */
  version: string | null;
  engineeringName: string;
  summary: string;
  layout: string;
  style: string;
  sections: { label: string; controls: string }[];
  signature: string;
}

export interface CustomerEffectBlueprintView {
  schema: "kf-design-plan/v2";
  revision: number;
  designPlanHash: string;
  displayName: string;
  overview: {
    objective: string;
    audiences: string[];
    scenarios: string[];
    valueProposition: string;
  };
  informationArchitecture: { narrative: string; wireframe: string };
  modules: Array<{
    id: string;
    name: string;
    purpose: string;
    content: string[];
    sampleData: Array<{ label: string; value: string }>;
    interactions: string[];
    presentation: string;
  }>;
  visualDirection: {
    tone: string;
    colors: string[];
    typography: string;
    spacingAndSurfaces: string;
  };
  highlights: string[];
  revisionNotes: { added: string[]; changed: string[]; retained: string[] };
  acceptanceCriteria: string[];
  openQuestions: string[];
}

export interface CustomerSolutionBlueprintView {
  schema: "kf-design-plan/v3";
  revision: number;
  designPlanHash: string;
  displayName: string;
  objective: string;
  audiences: string[];
  scenarios: string[];
  pages: Array<{
    id: string;
    title: string;
    purpose: string;
    readingOrder: string[];
    regions: Array<{
      id: string;
      purpose: string;
      semanticRoles: string[];
      dataShape: string;
      density: "compact" | "comfortable" | "spacious";
      importance: "primary" | "secondary" | "supporting";
      content: string[];
      sampleData: Array<Array<{ label: string; value: string }>>;
      interactions: string[];
      states: string[];
      visualIntent: string;
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      visualRegionIds?: string[];
      // end
    }>;
  }>;
  journeys: Array<{
    id: string;
    actor: string;
    goal: string;
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    steps: Array<{ pageId: string; regionId: string; action: string; result: string; kind?: "observe" | "interact"; expectedTexts?: string[] }>;
    // end
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    completion?: string;
    // end
  }>;
  visualDirection: {
    tone: string;
    colors: string[];
    typography: string;
    spacingAndSurfaces: string;
  };
  acceptanceScenarios: string[];
  openQuestions: string[];
}

export type CustomerBlueprintView = CustomerEffectBlueprintView | CustomerSolutionBlueprintView;

const OPTION_CIRCLED = /^[①-⑩]/;
const OPTION_NUMERIC = /^\d+[.、]/;
const MAX_OPTIONS = 5;

/**
 * 识别澄清追问文本：第一行为问题，后续连续行以 ①②③④⑤ 或 1. 2. 开头
 * 且不超过 5 个选项。未命中返回 null（调用方回退为纯文本渲染）。
 */
export function parseClarifyingQuestion(content: string): ClarifyingQuestionView | null {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return null;
  const question = lines[0]!;
  const options: string[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!OPTION_CIRCLED.test(line) && !OPTION_NUMERIC.test(line)) break;
    options.push(line);
  }
  if (options.length === 0 || options.length > MAX_OPTIONS) return null;
  return { question, options };
}

const DESIGN_PLAN_HEADER = /^设计计划(?:\s*(v?\d+))?/;
const SECTION_LINE = /^\s{2,}([^：:]+)[：:]\s*(.+)$/;
const FIELD_LINE = /^([^：:]+)[：:]\s*(.*)$/;

/**
 * 识别设计计划文本（formatDesignPlan 输出）：文本含「设计计划」标题行
 * （前面可能有问候语等非计划内容，如「您好，我已根据您的需求整理出
 * 一份设计草案，请您过目：」），扫描首个匹配「设计计划 vN」的行作为
 * 标题；逐行提取 工程名/摘要/布局/风格/记忆点 与「分区：」下的缩进分区。
 * 至少要提取到一个计划字段才算命中，否则返回 null。
 */
export function parseDesignPlan(content: string): DesignPlanView | null {
  const lines = content.split("\n");
  const headerIndex = lines.findIndex((line) => DESIGN_PLAN_HEADER.test(line.trim()));
  if (headerIndex === -1) return null;
  const header = lines[headerIndex]!.trim().match(DESIGN_PLAN_HEADER);

  const view: DesignPlanView = {
    version: header?.[1] ?? null,
    engineeringName: "",
    summary: "",
    layout: "",
    style: "",
    sections: [],
    signature: "",
  };

  let inSections = false;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (inSections) {
      const section = line.match(SECTION_LINE);
      if (section !== null) {
        view.sections.push({ label: section[1]!.trim(), controls: section[2]!.trim() });
        continue;
      }
      // 缩进分区段结束（记忆点/提示行不再以两个空格缩进）。
      inSections = false;
    }
    const field = line.match(FIELD_LINE);
    if (field === null) continue;
    const key = field[1]!.trim();
    const value = field[2]!.trim();
    if (key === "分区") inSections = true;
    else if (key === "工程名") view.engineeringName = value;
    else if (key === "摘要") view.summary = value;
    else if (key === "布局") view.layout = value;
    else if (key === "风格") view.style = value;
    else if (key === "记忆点") view.signature = value;
  }

  const hasPlanContent =
    view.engineeringName !== "" || view.summary !== "" || view.signature !== "";
  return hasPlanContent ? view : null;
}

const BLUEPRINT_MESSAGE_PREFIX = "KF_BLUEPRINT_MESSAGE/1\n";

/** 将内部传输信封解码为仅面向客户的视图模型。 */
export function parseCustomerEffectBlueprint(
  content: string,
): CustomerBlueprintView | null {
  if (!content.startsWith(BLUEPRINT_MESSAGE_PREFIX)) return null;
  try {
    const envelope = JSON.parse(content.slice(BLUEPRINT_MESSAGE_PREFIX.length)) as unknown;
    if (!isRecord(envelope)) return null;
    if (envelope["kind"] !== "kf-customer-effect-blueprint" || envelope["version"] !== 1) {
      return null;
    }
    const revision = envelope["revision"];
    const designPlanHash = envelope["designPlanHash"];
    const blueprint = envelope["blueprint"];
    if (
      typeof revision !== "number" ||
      !Number.isInteger(revision) ||
      revision < 1 ||
      typeof designPlanHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(designPlanHash) ||
      !isRecord(blueprint)
    ) {
      return null;
    }
    if (blueprint["schema"] === "kf-design-plan/v3") {
      return parseCustomerSolutionBlueprint(blueprint, revision, designPlanHash);
    }
    if (blueprint["schema"] !== "kf-design-plan/v2") return null;

    const overview = blueprint["overview"];
    const architecture = blueprint["informationArchitecture"];
    const visual = blueprint["visualDirection"];
    const notes = blueprint["revisionNotes"];
    const modules = blueprint["modules"];
    if (
      typeof blueprint["displayName"] !== "string" ||
      !isRecord(overview) ||
      !isRecord(architecture) ||
      !isRecord(visual) ||
      !isRecord(notes) ||
      !Array.isArray(modules)
    ) {
      return null;
    }

    const audiences = asStringArray(overview["audiences"]);
    const scenarios = asStringArray(overview["scenarios"]);
    const colors = asStringArray(visual["colors"]);
    const highlights = asStringArray(blueprint["highlights"]);
    const added = asStringArray(notes["added"]);
    const changed = asStringArray(notes["changed"]);
    const retained = asStringArray(notes["retained"]);
    const acceptanceCriteria = asStringArray(blueprint["acceptanceCriteria"]);
    const openQuestions = asStringArray(blueprint["openQuestions"]);
    if (
      typeof overview["objective"] !== "string" ||
      typeof overview["valueProposition"] !== "string" ||
      typeof architecture["narrative"] !== "string" ||
      typeof architecture["wireframe"] !== "string" ||
      typeof visual["tone"] !== "string" ||
      typeof visual["typography"] !== "string" ||
      typeof visual["spacingAndSurfaces"] !== "string" ||
      audiences === null ||
      scenarios === null ||
      colors === null ||
      highlights === null ||
      added === null ||
      changed === null ||
      retained === null ||
      acceptanceCriteria === null ||
      openQuestions === null
    ) {
      return null;
    }

    const parsedModules = modules.map(parseBlueprintModule);
    if (parsedModules.some((module) => module === null)) return null;
    return {
      schema: "kf-design-plan/v2",
      revision,
      designPlanHash,
      displayName: blueprint["displayName"],
      overview: {
        objective: overview["objective"],
        audiences,
        scenarios,
        valueProposition: overview["valueProposition"],
      },
      informationArchitecture: {
        narrative: architecture["narrative"],
        wireframe: architecture["wireframe"],
      },
      modules: parsedModules as CustomerEffectBlueprintView["modules"],
      visualDirection: {
        tone: visual["tone"],
        colors,
        typography: visual["typography"],
        spacingAndSurfaces: visual["spacingAndSurfaces"],
      },
      highlights,
      revisionNotes: { added, changed, retained },
      acceptanceCriteria,
      openQuestions,
    };
  } catch {
    return null;
  }
}

const SOLUTION_TEXT_MAX = 600;
const SOLUTION_LIST_MAX = 12;
const SOLUTION_PAGE_MAX = 8;
const SOLUTION_JOURNEY_MAX = 12;
const SOLUTION_SAMPLE_FIELD_MAX = 32;
const SOLUTION_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

function boundedText(value: unknown, max = SOLUTION_TEXT_MAX): string | null {
  return typeof value === "string"
    && value.length > 0
    && value.length <= max
    && value.trim() === value
    ? value
// end
    : null;
}

function boundedId(value: unknown): string | null {
  const text = boundedText(value, 100);
  return text !== null && SOLUTION_ID.test(text) ? text : null;
}

function boundedTextArray(value: unknown, min = 0, max = SOLUTION_LIST_MAX): string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null;
  const parsed = value.map((item) => boundedText(item));
  return parsed.some((item) => item === null) ? null : parsed as string[];
}

function boundedIdArray(value: unknown, min = 0, max = SOLUTION_LIST_MAX): string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null;
  const parsed = value.map((item) => boundedId(item));
  return parsed.some((item) => item === null) ? null : parsed as string[];
}

function parseCustomerSolutionBlueprint(
  blueprint: Record<string, unknown>,
  revision: number,
  designPlanHash: string,
): CustomerSolutionBlueprintView | null {
  const displayName = boundedText(blueprint["displayName"]);
  const objective = boundedText(blueprint["objective"]);
  const audiences = boundedTextArray(blueprint["audiences"], 1);
  const scenarios = boundedTextArray(blueprint["scenarios"], 1);
  const acceptanceScenarios = boundedTextArray(blueprint["acceptanceScenarios"], 1);
  const openQuestions = boundedTextArray(blueprint["openQuestions"]);
  const pagesValue = blueprint["pages"];
  const journeysValue = blueprint["journeys"];
  const visual = blueprint["visualDirection"];
  if (
    displayName === null || objective === null || audiences === null || scenarios === null
    || acceptanceScenarios === null || openQuestions === null
    || !Array.isArray(pagesValue) || pagesValue.length < 1 || pagesValue.length > SOLUTION_PAGE_MAX
    || !Array.isArray(journeysValue) || journeysValue.length < 1 || journeysValue.length > SOLUTION_JOURNEY_MAX
    || !isRecord(visual)
  ) return null;

  const tone = boundedText(visual["tone"]);
  const colors = boundedTextArray(visual["colors"], 1);
  const typography = boundedText(visual["typography"]);
  const spacingAndSurfaces = boundedText(visual["spacingAndSurfaces"]);
  if (tone === null || colors === null || typography === null || spacingAndSurfaces === null) return null;

  const pages = pagesValue.map(parseSolutionPage);
  if (pages.some((page) => page === null)) return null;
  const typedPages = pages as CustomerSolutionBlueprintView["pages"];
  const pageIds = new Set<string>();
  const regionOwners = new Map<string, string>();
  for (const page of typedPages) {
    if (pageIds.has(page.id)) return null;
    pageIds.add(page.id);
    const pageRegionIds = new Set(page.regions.map((region) => region.id));
    if (pageRegionIds.size !== page.regions.length) return null;
    if (new Set(page.readingOrder).size !== page.readingOrder.length) return null;
    if (page.readingOrder.some((regionId) => !pageRegionIds.has(regionId))) return null;
    for (const regionId of pageRegionIds) {
      if (regionOwners.has(regionId)) return null;
      regionOwners.set(regionId, page.id);
    }
  }

  const journeys = journeysValue.map(parseSolutionJourney);
  if (journeys.some((journey) => journey === null)) return null;
  const typedJourneys = journeys as CustomerSolutionBlueprintView["journeys"];
  if (new Set(typedJourneys.map((journey) => journey.id)).size !== typedJourneys.length) return null;
  if (typedJourneys.some((journey) => journey.steps.some((step) =>
    regionOwners.get(step.regionId) !== step.pageId))) return null;

  return {
    schema: "kf-design-plan/v3",
    revision,
    designPlanHash,
    displayName,
    objective,
    audiences,
    scenarios,
    pages: typedPages,
    journeys: typedJourneys,
    visualDirection: { tone, colors, typography, spacingAndSurfaces },
    acceptanceScenarios,
    openQuestions,
  };
}

function parseSolutionPage(value: unknown): CustomerSolutionBlueprintView["pages"][number] | null {
  if (!isRecord(value)) return null;
  const id = boundedId(value["id"]);
  const title = boundedText(value["title"]);
  const purpose = boundedText(value["purpose"]);
  const readingOrder = boundedIdArray(value["readingOrder"], 1);
  const regionsValue = value["regions"];
  if (
    id === null || title === null || purpose === null || readingOrder === null
    || !Array.isArray(regionsValue) || regionsValue.length < 1 || regionsValue.length > SOLUTION_LIST_MAX
  ) return null;
  const regions = regionsValue.map(parseSolutionRegion);
  if (regions.some((region) => region === null)) return null;
  return { id, title, purpose, readingOrder, regions: regions as CustomerSolutionBlueprintView["pages"][number]["regions"] };
}

function parseSolutionRegion(value: unknown): CustomerSolutionBlueprintView["pages"][number]["regions"][number] | null {
  if (!isRecord(value)) return null;
  const id = boundedId(value["id"]);
  const purpose = boundedText(value["purpose"]);
  const semanticRoles = boundedTextArray(value["semanticRoles"], 1);
  const dataShape = boundedText(value["dataShape"]);
  const content = boundedTextArray(value["content"], 1);
  const interactions = boundedTextArray(value["interactions"]);
  const states = boundedTextArray(value["states"], 1);
  const visualIntent = boundedText(value["visualIntent"]);
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  const visualIds = value["visualRegionIds"];
  if (visualIds !== undefined && (!Array.isArray(visualIds) || visualIds.length < 1 || visualIds.length > 100
    || visualIds.some((id) => typeof id !== "string" || id.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id))
    || new Set(visualIds).size !== visualIds.length)) return null;
  // end
  const density = value["density"];
  const importance = value["importance"];
  const sampleValue = value["sampleData"];
  if (
    id === null || purpose === null || semanticRoles === null || dataShape === null || content === null
    || interactions === null || states === null || visualIntent === null
    || (density !== "compact" && density !== "comfortable" && density !== "spacious")
    || (importance !== "primary" && importance !== "secondary" && importance !== "supporting")
    || !Array.isArray(sampleValue) || sampleValue.length > SOLUTION_LIST_MAX
  ) return null;
  const sampleData = sampleValue.map((sample) => {
    if (!isRecord(sample)) return null;
    const entries = Object.entries(sample);
    if (entries.length > SOLUTION_SAMPLE_FIELD_MAX) return null;
    const fields = entries.map(([label, raw]) => {
      const parsedLabel = boundedText(label, 100);
      const parsedValue = boundedText(raw);
      return parsedLabel === null || parsedValue === null ? null : { label: parsedLabel, value: parsedValue };
    });
    return fields.some((field) => field === null) ? null : fields as Array<{ label: string; value: string }>;
  });
  if (sampleData.some((sample) => sample === null)) return null;
  return {
    id, purpose, semanticRoles, dataShape, density, importance, content,
    sampleData: sampleData as Array<Array<{ label: string; value: string }>>,
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    interactions, states, visualIntent, ...(visualIds === undefined ? {} : { visualRegionIds: visualIds as string[] }),
    // end
  };
}

function parseSolutionJourney(value: unknown): CustomerSolutionBlueprintView["journeys"][number] | null {
  if (!isRecord(value)) return null;
  const id = boundedId(value["id"]);
  const actor = boundedText(value["actor"]);
  const goal = boundedText(value["goal"]);
  const completion = boundedText(value["completion"]);
  const stepsValue = value["steps"];
  if (
    id === null || actor === null || goal === null || completion === null
    || !Array.isArray(stepsValue) || stepsValue.length < 1 || stepsValue.length > SOLUTION_LIST_MAX
  ) return null;
  const steps = stepsValue.map((step) => {
    if (!isRecord(step)) return null;
    const pageId = boundedId(step["pageId"]);
    const regionId = boundedId(step["regionId"]);
    const action = boundedText(step["action"]);
    const result = boundedText(step["result"]);
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    const kind = step["kind"];
    if (kind !== undefined && kind !== "observe" && kind !== "interact") return null;
    const expectedTexts = kind === "observe" ? boundedTextArray(step["expectedTexts"], 1) : undefined;
    if (kind === "observe" && (expectedTexts === null || expectedTexts === undefined || new Set(expectedTexts).size !== expectedTexts.length)) return null;
    if (kind !== "observe" && Object.hasOwn(step, "expectedTexts")) return null;
    return pageId === null || regionId === null || action === null || result === null
      ? null : { pageId, regionId, action, result, ...(kind === undefined ? {} : { kind }),
        ...(expectedTexts === undefined || expectedTexts === null ? {} : { expectedTexts }) };
    // end
  });
  if (steps.some((step) => step === null)) return null;
  return { id, actor, goal, steps: steps as CustomerSolutionBlueprintView["journeys"][number]["steps"], completion };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function parseBlueprintModule(
  value: unknown,
): CustomerEffectBlueprintView["modules"][number] | null {
  if (!isRecord(value)) return null;
  const content = asStringArray(value["content"]);
  const interactions = asStringArray(value["interactions"]);
  const sampleData = value["sampleData"];
  if (
    typeof value["id"] !== "string" ||
    typeof value["name"] !== "string" ||
    typeof value["purpose"] !== "string" ||
    typeof value["presentation"] !== "string" ||
    content === null ||
    interactions === null ||
    !Array.isArray(sampleData)
  ) {
    return null;
  }
  const samples = sampleData.map((sample) => {
    if (
      !isRecord(sample) ||
      typeof sample["label"] !== "string" ||
      typeof sample["value"] !== "string"
    ) {
      return null;
    }
    return { label: sample["label"], value: sample["value"] };
  });
  if (samples.some((sample) => sample === null)) return null;
  return {
    id: value["id"],
    name: value["name"],
    purpose: value["purpose"],
    content,
    sampleData: samples as Array<{ label: string; value: string }>,
    interactions,
    presentation: value["presentation"],
  };
}
