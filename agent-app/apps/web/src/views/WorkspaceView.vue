<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "../stores/session";
import { useWorkspace } from "../stores/workspace";
import { useWorkflowStage } from "../stores/stage";
import TopBar from "../components/TopBar.vue";
import ContextPanel from "../components/ContextPanel.vue";
import ConversationPanel from "../components/ConversationPanel.vue";
import PreviewBar from "../components/PreviewBar.vue";
import ApprovalSheet from "../components/ApprovalSheet.vue";
import type { SolutionTreeNode } from "../types";

/**
 * 客户解决方案工作区：双栏 workbench（对话 + 情境面板）+ 顶部栏 + 底部预览条。
 * 入口（新建/上传）由 /workspaces 列表页（WorkspacesView）承担；本页经路由保证必有 workspaceId。
 */
const props = defineProps<{ workspaceId?: string }>();

const route = useRoute();
const router = useRouter();
const session = useSession();
const workspace = useWorkspace();

const previewUrl = ref<string | undefined>(undefined);
const deleteConfirmOpen = ref(false);
const deleting = ref(false);
const deleteSheetEl = ref<HTMLElement | null>(null);

/** 由工作区状态实时推导当前工作流阶段，驱动情境面板切换。 */
const stage = useWorkflowStage(workspace.state);

/** 解决方案树：第一个子节点为「客户端工程」，其余注册域以 disabled 能力展示。 */
const solutionTree = computed<SolutionTreeNode>(() => ({
  label: "解决方案",
  children: [
    { label: "客户端工程", domain: "kingclient", supported: true, children: [] },
    { label: "计算域", domain: "calculation", supported: false, children: [] },
    { label: "数据源域", domain: "datasource", supported: false, children: [] },
    { label: "采集域", domain: "acquisition", supported: false, children: [] },
    { label: "报警域", domain: "alarm", supported: false, children: [] },
  ],
}));

const activeWorkspaceId = computed<string | undefined>(() => {
  if (props.workspaceId !== undefined && props.workspaceId !== "") return props.workspaceId;
  const param = route.params.id;
  return typeof param === "string" && param.length > 0 ? param : undefined;
});

const hasWorkspace = computed(() => activeWorkspaceId.value !== undefined);

const artifact = computed(() => {
  const items = workspace.state.artifacts;
  return items.find((item) => item.kind === "client-package") ?? items[0];
});

async function refresh(): Promise<void> {
  const id = activeWorkspaceId.value;
  if (id === undefined) return;
  await workspace.load(id);
}

watch(activeWorkspaceId, () => {
  if (activeWorkspaceId.value !== undefined) void refresh();
});

onMounted(() => {
  if (activeWorkspaceId.value !== undefined) void refresh();
});

// 预览：approval interrupt 携带 previewArtifactId 时经授权端点生成 blob URL。
watch(
  () => workspace.state.pendingApproval?.previewArtifactId,
  async (artifactId) => {
    if (previewUrl.value !== undefined) {
      URL.revokeObjectURL(previewUrl.value);
      previewUrl.value = undefined;
    }
    if (artifactId === undefined || artifactId === "") return;
    try {
      previewUrl.value = await workspace.createPreviewUrl(artifactId);
    } catch {
      previewUrl.value = undefined;
    }
  },
);

async function onSend(content: string): Promise<void> {
  try {
    await workspace.sendMessage(content);
  } catch {
    // 错误信息已写入 workspace.state.error。
  }
}

async function onApprove(): Promise<void> {
  try {
    await workspace.resumeApproval("approve");
  } catch {
    // 错误信息已写入 workspace.state.error。
  }
}

async function onRevise(): Promise<void> {
  try {
    await workspace.resumeApproval("revise");
  } catch {
    // 错误信息已写入 workspace.state.error。
  }
}

async function onCancel(): Promise<void> {
  try {
    await workspace.resumeApproval("cancel");
  } catch {
    // 错误信息已写入 workspace.state.error。
  }
}

async function onDownload(artifactId: string): Promise<void> {
  try {
    await workspace.downloadArtifact(artifactId);
  } catch {
    // 错误信息已写入 workspace.state.error。
  }
}

async function onLogout(): Promise<void> {
  await session.logout();
  await router.push("/login");
}

/** 删除确认（Task 8）：替代原两次点击 armed 模式——点击「删除」仅打开确认弹层。 */
function onDeleteWorkspace(): void {
  deleteConfirmOpen.value = true;
}

/** 进入动画：iOS 风格 spring 近似（WAAPI，可中断），复用 ApprovalSheet 模式。 */
watch(deleteConfirmOpen, (open) => {
  if (!open) return;
  void nextTick(() => {
    const el = deleteSheetEl.value;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { opacity: 0, transform: "scale(0.92) translateY(28px)" },
        { opacity: 1, transform: "scale(1) translateY(0)" },
      ],
      { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" },
    );
  });
});

async function onConfirmDelete(): Promise<void> {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await workspace.deleteWorkspace();
    deleteConfirmOpen.value = false;
    await router.push("/workspaces");
  } catch (error) {
    // store.deleteWorkspace 不写 error，这里显式写入以驱动 shell-error 展示（Task 8）。
    workspace.state.error = error instanceof Error ? error.message : String(error);
    deleteConfirmOpen.value = false;
  } finally {
    deleting.value = false;
  }
}

function onCancelDelete(): void {
  if (deleting.value) return;
  deleteConfirmOpen.value = false;
}

function onSelectRevision(_revisionId: string): void {
  // 修订为不可变快照；选择仅用于查看，当前版本始终由 currentRevisionId 高亮。
}

// 供 Task 7（ApprovalSheet 接线）复用：审批/改稿/取消操作当前由弹层接管，
// 情境面板不直接触发；此处显式保留以通过 noUnusedLocals 检查。
void hasWorkspace;
void onApprove;
void onRevise;
void onCancel;

/** 上传 KF 源包：由情境面板的 UploadGuide 以 File 事件转出。 */
async function onUploadFile(file: File): Promise<void> {
  try {
    await workspace.uploadSource(file);
  } catch {
    // 错误信息已写入 workspace.state.error。
  }
}
</script>

<template>
  <div class="app-shell">
    <TopBar :workspace-name="workspace.state.workspace?.name ?? ''" :stage="stage" @logout="onLogout" @delete-workspace="onDeleteWorkspace" />
    <main class="shell">
      <section class="conversation-col">
        <ConversationPanel :messages="workspace.state.messages" :streaming="workspace.state.streaming" @send="onSend" />
        <p v-if="workspace.state.error" class="error" data-testid="shell-error">{{ workspace.state.error }}</p>
      </section>
      <ContextPanel
        :stage="stage"
        :workspace="workspace.state.workspace"
        :mode="workspace.state.workspace?.mode ?? 'new'"
        :tree="solutionTree"
        :revisions="workspace.state.revisions"
        :current-revision-id="workspace.state.currentRevisionId"
        :report="workspace.state.validationReport"
        :artifact="artifact"
        :job-status="workspace.state.buildJobStatus"
        :upload-pending="workspace.state.currentRevisionId === null"
        @upload="onUploadFile"
        @select-revision="onSelectRevision"
        @download="onDownload"
      />
    </main>
    <PreviewBar :preview-url="previewUrl" />
    <ApprovalSheet
      v-if="workspace.state.pendingApproval !== null"
      :plan="workspace.state.pendingApproval?.plan ?? null"
      :plan-hash="workspace.state.pendingApproval?.planHash ?? ''"
      :summary="workspace.state.pendingApproval?.summary ?? ''"
      :script-changes="workspace.state.pendingApproval?.scriptChanges ?? []"
      :busy="Boolean(workspace.state.streaming || workspace.state.resuming)"
      @approve="onApprove"
      @revise="onRevise"
      @cancel="onCancel"
    />
    <div v-if="deleteConfirmOpen" class="delete-scrim" data-testid="delete-confirm" @click.self="onCancelDelete">
      <section ref="deleteSheetEl" class="delete-sheet" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title">
        <h2 id="delete-confirm-title">删除工程</h2>
        <p class="delete-warning">
          删除后不可恢复，确定要删除「{{ workspace.state.workspace?.name ?? "当前工程" }}」吗？
        </p>
        <footer class="delete-actions">
          <button type="button" class="delete-cancel" :disabled="deleting" @click="onCancelDelete">取消</button>
          <button type="button" class="delete-confirm" data-testid="delete-confirm-action" :disabled="deleting" @click="onConfirmDelete">
            {{ deleting ? "删除中…" : "确认删除" }}
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.app-shell { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; background: transparent; }
.shell {
  flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; gap: 1.2rem;
  padding: 1.2rem 1.4rem; min-height: 0;
}
.conversation-col { display: flex; flex-direction: column; gap: 0.8rem; min-height: 0; }
.error { color: var(--color-danger); margin: 0; font-size: 0.85rem; padding: 0 0.2rem; }
/* Task 8 删除确认弹层：复用 ApprovalSheet 的 scrim + 毛玻璃卡片模式。 */
.delete-scrim {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0, 0, 0, 0.35); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.delete-sheet {
  width: min(24rem, 92vw);
  background: rgba(255, 255, 255, 0.92); backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-sheet); box-shadow: var(--shadow-float);
  padding: 1.4rem 1.5rem 1.3rem;
}
.delete-sheet h2 { margin: 0 0 0.4rem; font-size: 1.15rem; }
.delete-warning { margin: 0; color: var(--color-text-secondary); font-size: 0.9rem; line-height: 1.5; }
.delete-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.1rem; }
.delete-actions button { padding: 0.55rem 1.1rem; border-radius: 999px; font-size: 0.9rem; cursor: pointer; }
.delete-confirm { border: none; background: var(--color-danger); color: #fff; }
.delete-cancel { border: 1px solid var(--color-border); background: transparent; color: var(--color-text); }
.delete-actions button:active { transform: scale(0.97); }
.delete-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
