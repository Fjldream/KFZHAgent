<script setup lang="ts">
import { computed } from "vue";
import type { ValidationReport as ValidationReportType } from "../types";

/**
 * 六层校验报告展示（brief Task 7）。fail 时显示错误详情。
 */
const props = defineProps<{
  report: ValidationReportType | null | undefined;
}>();

const summaryText = computed(() => props.report?.summary ?? "");

const detailsText = computed(() => {
  const details = props.report?.details;
  if (details === null || details === undefined) return "";
  const error = details["error"];
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
});
</script>

<template>
  <section v-if="report !== null && report !== undefined" class="panel report" data-testid="validation-report">
    <h2>校验报告</h2>
    <p v-if="report.outcome === 'pass'" class="pass" data-testid="report-outcome">
      校验通过{{ summaryText.length > 0 ? `：${summaryText}` : "" }}
    </p>
    <div v-else class="fail" data-testid="report-outcome">
      <p>校验未通过{{ summaryText.length > 0 ? `：${summaryText}` : "" }}</p>
      <pre v-if="detailsText.length > 0" class="details">{{ detailsText }}</pre>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 1rem;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}
.panel h2 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}
.pass {
  color: var(--color-success);
  margin: 0;
}
.fail {
  color: var(--color-danger);
  margin: 0;
}
.fail p {
  margin: 0;
}
.details {
  background: rgba(255, 59, 48, 0.08);
  border: 1px solid rgba(255, 59, 48, 0.25);
  border-radius: var(--radius-button);
  padding: 0.5rem;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
