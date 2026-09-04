<script setup>
import { useI18n } from 'vue-i18n';
import { Search } from '@element-plus/icons-vue';

import { useMainLeftMenus } from '@/stores/mainLeftMenusStore.js';
import { formatTime, getStartAndEndTime, currentDateTime } from '@/utils/dayjsUtil.js';
import { handleMaintenanceLog } from '@/api/allRequest/nginxAPI.js';

import CustomStyleTable from '@/components/CustomStyleTable/CustomStyleTable.vue';
import CustomIcon from '@/components/Icons/CustomIcon.vue';
import CustomDialog from '@/components/CustomDialog/CustomDialog.vue';

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
const { t } = useI18n();
const mainLeftMenusStore = useMainLeftMenus();
const nodeOnlineStatus = ref('offline');
// 选择的库名
const dbName = ref('');
// 表格ref
const tableRef = ref('');
// 当前页码
const currentPage = ref(1);
const sizePage = ref(15);
// 总条数
const totalDataNum = ref(1);
// 过滤条件
const searchFormData = ref({
  dateRange: getStartAndEndTime(),
  logType: 'node',
  logSubType: ['system', 'script'],
  contentSearch: '',
  appName: '',
  logLevel: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly', 'fatal', 'trace'],
});
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

// 日志类型
const logTypeSelectOptions = computed(() => {
  return [
    { label: t('nodeLog'), value: 'node' },
    { label: t('appLog'), value: 'app' },
  ];
});
const projectType = ref(0);
// 日志子类型下拉框
const selectOptions = computed(() => {
  if (projectType.value === 0) {
    return [
      { label: t('systemLog'), value: 'system' },
      { label: t('scriptLog'), value: 'script' },
    ];
  }
  return [{ label: t('systemLog'), value: 'system' }];
});
// 选择APP下拉框
const appSelectOptions = ref([]);
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
const contextDialogVisible = ref(false);
const viewContext = ref('');
nextTick(async () => {
  await initPageData();
});
watch(
  () => mainLeftMenusStore.leftRowSelect,
  async (newValue, oldValue) => {
    if (newValue.path !== 'maintenanceLog') {
      return;
    }
    if (newValue.address === oldValue.address) {
      return;
    }
    searchFormData.value = {
      dateRange: getStartAndEndTime(),
      logType: 'node',
      logSubType: ['system', 'script'],
      contentSearch: '',
      appName: '',
    };
    await initPageData();
  },
);

/**
 * @function initPageData
 * @description 初始化页面数据，下拉框数据
 * @returns null
 */
async function initPageData() {
  const { address, port, nodeStatus } = mainLeftMenusStore.leftRowSelect;
  nodeOnlineStatus.value = nodeStatus;
  if (nodeOnlineStatus.value === 'running') {
    const result = await handleMaintenanceLog(address, port, 'dbList', {});
    if (result.code === 0) {
      dbName.value = result.data.nodeLogDbName;
      const res = await handleMaintenanceLog(address, port, 'tableList', {});
      if (res.code === 0) {
        appSelectOptions.value = res.data[dbName.value]
          .filter((item) => item.tableName !== 'kingopsproxy')
          .map((item) => {
            return { label: item.tableName, value: item.tableName, projectType: item.projectType };
          });
        handleSearchLog(true);
      } else {
        ElMessage.warning(t('getAppListError'));
      }
    } else {
      ElMessage.warning(t('getNodeDBError'));
    }
  } else {
    ElMessage.warning(t('nodeOffLine'));
  }
}
/**
 * @function handleSearchLog
 * @description 查询函数，第一次查询，页码切换至第一页
 * @param {*} isFirst
 * @returns null
 */
async function handleSearchLog(isFirst = false) {
  if (isFirst) tableRef.value.handleCurrentPage(1);
  const { appName } = searchFormData.value;
  const { logType } = searchFormData.value;
  const tableName = logType === 'node' ? 'kingopsproxy' : appName;
  if (!tableName) {
    ElMessage.warning(t('appIsNull'));
    tableInfoData.value = [];
    return;
  }
  if (!searchFormData.value.dateRange[0] || !searchFormData.value.dateRange[1]) return;
  const searchData = {
    dbName: dbName.value,
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
      type: searchFormData.value.logSubType,
    },
  };
  if (searchFormData.value.logSubType.length > 0) {
    searchData.filterCondition.type = searchFormData.value.logSubType;
  }
  const { address, port } = mainLeftMenusStore.leftRowSelect;
  const result = await handleMaintenanceLog(address, port, 'conditionQuery', searchData);
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
 * @function hanldeViewContext
 * @description 查看页面内容
 * @param {*} val
 * @returns null
 */
function hanldeViewContext(val) {
  if (val.context.length > 48) {
    viewContext.value = val.context;
    contextDialogVisible.value = true;
  }
}
function handleDialogVisible(val) {
  contextDialogVisible.value = val;
}

function handleAppSelectOptionsChange(val) {
  const select = appSelectOptions.value;
  for (let index = 0; index < select.length; index++) {
    const element = select[index];
    if (element.value === val) {
      projectType.value = element.projectType;
      break;
    }
  }
  if (projectType.value === 0) {
    searchFormData.value.logSubType = ['system', 'script'];
  } else {
    searchFormData.value.logSubType = ['system'];
  }
}
</script>

<template>
  <div class="log-coantainer">
    <header>
      <CustomIcon name="maintenanceLog" class="mr-10" />
      <span>{{ t('title.maintenanceLog') }}</span>
    </header>
    <el-form class="btn-list-con">
      <div class="search-list">
        <el-form-item :label="t('logType')">
          <template #label>
            <el-tooltip :content="t('logType')" placement="top">
              <span>{{ t('logType') }}</span>
            </el-tooltip>
          </template>
          <el-select v-model="searchFormData.logType" placeholder="select">
            <el-option
              v-for="item in logTypeSelectOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('appSelect')" v-show="searchFormData.logType === 'app'" :label-width="80">
          <template #label>
            <el-tooltip :content="t('appSelect')" placement="top">
              <span>{{ t('appSelect') }}</span>
            </el-tooltip>
          </template>
          <el-select
            v-model="searchFormData.appName"
            :placeholder="t('selectApp')"
            @change="handleAppSelectOptionsChange"
          >
            <el-option
              v-for="item in appSelectOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('logSubType')" v-show="searchFormData.logType === 'app'" :label-width="60">
          <template #label>
            <el-tooltip :content="t('logSubType')" placement="top">
              <span>{{ t('logSubType') }}</span>
            </el-tooltip>
          </template>
          <el-select
            v-model="searchFormData.logSubType"
            :multiple="true"
            placeholder=""
            collapse-tags
            :max-collapse-tags="1"
            style="min-width: 180px"
          >
            <el-option
              v-for="item in selectOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item
          :label="t('logLevel')"
          class="log-level"
          :label-width="searchFormData.logType === 'app' ? 60 : ''"
        >
          <template #label>
            <el-tooltip :content="t('logLevel')" placement="top">
              <span>{{ t('logLevel') }}</span>
            </el-tooltip>
          </template>
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
        <el-form-item :label="t('dateRange')" :label-width="searchFormData.logType === 'app' ? 60 : ''">
          <template #label>
            <el-tooltip :content="t('dateRange')" placement="top">
              <span>{{ t('dateRange') }}</span>
            </el-tooltip>
          </template>
          <el-date-picker
            v-model="searchFormData.dateRange"
            value-format="YYYY-MM-DD HH:mm:ss"
            type="datetimerange"
            :default-time="currentDateTime()"
          />
        </el-form-item>
      </div>
      <div class="search-box">
        <el-input
          v-model="searchFormData.contentSearch"
          :placeholder="t('searchKeywork')"
          :suffix-icon="Search"
          style="width: 200px; margin-right: 15px"
          clearable
          size="default"
        />
        <el-button
          class="custom-button"
          type="primary"
          :disabled="nodeOnlineStatus !== 'running'"
          @click="handleSearchLog(true)"
        >
          <el-icon class="mr-6">
            <IEpSearch />
          </el-icon>
          {{ t('query') }}
        </el-button>
      </div>
    </el-form>
    <CustomStyleTable
      ref="tableRef"
      :tableData="tableInfoData"
      rowKey="appName"
      :mergeFields="['proxyPath']"
      maxHeight="calc(50vh - 150px)"
      :totalNum="totalDataNum"
      :paginateValid="false"
      :pageSizes="[15, 30, 50, 100, 200]"
      @currentChange="handleCurrentChange"
      @sizeChange="handleSizeChange"
    >
      <el-table-column type="index" :label="t('index')" align="center" width="55" />
      <el-table-column
        v-for="row of infoTableColumns"
        :label="row.label"
        :min-width="row.minWidth ? row.minWidth : '10%'"
        :prop="row.props"
        align="center"
        show-overflow-tooltip
      >
        <template v-if="row.props === 'context'" #default="{ row }">
          <span @click="hanldeViewContext(row)" style="cursor: pointer">{{ row.context }}</span>
        </template>

        <template v-if="row.props === 'logLevel'" #default="{ row }">
          <span :class="logLevelColourMap[row.logLevel]">{{ row.logLevel }}</span>
        </template>
      </el-table-column>
    </CustomStyleTable>
    <CustomDialog
      :dialog-visible="contextDialogVisible"
      :title="t('logContextView')"
      @update:dialogVisible="handleDialogVisible"
      :width="500"
    >
      <div class="context-con">
        <span>{{ viewContext }}</span>
      </div>
    </CustomDialog>
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
    margin-bottom: 20px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    .search-list {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      .el-form-item {
        margin-right: 8px;
        max-height: 30px;
      }
      .log-level {
        :deep(.el-form-item__content) {
          min-width: 160px;
        }
      }
    }
    :deep(.el-form-item__label) {
      line-height: 30px;
      max-height: 30px;
      color: #1f2937;
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
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
    .search-box {
      display: flex;
      min-width: 190px;
      margin-top: 8px;
      height: 30px;
      @media screen and (min-width: 768px) {
        margin-top: 0;
      }
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
::v-deep(.el-form-item_label) {
  display: block;
  margin-left: 8px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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
