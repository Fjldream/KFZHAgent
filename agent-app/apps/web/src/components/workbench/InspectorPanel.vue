<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 右侧检查器（T13/T17/T24 UI 层）：方案 / 工程 / 版本 / 用量四个标签。
// 版本面板只提供只读检查与「从这里开始对话」，不提供未实现的回滚。
// end
import { ref } from "vue";
import UsageSummary from "./UsageSummary.vue";
import type { PlanSummary, RevisionSummary, UsageSummaryData } from "./workbench-types";

type InspectorTab = "plan" | "project" | "revision" | "usage";

const props = defineProps<{
  plan: PlanSummary;
  controlList: Array<{ name: string; count: string; support: string }>;
  projectTree: Array<{ icon: string; name: string }>;
  revisions: RevisionSummary[];
  usage: UsageSummaryData;
  open?: boolean;
  initialTab?: InspectorTab;
}>();

const emit = defineEmits<{
  (e: "select-revision", id: string): void;
  (e: "download-revision", id: string): void;
  (e: "fork-revision", id: string): void;
  (e: "replan-revision", id: string): void;
}>();

const tabs: Array<{ value: InspectorTab; label: string }> = [
  { value: "plan", label: "方案" },
  { value: "project", label: "工程" },
  { value: "revision", label: "版本" },
  { value: "usage", label: "用量" },
];

const activeTab = ref<InspectorTab>(props.initialTab ?? "plan");

const selectedRevisionId = ref<string | null>(null);

function selectRevision(id: string): void {
  selectedRevisionId.value = id;
  emit("select-revision", id);
}

function isSelected(id: string): boolean {
  return selectedRevisionId.value === id;
}
</script>

<template>
  <aside class="wb-inspector" :class="{ 'is-open': open === true }" data-testid="inspector" aria-label="检查器">
    <div class="wb-insp-tabs" role="tablist" aria-label="检查器标签">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.value"
        :class="{ 'is-on': activeTab === tab.value }"
        :data-testid="`inspector-tab-${tab.value}`"
        @click="activeTab = tab.value"
      >{{ tab.label }}</button>
    </div>

    <div class="wb-insp-body">
      <template v-if="activeTab === 'plan'">
        <div class="wb-insp-card">
          <h4>当前方案</h4>
          <div class="wb-kv"><span class="k">页面</span><span class="v">{{ plan.page }}（1 页）</span></div>
          <div class="wb-kv"><span class="k">生成模式</span><span class="v">图生工程</span></div>
          <div class="wb-kv"><span class="k">基线版本</span><span class="v">{{ plan.baseRevision }}</span></div>
          <div class="wb-kv"><span class="k">planHash</span><span class="v is-mono">{{ plan.planHash }} ✓已签名</span></div>
          <div class="wb-kv"><span class="k">分析版本</span><span class="v is-mono">9f2a…01cc</span></div>
        </div>
        <div class="wb-insp-card">
          <h4>控件清单（{{ plan.controlCount }}）</h4>
          <div class="wb-ctrl-list">
            <div v-for="item in controlList" :key="item.name" class="wb-ctrl-row">
              <span>{{ item.name }}</span><span>{{ item.count }} · {{ item.support }}</span>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'project'">
        <div class="wb-insp-card">
          <h4>工程结构</h4>
          <div class="wb-tree">
            <div v-for="(node, index) in projectTree" :key="node.name" class="wb-tree-node" :class="{ 'is-sub': index > 0 }">
              <span aria-hidden="true">{{ node.icon }}</span>{{ node.name }}
            </div>
          </div>
          <div class="wb-note-ok">✓ 参考图（reference）未打包进工程，仅业务素材（material）进入资源目录</div>
        </div>
        <div class="wb-insp-card">
          <h4>构建状态</h4>
          <div class="wb-kv"><span class="k">工作区锁</span><span class="v">本会话持有</span></div>
          <div class="wb-kv"><span class="k">构建队列</span><span class="v">方案确认后入队</span></div>
          <div class="wb-kv"><span class="k">stale-base 检测</span><span class="v">已启用</span></div>
        </div>
      </template>

      <template v-else-if="activeTab === 'revision'">
        <div
          v-for="revision in revisions"
          :key="revision.id"
          class="wb-rev-item"
          :class="{ 'is-latest': revision.isLatest, 'is-current': isSelected(revision.id) }"
          :data-testid="`revision-${revision.version}`"
        >
          <div class="wb-rev-top">
            <span class="wb-rev-v">{{ revision.version }}</span>
            <span class="wb-tag-src">{{ revision.source }}</span>
            <span v-if="revision.isLatest" class="wb-rev-cur">最新</span>
            <span v-else-if="revision.isCurrent" class="wb-rev-cur">本轮基线</span>
          </div>
          <div class="wb-rev-vb">
            <span class="wb-mini-v" :class="{ 'is-g': revision.schemaOk }">schema {{ revision.schemaOk ? "✓" : "✕" }}</span>
            <span class="wb-mini-v" :class="{ 'is-g': revision.compiledOk }">compiled {{ revision.compiledOk ? "✓" : "✕" }}</span>
            <span class="wb-mini-v" :class="{ 'is-y': revision.visualWarning }">visual {{ revision.visualWarning ? "⚠" : "–" }}</span>
            <span class="wb-mini-v">runtime {{ revision.runtimeVerified ? "✓" : "–" }}</span>
          </div>
          <div v-if="revision.note !== null" class="wb-rev-note">{{ revision.note }}</div>
          <div class="wb-rev-actions">
            <button
              type="button"
              class="wb-mini-btn"
              :disabled="!revision.downloadAvailable"
              @click="emit('download-revision', revision.id)"
            >下载</button>
            <button type="button" class="wb-mini-btn" @click="selectRevision(revision.id)">检查</button>
            <button
              v-if="revision.note !== null"
              type="button"
              class="wb-mini-btn is-link"
              @click="emit('replan-revision', revision.id)"
            >重新规划</button>
            <button
              v-else
              type="button"
              class="wb-mini-btn is-link"
              @click="emit('fork-revision', revision.id)"
            >从这里开始对话</button>
          </div>
        </div>
      </template>

      <UsageSummary v-else :usage="usage" />
    </div>
  </aside>
</template>
