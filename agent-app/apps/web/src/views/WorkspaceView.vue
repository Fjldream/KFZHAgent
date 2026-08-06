<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "../stores/session";
import { useWorkspace } from "../stores/workspace";
import { useWorkflowStage } from "../stores/stage";
import TopBar from "../components/TopBar.vue";
import ContextPanel from "../components/ContextPanel.vue";
import ConversationPanel from "../components/ConversationPanel.vue";
import PreviewBar from "../components/PreviewBar.vue";
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

const deleteArmed = ref(false);
const previewUrl = ref<string | undefined>(undefined);

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

async function onDeleteWorkspace(): Promise<void> {
  if (!deleteArmed.value) {
    deleteArmed.value = true;
    return;
  }
  try {
    await workspace.deleteWorkspace();
    deleteArmed.value = false;
    await router.push("/workspaces");
  } catch {
    // 错误信息已写入 workspace.state.error。
  }
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
  </div>
</template>

<style scoped>
.app-shell { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); }
.shell {
  flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; gap: 1.2rem;
  padding: 1.2rem 1.4rem; min-height: 0;
}
.conversation-col { display: flex; flex-direction: column; gap: 0.8rem; min-height: 0; }
.error { color: var(--color-danger); margin: 0; font-size: 0.85rem; padding: 0 0.2rem; }
</style>
