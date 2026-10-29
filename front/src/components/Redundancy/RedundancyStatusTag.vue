<script setup>
// modified by jinlong.feng at 0901 冗余功能开发
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { getRedundancyStatusTagType } from "@/utils/redundancyUtils.js";

const props = defineProps({
  value: { type: String, default: "" },
  kind: { type: String, default: "health" },
});
const { t } = useI18n();
const type = computed(() => getRedundancyStatusTagType(props.value));
const label = computed(() => t(`redundancy.enums.${props.value || "UNKNOWN"}`));
// end
</script>

<!-- modified by jinlong.feng at 0901 冗余功能开发 -->
<template>
  <el-tag class="redundancy-status-tag" :type="type" effect="light" round>{{
    label
  }}</el-tag>
</template>
<!-- end -->

<style scoped>
/* modified by jinlong.feng at 0901 冗余功能开发 */
.redundancy-status-tag {
  max-width: none;
  white-space: nowrap;
}
/* end */
</style>
