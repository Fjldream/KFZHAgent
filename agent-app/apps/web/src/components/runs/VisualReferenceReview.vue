<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
<script setup lang="ts">
// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
import { computed, nextTick, ref, watch } from "vue";
// end
import type { VisualRegion, VisualReviewAcceptance, VisualReviewDisplay, VisualReviewRevision } from "@kf/contracts";
import { VisualReviewRevisionSchema, VisualReferenceSpecSchema } from "@kf/contracts/visual-review-revision";
import { referenceImageUrl } from "../../visual-api.js";

const props = defineProps<{ review: VisualReviewDisplay; disabled?: boolean; acceptDisabled?: boolean }>();
const emit = defineEmits<{ accept: [action: VisualReviewAcceptance & { type: "accept_visual_reference" }]; cancel: [];
  revise: [revision: Omit<VisualReviewRevision, "clientRequestId">]; reload: [] }>();
const editing = ref(false);
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
type RegionDraft = { role: VisualRegion["role"]; text: string; box: VisualRegion["box"]; parentId: string | null;
  interactionNote: string; dataSourceNote: string; interactionKind: "" | "click-feedback";
  feedbackMessage: string; feedbackLevel: NonNullable<VisualRegion["interactionRequirement"]>["level"]; dataField: "" | "workspace-name" };
const drafts = ref<Record<string, RegionDraft>>({});
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
const addedRegionIds = ref<string[]>([]);
const removedRegionIds = ref<string[]>([]);
// end
const regionRoles: VisualRegion["role"][] = ["header", "sidebar", "content", "card", "table", "chart", "form", "image", "text", "action"];
const roleLabels: Record<VisualRegion["role"], string> = { header: "标题区域", sidebar: "侧栏", content: "内容区", card: "信息卡片",
  table: "表格", chart: "图表", form: "表单", image: "图片", text: "文字", action: "操作按钮" };
const boxLabels = { x: "左侧 x", y: "顶部 y", width: "宽度", height: "高度" };
const boxFields = ["x", "y", "width", "height"] as const;
const draftText = (text: string, original: string[]): string[] => text === original.join("\n") ? [...original] : text === "" ? [] : text.split("\n");
function edit() {
  drafts.value = Object.fromEntries(props.review.reference.spec.regions.map(region => [region.id,
    { role: region.role, text: region.text.join("\n"), box: { ...region.box }, parentId: region.parentId,
      interactionNote: region.clarifications?.interaction ?? "", dataSourceNote: region.clarifications?.dataSource ?? "",
      interactionKind: region.interactionRequirement?.kind ?? "", feedbackMessage: region.interactionRequirement?.message ?? "",
      feedbackLevel: region.interactionRequirement?.level ?? "info", dataField: region.dataRequirement ? "workspace-name" : "" }]));
  addedRegionIds.value = []; removedRegionIds.value = [];
  editing.value = true;
}
const regionPatches = computed(() => props.review.reference.spec.regions.flatMap(region => {
  const draft = drafts.value[region.id];
  if (!draft || removedRegionIds.value.includes(region.id)) return [];
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const patch = { regionId: region.id, role: draft.role, text: draftText(draft.text, region.text), box: { ...draft.box },
    ...(draft.parentId !== region.parentId ? { parentId: draft.parentId } : {}),
    ...(notesChanged(region, draft) ? { clarifications: notesValue(draft) } : {}),
    ...(interactionChanged(region, draft) ? { interactionRequirement: interactionValue(draft) } : {}),
    ...(dataChanged(region, draft) ? { dataRequirement: dataValue(draft) } : {}) };
  return draft.role === region.role && JSON.stringify(patch.text) === JSON.stringify(region.text)
    && JSON.stringify(patch.box) === JSON.stringify(region.box) && draft.parentId === region.parentId && !notesChanged(region, draft)
    && !interactionChanged(region, draft) && !dataChanged(region, draft) ? [] : [patch];
  // end
}));
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
function notesValue(draft: { interactionNote: string; dataSourceNote: string }) {
  return { interaction: draft.interactionNote.trim() || null, dataSource: draft.dataSourceNote.trim() || null };
}
function notesChanged(region: VisualRegion, draft: { interactionNote: string; dataSourceNote: string }) {
  return JSON.stringify(notesValue(draft)) !== JSON.stringify({ interaction: region.clarifications?.interaction ?? null, dataSource: region.clarifications?.dataSource ?? null });
}
function interactionValue(draft: RegionDraft) {
  return draft.interactionKind === "click-feedback" ? { kind: "click-feedback" as const, message: draft.feedbackMessage.trim(), level: draft.feedbackLevel } : null;
}
function interactionChanged(region: VisualRegion, draft: RegionDraft) {
  const previous = region.interactionRequirement;
  return JSON.stringify(interactionValue(draft)) !== JSON.stringify(previous ? { kind: previous.kind, message: previous.message, level: previous.level } : null);
}
function dataValue(draft: RegionDraft) {
  return draft.dataField === "workspace-name" ? { kind: "workspace-field" as const, field: "name" as const } : null;
}
function dataChanged(region: VisualRegion, draft: RegionDraft) {
  return (draft.dataField === "workspace-name") !== (region.dataRequirement !== undefined);
}
function dataSnapshot(regionId: string) { return props.review.reference.dataSnapshots?.find(snapshot => snapshot.regionId === regionId); }
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
const additions = computed(() => addedRegionIds.value.map(id => {
  const draft = drafts.value[id]!;
  return { role: draft.role, text: draftText(draft.text, []), box: { ...draft.box } };
}));
const correction = computed(() => ({ receipt: props.review.receipt, analysisId: props.review.reference.analysisId,
  analysisHash: props.review.reference.specHash, regions: regionPatches.value,
  ...(additions.value.length ? { additions: additions.value } : {}),
  ...(removedRegionIds.value.length ? { removals: [...removedRegionIds.value] } : {}) }));
const operationCount = computed(() => regionPatches.value.length + additions.value.length + removedRegionIds.value.length);
const finalRegionCount = computed(() => props.review.reference.spec.regions.length + additions.value.length - removedRegionIds.value.length);
const canSave = computed(() => editing.value && !props.disabled && !props.acceptDisabled && !imageFailed.value
  && finalRegionCount.value >= 1 && finalRegionCount.value <= 100
  && props.review.reference.spec.uncertainties.length + additions.value.length <= 100
  && candidateSpecValid.value
  && VisualReviewRevisionSchema.safeParse({ ...correction.value, clientRequestId: "00000000-0000-4000-8000-000000000000" }).success);
const canAdd = computed(() => !props.disabled && !props.acceptDisabled && !imageFailed.value && finalRegionCount.value < 100
  && operationCount.value < 100 && props.review.reference.spec.uncertainties.length + additions.value.length < 100);
async function addRegion() {
  if (!editing.value || !canAdd.value) return;
  const id = `draft_${crypto.randomUUID()}`;
  drafts.value[id] = { role: "text", text: "", box: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }, parentId: null, interactionNote: "", dataSourceNote: "",
    interactionKind: "", feedbackMessage: "", feedbackLevel: "info", dataField: "" };
  addedRegionIds.value.push(id); activeRegion.value = id;
  await nextTick(); document.getElementById(`text-${id}`)?.focus();
}
function hasRetainedChildren(id: string) {
  return previewRows.value.some(({ region }) => region.parentId === id);
}
function removeRegion(id: string) {
  if (props.disabled || props.acceptDisabled || hasRetainedChildren(id)) return;
  if (addedRegionIds.value.includes(id)) {
    addedRegionIds.value = addedRegionIds.value.filter(addedId => addedId !== id);
    delete drafts.value[id];
  } else if (!removedRegionIds.value.includes(id)) removedRegionIds.value.push(id);
  if (activeRegion.value === id) activeRegion.value = "";
}
function parentRemoved(region: VisualRegion) { return region.parentId !== null && removedRegionIds.value.includes(region.parentId); }
function restoreRegion(region: VisualRegion) {
  if (props.disabled || props.acceptDisabled || parentRemoved(region)) return;
  removedRegionIds.value = removedRegionIds.value.filter(id => id !== region.id);
}
// end
function save() {
  if (!canSave.value) return;
  emit("revise", correction.value);
}
function visibleBox(region: VisualRegion): VisualRegion["box"] { return editing.value ? drafts.value[region.id]?.box ?? region.box : region.box; }
const choices = ref<Record<string, { disposition: "" | "omit" | "accept-unverified"; reason: string }>>(
  Object.fromEntries(props.review.reference.mappings.map(mapping => [mapping.regionId, { disposition: "", reason: "" }])),
);
const activeRegion = ref("");
const imageFailed = ref(false);
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
const rows = computed(() => [
  ...props.review.reference.spec.regions.map(original => {
    const draft = editing.value ? drafts.value[original.id] : undefined;
    const region = draft ? { ...original, role: draft.role, text: draftText(draft.text, original.text), box: draft.box, parentId: draft.parentId } : original;
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    if (draft && notesChanged(original, draft)) {
      const notes = notesValue(draft);
      if (notes.interaction === null && notes.dataSource === null) delete region.clarifications;
      else region.clarifications = notes;
    }
    if (draft && interactionChanged(original, draft)) {
      const requirement = interactionValue(draft);
      if (requirement === null) delete region.interactionRequirement;
      else region.interactionRequirement = requirement;
    }
    if (draft && dataChanged(original, draft)) {
      const requirement = dataValue(draft);
      if (requirement === null) delete region.dataRequirement;
      else region.dataRequirement = requirement;
    }
    // end
    return { region, added: false, removed: editing.value && removedRegionIds.value.includes(region.id),
      mapping: props.review.reference.mappings.find(mapping => mapping.regionId === region.id) };
  }),
  ...(editing.value ? addedRegionIds.value.map(id => {
    const draft = drafts.value[id]!;
    const region: VisualRegion = { id, parentId: null, role: draft.role, text: draftText(draft.text, []), box: draft.box,
      confidence: 0, interactionHint: null };
    return { region, added: true, removed: false, mapping: undefined };
  }) : []),
]);
const previewRows = computed(() => rows.value.filter(row => !row.removed));
// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
type ReviewRow = (typeof rows.value)[number];
type ReviewChoice = { disposition: "" | "omit" | "accept-unverified"; reason: string };
type ReviewGroup = { key: string; role: VisualRegion["role"]; support: "verified" | "supported_unverified" | "unsupported" | "missing"; rows: ReviewRow[] };
const showAllRegions = ref(false);
const batchChoices = ref<Record<string, ReviewChoice>>({});
const summaryLocked = computed(() => editing.value || props.disabled || props.acceptDisabled || imageFailed.value);
function isNormalRegion(row: ReviewRow) {
  return row.mapping !== undefined && row.mapping.support !== "unsupported" && !["table", "chart", "form"].includes(row.region.role);
}
function resolved(row: ReviewRow) {
  if (!row.mapping) return false;
  if (row.mapping.support === "verified") return true;
  const choice = choices.value[row.region.id];
  return choice !== undefined && choice.reason.trim().length > 0 && choice.reason.trim().length <= 1000
    && (choice.disposition === "omit" || (row.mapping.support === "supported_unverified" && choice.disposition === "accept-unverified"));
}
function untouched(row: ReviewRow) {
  const choice = choices.value[row.region.id];
  return row.mapping?.support !== "verified" && choice?.disposition === "" && choice.reason.trim() === "";
}
const normalRows = computed(() => rows.value.filter(isNormalRegion));
const normalUnverifiedRows = computed(() => normalRows.value.filter(row => row.mapping?.support === "supported_unverified"));
const normalPending = computed(() => normalUnverifiedRows.value.filter(row => !resolved(row)));
const normalUntouched = computed(() => normalUnverifiedRows.value.filter(untouched));
const requiredFacts = computed(() => rows.value.filter(row => row.region.dataRequirement || row.region.interactionRequirement));
const exceptionGroups = computed(() => {
  const groups = new Map<string, ReviewGroup>();
  for (const row of rows.value) {
    if (isNormalRegion(row) || row.mapping?.support === "verified") continue;
    const support = row.mapping?.support ?? "missing";
    const key = `${support}:${row.region.role}`;
    let group = groups.get(key);
    if (!group) { group = { key, role: row.region.role, support, rows: [] }; groups.set(key, group); }
    group.rows.push(row);
  }
  return [...groups.values()];
});
const pendingGroupCount = computed(() => exceptionGroups.value.filter(group => group.rows.some(row => !resolved(row))).length);
function applyBatch(target: ReviewRow[], disposition: "omit" | "accept-unverified") {
  if (summaryLocked.value) return;
  for (const row of target) {
    if (!row.mapping || !untouched(row) || (disposition === "accept-unverified" && row.mapping.support !== "supported_unverified")) continue;
    const choice = { disposition, reason: disposition === "omit"
      ? `用户在识别摘要中明确省略本轮${roleLabels[row.region.role]}区域。`
      : "用户在识别摘要中批量保留匹配的现有组件，效果与交互尚待后续核对。" };
    choices.value[row.region.id] = choice;
    batchChoices.value[row.region.id] = { ...choice };
  }
}
function hasBatch(target: ReviewRow[]) {
  return target.some(row => {
    const original = batchChoices.value[row.region.id]; const current = choices.value[row.region.id];
    return original && current && original.disposition === current.disposition && original.reason === current.reason;
  });
}
function undoBatch(target: ReviewRow[]) {
  if (summaryLocked.value) return;
  for (const row of target) {
    const original = batchChoices.value[row.region.id]; const current = choices.value[row.region.id];
    if (original && current && original.disposition === current.disposition && original.reason === current.reason) {
      choices.value[row.region.id] = { disposition: "", reason: "" };
      delete batchChoices.value[row.region.id];
    }
  }
}
async function editGroup(group: ReviewGroup) {
  if (summaryLocked.value) return;
  edit(); activeRegion.value = group.rows[0]?.region.id ?? "";
  await nextTick();
  const field = document.getElementById(`role-${activeRegion.value}`);
  field?.scrollIntoView?.({ block: "center" }); field?.focus();
}
watch(() => [props.review.runId, props.review.receipt, props.review.reference.analysisId, props.review.reference.specHash].join("|"), () => {
  choices.value = Object.fromEntries(props.review.reference.mappings.map(mapping => [mapping.regionId, { disposition: "", reason: "" }]));
  batchChoices.value = {}; showAllRegions.value = false; editing.value = false; imageFailed.value = false;
  drafts.value = {}; addedRegionIds.value = []; removedRegionIds.value = []; activeRegion.value = "";
});
// end
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
const candidateSpecValid = computed(() => VisualReferenceSpecSchema.safeParse({ ...props.review.reference.spec,
  regions: previewRows.value.map(row => row.region), uncertainties: props.review.reference.spec.uncertainties.map(item =>
    item.regionId !== null && removedRegionIds.value.includes(item.regionId) ? { ...item, regionId: null } : item),
}).success);
const previewRegionsById = computed(() => new Map(previewRows.value.map(row => [row.region.id, row.region])));
function canSelectParent(regionId: string, parentId: string) {
  const byId = previewRegionsById.value;
  const visited = new Set([regionId]);
  let current: string | null = parentId;
  while (current !== null) {
    if (visited.has(current)) return false;
    const parent = byId.get(current);
    if (!parent) return false;
    visited.add(current); current = parent.parentId;
  }
  return true;
}
function parentOptions(regionId: string) {
  return previewRows.value.filter(row => !row.added && canSelectParent(regionId, row.region.id)).map(row => row.region);
}
function updateParent(regionId: string, event: Event) {
  if (!editing.value || props.disabled || props.acceptDisabled || addedRegionIds.value.includes(regionId)) return;
  const value = (event.target as HTMLSelectElement).value;
  if (value !== "" && !parentOptions(regionId).some(region => region.id === value)) return;
  const draft = drafts.value[regionId]; if (draft) draft.parentId = value || null;
}
function regionLabel(region: VisualRegion) { return region.text.join(" ") || roleLabels[region.role]; }
const hierarchyRows = computed(() => {
  const result: { region: VisualRegion; depth: number }[] = [];
  const visited = new Set<string>();
  const visit = (region: VisualRegion, depth: number) => {
    if (visited.has(region.id)) return;
    visited.add(region.id); result.push({ region, depth });
    for (const row of previewRows.value) if (row.region.parentId === region.id) visit(row.region, depth + 1);
  };
  for (const row of previewRows.value) if (row.region.parentId === null) visit(row.region, 0);
  for (const row of previewRows.value) if (!visited.has(row.region.id)) visit(row.region, 0);
  return result;
});
// end
// end
// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
const canAccept = computed(() => !summaryLocked.value && rows.value.every(resolved));
// end
function accept() {
  if (!canAccept.value) return;
  const acceptedDifferences: VisualReviewAcceptance["acceptedDifferences"] = [];
  for (const mapping of props.review.reference.mappings) {
    if (mapping.support === "verified") continue;
    const choice = choices.value[mapping.regionId];
    if (!choice || !choice.disposition) return;
    acceptedDifferences.push({ regionId: mapping.regionId, disposition: choice.disposition,
      capabilityId: choice.disposition === "omit" ? null : mapping.capabilityId, reason: choice.reason.trim() });
  }
  emit("accept", { type: "accept_visual_reference", expectedRunId: props.review.runId,
    analysisId: props.review.reference.analysisId, analysisHash: props.review.reference.specHash,
    receipt: props.review.receipt, acceptedDifferences });
}
// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
const supportLabels = { verified: "已验证", supported_unverified: "可生成，效果待核对", unsupported: "需单独处理" };
// end
</script>

<template>
  <section class="approval-card visual-review" aria-label="参考图识别确认">
    <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
    <div class="card-head">确认识别摘要</div>
    <!-- end -->
    <div class="card-body">
      <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
      <p>常规内容可以一次保留，只需单独处理影响生成结果的例外。下一步会展示整体工程蓝图。</p>
      <section v-if="!editing" class="visual-review-summary" data-testid="review-summary" aria-label="识别摘要">
        <div class="review-summary-counts"><span>识别区域 <b>{{ rows.length }}</b></span><span>常规内容 <b>{{ normalRows.length }}</b></span><span>待处理例外 <b>{{ pendingGroupCount }}</b> 类</span></div>
        <section v-if="requiredFacts.length" class="review-required-facts" aria-label="本轮数据与交互">
          <h3>本轮明确的数据与交互</h3>
          <div v-for="row in requiredFacts" :key="row.region.id">
            <p v-if="row.region.dataRequirement">{{ regionLabel(row.region) }}：读取当前工作区名称，<strong>{{ dataSnapshot(row.region.id)?.value ?? '尚未读取，请重新读取当前结果' }}</strong>（只读快照，非实时）。</p>
            <p v-if="row.region.interactionRequirement">{{ regionLabel(row.region) }}：点击后显示本地提示“{{ row.region.interactionRequirement.message }}”。</p>
          </div>
        </section>
        <div v-if="normalUnverifiedRows.length" class="review-batch-card">
          <div><h3>按现有组件保留常规内容</h3><p>文字、布局和普通按钮统一处理，不用逐项填写说明。保留后仍需核对实际效果。</p></div>
          <div class="review-batch-actions">
            <button type="button" class="mini-btn batch-primary" data-testid="batch-keep-supported" :disabled="summaryLocked || !normalUntouched.length" @click="applyBatch(normalUnverifiedRows, 'accept-unverified')">{{ normalUntouched.length ? `保留常规内容（${normalUntouched.length} 处）` : normalPending.length ? '其余内容已选择' : '常规内容已处理' }}</button>
            <button v-if="hasBatch(normalUnverifiedRows)" type="button" class="mini-btn" data-testid="undo-supported" :disabled="summaryLocked" @click="undoBatch(normalUnverifiedRows)">撤销批量保留</button>
          </div>
          <p v-if="normalPending.length && !normalUntouched.length" class="review-pending-note">还有 {{ normalPending.length }} 项单独调整未完成，可展开所有区域继续处理。</p>
        </div>
        <section v-for="group in exceptionGroups" :key="group.key" class="review-exception-group" :data-review-group="group.key" :aria-label="`${roleLabels[group.role]}例外`">
          <div class="review-group-heading"><h3>{{ roleLabels[group.role] }} · {{ group.rows.length }} 处</h3><span>{{ group.rows.every(resolved) ? '已处理' : '需要选择' }}</span></div>
          <p v-if="group.support === 'unsupported'">这类内容暂不能直接生成。可以调整识别，或明确省略下列区域；不会自动省略。</p>
          <p v-else-if="group.support === 'missing'">匹配结果缺失，请重新读取或调整识别。</p>
          <p v-else>可以使用匹配的现有组件保留，效果与交互仍待核对。</p>
          <ul class="review-group-regions"><li v-for="row in group.rows" :key="row.region.id">{{ regionLabel(row.region) }}</li></ul>
          <div class="review-batch-actions">
            <button v-if="group.support === 'supported_unverified'" type="button" class="mini-btn" data-action="keep-group" :disabled="summaryLocked || !group.rows.some(untouched)" @click="applyBatch(group.rows, 'accept-unverified')">保留这类区域</button>
            <button v-if="group.support !== 'missing'" type="button" class="mini-btn" data-action="omit-group" :disabled="summaryLocked || !group.rows.some(untouched)" @click="applyBatch(group.rows, 'omit')">省略这类区域</button>
            <button type="button" class="mini-btn" :disabled="summaryLocked" @click="editGroup(group)">调整识别</button>
            <button v-if="hasBatch(group.rows)" type="button" class="mini-btn" data-action="undo-group" :disabled="summaryLocked" @click="undoBatch(group.rows)">撤销本类选择</button>
          </div>
        </section>
        <p v-if="!normalPending.length && !pendingGroupCount && !imageFailed" class="review-ready-note" role="status">识别内容已处理，可以继续生成整体蓝图。</p>
      </section>
      <label v-if="!editing" class="review-detail-toggle"><input v-model="showAllRegions" type="checkbox" data-testid="review-show-details"> 展开所有区域，逐项调整</label>
      <!-- end -->
      <button v-if="!editing" type="button" class="mini-btn" data-testid="edit-reference" :disabled="disabled || acceptDisabled || imageFailed" @click="edit">编辑识别结果</button>
      <button v-if="!editing" type="button" class="mini-btn" data-testid="reload-reference" :disabled="disabled" @click="emit('reload')">重新读取当前结果</button>
      <p v-else class="visual-review-note">正在预览未保存修改；保存后重新匹配组件并清除旧差异选择，不会直接生成工程。</p>
      <div v-if="editing" class="visual-review-toolbar"><button type="button" class="mini-btn" data-testid="add-reference-region" :disabled="!canAdd" @click="addRegion">新增区域</button><span>保存后保留 {{ finalRegionCount }} / 100 个区域</span></div>
      <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
      <div class="visual-review-grid" :class="{ 'review-compact': !editing && !showAllRegions }">
      <!-- end -->
        <div>
          <div class="visual-reference-image" :style="{ aspectRatio: `${review.reference.spec.viewport.width} / ${review.reference.spec.viewport.height}` }">
            <img :src="referenceImageUrl(review.workspaceId, review.reference.spec.sourceAssetId)" alt="本轮参考图的安全派生图片" @error="imageFailed = true">
            <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
            <button v-for="({ region, mapping }, index) in previewRows" v-show="editing || showAllRegions || !isNormalRegion({ region, mapping, added: false, removed: false })" :key="region.id" type="button" class="visual-region" :class="{ active: activeRegion === region.id }"
              :style="{ left: visibleBox(region).x * 100 + '%', top: visibleBox(region).y * 100 + '%', width: visibleBox(region).width * 100 + '%', height: visibleBox(region).height * 100 + '%' }"
              :aria-label="`查看区域 ${region.id}`" @focus="activeRegion = region.id" @mouseenter="activeRegion = region.id" @click="activeRegion = region.id">
              <span>{{ index + 1 }}</span>
            </button>
            <!-- end -->
          </div>
          <p v-if="imageFailed" role="alert">参考图读取失败，暂不能确认。请重新加载或停止本轮后重新提交。</p>
          <details class="visual-hierarchy"><summary>层级预览{{ editing ? '（未保存）' : '' }}</summary>
            <ol aria-label="区域层级预览"><li v-for="entry in hierarchyRows" :key="entry.region.id" :style="{ paddingInlineStart: Math.min(entry.depth, 8) * 12 + 'px' }">
              <span class="sr-only">第 {{ entry.depth + 1 }} 层：</span>{{ regionLabel(entry.region) }} <small>· {{ entry.region.id }}</small>
            </li></ol>
          </details>
          <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
          <details v-if="review.reference.spec.uncertainties.length" class="visual-review-notes"><summary>识别备注（{{ review.reference.spec.uncertainties.length }} 条，按需查看）</summary>
            <ul class="visual-uncertainties" aria-label="识别中的不确定项"><li v-for="(item, index) in review.reference.spec.uncertainties" :key="index">{{ item.question }}</li></ul>
          </details>
          <!-- end -->
        </div>
        <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
        <div v-show="editing || showAllRegions" class="visual-mappings">
        <!-- end -->
          <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
          <div v-for="({ region, mapping, added, removed }, index) in rows" v-show="editing || showAllRegions" :key="region.id" class="visual-mapping" :class="{ active: activeRegion === region.id, 'is-removed': removed }"
            :data-region-id="region.id" :data-parent-id="region.parentId ?? ''" :data-new-region="added ? 'true' : undefined"
            @focusin="activeRegion = region.id" @mouseenter="activeRegion = region.id">
            <div class="visual-mapping-heading"><b>{{ index + 1 }} · {{ region.text.join(' ') || roleLabels[region.role] }}</b><span>{{ removed ? '待删除' : added ? '保存后匹配' : mapping ? supportLabels[mapping.support] : '映射缺失' }}</span></div>
            <details class="visual-technical-details"><summary>技术详情</summary>
              <p v-if="added || (region.confidence === 0 && region.id.startsWith('user_'))">用户补充 · 未经过模型识别</p>
              <p v-else>{{ mapping?.capabilityId || '无匹配组件' }} · 识别置信度 {{ Math.round(region.confidence * 100) }}%</p>
              <p>{{ mapping?.reason }}</p>
              <p v-if="mapping?.fallback">技术参考（替代生成尚未开放）：{{ mapping.fallback }}</p>
            </details>
            <!-- end -->
            <p v-if="region.interactionHint">原始交互线索（未验证）：{{ region.interactionHint }}</p>
            <p v-if="region.clarifications?.interaction">补充交互说明（未验证）：{{ region.clarifications.interaction }}</p>
            <p v-if="region.clarifications?.dataSource">数据来源说明（未绑定）：{{ region.clarifications.dataSource }}</p>
            <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
            <p v-if="region.interactionRequirement">执行要求：点击反馈 · {{ region.interactionRequirement.level }} · {{ region.interactionRequirement.message }}（待生成校验，非运行验收）</p>
            <p v-if="region.dataRequirement">数据绑定：当前工作区名称（只读快照，非实时）。
              <span v-if="!editing && dataSnapshot(region.id)">本版本取值：{{ dataSnapshot(region.id)!.value }}。后续重命名不自动更新此版本。</span>
              <span v-else>保存后由服务端读取并展示，请重新确认；取值会传入后续蓝图和工程规划。</span>
            </p>
            <!-- end -->
            <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
            <!-- Optional fallback guidance stays in technical details until an executable substitution protocol exists. -->
            <!-- end -->
            <div v-if="editing" class="visual-region-tools">
              <button v-if="removed" type="button" class="mini-btn" :aria-label="`恢复区域 ${region.id}`" :disabled="disabled || acceptDisabled || parentRemoved(region)" @click="restoreRegion(region)">恢复区域</button>
              <button v-else type="button" class="mini-btn" :aria-label="`删除区域 ${region.id}`" :disabled="disabled || acceptDisabled || hasRetainedChildren(region.id)" @click="removeRegion(region.id)">删除区域</button>
              <span v-if="removed && parentRemoved(region)">请先恢复父区域</span>
              <span v-else-if="!removed && hasRetainedChildren(region.id)">请先删除子区域</span>
            </div>
            <template v-if="editing && !removed && drafts[region.id]">
              <label v-if="!added" :for="`parent-${region.id}`">父区域</label>
              <select v-if="!added" :id="`parent-${region.id}`" :value="drafts[region.id]!.parentId ?? ''" :disabled="disabled || acceptDisabled" :aria-label="`区域 ${region.id} 的父区域`" @change="updateParent(region.id, $event)">
                <option value="">无父区域（根级）</option><option v-for="parent in parentOptions(region.id)" :key="parent.id" :value="parent.id">{{ regionLabel(parent) }} · {{ parent.id }}</option>
              </select>
              <p v-else>新增区域保存后可调整层级、补充交互与数据说明。</p>
              <details v-if="!added" class="visual-clarification-edit">
                <summary>交互与数据说明（可选，未验证）</summary>
                <p>仅作为后续规划参考，不是可执行动作或数据连接。请勿填写密钥；清空说明不会解决原始疑问。</p>
                <label :for="`interaction-note-${region.id}`">交互说明（未验证）</label>
                <textarea :id="`interaction-note-${region.id}`" v-model="drafts[region.id]!.interactionNote" :disabled="disabled || acceptDisabled" rows="2" maxlength="1000" :aria-label="`区域 ${region.id} 的交互说明`" />
                <label :for="`data-note-${region.id}`">数据来源说明（未绑定）</label>
                <textarea :id="`data-note-${region.id}`" v-model="drafts[region.id]!.dataSourceNote" :disabled="disabled || acceptDisabled" rows="2" maxlength="1000" :aria-label="`区域 ${region.id} 的数据来源说明`" />
              </details>
              <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
              <details v-if="!added" class="visual-interaction-edit">
                <summary>执行交互（可选）</summary>
                <p>目前仅操作按钮支持本地点击反馈，不连接数据源；保存后仍需确认，生成时校验实际事件和动作。</p>
                <label :for="`interaction-kind-${region.id}`">执行交互</label>
                <select :id="`interaction-kind-${region.id}`" v-model="drafts[region.id]!.interactionKind" :disabled="disabled || acceptDisabled" :aria-label="`区域 ${region.id} 的执行交互`">
                  <option value="">不指定</option><option value="click-feedback">点击 → 本地消息反馈</option>
                </select>
                <template v-if="drafts[region.id]!.interactionKind === 'click-feedback'">
                  <label :for="`feedback-message-${region.id}`">反馈文字</label>
                  <input :id="`feedback-message-${region.id}`" v-model="drafts[region.id]!.feedbackMessage" :disabled="disabled || acceptDisabled" maxlength="400" :aria-label="`区域 ${region.id} 的反馈文字`">
                  <label :for="`feedback-level-${region.id}`">反馈级别</label>
                  <select :id="`feedback-level-${region.id}`" v-model="drafts[region.id]!.feedbackLevel" :disabled="disabled || acceptDisabled" :aria-label="`区域 ${region.id} 的反馈级别`">
                    <option value="info">提示</option><option value="success">成功</option><option value="warning">警告</option><option value="error">错误</option>
                  </select>
                  <p v-if="drafts[region.id]!.role !== 'action'">请将区域类型设为操作按钮，或取消执行交互。</p>
                </template>
              </details>
              <!-- end -->
              <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
              <details v-if="!added" class="visual-data-edit">
                <summary>数据绑定（只读快照）</summary>
                <p>目前仅文字区域可读取当前工作区名称，不接外部接口，不接受手填数据值或密钥。</p>
                <label :for="`data-field-${region.id}`">数据绑定</label>
                <select :id="`data-field-${region.id}`" v-model="drafts[region.id]!.dataField" :disabled="disabled || acceptDisabled" :aria-label="`区域 ${region.id} 的数据绑定`">
                  <option value="">不指定</option><option value="workspace-name">当前工作区 → 名称（非实时）</option>
                </select>
                <p v-if="drafts[region.id]!.dataField && drafts[region.id]!.role !== 'text'">请将区域类型设为文字，或取消数据绑定。</p>
              </details>
              <!-- end -->
              <label :for="`role-${region.id}`">区域类型</label>
              <select :id="`role-${region.id}`" v-model="drafts[region.id]!.role" :disabled="disabled" :aria-label="`区域 ${region.id} 的区域类型`"><option v-for="role in regionRoles" :key="role" :value="role">{{ roleLabels[role] }}</option></select>
              <label :for="`text-${region.id}`">识别文字（每行一段，最多 20 段，每段 2000 字）</label>
              <textarea :id="`text-${region.id}`" v-model="drafts[region.id]!.text" :disabled="disabled" rows="3" :aria-label="`区域 ${region.id} 的识别文字`" />
              <div class="visual-box-fields"><label v-for="field in boxFields" :key="field">{{ boxLabels[field] }}
                <input v-model.number="drafts[region.id]!.box[field]" type="number" min="0" max="1" step="0.01" :disabled="disabled" :aria-label="`区域 ${region.id} 的 ${field}`">
              </label></div>
            </template>
            <template v-else-if="!editing && mapping && mapping.support !== 'verified' && choices[region.id]">
              <label :for="`choice-${region.id}`">处理方式</label>
              <select :id="`choice-${region.id}`" v-model="choices[region.id]!.disposition" :disabled="disabled" :aria-label="`区域 ${region.id} 的处理方式`">
                <option value="" disabled>请选择，不会自动接受差异</option>
                <option v-if="mapping.support === 'supported_unverified'" value="accept-unverified">保留，接受未验证风险</option>
                <option value="omit">本轮省略此区域</option>
              </select>
              <label :for="`reason-${region.id}`">确认说明</label>
              <input :id="`reason-${region.id}`" v-model="choices[region.id]!.reason" :disabled="disabled" maxlength="1000" :aria-label="`区域 ${region.id} 的确认说明`" placeholder="说明保留或省略的原因">
            </template>
          </div>
        </div>
      </div>
      <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
      <p v-if="editing || showAllRegions" class="visual-review-note">可增删、调整层级并补充交互/数据说明；说明各限 1000 字，不代表已实现或已绑定。单次最多 100 项、64 KiB，至少保留一个区域。原有未知问题不会自动消失，替代组件与视觉重试尚未开放。</p>
      <!-- end -->
      <div v-if="editing" class="visual-review-actions">
        <button type="button" class="mini-btn" data-testid="save-reference-edit" :disabled="!canSave" @click="save">保存修改并重新匹配</button>
        <button type="button" class="mini-btn" data-testid="discard-reference-edit" :disabled="disabled" @click="editing = false">放弃未保存修改</button>
        <p v-if="operationCount && !canSave && !disabled" role="status">请检查层级是否循环或引用待删区域，以及文字长度、64 KiB 请求大小、100 项操作/区域/未知问题上限和区域边界；至少保留一个区域，内容过多时请分批修改。</p>
      </div>
      <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
      <div class="visual-review-actions"><button type="button" class="mini-btn" data-testid="accept-reference" :disabled="!canAccept" @click="accept">确认识别并生成蓝图</button><button type="button" class="mini-btn" data-testid="cancel-reference" :disabled="disabled" @click="emit('cancel')">停止本轮</button></div>
      <!-- end -->
    </div>
  </section>
</template>

<style scoped>
/* modified by jinlong.feng at 2026-10-28 Agent工作台迭代 */
.visual-review-summary { margin: 14px 0; padding: 14px; border: 1px solid #e2e7ef; border-radius: 12px; background: #f8fafc; }
.review-summary-counts { display: flex; align-items: center; gap: 10px 22px; flex-wrap: wrap; color: #586174; font-size: 12px; }
.review-summary-counts b { margin-left: 5px; color: #293345; font-size: 15px; font-variant-numeric: tabular-nums; }
.review-batch-card { margin-top: 14px; }
.review-required-facts { margin-top: 14px; padding: 10px; border: 1px solid #dce6f5; border-radius: 8px; background: #fff; }
.review-required-facts strong { color: #293345; }
.visual-review-summary h3 { margin: 0; color: #293345; font-size: 13px; font-weight: 600; }
.visual-review-summary p { margin: 5px 0 0; color: #586174; font-size: 12px; line-height: 1.6; }
.review-batch-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.visual-review-summary .mini-btn { min-height: 34px; padding: 6px 11px; border: 1px solid #d8dee8; border-radius: 8px; background: #fff; color: #293345; font: inherit; font-size: 12px; cursor: pointer; }
.visual-review-summary .mini-btn.batch-primary { background: #1f6feb; color: #fff; border-color: #1f6feb; }
.visual-review-summary .mini-btn:disabled { opacity: .45; cursor: default; }
.visual-review-summary .mini-btn:focus-visible, .review-detail-toggle input:focus-visible { outline: 2px solid #1f6feb; outline-offset: 2px; }
.review-exception-group { margin-top: 14px; padding: 12px; border: 1px solid #e2e7ef; border-radius: 10px; background: #fff; }
.review-group-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.review-group-heading > span { flex: none; color: #7b5622; font-size: 12px; }
.review-group-regions { display: flex; gap: 5px; flex-wrap: wrap; max-height: 100px; overflow-y: auto; list-style: none; margin: 8px 0 0; padding: 0; }
.review-group-regions li { max-width: 100%; padding: 2px 6px; border-radius: 5px; background: #f5f7fa; color: #586174; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-review-summary .review-ready-note { margin-top: 12px; color: #238747; }
.visual-review-summary .review-pending-note { color: #7b5622; }
.review-detail-toggle { display: flex; align-items: center; gap: 7px; margin: 12px 0; color: #586174; font-size: 12px; cursor: pointer; }
.review-detail-toggle input { accent-color: #1f6feb; }
.visual-review-grid.review-compact { grid-template-columns: minmax(0, 1fr); }
.review-compact .visual-reference-image { width: 100%; max-width: 540px; margin-inline: auto; }
.visual-technical-details { color: #586174; font-size: 12px; }
.visual-technical-details summary { margin: 6px 0; cursor: pointer; }
.visual-review-notes { margin-top: 12px; color: #586174; font-size: 12px; }
.visual-review-notes summary { cursor: pointer; }
.visual-review-summary .mini-btn:active:not(:disabled) { transform: scale(.97); }
@media (hover: hover) and (pointer: fine) { .visual-review-summary .mini-btn:hover:not(:disabled) { filter: brightness(.97); } }
/* end */
.visual-review-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 1fr); gap: 18px; margin: 18px 0; }
.visual-reference-image { position: relative; overflow: hidden; border: 1px solid #d8dee8; border-radius: 8px; background: #f5f7fa; }
.visual-reference-image img { display: block; width: 100%; height: 100%; object-fit: contain; }
.visual-region { position: absolute; border: 1px solid #6c89bd; background: transparent; padding: 0; text-align: left; cursor: pointer; }
.visual-region span { position: absolute; top: 0; left: 0; background: #1f6feb; color: white; font-size: 11px; padding: 1px 5px; }
.visual-region.active { border: 2px solid #1f6feb; background: #1f6feb12; }
.visual-mapping { border-bottom: 1px solid #e4e8ee; padding: 10px; overflow-wrap: anywhere; }
.visual-mapping.active { background: #f0f5ff; }
.visual-mapping-heading { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.visual-mapping-heading span { flex-shrink: 0; color: #7b5622; }
.visual-mapping p, .visual-review-note, .visual-uncertainties { color: #586174; font-size: 12px; line-height: 1.6; }
.visual-mapping label { display: block; margin-top: 8px; font-size: 12px; }
.visual-mapping input, .visual-mapping select, .visual-mapping textarea { box-sizing: border-box; width: 100%; min-height: 34px; border: 1px solid #cbd3df; border-radius: 6px; background: white; color: #293345; padding: 5px 8px; font: inherit; font-size: 12px; }
.visual-mapping textarea { resize: vertical; }
.visual-box-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.visual-review-actions { display: flex; gap: 8px; flex-wrap: wrap; }
/* modified by jinlong.feng at 2026-10-23 Agent工作台迭代 */
.visual-review-toolbar, .visual-region-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #586174; }
.visual-region-tools { margin: 8px 0; }
.visual-mapping.is-removed b { text-decoration: line-through; }
.visual-hierarchy { margin-top: 10px; color: #586174; font-size: 12px; }
.visual-hierarchy summary { cursor: pointer; }
.visual-clarification-edit { margin: 8px 0; font-size: 12px; color: #586174; }
.visual-clarification-edit summary { cursor: pointer; }
.visual-hierarchy ol { list-style: none; margin: 8px 0; padding: 0; overflow-wrap: anywhere; }
.visual-hierarchy li { margin: 5px 0; }
.visual-hierarchy small { color: #737d8c; }
.visual-hierarchy .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/* end */
.visual-review-actions .mini-btn:first-child { background: #1f6feb; color: white; border-color: #1f6feb; }
.visual-region:focus-visible, .visual-mapping input:focus-visible, .visual-mapping select:focus-visible, .visual-mapping textarea:focus-visible { outline: 2px solid #1f6feb; outline-offset: 2px; }
@media (max-width: 1100px) { .visual-review-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
<!-- end -->
