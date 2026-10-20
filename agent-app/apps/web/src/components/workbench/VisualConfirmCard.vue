<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 视觉识别确认卡（T22 UI 层）：参考图区域叠层 ↔ 映射行双向联动。
// 低置信区域在叠层与映射行上同时高亮，避免只靠颜色区分（附文字「未验证」）。
// end
import { ref } from "vue";
import type { RegionMapping } from "./workbench-types";

defineProps<{
  regions: RegionMapping[];
}>();

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "revise"): void;
  (e: "cancel"): void;
}>();

const activeId = ref<string | null>(null);

function supportLabel(level: RegionMapping["support"]): string {
  if (level === "verified") return "✓ 已验证";
  if (level === "unverified") return "⚠ 未验证";
  return "✕ 不支持";
}

function supportClass(level: RegionMapping["support"]): string {
  return `is-${level}`;
}

function boxStyle(region: RegionMapping): Record<string, string> {
  return {
    left: region.box.left,
    top: region.box.top,
    width: region.box.width,
    height: region.box.height,
  };
}
</script>

<template>
  <section class="wb-card" data-testid="visual-confirm" aria-label="视觉识别确认">
    <div class="wb-card-head">
      <span aria-hidden="true">👁</span>
      <b>请确认识别结果</b>
      <span class="wb-head-hint">任务已暂停等待输入 · 不会超时丢失 · 分析版本 9f2a…01cc</span>
    </div>
    <div class="wb-card-body">
      <div class="wb-review-grid">
        <div class="wb-ref-shot" data-testid="reference-shot">
          <span class="wb-shot-label">参考图 · dashboard-v2.png</span>
          <!-- 参考图示意：只表达区域结构，不是真实截图 -->
          <div class="wb-shot-fig" aria-hidden="true">
            <div class="wb-shot-head">⚡ 能源管理系统</div>
            <div class="wb-shot-row">
              <div class="wb-shot-side"><i /><i style="width: 80%" /><i style="width: 70%" /><i style="width: 85%" /><i style="width: 60%" /></div>
              <div class="wb-shot-main">
                <div class="wb-shot-cards">
                  <div class="wb-shot-card"><b>今日用电</b><span>12,480 kWh</span></div>
                  <div class="wb-shot-card"><b>同比</b><span>-6.2%</span></div>
                  <div class="wb-shot-card"><b>峰值负荷</b><span>1,204 kW</span></div>
                </div>
                <div class="wb-shot-chart">
                  <svg viewBox="0 0 200 60" preserveAspectRatio="none">
                    <polyline points="0,50 20,42 40,46 60,30 80,36 100,22 120,28 140,14 160,20 180,10 200,16" fill="none" stroke="#1f6feb" stroke-width="2" />
                    <polyline points="0,55 20,50 40,52 60,44 80,48 100,40 120,44 140,34 160,38 180,30 200,34" fill="none" stroke="#34c759" stroke-width="1.5" stroke-dasharray="3 2" />
                  </svg>
                </div>
                <div class="wb-shot-table"><i /><i /><i /><i /></div>
              </div>
            </div>
          </div>
          <button
            v-for="region in regions"
            :key="region.id"
            type="button"
            class="wb-region"
            :class="{ 'is-lowconf': region.support !== 'verified', 'is-hl': activeId === region.id }"
            :style="boxStyle(region)"
            :data-testid="`region-${region.no}`"
            :aria-label="`区域 ${region.no}：${region.name}，${supportLabel(region.support)}，匹配度 ${region.confidence}`"
            @mouseenter="activeId = region.id"
            @mouseleave="activeId = null"
            @focus="activeId = region.id"
            @blur="activeId = null"
            @click="activeId = region.id"
          >
            <span class="wb-region-no">{{ region.no }}</span>
          </button>
        </div>

        <div class="wb-mapping">
          <button
            v-for="region in regions"
            :key="region.id"
            type="button"
            class="wb-map-row"
            :class="{ 'is-hl': activeId === region.id }"
            :data-testid="`mapping-${region.no}`"
            @mouseenter="activeId = region.id"
            @mouseleave="activeId = null"
            @focus="activeId = region.id"
            @blur="activeId = null"
            @click="activeId = region.id"
          >
            <span class="wb-rno-s">{{ region.no }}</span>
            <span class="wb-m-name">{{ region.name }}</span>
            <span class="wb-m-ctrl">{{ region.control }}</span>
            <span class="wb-sup" :class="supportClass(region.support)">{{ supportLabel(region.support) }}</span>
            <span class="wb-conf">{{ region.confidence.toFixed(2) }}</span>
          </button>
          <div class="wb-map-note">
            <span aria-hidden="true">❓</span>
            <span>待确认：截图未体现趋势图与数据表的数据源。继续前请选择「演示数据」或「绑定真实变量」；未验证控件（XY 曲线）可选择保留并记录确认，或改用数据表替代。</span>
          </div>
        </div>
      </div>

      <div class="wb-done-actions">
        <button type="button" class="wb-btn is-primary" data-testid="visual-confirm-continue" @click="emit('confirm')">按当前理解继续</button>
        <button type="button" class="wb-btn is-secondary" data-testid="visual-confirm-revise" @click="emit('revise')">修改区域 / 绑定</button>
        <button type="button" class="wb-btn is-danger-ghost" data-testid="visual-confirm-cancel" @click="emit('cancel')">取消任务</button>
        <span class="wb-fine">低置信区域（4）需确认后才会进入方案生成</span>
      </div>
    </div>
  </section>
</template>
