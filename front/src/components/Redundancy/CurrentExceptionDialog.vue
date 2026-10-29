<script setup>
// modified by jinlong.feng at 0901 冗余功能开发
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import CustomStyleTable from "@/components/CustomStyleTable/CustomStyleTable.vue";
import { redundancyAPI } from "@/api/redundancyAPI.js";
import { useRedundancyStore } from "@/stores/redundancyStore.js";
import {
  createCurrentExceptionQuery,
  formatDateTime,
  selectCurrentOpenEvents,
} from "@/utils/redundancyUtils.js";
import { showRedundancyMessage } from "@/utils/redundancyMessage.js";

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  configuration: {
    type: Object,
    default: null,
  },
});
const emit = defineEmits(["update:visible"]);
const { t, locale } = useI18n();
const store = useRedundancyStore();
const rows = ref([]);
const loading = ref(false);
const loadFailed = ref(false);
const acknowledgingId = ref("");
let requestSerial = 0;

/** 加载当前所选冗余配置的未恢复异常。 */
async function loadCurrentExceptions() {
  const redundancyId = props.configuration?.redundancyId;
  if (!redundancyId) {
    rows.value = [];
    loadFailed.value = false;
    return;
  }
  const currentRequest = ++requestSerial;
  loading.value = true;
  loadFailed.value = false;
  try {
    const result =
      (await redundancyAPI.events(createCurrentExceptionQuery(redundancyId))) ||
      [];
    if (currentRequest !== requestSerial) return;
    rows.value = selectCurrentOpenEvents(result, redundancyId);
  } catch {
    if (currentRequest !== requestSerial) return;
    rows.value = [];
    loadFailed.value = true;
  } finally {
    if (currentRequest === requestSerial) loading.value = false;
  }
}

/** 关闭当前异常弹窗。 */
function closeDialog() {
  emit("update:visible", false);
}

/** 确认未处理的异常，并静默同步弹窗与全局异常计数。 */
async function acknowledge(row) {
  acknowledgingId.value = row.eventId;
  try {
    await redundancyAPI.acknowledge(row.redundancyId, row.eventId);
    showRedundancyMessage("success", t("redundancy.messages.acknowledged"));
    await store.loadOpenEvents();
    rows.value = selectCurrentOpenEvents(
      store.openEvents,
      props.configuration?.redundancyId,
    );
  } finally {
    acknowledgingId.value = "";
  }
}

watch(
  () => [props.visible, props.configuration?.redundancyId],
  ([visible]) => {
    if (visible) {
      void loadCurrentExceptions();
      return;
    }
    requestSerial += 1;
    rows.value = [];
    loadFailed.value = false;
    loading.value = false;
  },
  { immediate: true },
);

watch(
  () => store.openEvents,
  (events) => {
    if (!props.visible || loading.value) return;
    rows.value = selectCurrentOpenEvents(
      events,
      props.configuration?.redundancyId,
    );
    loadFailed.value = false;
  },
);
// end
</script>

<!-- modified by jinlong.feng at 0901 冗余功能开发 -->
<template>
  <el-dialog
    :model-value="visible"
    :title="t('redundancy.exceptionEvents')"
    width="min(760px, calc(100vw - 32px))"
    append-to-body
    destroy-on-close
    align-center
    class="current-exception-dialog"
    @update:model-value="closeDialog"
  >
    <div v-loading="loading" class="exception-table-region">
      <div v-if="loadFailed" class="exception-load-error" role="alert">
        <span>{{ t("redundancy.loadCurrentExceptionsFailed") }}</span>
        <el-button link type="primary" @click="loadCurrentExceptions">
          {{ t("redundancy.retryLoad") }}
        </el-button>
      </div>

      <CustomStyleTable
        :key="rows.length"
        v-else-if="rows.length"
        :table-data="rows"
        row-key="eventId"
        :page-sizes="[10]"
        :show-highlight="false"
        max-height="100%"
        class="current-exception-table"
        table-class="redundancy-centered-table"
      >
        <el-table-column type="index" :label="t('index')" width="70" />
        <el-table-column
          prop="summary"
          :label="t('redundancy.exceptionContent')"
          min-width="300"
        >
          <template #default="{ row }">
            <span class="exception-summary">{{ row.summary }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('redundancy.occurredAt')" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.openedAt, locale) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('operation')" width="100">
          <template #default="{ row }">
            <span v-if="row.acknowledgedAt" class="acknowledged-text">
              {{ t("redundancy.acknowledged") }}
            </span>
            <el-button
              v-else
              link
              type="primary"
              :loading="acknowledgingId === row.eventId"
              :disabled="Boolean(acknowledgingId)"
              @click.stop="acknowledge(row)"
            >
              {{ t("redundancy.acknowledge") }}
            </el-button>
          </template>
        </el-table-column>
      </CustomStyleTable>

      <el-empty
        v-else-if="!loading"
        :image-size="64"
        :description="t('redundancy.noCurrentExceptions')"
      />
    </div>
  </el-dialog>
</template>
<!-- end -->

<style scoped lang="scss">
/* modified by jinlong.feng at 0901 冗余功能开发 */
.exception-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 0 16px;
  border: 1px solid #f3c7c7;
  border-radius: 8px;
  background: #fff6f6;
  color: #c94545;
}

.exception-table-region {
  height: 520px;

  :deep(.el-empty) {
    height: 100%;
  }
}

.current-exception-table {
  :deep(.table-container) {
    padding: 0;
    border-radius: 8px;
  }

  :deep(.custom-row) {
    height: 40px;
  }

  :deep(.custom-row .el-table__cell) {
    padding: 0;
  }

  :deep(.el-table .cell) {
    line-height: 20px;
  }
}

.exception-summary {
  display: block;
  padding: 8px 0;
  white-space: normal;
  overflow-wrap: anywhere;
}

.acknowledged-text {
  color: #8b95a7;
}

:global(.current-exception-dialog) {
  border-radius: 10px;
}

:global(.current-exception-dialog .el-dialog__header) {
  margin-right: 0;
  padding-bottom: 14px;
  border-bottom: 1px solid #e8edf5;
}

:global(.current-exception-dialog .el-dialog__body) {
  padding-top: 16px;
}
/* end */
</style>
