<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useGsap } from "../composables/useGsap";
import type { WorkflowStage } from "../stores/stage";
import type { ArtifactRow, BuildJobStatus, Revision, ValidationReport, Workspace, SolutionTreeNode } from "../types";
import ProjectTree from "./ProjectTree.vue";
import RevisionList from "./RevisionList.vue";
import ValidationReportView from "./ValidationReport.vue";
import UploadGuide from "./UploadGuide.vue";

const props = defineProps<{
  stage: WorkflowStage;
  workspace: Workspace | null;
  mode: string;
  tree: SolutionTreeNode;
  revisions: Revision[];
  currentRevisionId: string | null;
  report: ValidationReport | null;
  artifact: ArtifactRow | undefined;
  jobStatus: BuildJobStatus | null;
  uploadPending: boolean;
}>();

const emit = defineEmits<{
  (e: "upload", file: File): void;
  (e: "select-revision", id: string): void;
  (e: "download", id: string): void;
}>();

const showUpload = computed(() => props.mode === "upload" && props.uploadPending);
const buildText = computed(() => {
  switch (props.jobStatus) {
    case "QUEUED": return "排队中…";
    case "RUNNING": return "正在生成工程…";
    case "VALIDATING": return "六层校验中…";
    case "SUCCEEDED": return "构建完成";
    case "FAILED": return "构建失败";
    default: return "";
  }
});

// 情境面板内容切换：新内容淡入 + 轻微 y（flush: "post" 保证回调在 Vue
// DOM patch 之后——旧内容此刻已不在 DOM，做「旧内容淡出」无意义且会造成
// 新内容闪灭；v-if 结构下做纯进入动画即可）。
const { gsap, track, reduceMotion } = useGsap();
const panelEl = ref<HTMLElement | null>(null);

watch(
  () => props.stage,
  () => {
    const el = panelEl.value;
    if (el === null) return;
    if (reduceMotion()) {
      gsap.set(el, { opacity: 1, y: 0 });
      return;
    }
    const tl = gsap.timeline();
    tl.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" });
    track(tl);
  },
  { flush: "post" },
);
</script>

<template>
  <aside ref="panelEl" class="context" data-testid="context-panel">
    <template v-if="stage === 'approval'">
      <div class="section"><h2>待确认计划</h2><p class="sub">已生成变更计划，请在弹层中审阅并确认。</p></div>
    </template>

    <template v-else-if="stage === 'building'">
      <div class="section">
        <h2>构建进度</h2>
        <div class="bar"><div class="fill" /></div>
        <p class="sub" data-testid="build-status">{{ buildText }}</p>
      </div>
    </template>

    <template v-else-if="stage === 'ready' || stage === 'error'">
      <ValidationReportView v-if="report !== null && report !== undefined" :report="report" />
      <!-- 构建失败且无失败详情（report 缺失，如后端未返回 / 加载失败）时给占位文案（spec §7）。 -->
      <div v-else-if="stage === 'error'" class="section">
        <h2>校验报告</h2>
        <p class="sub">构建失败，请重新描述需求</p>
      </div>
      <div v-if="stage === 'ready' && artifact" class="section">
        <h2>产物下载</h2>
        <button type="button" data-testid="download-artifact" class="primary" @click="emit('download', artifact.id)">
          下载客户端包
        </button>
      </div>
    </template>

    <template v-else>
      <UploadGuide v-if="showUpload" @file="emit('upload', $event)" />
      <ProjectTree v-else :tree="tree" />
      <RevisionList
        :revisions="revisions"
        :current-revision-id="currentRevisionId"
        @select="emit('select-revision', $event)"
      />
    </template>
  </aside>
</template>

<style scoped>
.context { display: flex; flex-direction: column; gap: 1rem; overflow-y: auto; padding: 0 0 1rem; }
.section { background: var(--color-surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 1.2rem; }
.section h2 { margin: 0 0 0.5rem; font-size: 1rem; }
.sub { margin: 0; color: var(--color-text-secondary); font-size: 0.85rem; }
.bar { height: 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.08); overflow: hidden; margin: 0.6rem 0; }
.fill { height: 100%; width: 60%; border-radius: inherit; background: var(--color-accent); animation: pulse 1.4s ease-in-out infinite alternate; }
@keyframes pulse { from { transform: translateX(-100%); } to { transform: translateX(120%); } }
.primary {
  width: 100%; padding: 0.6rem; border: none; border-radius: var(--radius-button);
  background: var(--color-success); color: #fff; cursor: pointer;
}
.primary:active { transform: scale(0.98); }
</style>
