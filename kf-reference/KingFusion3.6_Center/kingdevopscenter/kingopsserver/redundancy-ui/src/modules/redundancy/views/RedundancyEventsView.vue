<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Refresh } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { useRedundancyRuntime } from "../runtime";
import type { RedundancyEvent } from "../types/redundancy";
import { formatDateTime } from "../utils/format";
import RedundancyStatusTag from "../components/RedundancyStatusTag.vue";

const runtime = useRedundancyRuntime();
const router = useRouter();
const events = ref<RedundancyEvent[]>([]);
const status = ref("");
const query = ref("");
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const pagedEvents = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return events.value.slice(start, start + pageSize.value);
});

watch([status, query], () => {
  page.value = 1;
});

onMounted(() => {
  document.title = "冗余异常事件 — KingFusion3.6";
  void load();
});

async function load() {
  loading.value = true;
  try {
    events.value = await runtime.api.listEvents({
      status: status.value || undefined,
      q: query.value || undefined,
    });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "事件加载失败");
  } finally {
    loading.value = false;
  }
}

function submitOnEnter(event: KeyboardEvent) {
  if (!event.isComposing) void load();
}
</script>

<template>
  <main class="redundancy-module events-page">
    <header class="events-heading">
      <div>
        <el-button :icon="ArrowLeft" text @click="router.push('/redundancy')"
          >返回节点冗余管理</el-button
        >
        <h1>异常事件记录</h1>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="load"
        >刷新</el-button
      >
    </header>
    <section class="redundancy-panel events-panel">
      <div class="events-filter">
        <el-select
          v-model="status"
          clearable
          placeholder="全部状态"
          aria-label="事件状态"
          @change="load"
          ><el-option label="当前异常" value="OPEN" /><el-option
            label="已恢复"
            value="RECOVERED"
        /></el-select>
        <el-input
          v-model="query"
          clearable
          placeholder="搜索冗余名称或异常内容"
          aria-label="搜索异常事件"
          @keyup.enter="submitOnEnter"
          @clear="load"
        />
        <el-button type="primary" @click="load">查询</el-button>
      </div>
      <el-table
        v-loading="loading"
        :data="pagedEvents"
        row-key="eventId"
        height="calc(100vh - 250px)"
        empty-text="暂无异常事件"
      >
        <el-table-column label="状态" width="100"
          ><template #default="scope"
            ><RedundancyStatusTag
              :status="
                scope.row.status === 'OPEN' ? 'ABNORMAL' : 'NORMAL'
              " /></template
        ></el-table-column>
        <el-table-column
          prop="redundancyName"
          label="冗余名称"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column
          prop="summary"
          label="异常内容"
          min-width="320"
          show-overflow-tooltip
        />
        <el-table-column
          prop="reasonCode"
          label="原因码"
          min-width="210"
          show-overflow-tooltip
        />
        <el-table-column label="发生时间" width="180"
          ><template #default="scope">{{
            formatDateTime(scope.row.openedAt)
          }}</template></el-table-column
        >
        <el-table-column label="恢复时间" width="180"
          ><template #default="scope">{{
            formatDateTime(scope.row.recoveredAt)
          }}</template></el-table-column
        >
        <el-table-column label="确认人" width="120"
          ><template #default="scope">{{
            scope.row.acknowledgedBy || "—"
          }}</template></el-table-column
        >
      </el-table>
      <footer>
        <span>共 {{ events.length }} 条</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          background
          layout="sizes, prev, pager, next, jumper"
          :page-sizes="[20, 50, 100]"
          :total="events.length"
        />
      </footer>
    </section>
  </main>
</template>

<style scoped>
.events-page {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
}
.events-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}
.events-heading h1 {
  margin: 6px 0 0;
  font-size: 20px;
}
.events-panel {
  padding: 14px 16px 8px;
}
.events-filter {
  display: grid;
  grid-template-columns: 160px minmax(260px, 420px) auto;
  gap: 10px;
  margin-bottom: 14px;
}
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 2px 2px;
}
@media (max-width: 720px) {
  .events-filter {
    grid-template-columns: 1fr;
  }
  footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
