import {
  CompositionRecipeSchema,
  type CompositionRecipe,
} from "@kf/contracts";
import { listControlDesignProfiles } from "./control-design-registry.js";
import { createKnowledgeRegistry } from "./registry.js";

const RAW_RECIPES: readonly unknown[] = [
  {
    schema: "kf-composition-recipe/v1",
    id: "split-hero",
    version: "1.0.0",
    purpose: "以清晰叙事和一个明确动作建立页面入口。",
    useFor: ["产品介绍", "服务入口", "具有单一主张的专题首页"],
    avoidFor: ["需要高密度比较的大量记录", "需要持续筛选的工作台"],
    requiredRoles: [
      { role: "heading", capabilityCandidates: ["text"] },
      { role: "narrative", capabilityCandidates: ["richtext", "text"] },
      { role: "primary-action", capabilityCandidates: ["button", "easyui.2"] },
      { role: "media", capabilityCandidates: ["image"] },
      { role: "structure", capabilityCandidates: ["layout.2", "layout.4"] },
    ],
    optionalRoles: [
      { role: "supporting-status", capabilityCandidates: ["tag"] },
    ],
    layoutPrinciples: ["采用 5/7 或 7/5 分栏，并让一侧保持明确主导。", "高度跟随内容，不为了对称而制造空白。"],
    interactionFlow: ["用户通过 primary-action 进入下一页面或启动下一步任务。"],
    substitutions: [
      { when: "没有足够媒体内容", replaceRole: "media", withCapabilities: ["richtext", "tag"] },
    ],
    designNotes: ["动作区与叙事保持同一视觉路径，避免把所有元素平均分配。"],
  },
  {
    schema: "kf-composition-recipe/v1",
    id: "media-card-gallery",
    version: "1.0.0",
    purpose: "以可比较的媒体内容组织作品、案例或产品条目。",
    useFor: ["图片主导的作品展示", "案例集合", "需要快速浏览的商品或内容卡片"],
    avoidFor: ["以字段比较为主的业务记录", "没有可叙事内容的纯筛选任务"],
    requiredRoles: [
      { role: "media", capabilityCandidates: ["image"] },
      { role: "title", capabilityCandidates: ["text"] },
      { role: "summary", capabilityCandidates: ["text", "richtext"] },
      { role: "action", capabilityCandidates: ["button", "easyui.2"] },
      { role: "structure", capabilityCandidates: ["layout.2", "layout.4"] },
    ],
    optionalRoles: [
      { role: "category", capabilityCandidates: ["tag"] },
      { role: "secondary-action", capabilityCandidates: ["button", "easyui.2"] },
    ],
    layoutPrinciples: ["使用一个焦点条目加次级条目，或采用响应式网格。", "卡片内的媒体、标题、摘要和动作必须形成稳定层级。"],
    interactionFlow: ["用户选择条目动作后进入详情页或切换到该条目的内容视图。"],
    substitutions: [
      { when: "内容没有可用图片", replaceRole: "media", withCapabilities: ["richtext", "tag"] },
    ],
    designNotes: ["媒体是内容证据而非背景装饰；当图片缺失时，以叙事和分类维持信息密度。"],
  },
  {
    schema: "kf-composition-recipe/v1",
    id: "filtered-record-workspace",
    version: "1.0.0",
    purpose: "让用户通过检索和筛选定位结构稳定的记录集合。",
    useFor: ["客户列表", "订单或任务记录", "需要搜索、筛选和分页的数据工作区"],
    avoidFor: ["图片主导的作品展示", "品牌叙事内容", "单一主张的营销首页"],
    requiredRoles: [
      { role: "search", capabilityCandidates: ["easyui.6", "input"] },
      { role: "filter", capabilityCandidates: ["select", "checkbox", "radio"] },
      { role: "record-list", capabilityCandidates: ["easyui.1", "list", "easyui.18"] },
      { role: "structure", capabilityCandidates: ["layout.4"] },
      { role: "pagination", capabilityCandidates: ["easyui.22"] },
    ],
    optionalRoles: [
      { role: "bulk-action", capabilityCandidates: ["button", "easyui.2"] },
      { role: "record-status", capabilityCandidates: ["tag"] },
    ],
    layoutPrinciples: ["工具栏与结果面保持上边缘对齐。", "结果区域占据剩余空间，筛选不应挤压记录可读性。"],
    interactionFlow: ["用户输入搜索词或调整筛选条件，结果面更新并保留当前筛选上下文。", "用户选择记录后进入详情页或打开聚焦详情。"],
    substitutions: [
      { when: "记录只有少量低列信息", replaceRole: "record-list", withCapabilities: ["list"] },
      { when: "记录存在父子层级", replaceRole: "record-list", withCapabilities: ["easyui.18"] },
    ],
    designNotes: ["不要把媒体画廊伪装成数据表；该构图的价值来自定位、比较和连续操作。"],
  },
  {
    schema: "kf-composition-recipe/v1",
    id: "master-detail-workspace",
    version: "1.0.0",
    purpose: "在保留上下文的同时浏览记录并查看其详情。",
    useFor: ["案件或客户管理", "目录浏览", "需要在列表和详情之间反复切换的任务"],
    avoidFor: ["首次品牌叙事", "需要并列浏览大量媒体作品的画廊"],
    requiredRoles: [
      { role: "master", capabilityCandidates: ["easyui.1", "list", "tree", "easyui.18"] },
      { role: "detail", capabilityCandidates: ["richtext", "text"] },
      { role: "structure", capabilityCandidates: ["layout.2", "layout.5"] },
    ],
    optionalRoles: [
      { role: "detail-action", capabilityCandidates: ["button", "easyui.2"] },
      { role: "detail-overlay", capabilityCandidates: ["easyui.12", "easyui.19"] },
    ],
    layoutPrinciples: ["主列表始终比详情区域窄，使详情成为工作焦点。", "当上下文需要暂时保留时，允许以覆盖层替代详情面板。"],
    interactionFlow: ["用户选择 master 中的记录，detail 区域随之切换。", "用户可在保留列表上下文的前提下，通过覆盖层查看聚焦详情。"],
    substitutions: [
      { when: "目录层级比字段比较更重要", replaceRole: "master", withCapabilities: ["tree"] },
      { when: "详情需要短时集中处理", replaceRole: "detail", withCapabilities: ["easyui.12", "easyui.19"] },
    ],
    designNotes: ["主从关系是信息关系，不是把两个区域做成等宽的并列卡片。"],
  },
  {
    schema: "kf-composition-recipe/v1",
    id: "sidebar-admin-shell",
    version: "1.0.0",
    purpose: "为多目的地业务应用提供稳定导航和单一主工作面。",
    useFor: ["后台管理", "多模块运营系统", "需要持续跨页面切换的业务工具"],
    avoidFor: ["只有一个动作的落地页", "无层级的短内容阅读"],
    requiredRoles: [
      { role: "navigation", capabilityCandidates: ["navmenu", "tree"] },
      { role: "content", capabilityCandidates: ["layout.4"] },
      { role: "structure", capabilityCandidates: ["layout.5"] },
    ],
    optionalRoles: [
      { role: "page-title", capabilityCandidates: ["text"] },
      { role: "global-action", capabilityCandidates: ["button", "easyui.2"] },
    ],
    layoutPrinciples: ["保持持久且较窄的导航区，并将主要操作留给一个主工作面。", "导航分组和当前目的地应清晰，不用大尺寸首页按钮代替信息架构。"],
    interactionFlow: ["用户切换 navigation 目的地，主工作面跳转到对应页面并保留清晰的当前位置。"],
    substitutions: [
      { when: "目的地由父子结构组织", replaceRole: "navigation", withCapabilities: ["tree"] },
    ],
    designNotes: ["外壳只建立应用秩序，具体页面仍可根据任务选择不同构图。"],
  },
  {
    schema: "kf-composition-recipe/v1",
    id: "form-dialog-flow",
    version: "1.0.0",
    purpose: "在有限上下文中完成创建、编辑或确认等聚焦任务。",
    useFor: ["创建记录", "编辑字段", "需要确认后提交的短流程"],
    avoidFor: ["长篇阅读", "需要同时观察多个大范围数据面板的任务"],
    requiredRoles: [
      { role: "input", capabilityCandidates: ["input", "inputnumber", "select", "checkbox", "radio", "switch", "datetimepicker"] },
      { role: "action", capabilityCandidates: ["button", "easyui.2"] },
      { role: "overlay", capabilityCandidates: ["easyui.12", "easyui.19"] },
      { role: "structure", capabilityCandidates: ["layout.4"] },
    ],
    optionalRoles: [
      { role: "field-description", capabilityCandidates: ["text", "richtext"] },
      { role: "field-status", capabilityCandidates: ["tag"] },
    ],
    layoutPrinciples: ["标签与输入项沿稳定对齐线排列。", "主动作应与重置或取消明确区分，且靠近流程结束处。"],
    interactionFlow: ["用户打开 overlay，填写或调整 input 后执行主 action。", "用户提交后关闭覆盖层并返回带有结果反馈的原上下文。"],
    substitutions: [
      { when: "任务不需要覆盖层隔离", replaceRole: "overlay", withCapabilities: ["layout.4"] },
      { when: "值只在两个状态之间切换", replaceRole: "input", withCapabilities: ["switch"] },
    ],
    designNotes: ["表单不是控件堆叠；字段分组、说明与校验反馈都应服务于完成任务。"],
  },
];

const RECIPES = RAW_RECIPES.map((recipe) => CompositionRecipeSchema.parse(recipe));
const controlProfileIds = new Set(listControlDesignProfiles().map((profile) => profile.capabilityId));

for (const recipe of RECIPES) {
  const referencedCapabilities = [
    ...recipe.requiredRoles.flatMap((role) => role.capabilityCandidates),
    ...recipe.optionalRoles.flatMap((role) => role.capabilityCandidates),
    ...recipe.substitutions.flatMap((substitution) => substitution.withCapabilities),
  ];
  for (const capabilityId of referencedCapabilities) {
    if (!controlProfileIds.has(capabilityId)) {
      throw new Error(`COMPOSITION_RECIPE_CAPABILITY_NOT_FOUND: ${recipe.id}: ${capabilityId}`);
    }
  }
}

const registry = createKnowledgeRegistry(
  RECIPES,
  (recipe) => recipe.id,
  "COMPOSITION_RECIPE_NOT_FOUND",
);

export const listCompositionRecipes = (): readonly CompositionRecipe[] => registry.list();
export const getCompositionRecipe = (id: string): CompositionRecipe | undefined => registry.get(id);
export const requireCompositionRecipe = (id: string): CompositionRecipe => registry.require(id);
