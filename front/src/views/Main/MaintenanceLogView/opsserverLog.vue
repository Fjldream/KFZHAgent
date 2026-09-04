<script setup>
import { useI18n } from 'vue-i18n';
import { Search } from '@element-plus/icons-vue';
import { formatTime, getStartAndEndTime, currentDateTime } from '@/utils/dayjsUtil';
import { handleMaintenanceLogServer } from '@/api/allRequest/logAPI';
import CustomStyleTable from '@/components/CustomStyleTable/CustomStyleTable.vue';
import CustomIcon from '@/components/Icons/CustomIcon.vue';

const { t } = useI18n();

// 查询条件
const searchFormData = ref({
  dateRange: getStartAndEndTime(),
  contentSearch: '',
  logLevel: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly', 'fatal', 'trace'],
});
// 表格ref
const tableRef = ref('');
// 当前页码
const currentPage = ref(1);
const sizePage = ref(15);
// 总条数
const totalDataNum = ref(0);
const changeLogType = { system: t('systemLog'), script: t('scriptLog') };
// 表格数据
const tableInfoData = ref([]);
const infoTableColumns = computed(() => {
  return [
    {
      label: t('date'),
      props: 'time',
      minWidth: '15%',
    },
    {
      label: t('logLevel'),
      props: 'logLevel',
    },
    {
      label: t('logType'),
      props: 'logType',
    },
    {
      label: t('operator'),
      props: 'operator',
    },
    {
      label: t('operatorIP'),
      props: 'operatorIP',
    },
    {
      label: t('context'),
      props: 'context',
      minWidth: '40%',
    },
  ];
});
// 日志等级下拉框
const logLevelOptions = [
  { label: 'error', value: 'error' },
  { label: 'warn', value: 'warn' },
  { label: 'info', value: 'info' },
  { label: 'http', value: 'http' },
  { label: 'verbose', value: 'verbose' },
  { label: 'debug', value: 'debug' },
  { label: 'silly', value: 'silly' },
  { label: 'fatal', value: 'fatal' },
  { label: 'trace', value: 'trace' },
];

// 日志级别与颜色的映射表
const logLevelColourMap = {
  INFO: 'log-info',
  WARN: 'log-warn',
  ERROR: 'log-error',
  VERBOSE: 'log-verbose',
  DEBUG: 'log-debug',
  SILLY: 'log-silly',
  FATAL: 'log-error',
  TRACE: 'log-debug',
};

nextTick(async () => {
  await handleSearchLog(true);
});
/**
 * @function handleCurrentChange
 * @description 改变页码
 * @param {*} val
 * @returns null
 */
async function handleCurrentChange(val) {
  const isChange = currentPage.value !== val;
  currentPage.value = val;
  if (isChange || val !== 1) {
    await handleSearchLog();
  }
}
/**
 * @function handleSizeChange
 * @description 页面显示条数改变
 * @param {*} val
 * @returns null
 */
async function handleSizeChange(val) {
  sizePage.value = val;
  await handleSearchLog(true);
}

/**
 * @function handleSearchLog
 * @description 查询函数，第一次查询，页码切换至第一页
 * @param {*} isFirst
 * @returns null
 */
async function handleSearchLog(isFirst = false) {
  if (isFirst) {
    tableRef.value.handleCurrentPage(1);
  }
  const tableName = 'kingopsserver';
  if (!searchFormData.value.dateRange[0] || !searchFormData.value.dateRange[1]) return;
  const searchData = {
    dbName: 'logs_center',
    tableName: tableName,
    startTime: formatTime(searchFormData.value.dateRange[0]),
    endTime: formatTime(searchFormData.value.dateRange[1]),
    searchContext: searchFormData.value.contentSearch,
    pagingCondition: {
      limit: sizePage.value,
      offset: currentPage.value - 1,
    },
    filterCondition: {
      level: searchFormData.value.logLevel,
    },
  };
  const result = await handleMaintenanceLogServer(searchData);
  tableInfoData.value = [];
  totalDataNum.value = 0;
  if (result.code === 0) {
    const { data } = result;
    if (data[0]?.count) {
      totalDataNum.value = data[0].count;
    }
    tableInfoData.value = data.map((row) => {
      return {
        time: row.timestamp,
        logLevel: row.level.toUpperCase(),
        logType: changeLogType[row.type],
        operator: row.user,
        operatorIP: row.ip,
        context: row.context,
      };
    });
  }
}
</script>

<template>
  <div class="log-coantainer">
    <header>
      <CustomIcon name="maintenanceLog" class="mr-10" />
      <span>{{ t('title.maintenanceLog') }}</span>
    </header>
    <div class="btn-list-con">
      <el-form>
        <el-form-item :label="t('dateRange')">
          <el-date-picker
            v-model="searchFormData.dateRange"
            value-format="YYYY-MM-DD HH:mm:ss"
            type="datetimerange"
            :default-time="currentDateTime()"
          />
        </el-form-item>
        <el-form-item :label="t('logLevel')" class="log-level">
          <el-select
            v-model="searchFormData.logLevel"
            multiple
            collapse-tags
            collapse-tags-tooltip
            :placeholder="t('plsSetlect')"
          >
            <el-option
              v-for="item in logLevelOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="searchFormData.contentSearch"
            :placeholder="t('searchKeywork')"
            :suffix-icon="Search"
            style="width: 260px"
            clearable
            size="default"
          />
        </el-form-item>
        <el-button class="custom-button" type="primary" @click="handleSearchLog(true)">
          <el-icon class="mr-6">
            <IEpSearch />
          </el-icon>
          {{ t('query') }}
        </el-button>
      </el-form>
    </div>
    <CustomStyleTable
      ref="tableRef"
      :tableData="tableInfoData"
      maxHeight="calc(50vh - 150px)"
      :totalNum="totalDataNum"
      :paginateValid="false"
      :pageSizes="[15, 30, 50, 100, 200]"
      @currentChange="handleCurrentChange"
      @sizeChange="handleSizeChange"
    >
      <el-table-column type="index" :label="t('index')" align="center" width="55" />
      <el-table-column
        v-for="(row, index) of infoTableColumns"
        :key="index"
        :label="row.label"
        :min-width="row.minWidth ? row.minWidth : '10%'"
        :prop="row.props"
        align="center"
        show-overflow-tooltip
      >
        <template v-if="row.props === 'logLevel'" #default="{ row }">
          <span :class="logLevelColourMap[row.logLevel]">{{ row.logLevel }}</span>
        </template>
      </el-table-column>
    </CustomStyleTable>
  </div>
</template>

<style lang="scss" scoped>
.log-coantainer {
  width: 100%;
  height: 100%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  header {
    display: flex;
    align-items: center;
    span {
      color: #1f2937;
      font-size: 18px;
      padding-right: 8px;
      font-weight: 700;
    }
    margin-bottom: 24px;
  }
  .btn-list-con {
    width: 100%;
    height: 30px;
    margin-bottom: 20px;
    .el-form {
      display: flex;
      flex-direction: row;
    }
    .el-form-item {
      margin-right: 40px;
      max-height: 30px;
    }
    .log-level {
      :deep(.el-form-item__content) {
        min-width: 160px;
      }
    }
    :deep(.el-form-item__label) {
      line-height: 30px;
      max-height: 30px;
      color: #1f2937;
    }
    :deep(.el-form-item__content) {
      min-width: 120px;
    }
    :deep(.el-range-editor.el-input__wrapper) {
      max-height: 30px;
      border-radius: 4px;
    }
    :deep(.el-select__wrapper) {
      border-radius: 4px;
      min-height: 30px;
    }
    :deep(.el-input__wrapper) {
      border-radius: 4px;
      max-height: 30px;
    }
    .custom-button {
      width: 68px;
      height: 30px;
      border-radius: 4px;
    }
  }
  .table-container {
    flex: 1;
  }
}
.context-con {
  height: 400px;
  color: #1f2937;
  word-break: break-all;
  overflow-y: auto;
}

.log-info {
  color: green;
}
.log-warn {
  color: #faad14;
}
.log-error {
  color: red;
}
.log-verbose {
  color: blue;
}
.log-debug {
  color: cyan;
}
.log-silly {
  color: grey;
}
</style>
