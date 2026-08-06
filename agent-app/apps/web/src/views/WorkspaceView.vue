<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "../stores/session";
import { useWorkspace } from "../stores/workspace";
import ArtifactDownload from "../components/ArtifactDownload.vue";
import ChangePlanPanel from "../components/ChangePlanPanel.vue";
import ConversationPanel from "../components/ConversationPanel.vue";
import PreviewFrame from "../components/PreviewFrame.vue";
import ProjectTree from "../components/ProjectTree.vue";
import RevisionList from "../components/RevisionList.vue";
import ValidationReport from "../components/ValidationReport.vue";
import type { SolutionTreeNode } from "../types";

/**
 * 客户解决方案工作区：conversation、plan、preview、revisions、report 同屏可见不跳转。
 * 入口（新建/上传）由 /workspaces 列表页（WorkspacesView）承担；本页经路由保证必有 workspaceId。
 */
const props = defineProps<{ workspaceId?: string }>();

const route = useRoute();
const router = useRouter();
const session = useSession();
const workspace = useWorkspace();

const deleteArmed = ref(false);
const previewUrl = ref<string | undefined>(undefined);

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
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <h1>KF Solution Agent</h1>
      <div class="user">
        <span class="tenant">{{ session.state.tenantName }}</span>
        <span class="username">{{ session.state.user?.username ?? "" }}</span>
        <button type="button" data-testid="logout" @click="onLogout">退出</button>
        <button
          v-if="hasWorkspace"
          type="button"
          class="danger"
          data-testid="delete-workspace"
          @click="onDeleteWorkspace"
        >
          {{ deleteArmed ? "再次点击确认删除" : "删除工作区" }}
        </button>
      </div>
    </header>

    <main class="shell">
      <div class="left">
        <ProjectTree :tree="solutionTree" />
        <RevisionList
          :revisions="workspace.state.revisions"
          :current-revision-id="workspace.state.currentRevisionId"
          @select="onSelectRevision"
        />
        <ArtifactDownload
          :artifact-id="artifact?.storageKey ?? ''"
          :job-status="workspace.state.buildJobStatus"
          :file-name="`${workspace.state.workspace?.name ?? 'client'}.gz`"
          @download="onDownload"
        />
      </div>
      <div class="center">
        <ConversationPanel
          :messages="workspace.state.messages"
          :streaming="workspace.state.streaming"
          @send="onSend"
        />
        <p v-if="workspace.state.error" class="error" data-testid="shell-error">{{ workspace.state.error }}</p>
      </div>
      <div class="right">
        <ChangePlanPanel
          :plan="workspace.state.pendingApproval?.plan ?? null"
          :plan-hash="workspace.state.pendingApproval?.planHash ?? ''"
          :summary="workspace.state.pendingApproval?.summary ?? ''"
          :script-changes="workspace.state.pendingApproval?.scriptChanges ?? []"
          :busy="workspace.state.streaming"
          @approve="onApprove"
          @revise="onRevise"
          @cancel="onCancel"
        />
        <ValidationReport :report="workspace.state.validationReport" />
      </div>
      <div class="bottom">
        <PreviewFrame :preview-url="previewUrl ?? ''" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: #f1f5f9;
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.8rem 1.2rem;
  background: #0f172a;
  color: #ffffff;
}
.topbar h1 {
  margin: 0;
  font-size: 1.1rem;
}
.user {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
}
.user button {
  padding: 0.35rem 0.7rem;
  border-radius: 6px;
  border: none;
  background: #334155;
  color: #ffffff;
  cursor: pointer;
}
.user button.danger {
  background: #7f1d1d;
}
.error {
  color: #b91c1c;
  font-size: 0.85rem;
}
.shell {
  flex: 1;
  display: grid;
  grid-template-columns: 20rem 1fr 24rem;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 1rem;
  padding: 1rem;
}
.left {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}
.center {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
}
.right {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}
.bottom {
  grid-column: 1 / -1;
}
</style>
