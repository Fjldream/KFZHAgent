<script setup>
// modified by jinlong.feng at 0901 冗余功能开发
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import CustomStyleTable from "@/components/CustomStyleTable/CustomStyleTable.vue";
import { redundancyAPI } from "@/api/redundancyAPI.js";
import { formatDateTime } from "@/utils/redundancyUtils.js";
import { showRedundancyMessage } from "@/utils/redundancyMessage.js";
import RedundancyStatusTag from "@/components/Redundancy/RedundancyStatusTag.vue";
import "@/styles/redundancy-tables.scss";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const rows = ref([]);
const loading = ref(false);
const status = ref("");
const keyword = ref("");
const appliedStatus = ref("");
const appliedKeyword = ref("");
const tableKey = ref(0);
const filtered = computed(() =>
  rows.value.filter(
    (row) =>
      (!appliedStatus.value || row.status === appliedStatus.value) &&
      (!appliedKeyword.value ||
        [row.redundancyName, row.summary, row.reasonCode].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(appliedKeyword.value.toLowerCase()),
        )),
  ),
);

/** 根据筛选条件加载冗余异常事件。 */
async function load() {
  loading.value = true;
  try {
    rows.value =
      (await redundancyAPI.events({
        redundancyId: route.query.redundancyId || undefined,
      })) || [];
  } finally {
    loading.value = false;
  }
}
/** 确认当前事件并刷新列表。 */
async function acknowledge(row) {
  await redundancyAPI.acknowledge(row.redundancyId, row.eventId);
  showRedundancyMessage("success", t("redundancy.messages.acknowledged"));
  await load();
}
/** 提交筛选条件、刷新事件数据并将分页恢复到第一页。 */
async function handleSearch() {
  appliedStatus.value = status.value;
  appliedKeyword.value = keyword.value.trim();
  tableKey.value += 1;
  await load();
}
/** 避免中文、日文和韩文输入法确认候选词时误触发搜索。 */
function handleKeywordEnter(event) {
  if (event.isComposing) return;
  handleSearch();
}
onMounted(handleSearch);
// end
</script>

<!-- modified by jinlong.feng at 0901 冗余功能开发 -->
<template>
  <main class="events-page">
    <el-button
      class="back-button"
      link
      @click="router.push({ name: 'redundancy' })"
    >
      <IEpArrowLeft />
      {{ t("redundancy.backToManagement") }}
    </el-button>
    <header>
      <h2>{{ t("redundancy.eventRecords") }}</h2>
    </header>
    <section class="events-card">
      <div class="filters" role="search">
        <el-select
          v-model="status"
          class="status-filter"
          clearable
          :placeholder="t('redundancy.allStatuses')"
          ><el-option
            :label="t('redundancy.enums.OPEN')"
            value="OPEN" /><el-option
            :label="t('redundancy.enums.RECOVERED')"
            value="RECOVERED" /></el-select
        ><el-input
          v-model="keyword"
          class="keyword-filter"
          clearable
          :placeholder="t('redundancy.searchEvents')"
          @keyup.enter="handleKeywordEnter"
          ><template #prefix><IEpSearch /></template></el-input
        ><el-button
          class="search-button"
          type="primary"
          :loading="loading"
          @click="handleSearch"
          ><IEpSearch />{{ t("query") }}</el-button
        >
      </div>
      <CustomStyleTable
        :key="tableKey"
        :table-data="filtered"
        row-key="eventId"
        :page-sizes="[15, 30, 50, 100]"
        max-height="calc(100% - 44px)"
        table-class="redundancy-centered-table"
      >
        <el-table-column
          class-name="event-status-column"
          :label="t('status')"
          width="120"
          ><template #default="{ row }"
            ><RedundancyStatusTag
              :value="row.status" /></template></el-table-column
        ><el-table-column
          prop="redundancyName"
          :label="t('redundancy.configurationName')"
          min-width="150"
        /><el-table-column
          prop="summary"
          :label="t('redundancy.exceptionContent')"
          min-width="260"
          show-overflow-tooltip
        /><!-- modified by jinlong.feng at 2026-10-09 冗余事件列与通知时长调整 按需求移除「原因码」列 -->
        <el-table-column :label="t('redundancy.occurredAt')" min-width="170"
          ><template #default="{ row }">{{
            formatDateTime(row.openedAt, locale)
          }}</template></el-table-column
        ><el-table-column :label="t('redundancy.recoveredAt')" min-width="170"
          ><template #default="{ row }">{{
            formatDateTime(row.recoveredAt, locale)
          }}</template></el-table-column
        ><el-table-column :label="t('redundancy.acknowledgedBy')" width="130"
          ><template #default="{ row }">{{
            row.acknowledgedBy || "—"
          }}</template></el-table-column
        ><el-table-column :label="t('operation')" width="100"
          ><template #default="{ row }"
            ><el-button
              v-if="row.status === 'OPEN' && !row.acknowledgedAt"
              link
              type="primary"
              @click.stop="acknowledge(row)"
              >{{ t("redundancy.acknowledge") }}</el-button
            ></template
          ></el-table-column
        >
      </CustomStyleTable>
    </section>
  </main>
</template>
<!-- end -->

<style scoped lang="scss">
/* modified by jinlong.feng at 0901 冗余功能开发 */
.events-page {
  height: 100%;
  min-height: 0;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f4f6fb;
  color: #283044;
  .back-button {
    align-self: flex-start;
    flex: 0 0 38px;
    min-height: 38px;
    padding: 0 4px;
    font-size: 14px;
    :deep(.el-icon) {
      width: 20px;
      height: 20px;
      font-size: 20px;
    }
  }
  header {
    flex: 0 0 40px;
    display: flex;
    align-items: center;
    h2 {
      margin: 0;
      font-size: 20px;
    }
  }
  .events-card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 16px;
    box-sizing: border-box;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 18px rgb(48 70 120 / 5%);
  }
  .filters {
    flex: 0 0 32px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    .status-filter {
      width: 150px;
    }
    .keyword-filter {
      width: 280px;
    }
    .search-button {
      width: 80px;
      margin-left: 0;
    }
  }
  :deep(.event-status-column .cell) {
    overflow: visible;
    white-space: nowrap;
  }
  :deep(.table-container) {
    flex: 1;
    min-height: 0;
    padding: 0;
    border-radius: 0;
  }
}
/* end */
</style>
