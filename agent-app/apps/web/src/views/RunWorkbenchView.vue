<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { computed, inject, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { ensureConversationDraftOwner } from "../conversation-drafts.js";
import { routerKey } from "vue-router";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { api, API_BASE, ApiError } from "../api.js";
// end
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import type { WorkbenchConfigResponse } from "../api.js";
import { useSession } from "../stores/session.js";
// end
import WorkbenchShell from "../components/runs/WorkbenchShell.vue";
import ConversationSidebar from "../components/runs/ConversationSidebar.vue";
import MessageBubble from "../components/runs/MessageBubble.vue";
import RunTimeline from "../components/runs/RunTimeline.vue";
import RunPill from "../components/runs/RunPill.vue";
import ContextPanel from "../components/runs/ContextPanel.vue";
import ComposerBar, { type ComposerMode, type ComposerFile } from "../components/runs/ComposerBar.vue";
// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
import ConversationActions from "../components/runs/ConversationActions.vue";
import ImageEgressSettings from "../components/runs/ImageEgressSettings.vue";
// end
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import UploadGuide from "../components/UploadGuide.vue";
// end
import ReferenceMessages from "../components/runs/ReferenceMessages.vue";
import type { SidebarConversation } from "../components/runs/types.js";
import { startRun, fetchLatestRun, fetchRunSnapshot, cancelRun, retryRun, type StartRunInput } from "../runs-api.js";
import { useRunStream } from "../composables/useRunStream.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import type { ConversationListItem, VisualReviewDisplay, VisualReviewRevision } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import type { ConversationForkInput, RevisionDetail } from "@kf/contracts";
// end
import VisualReferenceReview from "../components/runs/VisualReferenceReview.vue";
import { fetchVisualEgressPolicy, updateVisualEgressPolicy, fetchVisualReview, reviseVisualReview, uploadReferenceImage, referenceImageUrl, VISUAL_CONSENT_NOTICE, type ReferenceImage } from "../visual-api.js";
// end

const props = withDefaults(defineProps<{ workspaceId: string; conversationId?: string; runId?: string; preview?: boolean }>(), { preview: false });
const router = inject(routerKey, undefined);
const conversations = ref<SidebarConversation[]>([]);
const activeConversationId = ref(props.conversationId ?? "");
const workspaceName = ref("当前工程");
const mode = ref<ComposerMode>("build");
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
type ConversationDraft = { text: string; mode: ComposerMode; requiresImage?: boolean; revision?: string };
const drafts = ref<Record<string, ConversationDraft>>({});
const draftKey = computed(() => `${session.state.user?.tenantId ?? ""}:${session.state.user?.id ?? ""}:${props.workspaceId}:${activeConversationId.value}`);
function readDraft(): ConversationDraft | undefined {
  const cached = drafts.value[draftKey.value];
  if (cached) return cached;
  try {
    const saved = JSON.parse(sessionStorage.getItem(`kf-agent:draft:${draftKey.value}`) ?? "null") as { text?: unknown; mode?: unknown; requiresImage?: unknown; revision?: unknown } | null;
    if (saved && typeof saved.text === "string" && ["discuss", "plan", "build"].includes(String(saved.mode))) {
      return { text: saved.text, mode: saved.mode as ComposerMode, requiresImage: saved.requiresImage === true,
        revision: typeof saved.revision === "string" ? saved.revision : "" };
    }
  } catch { /* Storage restrictions do not block conversation use. */ }
  return undefined;
}
function saveDraft(text: string, draftMode: ComposerMode, requiresImage = readDraft()?.requiresImage === true) {
  const draft = { text, mode: draftMode, requiresImage, revision: crypto.randomUUID() };
  drafts.value[draftKey.value] = draft;
  try { sessionStorage.setItem(`kf-agent:draft:${draftKey.value}`, JSON.stringify(draft)); }
  catch { /* Keep the in-memory draft if browser storage is unavailable. */ }
}
const draftText = computed({ get: () => readDraft()?.text ?? "", set: text => saveDraft(text, mode.value) });
watch(mode, value => saveDraft(draftText.value, value));
const archivedIds = ref(new Set<string>());
const knownTitles = ref<Record<string, string>>({});
const activeArchived = computed(() => archivedIds.value.has(activeConversationId.value));
const invalidSelection = ref(false);
const showingArchive = ref(false);
const conversationCursor = ref<string | null>(null);
const historyCursor = ref<string | null>(null);
const pagingConversations = ref(false);
const pagingHistory = ref(false);
const managing = ref(false);
const renameTitle = ref("");
const policyAllowed = ref<boolean | null>(null);
const policyBusy = ref(false);
const policyError = ref("");
const isTenantAdmin = computed(() => session.state.user?.role === "tenant_admin");
let selectionGeneration = 0;
let listGeneration = 0;
function sidebarItem(item: ConversationListItem): SidebarConversation {
  knownTitles.value[item.id] = item.title;
  if (item.archivedAt) archivedIds.value.add(item.id); else archivedIds.value.delete(item.id);
  return { id: item.id, title: item.title, state: item.archivedAt ? "archived" : item.activeRunStatus === "QUEUED" ? "queued" : item.activeRunId ? "running" : "discuss" };
}
async function loadConversations(reset = false) {
  if (!reset && (pagingConversations.value || !conversationCursor.value)) return;
  const version = reset ? ++listGeneration : listGeneration;
  const workspaceId = props.workspaceId;
  const archived = showingArchive.value;
  pagingConversations.value = true;
  try {
    const page = await api.conversationPage(workspaceId, reset ? null : conversationCursor.value, archived);
    if (version !== listGeneration || workspaceId !== props.workspaceId) return;
    const rows = page.items.map(sidebarItem);
    conversations.value = reset ? rows : [...conversations.value, ...rows.filter(row => !conversations.value.some(item => item.id === row.id))];
    conversationCursor.value = page.nextCursor;
  } catch (cause) { if (version === listGeneration) error.value = cause instanceof Error ? cause.message : "会话列表加载失败"; }
  finally { if (version === listGeneration) pagingConversations.value = false; }
}
async function toggleArchive() {
  showingArchive.value = !showingArchive.value;
  await loadConversations(true);
}
async function ensureConversation(id: string) {
  if (conversations.value.some(item => item.id === id)) return;
  const workspaceId = props.workspaceId;
  const version = generation;
  const item = await api.getConversationV2(id);
  if (version !== generation) return;
  if (item.id !== id || item.workspaceId !== workspaceId) throw new Error("会话不存在或不属于当前工程，请选择其他会话或新建会话。");
  conversations.value.push(sidebarItem(item));
}

async function mutateConversation(archived?: boolean) {
  if (managing.value || !activeConversationId.value || invalidSelection.value) return;
  const id = activeConversationId.value;
  const version = generation;
  managing.value = true;
  error.value = null;
  try {
    const title = renameTitle.value.trim();
    if (archived === undefined && (!title || [...title].length > 100)) throw new Error("会话名称需为 1–100 个字符");
    const item = await api.updateConversation(id, archived === undefined ? { title } : { archived });
    if (version !== generation) return;
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // Selection ownership exists independently of the currently loaded list bucket.
    const updatedConversation = sidebarItem(item);
    const index = conversations.value.findIndex(item => item.id === id);
    if (index >= 0) conversations.value[index] = updatedConversation;
    // end
    if (id === activeConversationId.value) { renameTitle.value = ""; if (archived) clearReferenceDraft(); }
  } catch (cause) { if (version === generation && id === activeConversationId.value) error.value = cause instanceof Error ? cause.message : "会话更新失败"; }
  finally { if (version === generation) managing.value = false; }
}
// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
function renameConversation(title: string) {
  if (managing.value || loading.value) return;
  renameTitle.value = title;
  void mutateConversation();
}
// end
async function changeEgressPolicy() {
  if (!isTenantAdmin.value || policyBusy.value || policyAllowed.value === null) return;
  const version = generation;
  policyBusy.value = true;
  policyError.value = "";
  try {
    const policy = await updateVisualEgressPolicy(!policyAllowed.value);
    if (version !== generation) return;
    policyAllowed.value = policy.imageEgressAllowed;
    referenceConsent.value = false;
    const config = await api.getWorkbenchConfig();
    if (version === generation) capabilities.value = config;
  } catch (cause) { if (version === generation) policyError.value = cause instanceof Error ? cause.message : "图片外发授权保存失败"; }
  finally { if (version === generation) policyBusy.value = false; }
}
// end
const loading = ref(false);
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
const sourceRequired = ref(false);
const uploading = ref(false);
async function uploadSource(file: File) {
  if (!sourceRequired.value || !canStartRun.value || uploading.value || loading.value || busy.value) return;
  const version = generation;
  const workspaceId = props.workspaceId;
  uploading.value = true;
  error.value = null;
  try {
    await api.uploadSource(workspaceId, file);
    if (version !== generation) return;
    const [workspace, versions] = await Promise.all([api.getWorkspace(workspaceId), api.listRevisions(workspaceId)]);
    if (version !== generation) return;
    sourceRequired.value = workspace.mode === "upload" && !workspace.currentRevisionId;
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    revisions.value = versions.map(item => ({ id: item.id, version: "v" + item.revisionNumber, at: item.createdAt.slice(0, 10), current: item.id === workspace.currentRevisionId }));
    // end
  } catch (cause) {
    if (version === generation) error.value = cause instanceof Error ? cause.message : "源工程上传失败";
  } finally {
    if (version === generation) uploading.value = false;
  }
}
// end
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
const session = useSession();
watch(() => [session.state.user?.tenantId, session.state.user?.id], (identity, previous) => {
  if (previous && (identity[0] !== previous[0] || identity[1] !== previous[1])) drafts.value = {};
  ensureConversationDraftOwner(identity[0], identity[1]);
}, { immediate: true });
const capabilities = ref<WorkbenchConfigResponse | null>(null);
const capabilityNotice = ref("正在读取服务端运行权限…");
const canStartRun = computed(() => props.preview || (capabilities.value?.schemaVersion === 1
  && capabilities.value.flags?.agentRunsV2 === true && capabilities.value.flags?.agentWorkbenchV2 === true));
let capabilityController: AbortController | undefined;
// end
const sending = ref(false);
const controlling = ref(false);
const error = ref<string | null>(null);
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
const failureCode = ref<string | null>(null);
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const recoveryPolicyState = ref<"loading" | "ready" | "unavailable">("ready");
// end
const baselineConflict = computed(() => failureCode.value === "BASE_REVISION_CONFLICT");
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const needsNewVisualReview = ref(false);
const VISUAL_NEW_REVIEW_NOTICE = "图片任务当前不支持直接重试。请重新上传参考图，确认本轮外发同意，并完成新的识别及工程审核。";
const VISUAL_RECONSENT_NOTICE = "现有视觉工程内容再次外发需要新同意，当前入口未开放。";
const visualReconsentRequired = computed(() => failureCode.value === "VISUAL_EXISTING_CONTENT_RECONSENT_REQUIRED");
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const nativeNameRegenerationRequired = computed(() => failureCode.value === "CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED");
const NATIVE_NAME_REGENERATION_NOTICE = "旧工程名称超过 KF 的长度限制，请新建工程重新生成；历史版本仍可下载。";
// end
// end
function requestReplan() {
  mode.value = "plan";
  notify("请核对当前工程版本，输入新需求重新规划；不会继续执行旧方案。");
}
// end
const notice = ref("");
const submitted = ref(0);
const messages = ref<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const revisions = ref<Array<{ id: string; version: string; at: string; current?: boolean }>>([]);
const selectedRevisionId = ref("");
const revisionDetail = ref<RevisionDetail | null>(null);
const revisionLoading = ref(false);
const revisionError = ref("");
const revisionActionError = ref("");
const revisionDownloading = ref(false);
const revisionForking = ref(false);
let detailGeneration = 0;
const pendingForks = new Map<string, ConversationForkInput>();
const parentVersion = computed(() => {
  const parentId = revisionDetail.value?.parentRevisionId;
  return parentId ? revisions.value.find(item => item.id === parentId)?.version ?? parentId : "无（初始版本）";
});
function closeRevision() {
  detailGeneration += 1;
  selectedRevisionId.value = "";
  revisionDetail.value = null;
  revisionLoading.value = false;
  revisionDownloading.value = false;
  revisionForking.value = false;
  revisionError.value = "";
  revisionActionError.value = "";
}
async function selectRevision(id: string) {
  if (props.preview) return;
  closeRevision();
  selectedRevisionId.value = id;
  const requestVersion = detailGeneration;
  const workspaceId = props.workspaceId;
  revisionLoading.value = true;
  try {
    const detail = await api.revisionDetail(workspaceId, id);
    if (requestVersion !== detailGeneration || workspaceId !== props.workspaceId) return;
    if (detail.workspaceId !== workspaceId || detail.id !== id) throw new Error("版本详情与当前工程不匹配");
    revisionDetail.value = detail;
  } catch (cause) {
    if (requestVersion === detailGeneration && workspaceId === props.workspaceId) revisionError.value = cause instanceof Error ? cause.message : "版本详情加载失败";
  } finally { if (requestVersion === detailGeneration) revisionLoading.value = false; }
}
async function downloadRevision() {
  const detail = revisionDetail.value;
  if (!detail?.delivery || revisionDownloading.value) return;
  const requestVersion = detailGeneration;
  const workspaceId = props.workspaceId;
  revisionDownloading.value = true;
  revisionActionError.value = "";
  try {
    const token = await api.createDownloadToken(detail.delivery.artifactId);
    if (requestVersion !== detailGeneration || workspaceId !== props.workspaceId) return;
    if (token.artifactId !== detail.delivery.artifactId) throw new Error("下载凭据与历史制品不匹配");
    window.location.assign(api.downloadUrl(token.token));
  } catch (cause) {
    if (requestVersion === detailGeneration) revisionActionError.value = cause instanceof Error ? cause.message : "历史工程包下载失败，请重试";
  } finally { if (requestVersion === detailGeneration) revisionDownloading.value = false; }
}
async function forkRevision() {
  const detail = revisionDetail.value;
  if (!detail?.forkAnchor || revisionForking.value || loading.value || sending.value) return;
  const workspaceId = props.workspaceId;
  const requestVersion = detailGeneration;
  const viewVersion = generation;
  const selectionVersion = selectionGeneration;
  const key = `${workspaceId}:${detail.id}:${detail.forkAnchor.conversationId}:${detail.forkAnchor.messageId}`;
  let input = pendingForks.get(key);
  if (!input) {
    input = { clientRequestId: crypto.randomUUID(), messageId: detail.forkAnchor.messageId, revisionId: detail.id };
    pendingForks.set(key, input);
  }
  revisionForking.value = true;
  revisionActionError.value = "";
  try {
    const conversation = await api.forkConversation(detail.forkAnchor.conversationId, input);
    if (viewVersion !== generation || workspaceId !== props.workspaceId) return;
    if (conversation.workspaceId !== workspaceId) throw new Error("新对话与当前工程不匹配");
    if (requestVersion !== detailGeneration || selectionVersion !== selectionGeneration) return;
    if (showingArchive.value) {
      showingArchive.value = false;
      conversations.value = [];
      conversationCursor.value = null;
      void loadConversations(true);
    }
    if (!conversations.value.some(item => item.id === conversation.id)) conversations.value.unshift(sidebarItem(conversation));
    pendingForks.delete(key);
    await selectConversation(conversation.id);
    if (requestVersion === detailGeneration) closeRevision();
  } catch (cause) {
    if (requestVersion === detailGeneration && viewVersion === generation) revisionActionError.value = cause instanceof Error ? cause.message : "创建对话失败，请重试";
  } finally { if (requestVersion === detailGeneration) revisionForking.value = false; }
}
// end
const usage = ref<{ callsUsed: number; callsLimit: number; costEstimate: string; inputTokens: number; inputLimit: number; outputTokens: number; outputLimit: number; usageUnknownCount?: number }>();
const stream = shallowRef<ReturnType<typeof useRunStream> | null>(null);
const currentRunId = ref("");
const delivery = ref<{ artifactId: string | null; revisionId: string | null; buildJobId: string | null } | null>(null);
const pendingInput = computed(() => [...(stream.value?.events.value ?? [])].reverse().find(event => event.type === "input.required"));
const pendingApproval = computed(() => [...(stream.value?.events.value ?? [])].reverse().find(event => event.type === "approval.required"));
const scrollArea = ref<HTMLElement | null>(null);
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
const panes = computed(() => [{ id: "plan", label: "方案" }, { id: "project", label: "工程" }, { id: "revision", label: "版本" }, { id: "usage", label: "用量" }]
  .filter(pane => pane.id !== "usage" || props.preview || capabilities.value?.flags?.agentUsageV2 === true));
// end
const activePane = ref("plan");
const previewFiles = ref<ComposerFile[]>([{ name: "trend-detail.png", state: "uploading", progress: 64 }, { name: "dashboard-v2.png", state: "ready" }]);
let generation = 0;
let messagesGeneration = 0;
let olderHistoryLoaded = false;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let usageController: AbortController | undefined;
let retryRequestId = "";
const status = computed(() => props.preview ? "RUNNING" : stream.value?.status.value ?? null);
const busy = computed(() => status.value !== null && ["QUEUED", "RUNNING", "BUILDING", "CANCEL_REQUESTED"].includes(status.value));
const activeTitle = computed(() => conversations.value.find(item => item.id === activeConversationId.value)?.title ?? knownTitles.value[activeConversationId.value] ?? "新对话");
const connectionLabel = computed(() => props.preview ? "实时同步" : stream.value?.connected.value ? "实时同步" : currentRunId.value ? "连接已暂停" : "准备就绪");
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
const canUseReference = computed(() => canStartRun.value && capabilities.value?.flags.agentVisionV1 === true
  && capabilities.value.imagePolicy === "explicit-consent" && capabilities.value.outboundImagesAllowed === true && policyAllowed.value === true);
const referenceInput = ref<HTMLInputElement | null>(null);
const composerDraftIdentity = ref(0);
const referenceImage = ref<ReferenceImage | null>(null);
const referenceFile = ref<ComposerFile | null>(null);
const referenceUploading = ref(false);
const referenceConsent = ref(false);
const visualReview = ref<VisualReviewDisplay | null>(null);
const reviewLoading = ref(false);
const reviewError = ref("");
const revisingReference = ref(false);
let revisionController: AbortController | undefined;
let pendingRevision: { fingerprint: string; input: VisualReviewRevision } | undefined;
const isReferenceWait = computed(() => status.value === "WAITING_INPUT" && typeof pendingInput.value?.payload.receipt === "string"
  && pendingInput.value.payload.receipt.startsWith("vref1:"));
const missingReferenceDraft = computed(() => readDraft()?.requiresImage === true && !referenceFile.value);
const imageSendBlocked = computed(() => missingReferenceDraft.value || (referenceFile.value !== null
  && (!referenceImage.value || !referenceConsent.value || !canUseReference.value || mode.value !== "build" || busy.value)));
let referenceController: AbortController | undefined;
let referenceGeneration = 0;
let reviewController: AbortController | undefined;
let reviewGeneration = 0;
let pendingSubmission: { conversationId: string; fingerprint: string; input: StartRunInput } | undefined;
function submission(conversationId: string, input: Omit<StartRunInput, "clientRequestId" | "clientMessageId">): StartRunInput {
  const fingerprint = JSON.stringify(input);
  if (pendingSubmission?.conversationId !== conversationId || pendingSubmission.fingerprint !== fingerprint) {
    pendingSubmission = { conversationId, fingerprint, input: { ...input, clientRequestId: crypto.randomUUID(), clientMessageId: crypto.randomUUID() } };
  }
  return pendingSubmission.input;
}
function clearReferenceDraft() {
  referenceGeneration += 1;
  referenceController?.abort();
  referenceImage.value = null;
  referenceFile.value = null;
  referenceUploading.value = false;
  referenceConsent.value = false;
  if (referenceInput.value) referenceInput.value.value = "";
}
function clearVisualReview() {
  reviewGeneration += 1;
  reviewController?.abort();
  revisionController?.abort();
  revisingReference.value = false;
  pendingRevision = undefined;
  visualReview.value = null;
  reviewLoading.value = false;
  reviewError.value = "";
}
async function attachReference(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (activeArchived.value || invalidSelection.value || !canUseReference.value || busy.value || sending.value || controlling.value || loading.value || sourceRequired.value || referenceFile.value || mode.value !== "build") return;
  const file = files?.[0];
  if (!file) return;
  if (files?.length !== 1 || file.size === 0 || file.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    error.value = "请选择单张 PNG、JPEG 或 WebP 参考图，大小不超过 10 MiB。";
    input.value = "";
    return;
  }
  const version = ++referenceGeneration;
  const workspaceId = props.workspaceId;
  referenceController = new AbortController();
  saveDraft(draftText.value, mode.value, true);
  referenceFile.value = { name: file.name, state: "uploading" };
  referenceUploading.value = true;
  referenceConsent.value = false;
  error.value = null;
  try {
    const image = await uploadReferenceImage(workspaceId, file, referenceController.signal);
    if (version !== referenceGeneration) return;
    referenceImage.value = image;
    referenceFile.value = { name: file.name, state: "ready" };
    // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
    referenceConsent.value = canUseReference.value;
    // end
  } catch (cause) {
    // Keep the failed attachment in the draft. Never turn image intent into a text-only request.
    if (version === referenceGeneration) {
      referenceFile.value = { name: file.name, state: "failed" };
      error.value = `参考图上传失败：${cause instanceof Error ? cause.message : "未知错误"}；请移除后重新上传。`;
    }
  } finally {
    if (version === referenceGeneration) referenceUploading.value = false;
    input.value = "";
  }
}
async function loadVisualReview() {
  clearVisualReview();
  if (!isReferenceWait.value || props.preview) return;
  const version = reviewGeneration;
  const runId = currentRunId.value;
  const conversationId = activeConversationId.value;
  const receipt = pendingInput.value?.payload.receipt;
  reviewController = new AbortController();
  reviewLoading.value = true;
  try {
    const review = await fetchVisualReview(runId, reviewController.signal);
    if (version !== reviewGeneration || currentRunId.value !== runId || conversationId !== activeConversationId.value || !isReferenceWait.value) return;
    if (review.schemaVersion !== 1 || review.runId !== runId || review.workspaceId !== props.workspaceId || review.conversationId !== conversationId
      || review.receipt !== receipt || !Array.isArray(review.reference?.spec?.regions) || !Array.isArray(review.reference.mappings)
      || review.reference.spec.regions.length === 0 || review.reference.spec.regions.length !== review.reference.mappings.length) throw new Error("VISUAL_REVIEW_IDENTITY_MISMATCH");
    visualReview.value = review;
  } catch (cause) {
    if (version === reviewGeneration) reviewError.value = `识别确认暂不可用：${cause instanceof Error ? cause.message : "未知错误"}。请重新读取；若已过期或工程版本变化，请停止本轮后重新提交。`;
  } finally { if (version === reviewGeneration) reviewLoading.value = false; }
}
function acceptVisualReference(action: Extract<StartRunInput["action"], { type: "accept_visual_reference" }>) {
  if (revisingReference.value || !canUseReference.value || !isReferenceWait.value || !visualReview.value || visualReview.value.runId !== currentRunId.value
    || action.receipt !== visualReview.value.receipt) return;
  void performAction(action);
}
function refreshVisualReview() {
  if (revisingReference.value || sending.value || controlling.value || !currentRunId.value) return;
  // Refresh the event cursor together with the display; GET alone cannot authenticate a newer receipt.
  subscribe(currentRunId.value);
}
async function saveVisualCorrections(input: Omit<VisualReviewRevision, "clientRequestId">) {
  if (revisingReference.value || sending.value || controlling.value || !canUseReference.value || !isReferenceWait.value
    || !visualReview.value || input.receipt !== visualReview.value.receipt) return;
  const version = reviewGeneration;
  const runId = currentRunId.value;
  const fingerprint = JSON.stringify({ runId, input });
  if (pendingRevision?.fingerprint !== fingerprint) pendingRevision = { fingerprint, input: { ...input, clientRequestId: crypto.randomUUID() } };
  revisionController = new AbortController();
  revisingReference.value = true;
  error.value = null;
  try {
    const result = await reviseVisualReview(runId, pendingRevision.input, revisionController.signal);
    if (version !== reviewGeneration || currentRunId.value !== runId) return;
    if (result.runId !== runId || result.workspaceId !== props.workspaceId || result.conversationId !== activeConversationId.value
      || result.receipt === input.receipt) throw new Error("VISUAL_REVIEW_IDENTITY_MISMATCH");
    // Replay the actual new event/receipt; remount the card so no old choices authorize edited content.
    subscribe(runId);
  } catch (cause) {
    if (version !== reviewGeneration) return;
    error.value = `识别修改尚未确认保存：${cause instanceof Error ? cause.message : "未知错误"}。可重试；未生成工程。`;
    if (cause instanceof ApiError && cause.status === 409) {
      subscribe(runId);
      notify("识别版本已变化，正在读取最新结果；请重新核对。");
    }
  } finally { if (version === reviewGeneration) revisingReference.value = false; }
}
function removeReference(name: string) {
  if (props.preview) previewFiles.value = previewFiles.value.filter(file => file.name !== name);
  else if (!sending.value && !controlling.value) { clearReferenceDraft(); saveDraft(draftText.value, mode.value, false); }
}
// end

function notify(text: string) {
  notice.value = text;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.value = ""; }, 4000);
}
function previewAction() { notify("设计预览：此操作仅演示界面，未提交工程变更。"); }
async function refreshUsage(runId: string) {
  usageController?.abort();
  usageController = new AbortController();
  try {
    const response = await fetch(API_BASE + "/api/runs/" + encodeURIComponent(runId) + "/usage", { credentials: "include", signal: usageController.signal });
    if (response.ok && currentRunId.value === runId) {
      const data = await response.json();
      usage.value = { ...data, costEstimate: data.callsUsed > 0 ? data.costEstimate : "—" };
    }
  } catch { /* 用量面板不可用不阻断当前对话。 */ }
}
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
async function refreshMessages(conversationId: string, older = false) {
  if (older && (!historyCursor.value || pagingHistory.value)) return;
  const version = older ? messagesGeneration : ++messagesGeneration;
  const before = older ? historyCursor.value : null;
  const scrollHeight = scrollArea.value?.scrollHeight ?? 0;
  const scrollTop = scrollArea.value?.scrollTop ?? 0;
  if (older) pagingHistory.value = true;
  try {
    const page = await api.messagePage(conversationId, before);
    if (conversationId !== activeConversationId.value || version !== messagesGeneration) return;
    const rows = page.items.filter(row => row.role === "user" || row.role === "assistant");
    if (older) messages.value = [...rows.filter(row => !messages.value.some(item => item.id === row.id)), ...messages.value];
    else messages.value = [...messages.value.filter(row => !rows.some(item => item.id === row.id)), ...rows];
    if (older) olderHistoryLoaded = true;
    if (older || !olderHistoryLoaded) historyCursor.value = page.nextCursor;
    await nextTick();
    if (conversationId !== activeConversationId.value || version !== messagesGeneration) return;
    scrollArea.value?.scrollTo?.({ top: older ? (scrollArea.value.scrollHeight - scrollHeight + scrollTop) : scrollArea.value.scrollHeight, behavior: "auto" });
  } finally { if (version === messagesGeneration) pagingHistory.value = false; }
}
async function loadOlderMessages() {
  const id = activeConversationId.value;
  try { await refreshMessages(id, true); }
  catch (cause) { if (id === activeConversationId.value) error.value = cause instanceof Error ? cause.message : "历史加载失败"; }
}
// end

function subscribe(runId: string) {
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  clearVisualReview();
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  const viewGeneration = generation;
  // end
  stream.value?.stop();
  currentRunId.value = runId;
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  failureCode.value = null;
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  recoveryPolicyState.value = "loading";
  // end
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  needsNewVisualReview.value = false;
  // end
  // end
  retryRequestId = "";
  delivery.value = null;
  const conversationId = activeConversationId.value;
  const created = useRunStream(runId, { onUpdate: () => {
    if (currentRunId.value === runId) void refreshMessages(conversationId).catch(() => undefined);
  } });
  stream.value = created;
  void created.start().then(async () => {
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    if (currentRunId.value !== runId || stream.value !== created) return;
    // end
    await Promise.allSettled([refreshMessages(activeConversationId.value), refreshUsage(runId)]);
    const snapshot = await fetchRunSnapshot(runId).catch(() => null);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    if (currentRunId.value !== runId || stream.value !== created) return;
    recoveryPolicyState.value = snapshot ? "ready" : "unavailable";
    // end
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    failureCode.value = snapshot?.failureCode ?? null;
    // end
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    needsNewVisualReview.value = snapshot?.retryPolicy === "new-visual-review";
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    if (snapshot?.status === "FAILED") error.value = nativeNameRegenerationRequired.value ? NATIVE_NAME_REGENERATION_NOTICE
      : visualReconsentRequired.value ? VISUAL_RECONSENT_NOTICE
      : needsNewVisualReview.value ? VISUAL_NEW_REVIEW_NOTICE : "本轮执行失败：" + (snapshot.failureCode ?? "未知错误");
    // end
    // end
    if (snapshot?.resultRevisionId && snapshot.buildJobId) {
      const result = await api.getConversationDelivery(conversationId, snapshot.buildJobId).catch(() => null);
      if (currentRunId.value === runId) delivery.value = result;
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      const workspaceId = props.workspaceId;
      const [versions, workspace] = await Promise.all([api.listRevisions(workspaceId), api.getWorkspace(workspaceId)]);
      if (generation === viewGeneration && workspaceId === props.workspaceId && currentRunId.value === runId) revisions.value = versions.map(item => ({ id: item.id, version: "v" + item.revisionNumber, at: item.createdAt.slice(0, 10), current: item.id === workspace.currentRevisionId }));
      // end
    }
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    if (snapshot && ["SUCCEEDED", "FAILED", "CANCELLED"].includes(snapshot.status)) {
      const next = await fetchLatestRun(conversationId).catch(() => null);
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      if (generation === viewGeneration && currentRunId.value === runId && stream.value === created && activeConversationId.value === conversationId && next && next.id !== runId) {
      // end
        subscribe(next.id);
        await router?.replace({ name: "workbench", params: { id: props.workspaceId, conversationId }, query: { run: next.id } });
      }
    }
    // end
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  }).catch(cause => { if (currentRunId.value === runId && stream.value === created) {
    recoveryPolicyState.value = "unavailable";
    error.value = cause instanceof Error ? cause.message : "运行订阅失败";
  } });
  // end
  void refreshUsage(runId);
}
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
async function selectConversation(id: string, navigate = true, preserveInitialDraft = false) {
  if (id === activeConversationId.value) return;
  const version = ++selectionGeneration;
  const viewVersion = generation;
  if (!preserveInitialDraft) clearReferenceDraft();
  clearVisualReview();
  pendingSubmission = undefined;
  stream.value?.stop(); stream.value = null;
  currentRunId.value = ""; usage.value = undefined; delivery.value = null;
  const initialDraft = preserveInitialDraft ? { text: draftText.value, mode: mode.value, requiresImage: readDraft()?.requiresImage === true } : undefined;
  activeConversationId.value = id;
  if (initialDraft) saveDraft(initialDraft.text, initialDraft.mode, initialDraft.requiresImage);
  mode.value = readDraft()?.mode ?? "build";
  composerDraftIdentity.value += 1;
  error.value = null; invalidSelection.value = false;
  messages.value = []; historyCursor.value = null; olderHistoryLoaded = false; messagesGeneration += 1;
  sending.value = false; controlling.value = false; pagingHistory.value = false;
  if (props.preview) return;
  loading.value = true;
  try {
    if (navigate) await router?.push({ name: "workbench", params: { id: props.workspaceId, ...(id ? { conversationId: id } : {}) } });
    if (version !== selectionGeneration || viewVersion !== generation) return;
    if (id) {
      await ensureConversation(id);
      if (version !== selectionGeneration || viewVersion !== generation) return;
      await refreshMessages(id);
      const latest = await fetchLatestRun(id);
      if (version !== selectionGeneration || viewVersion !== generation) return;
      if (latest) subscribe(latest.id);
    }
  } catch (cause) {
    if (version === selectionGeneration && viewVersion === generation) { invalidSelection.value = true; error.value = cause instanceof Error ? cause.message : "对话加载失败"; }
  } finally { if (version === selectionGeneration && viewVersion === generation) loading.value = false; }
}
// end

async function createConversation() {
  if (props.preview) {
    const id = crypto.randomUUID();
    conversations.value.unshift({ id, title: "新对话", state: "discuss" });
    activeConversationId.value = id;
    return id;
  }
  if (sending.value || loading.value) return;
  const viewVersion = generation;
  const selectionVersion = selectionGeneration;
  sending.value = true;
  try {
    const conversation = await api.createConversationV2(props.workspaceId);
    if (viewVersion !== generation || selectionVersion !== selectionGeneration) return;
    conversations.value.unshift(sidebarItem(conversation));
    await selectConversation(conversation.id, true, !activeConversationId.value);
    return conversation.id;
  } catch (cause) { if (viewVersion === generation && selectionVersion === selectionGeneration) error.value = cause instanceof Error ? cause.message : "创建会话失败"; }
  finally { if (viewVersion === generation && !loading.value) sending.value = false; }
}
async function send(text: string) {
  if (props.preview) { previewAction(); return; }
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  if (activeArchived.value || invalidSelection.value || !canStartRun.value || sourceRequired.value || uploading.value || sending.value || controlling.value || loading.value || status.value === "CANCEL_REQUESTED" || status.value === "WAITING_APPROVAL") return;
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  if (referenceUploading.value || imageSendBlocked.value || isReferenceWait.value) return;
  // end
  const viewVersion = generation;
  const queuedBehindCurrent = busy.value;
  // end
  if (!activeConversationId.value) {
    const createdId = await createConversation();
    if (!createdId || createdId !== activeConversationId.value) return;
  }
  if (viewVersion !== generation || invalidSelection.value || activeArchived.value) return;
  const submissionSelection = selectionGeneration;
  const submissionDraftKey = draftKey.value;
  const submissionDraftRevision = readDraft()?.revision;
  const submissionMode = mode.value;
  const conversationId = activeConversationId.value;
  if (!conversationId) return;
  sending.value = true;
  error.value = null;
  try {
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    const image = referenceImage.value;
    const input = submission(conversationId, { mode: mode.value, action: { type: "message", text },
      ...(image ? { attachmentIds: [image.id], visualReference: { primaryAssetId: image.id,
        sendingConsent: { noticeVersion: "visual-egress@1" as const, accepted: true as const } } } : {}) });
    const clientMessageId = input.clientMessageId;
    const snapshot = await startRun(conversationId, input);
    // end
    if (viewVersion !== generation) return;
    if (submissionSelection !== selectionGeneration || activeConversationId.value !== conversationId) {
      const draft = drafts.value[submissionDraftKey];
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      // Equal text/mode can belong to a recreated draft or a newly attached image.
      if (submissionDraftRevision && draft?.revision === submissionDraftRevision) {
        drafts.value[submissionDraftKey] = { text: "", mode: submissionMode, requiresImage: false, revision: crypto.randomUUID() };
        try { sessionStorage.setItem(`kf-agent:draft:${submissionDraftKey}`, JSON.stringify(drafts.value[submissionDraftKey])); } catch { /* Memory remains authoritative. */ }
      }
      // end
      return;
    }
    messages.value.push({ id: clientMessageId, role: "user", content: text });
    const conversation = conversations.value.find(item => item.id === conversationId);
    if (conversation) conversation.state = "running";
    saveDraft("", mode.value, false);
    submitted.value += 1;
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    pendingSubmission = undefined;
    clearReferenceDraft();
    // end
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const focused = queuedBehindCurrent ? await fetchLatestRun(conversationId).catch(() => null) : snapshot;
    if (viewVersion !== generation || submissionSelection !== selectionGeneration || activeConversationId.value !== conversationId) return;
    if (focused && focused.id !== currentRunId.value) subscribe(focused.id);
    if (focused) await router?.replace({ name: "workbench", params: { id: props.workspaceId, conversationId }, query: { run: focused.id } });
    if (queuedBehindCurrent && focused?.id !== snapshot.id) notify("已排队，前序轮次结束并处理必要确认后继续。");
    // end
    await nextTick();
    if (viewVersion !== generation) return;
    scrollArea.value?.scrollTo?.({ top: scrollArea.value.scrollHeight, behavior: "auto" });
  } catch (cause) { if (viewVersion === generation && submissionSelection === selectionGeneration && conversationId === activeConversationId.value) error.value = cause instanceof Error ? cause.message : "提交失败"; }
  finally { if (viewVersion === generation && submissionSelection === selectionGeneration && activeConversationId.value === conversationId) sending.value = false; }
}
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
async function performAction(action: StartRunInput["action"]) {
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  if (!canStartRun.value && !(action.type === "resume_approval" && action.action === "cancel")) return;
  // end
  if (props.preview || activeArchived.value || invalidSelection.value || sending.value || controlling.value || busy.value || !activeConversationId.value) return;
  const viewVersion = generation;
  const conversationId = activeConversationId.value;
  sending.value = true;
  error.value = null;
  try {
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    const snapshot = await startRun(conversationId, submission(conversationId, { mode: "build", action }));
    // end
    if (viewVersion !== generation || activeConversationId.value !== conversationId) return;
    mode.value = "build";
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    pendingSubmission = undefined;
    // end
    subscribe(snapshot.id);
    await router?.replace({ name: "workbench", params: { id: props.workspaceId, conversationId }, query: { run: snapshot.id } });
  } catch (cause) {
    if (viewVersion === generation && activeConversationId.value === conversationId) {
      error.value = cause instanceof Error ? cause.message : "操作失败";
      if (action.type === "accept_visual_reference" && cause instanceof ApiError && cause.status === 409) {
        subscribe(action.expectedRunId);
        notify("识别版本或状态已变化，请核对最新结果后重新确认。");
      }
    }
  }
  finally { if (viewVersion === generation && activeConversationId.value === conversationId) sending.value = false; }
}
// end
function confirmBlueprint() {
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  if (isReferenceWait.value) return;
  // end
  const receipt = pendingInput.value?.payload.receipt;
  if (typeof receipt === "string") void performAction({ type: "confirm_blueprint", expectedRunId: currentRunId.value, receipt });
}
function resumeApproval(action: "approve" | "revise" | "cancel") {
  const planHash = pendingApproval.value?.payload.planHash;
  if (typeof planHash === "string") void performAction({ type: "resume_approval", expectedRunId: currentRunId.value, action, planHash });
}
async function download() {
  if (!delivery.value?.artifactId) return;
  try { const token = await api.createDownloadToken(delivery.value.artifactId); window.location.assign(api.downloadUrl(token.token)); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "下载失败"; }
}
async function stopCurrentRun() {
  if (props.preview) { previewAction(); return; }
  if (controlling.value || !currentRunId.value) return;
  const viewVersion = generation;
  const runId = currentRunId.value;
  controlling.value = true;
  try {
    const snapshot = await cancelRun(runId);
    if (viewVersion !== generation || currentRunId.value !== runId) return;
    if (snapshot.id !== runId) {
      subscribe(snapshot.id);
      await router?.replace({ name: "workbench", params: { id: props.workspaceId, conversationId: activeConversationId.value }, query: { run: snapshot.id } });
    }
    else if (stream.value) stream.value.status.value = snapshot.status;
  } catch (cause) { if (viewVersion === generation) error.value = cause instanceof Error ? cause.message : "停止请求失败"; }
  finally { if (viewVersion === generation) controlling.value = false; }
}
async function retryCurrentRun() {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  if (recoveryPolicyState.value !== "ready" || needsNewVisualReview.value || visualReconsentRequired.value || nativeNameRegenerationRequired.value) return;
  // end
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  if (props.preview || activeArchived.value || invalidSelection.value || !canStartRun.value || controlling.value || !currentRunId.value) return;
  // end
  const viewVersion = generation;
  const runId = currentRunId.value;
  retryRequestId ||= crypto.randomUUID();
  controlling.value = true;
  try {
    const snapshot = await retryRun(runId, retryRequestId);
    if (viewVersion !== generation || currentRunId.value !== runId) return;
    error.value = null;
    subscribe(snapshot.id);
    await router?.replace({ name: "workbench", params: { id: props.workspaceId, conversationId: activeConversationId.value }, query: { run: snapshot.id } });
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  } catch (cause) { if (viewVersion === generation && currentRunId.value === runId) {
    if (cause instanceof ApiError && cause.status === 409 && (cause.code?.includes("VISUAL_RETRY_NOT_ENABLED") || cause.message.includes("VISUAL_RETRY_NOT_ENABLED"))) {
      needsNewVisualReview.value = true; error.value = VISUAL_NEW_REVIEW_NOTICE;
    } else error.value = cause instanceof Error ? cause.message : "重试失败";
  } }
  // end
  finally { if (viewVersion === generation) controlling.value = false; }
}
async function load() {
  const version = ++generation;
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  closeRevision();
  pendingForks.clear();
  // end
  selectionGeneration += 1; listGeneration += 1; invalidSelection.value = false; archivedIds.value = new Set(); knownTitles.value = {}; historyCursor.value = null;
  olderHistoryLoaded = false; pagingHistory.value = false; managing.value = false; policyBusy.value = false; policyAllowed.value = null; policyError.value = "";
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  clearReferenceDraft();
  clearVisualReview();
  pendingSubmission = undefined;
  composerDraftIdentity.value += 1;
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  capabilityController?.abort();
  capabilities.value = null;
  capabilityNotice.value = "正在读取服务端运行权限…";
  messagesGeneration += 1;
  sending.value = false;
  controlling.value = false;
  retryRequestId = "";
  // end
  error.value = null;
  if (props.preview) {
    workspaceName.value = "水处理监控工程";
    conversations.value = [
      { id: "energy", title: "能耗对比页面改版", state: "running", unread: 2, meta: "生成组件方案中 · 12 秒" },
      { id: "filling", title: "灌装车间报表", state: "queued" },
      { id: "boiler", title: "锅炉监控大屏", state: "done", unread: 1, meta: "已完成 · 新版本 v1.4 可下载" },
      { id: "login", title: "登录页样式讨论", state: "discuss" },
      { id: "legacy", title: "一期历史遗留问题", state: "archived", meta: "归档 · 10-14" },
    ];
    activeConversationId.value = "energy";
    return;
  }
  stream.value?.stop();
  stream.value = null;
  currentRunId.value = "";
  activeConversationId.value = props.conversationId ?? "";
  messages.value = [];
  conversations.value = [];
  usage.value = undefined;
  delivery.value = null;
  revisions.value = [];
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  sourceRequired.value = false;
  uploading.value = false;
  // end
  loading.value = true;
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  void fetchVisualEgressPolicy().then(policy => { if (version === generation) policyAllowed.value = policy.imageEgressAllowed; })
    .catch(() => { if (version === generation) policyError.value = "无法读取租户图片外发授权，请重载或联系管理员。"; });
  // 配置请求独立于历史加载；断网时只关闭新执行，不挡住历史与已受理任务。
  capabilityController = new AbortController();
  void api.getWorkbenchConfig(capabilityController.signal).then(config => {
    if (version !== generation) return;
    capabilities.value = config;
    capabilityNotice.value = "当前租户暂未开放新的运行，可继续查看历史和停止已受理任务。";
  }).catch(() => {
    if (version === generation) capabilityNotice.value = "服务端配置暂不可用，暂未开放新的运行；历史和停止仍可使用。";
  });
  // end
  try {
    const [workspace, items, versions] = await Promise.all([api.getWorkspace(props.workspaceId), api.conversationPage(props.workspaceId, null, showingArchive.value), api.listRevisions(props.workspaceId)]);
    if (version !== generation) return;
    workspaceName.value = workspace.name;
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    sourceRequired.value = workspace.mode === "upload" && !workspace.currentRevisionId;
    // end
    conversations.value = items.items.map(sidebarItem);
    conversationCursor.value = items.nextCursor;
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    revisions.value = versions.map(item => ({ id: item.id, version: "v" + item.revisionNumber, at: item.createdAt.slice(0, 10), current: item.id === workspace.currentRevisionId }));
    // end
    activeConversationId.value = props.conversationId ?? items.items[0]?.id ?? "";
    mode.value = readDraft()?.mode ?? "build";
    const selectedId = activeConversationId.value;
    if (selectedId) {
      await ensureConversation(selectedId);
      if (version !== generation) return;
      await refreshMessages(selectedId);
    }
    if (!props.conversationId && activeConversationId.value) await router?.replace({ name: "workbench", params: { id: props.workspaceId, conversationId: activeConversationId.value } });
    if (version !== generation) return;
    if (activeConversationId.value) {
      const latest = await fetchLatestRun(activeConversationId.value);
      if (version === generation && latest) subscribe(latest.id);
    }
  } catch (cause) { if (version === generation) { invalidSelection.value = true; error.value = cause instanceof Error ? cause.message : "工程加载失败"; } }
  finally { if (version === generation) loading.value = false; }
}
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
watch(() => [props.workspaceId, props.preview, session.state.user?.tenantId, session.state.user?.id], () => { void load(); }, { immediate: true });
// end
watch(() => props.conversationId, id => {
  if ((id ?? "") !== activeConversationId.value) { if (loading.value) void load(); else void selectConversation(id ?? "", false); }
});
watch(activePane, pane => { if (pane === "usage" && currentRunId.value) void refreshUsage(currentRunId.value); });
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
watch(() => [isReferenceWait.value, currentRunId.value, pendingInput.value?.payload.receipt], () => { void loadVisualReview(); });
onBeforeUnmount(() => { clearReferenceDraft(); clearVisualReview(); pendingSubmission = undefined; });
// end
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
onBeforeUnmount(() => { closeRevision(); generation += 1; stream.value?.stop(); usageController?.abort(); capabilityController?.abort(); if (noticeTimer) clearTimeout(noticeTimer); });
// end
// end
// end
</script>

<template>
<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
  <WorkbenchShell title="智汇 · 工程工作台" :workspace-name="workspaceName" :preview="preview" :connection-label="connectionLabel" :sequence="preview ? 128 : stream?.lastSeq.value ?? 0">
    <template #sidebar>
      <ConversationSidebar :workspace-name="workspaceName" :conversations="conversations" :active-id="activeConversationId" :archived-count="preview ? 3 : 0" :more="!!conversationCursor" :paging="pagingConversations" :showing-archive="showingArchive"
        @select="selectConversation" @create="createConversation" @manage-archive="toggleArchive" @load-more="loadConversations()" />
    </template>
    <template #mainhead>
      <span class="conv-name">{{ activeTitle }}</span><span class="mode-chip">{{ mode === "build" ? "🛠 生成修改" : mode === "plan" ? "🧭 规划" : "💬 讨论" }}</span>
      <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
      <ConversationActions v-if="!preview && activeConversationId && !invalidSelection" :key="activeConversationId" :title="activeTitle" :archived="activeArchived" :disabled="managing || loading" @rename="renameConversation" @archive="mutateConversation" />
      <!-- end -->
      <RunPill :key="currentRunId || 'preview'" :status="busy ? status : null" :elapsed-seconds="preview ? 12 : 0" :cancelable="!controlling" @stop="stopCurrentRun" />
    </template>
    <template #main>
      <div ref="scrollArea" class="messages" aria-label="对话消息">
        <ReferenceMessages v-if="preview" @action="previewAction" />
        <template v-else>
          <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
          <p v-if="activeArchived" class="conversation-status" role="status">此会话已归档，仅可查看历史；恢复后可继续发送。</p>
          <button v-if="historyCursor" class="history-more" type="button" :disabled="pagingHistory" @click="loadOlderMessages">{{ pagingHistory ? '正在加载历史…' : '加载更早消息' }}</button>
          <!-- end -->
          <!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
          <fieldset v-if="sourceRequired && !loading" :disabled="uploading || !canStartRun" aria-label="源工程导入">
            <UploadGuide @file="uploadSource" /><p v-if="uploading" role="status">正在校验并导入源工程…</p>
          </fieldset>
          <!-- end -->
          <div v-if="loading" class="workspace-empty"><span class="spinner" /><p>正在打开工程…</p></div>
          <div v-else-if="!messages.length && !error" class="workspace-empty"><span class="empty-symbol">✦</span><h2>从一个想法开始</h2><p>描述页面需求，或新建对话继续探索。</p><small>发送一条需求即可开始一次运行。</small></div>
          <MessageBubble v-for="message in messages" :key="message.id" :role="message.role" :text="message.content" />
          <RunTimeline v-if="stream && stream.steps().length" :steps="stream.steps()" />
          <!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
          <!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
          <!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
          <section v-if="(status === 'FAILED' || status === 'CANCELLED') && nativeNameRegenerationRequired" class="approval-card" aria-label="运行已结束">
            <div class="card-body"><p>{{ NATIVE_NAME_REGENERATION_NOTICE }}</p><a class="mini-btn" data-testid="native-name-new-workspace" href="/workspaces">新建工程</a></div>
          </section>
          <section v-else-if="(status === 'FAILED' || status === 'CANCELLED') && (needsNewVisualReview || visualReconsentRequired)" class="approval-card" aria-label="运行已结束"><div class="card-body"><p>{{ visualReconsentRequired ? VISUAL_RECONSENT_NOTICE : VISUAL_NEW_REVIEW_NOTICE }}</p></div></section>
          <!-- end -->
          <!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
          <section v-else-if="status === 'FAILED' || status === 'CANCELLED'" class="approval-card" aria-label="运行已结束">
            <div class="card-body">
              <p v-if="recoveryPolicyState === 'loading'">正在读取本轮结果和恢复方式…</p>
              <p v-else-if="recoveryPolicyState === 'unavailable'">暂时无法读取本轮恢复方式，请刷新后重试。</p>
              <p v-else>{{ baselineConflict ? '工程版本已被其他轮次更新，旧任务未执行。请核对当前版本后重新规划。' : status === 'FAILED' ? '本轮未完成，可重新尝试。' : '本轮已停止。' }} <span v-if="!baselineConflict">重试会创建新运行，基线过期时需要重新规划。</span></p>
              <button v-if="baselineConflict" data-testid="run-replan" type="button" class="mini-btn" :disabled="controlling || recoveryPolicyState !== 'ready'" @click="requestReplan">重新规划</button>
              <button v-else data-testid="run-retry" type="button" class="mini-btn" :disabled="activeArchived || invalidSelection || controlling || !canStartRun || recoveryPolicyState !== 'ready'" @click="retryCurrentRun">重新尝试</button>
            </div>
          </section>
          <!-- end -->
          <!-- end -->
          <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
          <!-- end -->
          <VisualReferenceReview v-if="isReferenceWait && visualReview" :key="visualReview.runId + visualReview.receipt" :review="visualReview" :disabled="sending || controlling || revisingReference" :accept-disabled="!canUseReference" @accept="acceptVisualReference" @cancel="stopCurrentRun" @revise="saveVisualCorrections" @reload="refreshVisualReview" />
          <section v-else-if="isReferenceWait" class="approval-card" aria-label="读取识别确认">
            <div class="card-body"><p role="status">{{ reviewLoading ? '正在读取本轮识别与组件映射…' : reviewError }}</p><button type="button" class="mini-btn" :disabled="reviewLoading || sending || controlling" @click="refreshVisualReview">重新读取识别结果</button><button type="button" class="mini-btn" :disabled="controlling" @click="stopCurrentRun">停止本轮</button></div>
          </section>
          <section v-if="status === 'WAITING_INPUT' && pendingInput && !isReferenceWait" class="approval-card" aria-label="等待确认">
          <!-- end -->
            <div class="card-head">{{ pendingInput.payload.question }}</div>
            <!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
            <div class="card-body"><p>确认的是本轮显示的蓝图；需要调整时可直接发送修改意见。</p><button v-if="pendingInput.payload.receipt" class="mini-btn" :disabled="sending || !canStartRun" @click="confirmBlueprint">确认蓝图并生成工程</button></div>
            <!-- end -->
          </section>
          <section v-if="status === 'WAITING_APPROVAL' && pendingApproval" class="approval-card" aria-label="方案审批">
            <!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
            <div class="card-head">方案待审批</div><div class="card-body"><p>{{ pendingApproval.payload.summary }}</p><button class="mini-btn" :disabled="sending || !canStartRun" @click="resumeApproval('approve')">批准并构建</button><button class="mini-btn" :disabled="sending || !canStartRun" @click="resumeApproval('revise')">重新规划</button><button class="mini-btn" :disabled="sending" @click="resumeApproval('cancel')">取消方案</button></div>
            <!-- end -->
          </section>
          <section v-if="delivery?.artifactId" class="approval-card" aria-label="工程交付"><div class="card-head">工程包已就绪</div><div class="card-body"><p>构建与修订已绑定，尚未经过人工 KingFusion 3.6 运行态验收。</p><button class="mini-btn" @click="download">下载工程包</button></div></section>
          <div v-if="error" class="conflict-banner" role="alert"><span>⚠</span><div>{{ error }}<button v-if="!messages.length" type="button" class="mini-btn" @click="load">重新加载</button></div></div>
        </template>
      </div>
      <!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
      <div v-if="!preview && !canStartRun && !loading" class="conflict-banner" role="status">{{ capabilityNotice }}</div>
      <!-- end -->
      <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
      <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
      <!-- Tenant-wide settings live in the composer disclosure; per-send consent stays beside the attached image. -->
      <!-- end -->
      <input v-if="!preview" ref="referenceInput" type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="reference-file-input" aria-label="选择单张参考图" @change="attachReference">
      <!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
      <div v-if="!preview && missingReferenceDraft" class="reference-consent" role="status">
        <p>此草稿包含尚未发送的参考图要求；切换或刷新后请重新上传并同意外发。</p>
        <button type="button" :disabled="!canUseReference || activeArchived || invalidSelection || loading || mode !== 'build'" @click="referenceInput?.click()">重新上传参考图</button>
        <button type="button" :disabled="activeArchived || invalidSelection || loading || sending" @click="saveDraft(draftText, mode, false)">移除图片要求，仅保留文字</button>
      </div>
      <!-- end -->
      <div v-if="!preview && referenceFile" class="reference-consent">
        <img v-if="referenceImage" :src="referenceImageUrl(workspaceId, referenceImage.id)" alt="待发送参考图">
        <div><p>{{ referenceUploading ? '正在上传到私有存储，尚未发送给模型…' : referenceImage ? '参考图已上传，尚未发送给模型。' : '参考图未就绪，请移除后重传；不会自动改成纯文字请求。' }}</p>
          <label><input v-model="referenceConsent" type="checkbox" data-testid="reference-consent" :disabled="!referenceImage || referenceUploading || sending || controlling || !canUseReference"> 我同意本轮外发：{{ VISUAL_CONSENT_NOTICE }}</label>
          <p v-if="!canUseReference">服务端当前不允许图片外发；保留图片要求，不会降级为文字提交。</p>
        </div>
      </div>
      <!-- end -->
      <!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
      <!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
      <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
      <ComposerBar :key="workspaceId + ':' + (session.state.user?.tenantId ?? '') + ':' + composerDraftIdentity" :draft="draftText" @update:draft="draftText = $event" :mode="mode" :busy="busy || sending || controlling" :disabled="activeArchived || invalidSelection || loading || sourceRequired || uploading || !canStartRun || sending || controlling || status === 'CANCEL_REQUESTED' || status === 'WAITING_APPROVAL' || isReferenceWait" :send-disabled="imageSendBlocked || referenceUploading" :mode-locked="!preview && !!referenceFile" :reference-images-enabled="preview || (canUseReference && mode === 'build')" :attach-disabled="!preview && (busy || !!referenceFile)" :submitted="submitted" :files="preview ? previewFiles : referenceFile ? [referenceFile] : []" @update:mode="mode = $event" @send="send"
        @attach="preview ? previewAction() : referenceInput?.click()"
        @remove-file="removeReference">
        <!-- modified by jinlong.feng at 2026-10-28 Agent工作台迭代 -->
        <template v-if="!preview && !loading" #reference-settings>
          <ImageEgressSettings :allowed="policyAllowed" :admin="isTenantAdmin" :vision-enabled="!!capabilities?.flags.agentVisionV1" :busy="policyBusy" :error="policyError" @toggle="changeEgressPolicy" />
        </template>
        <!-- end -->
      </ComposerBar>
      <!-- end -->
      <!-- end -->
      <!-- end -->
    </template>
    <template #inspector>
      <!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
      <ContextPanel :panes="panes" :active="activePane" :preview="preview" :workspace-name="workspaceName" :revisions="revisions" :selected-revision-id="selectedRevisionId" :revision-detail="revisionDetail" :revision-loading="revisionLoading" :revision-error="revisionError" :revision-action-error="revisionActionError" :revision-downloading="revisionDownloading" :revision-forking="revisionForking" :parent-version="parentVersion" @select-revision="selectRevision" @close-revision="closeRevision" @retry-revision="selectRevision(selectedRevisionId)" @download-revision="downloadRevision" @fork-revision="forkRevision" v-bind="usage ? { usage } : {}" @update:active="activePane = $event" @preview-action="previewAction" />
      <!-- end -->
    </template>
    <template #statusbar><span>{{ preview ? "队列 1 · 运行 1" : conversations.length + " 个会话" }}</span></template>
  </WorkbenchShell>
  <Transition name="workbench-toast"><div v-if="notice" class="workbench-toast" role="status">{{ notice }}</div></Transition>
<!-- end -->
</template>
<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
<style scoped>
/* modified by jinlong.feng at 2026-10-28 Agent工作台迭代 */
.conv-name { cursor: default; }
.conv-name:hover::after { content: none; }
.conversation-status { padding: 10px 14px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface); color: var(--color-text-secondary); font-size: 12px; }
.history-more { align-self: center; padding: 6px 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); color: var(--color-text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.history-more:disabled { opacity: .5; cursor: default; }
.history-more:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
/* end */
.approval-card { background: #fff; border: 1px solid #e4e8ee; border-radius: 14px; overflow: hidden; }
.approval-card :deep(.card-head) { padding: 12px 16px; border-bottom: 1px solid #e4e8ee; font-size: 13px; font-weight: 600; }
.approval-card :deep(.card-body) { padding: 14px 16px; font-size: 13px; line-height: 1.6; }
.approval-card :deep(.card-body > p:first-child) { margin-top: 0; }
.approval-card :deep(.mini-btn) { min-height: 34px; padding: 6px 10px; border: 1px solid #d8dee8; border-radius: 7px; background: #fff; font: inherit; font-size: 12px; cursor: pointer; }
.approval-card :deep(.mini-btn:disabled) { opacity: .45; cursor: not-allowed; }
.approval-card :deep(.mini-btn:focus-visible) { outline: 2px solid #1f6feb; outline-offset: 2px; }
.reference-consent { display: flex; align-items: flex-start; gap: 12px; padding: 12px 24px 0; color: #586174; font-size: 12px; line-height: 1.6; }
.reference-consent img { width: 64px; height: 48px; object-fit: contain; border: 1px solid #d8dee8; border-radius: 6px; background: #f5f7fa; }
.reference-consent p { margin: 0 0 4px; }
.reference-consent label { cursor: pointer; }
.reference-consent input { accent-color: #1f6feb; }
@media (max-width: 640px) { .reference-consent { padding-inline: 12px; } }
</style>
<!-- end -->
<!-- end -->
<!-- end -->
