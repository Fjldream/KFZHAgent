import {
  ControlDesignProfileSchema,
  type ControlDesignProfile,
} from "@kf/contracts";
import { getControlCapability } from "../style/control-capability-registry.js";
import { createKnowledgeRegistry } from "./registry.js";

const RAW_PROFILES: readonly unknown[] = [
  {
    schema: "kf-control-design-profile/v1", capabilityId: "button", version: "1.0.0",
    semanticRoles: ["primary-action", "secondary-action"],
    useFor: ["触发明确且可见的用户操作"], avoidFor: ["没有动作含义的导航装饰"],
    dataShapes: ["action-list"], densities: ["compact", "comfortable"], regions: ["main", "toolbar", "overlay"],
    minimumSize: { width: 90, height: 60 }, recommendedCompanions: ["text", "image"], alternatives: [],
    parentRoles: ["action-group", "content-panel"], childRoles: [], designNotes: ["主要动作应在同一上下文中保持唯一且可识别。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "checkbox", version: "1.0.0",
    semanticRoles: ["form-input", "boolean-choice", "multi-choice"],
    useFor: ["多个可独立勾选的表单选项"], avoidFor: ["只读内容展示"],
    dataShapes: ["scalar", "record"], densities: ["comfortable", "spacious"], regions: ["main", "sidebar", "overlay"],
    minimumSize: { width: 314, height: 110 }, recommendedCompanions: ["text", "button"], alternatives: [],
    parentRoles: ["form-section", "filter-bar"], childRoles: [], designNotes: ["选项标签需要清楚描述被勾选后的结果。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "datetimepicker", version: "1.0.0",
    semanticRoles: ["form-input", "date-time-value", "range-filter"],
    useFor: ["限定日期或时间范围的表单输入和筛选"], avoidFor: ["只读内容展示"],
    dataShapes: ["scalar", "time-series"], densities: ["compact", "comfortable"], regions: ["toolbar", "main", "sidebar"],
    minimumSize: { width: 150, height: 45 }, recommendedCompanions: ["button", "easyui.1"], alternatives: [],
    parentRoles: ["form-section", "filter-bar"], childRoles: [], designNotes: ["日期范围应贴近受其影响的结果区域。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "easyui.1", version: "1.0.0",
    semanticRoles: ["structured-record-list", "comparison", "record-selection"],
    useFor: ["可筛选的同构记录", "字段稳定且需要选择记录的数据列表"], avoidFor: ["图片主导的作品展示", "品牌叙事内容"],
    dataShapes: ["record-list"], densities: ["compact", "comfortable"], regions: ["main", "workspace"],
    minimumSize: { width: 640, height: 240 }, recommendedCompanions: ["easyui.6", "select", "easyui.22"],
    alternatives: [{ when: "内容强调图片和叙事", capabilityIds: ["image", "text", "button", "layout.2"] }],
    parentRoles: ["data-workspace"], childRoles: [], designNotes: ["表头、筛选工具栏和数据列需要形成统一对齐线。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "easyui.12", version: "1.0.0",
    semanticRoles: ["modal-detail", "focused-task"],
    useFor: ["上下文详情和需要集中完成的短任务"], avoidFor: ["永久的主页面布局"],
    dataShapes: ["record", "action-list"], densities: ["comfortable", "spacious"], regions: ["overlay"],
    minimumSize: { width: 320, height: 180 }, recommendedCompanions: ["text", "button", "input"], alternatives: [],
    parentRoles: ["overlay"], childRoles: [], designNotes: ["弹层必须有清晰的关闭或完成路径。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "easyui.18", version: "1.0.0",
    semanticRoles: ["hierarchical-record-list", "comparison", "record-selection"],
    useFor: ["同时需要层级关系和多字段比较的记录"], avoidFor: ["平铺叙事内容"],
    dataShapes: ["hierarchy", "record-list"], densities: ["compact", "comfortable"], regions: ["main", "workspace"],
    minimumSize: { width: 520, height: 240 }, recommendedCompanions: ["easyui.6", "easyui.22"], alternatives: [],
    parentRoles: ["data-workspace"], childRoles: [], designNotes: ["层级缩进与列信息应共同服务于定位任务。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "easyui.19", version: "1.0.0",
    semanticRoles: ["modal-detail", "focused-task"],
    useFor: ["上下文详情和需要集中完成的短任务"], avoidFor: ["永久的主页面布局"],
    dataShapes: ["record", "action-list"], densities: ["comfortable", "spacious"], regions: ["overlay"],
    minimumSize: { width: 320, height: 180 }, recommendedCompanions: ["text", "button"], alternatives: [],
    parentRoles: ["overlay"], childRoles: [], designNotes: ["窗口内容应围绕单一任务，避免承载完整应用导航。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "easyui.2", version: "1.0.0",
    semanticRoles: ["primary-action", "secondary-action"],
    useFor: ["触发明确且可见的用户操作"], avoidFor: ["没有动作含义的导航装饰"],
    dataShapes: ["action-list"], densities: ["compact", "comfortable"], regions: ["main", "toolbar", "overlay"],
    minimumSize: { width: 80, height: 40 }, recommendedCompanions: ["text"], alternatives: [],
    parentRoles: ["action-group", "toolbar"], childRoles: [], designNotes: ["按钮文案应说明结果而非仅描述位置。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "easyui.22", version: "1.0.0",
    semanticRoles: ["pagination"],
    useFor: ["分批展示的记录集合"], avoidFor: ["没有结果视图时单独使用"],
    dataShapes: ["record-list"], densities: ["compact", "comfortable"], regions: ["main", "workspace"],
    minimumSize: { width: 500, height: 30 }, recommendedCompanions: ["easyui.1", "easyui.18", "list"], alternatives: [],
    parentRoles: ["data-workspace"], childRoles: [], designNotes: ["分页应紧贴其控制的结果列表，并保留当前范围信息。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "easyui.6", version: "1.0.0",
    semanticRoles: ["record-search"],
    useFor: ["紧邻结果视图的关键词搜索"], avoidFor: ["单独作为内容区块"],
    dataShapes: ["record-list"], densities: ["compact", "comfortable"], regions: ["toolbar", "main", "workspace"],
    minimumSize: { width: 280, height: 22 }, recommendedCompanions: ["easyui.1", "easyui.18", "easyui.22"], alternatives: [],
    parentRoles: ["filter-bar", "data-workspace"], childRoles: [], designNotes: ["搜索触发后的结果范围应可被用户辨认。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "image", version: "1.0.0",
    semanticRoles: ["media", "portrait", "product-visual"],
    useFor: ["视觉叙事和可识别的媒体内容"], avoidFor: ["没有内容目的的装饰填充"],
    dataShapes: ["media-list", "record"], densities: ["comfortable", "spacious"], regions: ["header", "main", "sidebar", "workspace"],
    minimumSize: { width: 200, height: 200 }, recommendedCompanions: ["text", "button", "tag"], alternatives: [],
    parentRoles: ["content-panel", "media-gallery"], childRoles: [], designNotes: ["媒体应与标题、说明或动作建立明确语义关系。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "input", version: "1.0.0",
    semanticRoles: ["form-input", "text-value", "filter-input"],
    useFor: ["受限的文本录入和筛选条件"], avoidFor: ["只读内容展示"],
    dataShapes: ["scalar", "record"], densities: ["compact", "comfortable"], regions: ["toolbar", "main", "sidebar", "overlay"],
    minimumSize: { width: 200, height: 45 }, recommendedCompanions: ["text", "button"], alternatives: [],
    parentRoles: ["form-section", "filter-bar"], childRoles: [], designNotes: ["输入框需要配套标签、示例或校验提示。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "inputnumber", version: "1.0.0",
    semanticRoles: ["form-input", "numeric-value", "range-filter"],
    useFor: ["受边界约束的数字录入和筛选"], avoidFor: ["只读内容展示"],
    dataShapes: ["scalar", "record"], densities: ["compact", "comfortable"], regions: ["toolbar", "main", "sidebar", "overlay"],
    minimumSize: { width: 170, height: 50 }, recommendedCompanions: ["text", "button"], alternatives: [],
    parentRoles: ["form-section", "filter-bar"], childRoles: [], designNotes: ["数字单位和允许范围应在输入附近明确表达。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "layout.2", version: "1.0.0",
    semanticRoles: ["row-layout"],
    useFor: ["横向组织同一层级的内容和动作"], avoidFor: ["客户可见的内容"],
    dataShapes: ["none"], densities: ["compact", "comfortable", "spacious"], regions: ["header", "main", "sidebar", "footer", "toolbar", "overlay", "workspace"],
    minimumSize: { width: 160, height: 40 }, recommendedCompanions: ["text", "image", "button"], alternatives: [],
    parentRoles: ["page", "content-panel"], childRoles: ["content-panel"], designNotes: ["行内项目应遵循明确的主次关系和间距节奏。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "layout.4", version: "1.0.0",
    semanticRoles: ["column-layout"],
    useFor: ["纵向组织信息层级和阅读顺序"], avoidFor: ["客户可见的内容"],
    dataShapes: ["none"], densities: ["compact", "comfortable", "spacious"], regions: ["header", "main", "sidebar", "footer", "toolbar", "overlay", "workspace"],
    minimumSize: { width: 160, height: 80 }, recommendedCompanions: ["text", "image", "button"], alternatives: [],
    parentRoles: ["page", "content-panel"], childRoles: ["content-panel"], designNotes: ["纵向节奏应随内容优先级而变化，避免平均切分。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "layout.5", version: "1.0.0",
    semanticRoles: ["dock-layout"],
    useFor: ["组织固定边缘区域和可工作的中心区域"], avoidFor: ["客户可见的内容"],
    dataShapes: ["none"], densities: ["compact", "comfortable", "spacious"], regions: ["main", "workspace"],
    minimumSize: { width: 480, height: 320 }, recommendedCompanions: ["navmenu", "tree", "easyui.1"], alternatives: [],
    parentRoles: ["page"], childRoles: ["sidebar", "workspace"], designNotes: ["固定区域应服务任务导航，中心区域保留主要操作空间。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "list", version: "1.0.0",
    semanticRoles: ["simple-record-list"],
    useFor: ["列数少且结构简单的短记录集合"], avoidFor: ["高列数比较"],
    dataShapes: ["record-list", "action-list"], densities: ["compact", "comfortable"], regions: ["main", "sidebar", "workspace"],
    minimumSize: { width: 100, height: 30 }, recommendedCompanions: ["text", "button", "tag"], alternatives: [],
    parentRoles: ["content-panel", "sidebar"], childRoles: [], designNotes: ["每一项的主信息和辅助信息应有稳定层次。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "navmenu", version: "1.0.0",
    semanticRoles: ["primary-navigation"],
    useFor: ["多个目的地之间的主导航"], avoidFor: ["单个放大的首页按钮"],
    dataShapes: ["action-list", "hierarchy"], densities: ["comfortable", "spacious"], regions: ["header", "sidebar"],
    minimumSize: { width: 300, height: 400 }, recommendedCompanions: ["layout.5", "text"], alternatives: [],
    parentRoles: ["page", "sidebar"], childRoles: [], designNotes: ["当前目的地和导航分组必须容易识别。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "radio", version: "1.0.0",
    semanticRoles: ["form-input", "single-choice"],
    useFor: ["数量有限且互斥的表单选择"], avoidFor: ["只读内容展示"],
    dataShapes: ["scalar", "record"], densities: ["comfortable", "spacious"], regions: ["main", "sidebar", "overlay"],
    minimumSize: { width: 314, height: 66 }, recommendedCompanions: ["text", "button"], alternatives: [],
    parentRoles: ["form-section", "filter-bar"], childRoles: [], designNotes: ["选项标签应足够自解释，避免要求用户猜测差异。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "richtext", version: "1.0.0",
    semanticRoles: ["heading", "body-copy", "narrative-content"],
    useFor: ["标题、说明和长篇内容"], avoidFor: ["结构化记录或交互控件的替代品"],
    dataShapes: ["scalar", "record"], densities: ["comfortable", "spacious"], regions: ["header", "main", "sidebar", "overlay", "workspace"],
    minimumSize: { width: 90, height: 80 }, recommendedCompanions: ["image", "button", "tag"], alternatives: [],
    parentRoles: ["content-panel", "narrative-section"], childRoles: [], designNotes: ["段落宽度和行距应优先保证阅读节奏。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "select", version: "1.0.0",
    semanticRoles: ["form-input", "bounded-choice", "filter-input"],
    useFor: ["固定候选项中的单项或多项选择"], avoidFor: ["只读内容展示"],
    dataShapes: ["scalar", "record"], densities: ["compact", "comfortable"], regions: ["toolbar", "main", "sidebar", "overlay"],
    minimumSize: { width: 150, height: 32 }, recommendedCompanions: ["text", "easyui.1", "button"], alternatives: [],
    parentRoles: ["form-section", "filter-bar"], childRoles: [], designNotes: ["候选项应保持可比较的命名和顺序。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "switch", version: "1.0.0",
    semanticRoles: ["form-input", "boolean-value", "immediate-toggle"],
    useFor: ["单一布尔状态的即时开关"], avoidFor: ["只读内容展示"],
    dataShapes: ["scalar", "record"], densities: ["compact", "comfortable"], regions: ["main", "sidebar", "overlay"],
    minimumSize: { width: 80, height: 30 }, recommendedCompanions: ["text"], alternatives: [],
    parentRoles: ["form-section", "settings-row"], childRoles: [], designNotes: ["开关标签应描述状态而非仅描述控件本身。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "tabs", version: "1.0.0",
    semanticRoles: ["view-switcher", "content-grouping"],
    useFor: ["共享上下文的同级视图"], avoidFor: ["单一区块的装饰"],
    dataShapes: ["record", "record-list", "action-list"], densities: ["comfortable", "spacious"], regions: ["main", "workspace"],
    minimumSize: { width: 200, height: 453 }, recommendedCompanions: ["text", "list", "easyui.1"], alternatives: [],
    parentRoles: ["content-panel", "workspace"], childRoles: ["content-panel"], designNotes: ["标签数量应克制，名称需帮助用户预测内容。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "tag", version: "1.0.0",
    semanticRoles: ["status-label", "category-label"],
    useFor: ["紧凑的状态和分类表达"], avoidFor: ["长段落文本或主要操作"],
    dataShapes: ["scalar", "record", "record-list"], densities: ["compact", "comfortable"], regions: ["header", "main", "sidebar", "toolbar", "workspace"],
    minimumSize: { width: 240, height: 70 }, recommendedCompanions: ["text", "list", "easyui.1"], alternatives: [],
    parentRoles: ["content-panel", "record-row"], childRoles: [], designNotes: ["标签颜色和文字应共同表达含义，不单独依赖颜色。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "text", version: "1.0.0",
    semanticRoles: ["heading", "body-copy", "narrative-content"],
    useFor: ["标题、说明和长篇内容"], avoidFor: ["结构化记录或交互控件的替代品"],
    dataShapes: ["scalar", "record"], densities: ["compact", "comfortable", "spacious"], regions: ["header", "main", "sidebar", "footer", "toolbar", "overlay", "workspace"],
    minimumSize: { width: 40, height: 30 }, recommendedCompanions: ["image", "button", "tag"], alternatives: [],
    parentRoles: ["content-panel", "narrative-section"], childRoles: [], designNotes: ["标题层级、对齐和留白应承担信息层次。"],
  },
  {
    schema: "kf-control-design-profile/v1", capabilityId: "tree", version: "1.0.0",
    semanticRoles: ["hierarchy-navigation"],
    useFor: ["父子关系明确的层级结构"], avoidFor: ["平铺且彼此无关的记录"],
    dataShapes: ["hierarchy"], densities: ["compact", "comfortable"], regions: ["sidebar", "main", "workspace"],
    minimumSize: { width: 200, height: 400 }, recommendedCompanions: ["layout.5", "easyui.18", "text"], alternatives: [],
    parentRoles: ["sidebar", "data-workspace"], childRoles: [], designNotes: ["展开状态和当前节点应让用户始终知道自己的位置。"],
  },
];

const PROFILES = RAW_PROFILES.map((profile) => ControlDesignProfileSchema.parse(profile));

for (const profile of PROFILES) {
  if (getControlCapability(profile.capabilityId) === undefined) {
    throw new Error(`CONTROL_DESIGN_PROFILE_CAPABILITY_NOT_FOUND: ${profile.capabilityId}`);
  }
}

const registry = createKnowledgeRegistry(
  PROFILES,
  (profile) => profile.capabilityId,
  "CONTROL_DESIGN_PROFILE_NOT_FOUND",
);

export const listControlDesignProfiles: () => readonly ControlDesignProfile[] = registry.list;
export const getControlDesignProfile: (capabilityId: string) => ControlDesignProfile | undefined = registry.get;
export const requireControlDesignProfile: (capabilityId: string) => ControlDesignProfile = registry.require;
