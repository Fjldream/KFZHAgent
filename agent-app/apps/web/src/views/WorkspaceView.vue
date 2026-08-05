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
 * 客户解决方案工作区（brief Step 3）：
 *  - 无工作区：提供「新建工程 / 上传工程」两个入口；
 *  - 有工作区：conversation、plan、preview、revisions、report 同屏可见不跳转。
 */
const props = defineProps<{ workspaceId?: string }>();

const route = useRoute();
const router = useRouter();
const session = useSession();
const workspace = useWorkspace();

const newName = ref("");
const busy = ref(false);
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

async function onCreate(): Promise<void> {
  const name = newName.value.trim();
  if (name.length === 0) return;
  busy.value = true;
  try {
    const created = await workspace.createWorkspace({ name, mode: "new" });
    await router.push(`/workspaces/${created.id}`);
  } finally {
    busy.value = false;
  }
}

async function onCreateUpload(): Promise<void> {
  const name = newName.value.trim();
  if (name.length === 0) return;
  busy.value = true;
  try {
    const created = await workspace.createWorkspace({ name, mode: "upload" });
    await router.push(`/workspaces/${created.id}`);
  } finally {
    busy.value = false;
  }
}

async function onUploadFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file === undefined) return;
  try {
    await workspace.uploadSource(file);
  } finally {
    input.value = "";
  }
}

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

    <main v-if="!hasWorkspace" class="entry" data-testid="workspace-entry">
      <h2>开始一个新方案</h2>
      <input
        v-model="newName"
        data-testid="workspace-name"
        type="text"
        placeholder="方案名称，例如 客户展示大屏"
      />
      <div class="entry-actions">
        <button type="button" data-testid="create-workspace" :disabled="busy || newName.trim() === ''" @click="onCreate">
          新建工程
        </button>
        <button type="button" data-testid="upload-workspace" :disabled="busy || newName.trim() === ''" @click="onCreateUpload">
          上传工程
        </button>
      </div>
      <p class="hint">新建工程从确定性初始设计开始；上传工程导入 KF 原生 .gz 客户端包（无损保留未知字段）。</p>
      <p v-if="workspace.state.error" class="error" data-testid="workspace-error">{{ workspace.state.error }}</p>
    </main>

    <main v-else class="shell">
      <div class="left">
        <ProjectTree :tree="solutionTree" />
        <div v-if="workspace.state.workspace?.mode === 'upload' && workspace.state.currentRevisionId === null" class="upload-zone">
          <h3>上传 KF 源包</h3>
          <input ref="fileInput" type="file" accept=".gz" data-testid="upload-input" @change="onUploadFile" />
        </div>
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
.entry {
  max-width: 40rem;
  margin: 4rem auto;
  background: #ffffff;
  border-radius: 12px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.entry input {
  padding: 0.6rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
.entry-actions {
  display: flex;
  gap: 0.8rem;
}
.entry-actions button {
  padding: 0.55rem 1.1rem;
  border-radius: 6px;
  border: none;
  background: #2563eb;
  color: #ffffff;
  cursor: pointer;
}
.entry-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hint {
  color: #64748b;
  font-size: 0.85rem;
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
.upload-zone {
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 0.8rem;
  background: #ffffff;
}
.upload-zone h3 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
}
</style>
