<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import type { RevisionDetail } from "@kf/contracts";
// end
import ReferenceInspector from "./ReferenceInspector.vue";
export type ContextPane = { id: string; label: string };
export type UsageFacts = { callsUsed: number; callsLimit: number; costEstimate: string;
  inputTokens: number; inputLimit: number; outputTokens: number; outputLimit: number;
  cacheHitPercent?: number; repairUsed?: number; repairLimit?: number; usageUnknownCount?: number };
export type PlanFacts = { page: string; mode: string; baseVersion: string; planHash: string; analysisVersion?: string | undefined };
withDefaults(defineProps<{ panes: ContextPane[]; active: string; facts?: PlanFacts;
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  controlCount?: number; usage?: UsageFacts; revisions?: Array<{ id?: string; version: string; at: string; current?: boolean }>;
  selectedRevisionId?: string; revisionDetail?: RevisionDetail | null; revisionLoading?: boolean;
  revisionError?: string; revisionActionError?: string; revisionDownloading?: boolean; revisionForking?: boolean; parentVersion?: string;
  // end
  preview?: boolean; workspaceName?: string;
}>(), { controlCount: 0, revisions: () => [], preview: false, workspaceName: "当前工程" });
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const emit = defineEmits<{ "update:active": [id: string]; previewAction: []; selectRevision: [id: string]; closeRevision: []; retryRevision: []; downloadRevision: []; forkRevision: [] }>();
// end
const short = (value: string) => value.length <= 8 ? value : value.slice(0, 4) + "…" + value.slice(-4);
const bar = (used: number, limit: number) => limit <= 0 ? "0%" : Math.min(100, Math.round(used / limit * 100)) + "%";
</script>
<template>
  <div class="insp">
    <div class="insp-tabs tabs" role="tablist" aria-label="工程检查器">
      <button v-for="pane in panes" :key="pane.id" type="button" role="tab" :aria-selected="active === pane.id" :class="{ on: active === pane.id }" @click="emit('update:active', pane.id)">{{ pane.label }}</button>
    </div>
    <ReferenceInspector v-if="preview" :active="active" @action="emit('previewAction')" />
    <div v-else class="insp-body body">
      <div v-show="active === 'plan'" class="insp-pane on">
        <section class="insp-card card">
          <h4>当前方案</h4>
          <template v-if="facts">
            <div class="kv"><span class="k">页面</span><span class="v">{{ facts.page }}</span></div>
            <div class="kv"><span class="k">生成模式</span><span class="v">{{ facts.mode }}</span></div>
            <div class="kv"><span class="k">基线版本</span><span class="v">{{ facts.baseVersion }}</span></div>
            <div class="kv"><span class="k">planHash</span><span class="v mono">{{ short(facts.planHash) }} ✓已签名</span></div>
            <div v-if="facts.analysisVersion" class="kv"><span class="k">分析版本</span><span class="v mono">{{ short(facts.analysisVersion) }}</span></div>
          </template>
          <p v-else class="panel-empty">方案生成后，页面、控件与版本信息会显示在这里。</p>
        </section>
        <section v-if="controlCount > 0" class="insp-card card"><h4>控件清单（{{ controlCount }}）</h4><p class="panel-empty">按区域分组，未验证控件会单独标注。</p></section>
      </div>
      <div v-show="active === 'project'" class="insp-pane on">
        <section class="insp-card"><h4>工程结构</h4><div class="tree"><div class="t-node">📁 {{ workspaceName }}</div></div><p class="panel-empty">完成构建后可查看本轮工程与资源。</p></section>
      </div>
      <div v-show="active === 'revision'" class="insp-pane on">
        <!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
        <div v-for="revision in revisions" :key="revision.id ?? revision.version" class="rev-item rev" :class="{ current: revision.current }">
          <div class="rev-top"><button type="button" class="rv mini-btn" :disabled="!revision.id" :aria-pressed="selectedRevisionId === revision.id" @click="revision.id && emit('selectRevision', revision.id)">{{ revision.version }}</button><span class="tag-src">{{ revision.at }}</span><span v-if="revision.current" class="cur">当前</span></div>
        </div>
        <section v-if="selectedRevisionId" class="insp-card" aria-label="版本详情">
          <button type="button" class="mini-btn" @click="emit('closeRevision')">关闭版本详情</button>
          <p v-if="revisionLoading" role="status">正在加载版本详情…</p>
          <div v-else-if="revisionError" role="alert"><p>{{ revisionError }}</p><button type="button" class="mini-btn" @click="emit('retryRevision')">重试版本详情</button></div>
          <template v-else-if="revisionDetail">
            <h4>v{{ revisionDetail.revisionNumber }} · 只读详情<span v-if="revisionDetail.current"> · 当前</span></h4>
            <p>父版本：{{ parentVersion }}</p>
            <p>类型：{{ revisionDetail.kind }} · {{ revisionDetail.createdAt }}</p>
            <p>编译校验：{{ revisionDetail.verification.compiled === 'passed' ? '通过' : '未知' }}</p>
            <p>运行态验收：未执行 · 视觉验收：未执行</p>
            <p>从历史版本开始的对话只保留历史上下文；后续生成仍使用工作区当前基线并检查冲突。</p>
            <template v-if="revisionDetail.delivery">
              <p class="mono">制品 SHA-256：{{ revisionDetail.delivery.sha256 }}</p>
              <button type="button" class="mini-btn" :disabled="revisionDownloading" @click="emit('downloadRevision')">{{ revisionDownloading ? '获取下载凭据…' : '下载此版本工程包' }}</button>
            </template>
            <p v-else>此版本没有可靠绑定的交付制品，仅支持只读查看。</p>
            <button v-if="revisionDetail.forkAnchor" type="button" class="mini-btn" :disabled="revisionForking" @click="emit('forkRevision')">{{ revisionForking ? '正在创建对话…' : '从这里开始对话' }}</button>
            <p v-else>此版本缺少可靠的消息关联，无法从此处开始对话。</p>
            <p v-if="revisionActionError" role="alert">{{ revisionActionError }}（可再次点击重试）</p>
          </template>
        </section>
        <!-- end -->
        <p v-if="!revisions.length" class="panel-empty">还没有工程修订。</p>
      </div>
      <div v-show="active === 'usage'" class="insp-pane on">
        <p v-if="usage && usage.callsUsed === 0" class="panel-empty">模型调用账本尚未接通；此处不代表零消耗。本轮暂不启用预算控制。</p>
        <template v-else-if="usage">
          <div class="usage-num">
            <div class="unum"><div class="n">{{ usage.callsUsed }}<small>/{{ usage.callsLimit }}</small></div><div class="d">模型调用 / 预算</div></div>
            <div class="unum"><div class="n">{{ usage.costEstimate }}</div><div class="d">费用估算</div></div>
            <div class="unum"><div class="n">{{ usage.inputTokens }}<small>/{{ usage.inputLimit }}</small></div><div class="d">输入 token</div></div>
            <div class="unum"><div class="n">{{ usage.outputTokens }}<small>/{{ usage.outputLimit }}</small></div><div class="d">输出 token</div></div>
          </div>
          <section class="insp-card"><h4>本轮预算（RunBudget）</h4><div class="usage-bars">
            <div class="ubar"><div class="lbl"><span>物理调用</span><b>{{ usage.callsUsed }} / {{ usage.callsLimit }}</b></div><div class="track"><div class="fill orange" :style="{ width: bar(usage.callsUsed, usage.callsLimit) }" /></div></div>
            <div v-if="usage.cacheHitPercent !== undefined" class="ubar"><div class="lbl"><span>缓存命中</span><b>{{ usage.cacheHitPercent }}%</b></div><div class="track"><div class="fill green" :style="{ width: usage.cacheHitPercent + '%' }" /></div></div>
          </div></section>
          <p v-if="usage.usageUnknownCount" class="unknown-note">⚠ {{ usage.usageUnknownCount }} 次调用 usage 未知（provider 未返回），费用为估算值，非账单。</p>
        </template>
        <p v-else class="panel-empty">发起任务后查看本轮用量。</p>
      </div>
      <slot />
    </div>
  </div>
</template>
<!-- end -->
