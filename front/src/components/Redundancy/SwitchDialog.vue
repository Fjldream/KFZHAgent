<script setup>
// modified by jinlong.feng at 0907 修复离线激活节点强制切换确认
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  createSwitchRequest,
  getSwitchNodeContext,
  isNodeOnline,
} from "@/utils/redundancyUtils.js";
import { showRedundancyMessage } from "@/utils/redundancyMessage.js";

const props = defineProps({
  configuration: { type: Object, default: null },
});
const visible = defineModel("visible", { type: Boolean, default: false });
const emit = defineEmits(["confirm"]);
const { t } = useI18n();
const riskAcknowledged = ref(false);
const switchContext = computed(() =>
  getSwitchNodeContext(props.configuration),
);
const source = computed(() => switchContext.value.source);
const target = computed(() => switchContext.value.target);
const sourceOffline = computed(
  () => Boolean(source.value) && !isNodeOnline(source.value),
);

watch(visible, (open) => {
  if (!open) return;
  riskAcknowledged.value = false;
});

/** 校验风险确认并提交普通或强制切换参数。 */
function submit() {
  try {
    const request = createSwitchRequest(props.configuration, {
      riskAcknowledged: riskAcknowledged.value,
    });
    visible.value = false;
    emit("confirm", request);
  } catch (error) {
    const messageKey =
      error?.code === "REDUNDANCY_FORCE_CONFIRMATION_REQUIRED"
        ? "redundancy.validation.forceConfirmation"
        : "redundancy.validation.switchNode";
    showRedundancyMessage("warning", t(messageKey));
  }
}
// end
</script>

<!-- modified by jinlong.feng at 0907 修复离线激活节点强制切换确认 -->
<template>
  <el-dialog
    v-model="visible"
    :title="t('redundancy.switchDialogTitle')"
    width="min(640px, calc(100vw - 32px))"
    class="redundancy-switch-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="switch-route">
      <article>
        <small>{{ t("redundancy.currentActive") }}</small>
        <strong>{{ source?.nodeName || source?.nodeId || "—" }}</strong>
        <span>{{ source?.nodeIp || source?.address || "—" }}</span>
        <el-tag
          size="small"
          :type="sourceOffline ? 'danger' : 'success'"
          round
        >
          {{ t(sourceOffline ? "offline" : "online") }}
        </el-tag>
      </article>
      <div class="switch-route__arrow" aria-hidden="true">→</div>
      <article>
        <small>{{ t("redundancy.targetActive") }}</small>
        <strong>{{ target?.nodeName || target?.nodeId || "—" }}</strong>
        <span>{{ target?.nodeIp || target?.address || "—" }}</span>
        <el-tag
          size="small"
          :type="isNodeOnline(target) ? 'success' : 'danger'"
          round
        >
          {{ t(isNodeOnline(target) ? "online" : "offline") }}
        </el-tag>
      </article>
    </div>

    <el-alert
      :title="
        t(
          sourceOffline
            ? 'redundancy.sourceNodeOfflineRisk'
            : 'redundancy.normalSwitchDescription',
        )
      "
      :type="sourceOffline ? 'error' : 'warning'"
      show-icon
      :closable="false"
    />

    <div v-if="sourceOffline" class="force-fields">
      <el-checkbox v-model="riskAcknowledged">
        {{ t("redundancy.acknowledgeDualActiveRisk") }}
      </el-checkbox>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t("cancel") }}</el-button>
      <el-button
        :type="sourceOffline ? 'danger' : 'primary'"
        :disabled="sourceOffline && !riskAcknowledged"
        @click="submit"
      >
        {{
          t(
            sourceOffline
              ? "redundancy.forceSwitch"
              : "redundancy.confirmSwitchAction",
          )
        }}
      </el-button>
    </template>
  </el-dialog>
</template>
<!-- end -->

<style scoped lang="scss">
/* modified by jinlong.feng at 0907 修复离线激活节点强制切换确认 */
.switch-route {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52px minmax(0, 1fr);
  align-items: center;
  margin-bottom: 18px;
  article {
    position: relative;
    display: grid;
    gap: 5px;
    min-width: 0;
    padding: 14px 16px;
    border: 1px solid #dfe5f0;
    border-radius: 8px;
    background: #f8faff;
    small,
    span {
      overflow: hidden;
      color: #7a8496;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    strong {
      overflow: hidden;
      color: #30384b;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .el-tag {
      position: absolute;
      top: 12px;
      right: 12px;
    }
  }
}
.switch-route__arrow {
  color: #4169df;
  font-size: 24px;
  text-align: center;
}
.force-fields {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
@media (max-width: 560px) {
  .switch-route {
    grid-template-columns: 1fr;
  }
  .switch-route__arrow {
    transform: rotate(90deg);
  }
}
/* end */
</style>
