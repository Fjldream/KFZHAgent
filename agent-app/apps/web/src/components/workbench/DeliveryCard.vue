<script setup lang="ts">
// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 交付卡：按证据等级展示验证结果。未执行 runtime 验证时显示「未验证」而不是「通过」。
// end
import type { DeliveryBadge, DeliverySummary } from "./workbench-types";

defineProps<{
  delivery: DeliverySummary;
}>();

const emit = defineEmits<{
  (e: "download"): void;
  (e: "continue"): void;
  (e: "fork"): void;
}>();

function badgeClass(level: DeliveryBadge["level"]): string {
  return `is-${level}`;
}

function badgeIcon(level: DeliveryBadge["level"]): string {
  if (level === "pass") return "✓";
  if (level === "warning") return "!";
  return "–";
}
</script>

<template>
  <section class="wb-card" data-testid="delivery-card" aria-label="已交付">
    <div class="wb-card-head">
      <span aria-hidden="true">✓</span>
      <b>已交付</b>
      <span class="wb-head-hint">{{ delivery.revision }} · {{ delivery.artifact }}</span>
    </div>
    <div class="wb-card-body">
      <div class="wb-verify-row">
        <span
          v-for="badge in delivery.badges"
          :key="badge.label"
          class="wb-vbadge"
          :class="badgeClass(badge.level)"
        >
          <span aria-hidden="true">{{ badgeIcon(badge.level) }}</span>{{ badge.label }}
        </span>
      </div>
      <p class="wb-fine" style="margin: 0; line-height: 1.55">{{ delivery.note }}</p>
      <div class="wb-done-actions">
        <button type="button" class="wb-btn is-primary" data-testid="delivery-download" @click="emit('download')">⬇ 下载工程包</button>
        <button type="button" class="wb-btn is-secondary" data-testid="delivery-continue" @click="emit('continue')">继续修改</button>
        <button type="button" class="wb-btn is-secondary" data-testid="delivery-fork" @click="emit('fork')">从此版本新建对话</button>
      </div>
    </div>
  </section>
</template>
