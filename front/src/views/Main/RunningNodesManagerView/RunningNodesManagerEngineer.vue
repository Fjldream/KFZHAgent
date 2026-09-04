<script setup>
import { useI18n } from 'vue-i18n';
import { QuestionFilled, Search, DataAnalysis } from '@element-plus/icons-vue';
import { useRunningNodesManagerList } from '@/composables/runningNodesManagerMng/useRunningNodesManagerEngineer';
import nodeOnline from '@/assets/image/nodeOnline.gif';
import { useOpsResourceStore } from '@/stores/opsResourceStore.js';
import nodeOffline from '@/assets/image/nodeOffline.gif';
import { formatRunTime } from '@/utils/dayjsUtil';
import CustomStyleTable from '@/components/CustomStyleTable/CustomStyleTable.vue';
import CustomCard from '@/components/CustomCard/CustomCard.vue';
import LineChart from '@/components/CustomEcharts/LineChart.vue';
import Loading from '@/components/Loading/LoadingComponent.vue';
import CustomIcon from '@/components/Icons/CustomIcon.vue';
import AppOverviewDialog from '@/views/Main/RunningNodesManagerView/RunningNodesManagerDialogView/AppOverviewDialog.vue';
const { t } = useI18n();
const opsResourceStore = useOpsResourceStore();
const {
  deployMode,
  tableColumns,
  dialogVisible,
  dialogType,
  isLoading,
  loadingText,
  activeDialogComponent,
  searchKeyword,
  editRowData,
  rowInfoData,
  selectedCollect,
  enabled,
  isOpen,
  tableRef,
  currentRunningNodeEngineer,
  tableData,
  deployStatus,
  appStatus,
  selectStatus,
  startStopSelectStatus,
  projectIdStatus,
  realDataMonitor,
  appOverviewDialog,
  handleToggle,
  overview,
  openDialog,
  handleSelectionChange,
  handleConfirm,
  deleteList,
  // startApp,
  startMultiApp,
  // stopApp,
  stopMultiApp,
  // restartApp,
  restartMultiApp,
  deployProject,
  reDeployProject,
  RevokeDeployProject,
  handleClick,
  formatRunningTime,
  handleMonitorCollectProject,
  handleCloseCollectMonitor,
  handleSyncNodeInfo,
  handleSelectable,
  handleTableRowClassName,
  handleTableRowClick,
  handleSelectAll,
} = useRunningNodesManagerList({ t, opsResourceStore });
</script>
<template>
  <div class="running-nodes-title" v-if="!isOpen">
    <el-row :gutter="18">
      <el-col :span="6">
        <CustomCard
          :title="currentRunningNodeEngineer.nodeName"
          :nodeStatus="currentRunningNodeEngineer.nodeStatus"
          :nodeAuthInfo="{
            nodeAuthStatus: currentRunningNodeEngineer.nodeAuthStatus,
            authInfo: currentRunningNodeEngineer.authInfo,
          }"
          iconName="vector"
          height="220px"
          :expand="true"
          :is-open="isOpen"
          @toggle="handleToggle"
          shadow="never"
          background="transparent"
          border="0px"
        >
          <div>
            <el-row>
              <el-col :span="10">
                <div class="app-nodes-img">
                  <el-image
                    fit="fill"
                    style="width: 100%; height: 100%"
                    :src="currentRunningNodeEngineer.nodeStatus === 'running' ? nodeOnline : nodeOffline"
                    alt="Img"
                  />
                  <el-button
                    type="primary"
                    @click="handleSyncNodeInfo(currentRunningNodeEngineer.nodeName)"
                    v-if="currentRunningNodeEngineer.nodeAuthStatus"
                  >
                    {{ t('syncNodeInfo') }}
                  </el-button>
                </div>
              </el-col>
              <el-col :span="14">
                <el-form :model="currentRunningNodeEngineer" label-width="auto" label-position="left">
                  <el-form-item :label="t('nodeIp')">
                    <el-text>{{ currentRunningNodeEngineer.address }}</el-text>
                  </el-form-item>
                  <el-form-item :label="t('port')">
                    <el-text>{{ currentRunningNodeEngineer.port }}</el-text>
                  </el-form-item>
                  <el-form-item>
                    <template #label>
                      <span class="custom-icon">
                        {{ t('deployMode') }}
                        <el-tooltip
                          :content="t('deploModeContent')"
                          placement="bottom"
                          effect="light"
                          popper-class="custom-tooltip"
                        >
                          <el-icon color="blue"><QuestionFilled /></el-icon>
                        </el-tooltip>
                      </span>
                    </template>
                    <el-radio-group v-model="deployMode" class="custom-radio-group">
                      <el-radio label="quick">{{ t('deployQuick') }}</el-radio>
                      <el-radio label="full">{{ t('deployFull') }}</el-radio>
                    </el-radio-group>
                  </el-form-item>
                </el-form>
              </el-col>
            </el-row>
          </div>
        </CustomCard>
      </el-col>
      <el-col v-if="!isOpen" :style="{ flex: '1' }">
        <CustomCard :height="'217px'">
          <div class="node-performance">
            <el-row>
              <el-col :span="20">
                <el-text>{{ t('cpuUsage') }} </el-text>
              </el-col>
              <el-col :span="4">
                <el-text style="color: #0348dd; font-size: 16px; font-weight: 700">
                  {{ opsResourceStore.currentNodesRes.cpu_usage_rate || 0 }}%
                </el-text>
              </el-col>
            </el-row>
            <el-row>
              <el-col :span="24">
                <el-progress
                  :percentage="opsResourceStore.currentNodesRes.cpu_usage_rate"
                  :stroke-width="10"
                  :show-text="false"
                  color="#0348dd"
                  striped
                  striped-flow
                  :duration="25"
                />
              </el-col>
            </el-row>
            <el-row>
              <el-col :span="20">
                <el-text>{{ t('diskUasge') }} </el-text>
              </el-col>
              <el-col :span="4">
                <el-text style="color: #05ab68; font-size: 16px; font-weight: 700">
                  {{ `${opsResourceStore.currentNodesRes.disk_usage_rate || 0}%` }}
                </el-text>
              </el-col>
            </el-row>
            <el-row>
              <el-col :span="24">
                <el-progress
                  :percentage="opsResourceStore.currentNodesRes.disk_usage_rate"
                  :stroke-width="10"
                  :show-text="false"
                  color="#05ab68"
                  striped
                  striped-flow
                  :duration="25"
                />
              </el-col>
            </el-row>
            <el-row>
              <el-col :span="20">
                <el-text>{{ t('menmoryUsage') }} </el-text>
              </el-col>
              <el-col :span="4">
                <el-text style="color: #fc8200; font-size: 16px; font-weight: 700">
                  {{ `${opsResourceStore.currentNodesRes.mem_usage_rate || 0}%` }}
                </el-text>
              </el-col>
            </el-row>
            <el-row>
              <el-col :span="24">
                <el-progress
                  :percentage="opsResourceStore.currentNodesRes.mem_usage_rate"
                  :stroke-width="10"
                  :show-text="false"
                  color="#fc8200"
                  striped
                  striped-flow
                  :duration="25"
                />
              </el-col>
            </el-row>
          </div>
        </CustomCard>
      </el-col>
      <el-col v-if="!isOpen" :style="{ flex: '1' }">
        <CustomCard :height="'217px'">
          <div>{{ t('hostInfo') }}</div>
          <div class="hostInfo-card">
            <el-row type="flax" justify="center" align="middle" gutter="0" style="background: transparent">
              <el-col :span="6">
                <el-tag type="primary" class="no-auto-width">
                  <el-text truncated>
                    {{ t('cpuModel') }}
                  </el-text>
                </el-tag>
              </el-col>
              <el-col :span="16" :offset="2">
                <el-text truncated>
                  {{ opsResourceStore.currentNodesRes.cpu_model }}
                </el-text>
              </el-col>
              <el-col :span="6">
                <el-tag type="primary" class="no-auto-width">
                  <el-text truncated>
                    {{ t('cpuCores') }}
                  </el-text>
                </el-tag>
              </el-col>
              <el-col :span="16" :offset="2">
                <el-text truncated>
                  {{ opsResourceStore.currentNodesRes.cpu_cores }}
                </el-text>
              </el-col>
              <el-col :span="6">
                <el-tag type="primary" class="no-auto-width">
                  <el-text truncated>
                    {{ t('osSystem') }}
                  </el-text>
                </el-tag>
              </el-col>
              <el-col :span="16" :offset="2">
                <el-text truncated>
                  {{ opsResourceStore.currentNodesRes.os_system }}
                </el-text>
              </el-col>
              <el-col :span="6">
                <el-tag type="primary" class="no-auto-width">
                  <el-text truncated>
                    {{ t('osRuntime') }}
                  </el-text>
                </el-tag>
              </el-col>
              <el-col :span="16" :offset="2">
                <el-text truncated>
                  {{ opsResourceStore.currentNodesRes.os_runtime }}
                </el-text>
              </el-col>
            </el-row>
          </div>
        </CustomCard>
      </el-col>
      <el-col v-if="!isOpen" :style="{ flex: '1' }">
        <CustomCard :height="'217px'">
          <div>{{ `${t('network')}IO (I/W)` }}</div>
          <div class="speed-card">
            <el-row type="flax" justify="center" align="middle" gutter="0" style="background: transparent">
              <el-col :span="14">
                <LineChart :value="opsResourceStore.currentNodesRes.netSendArr || []" :color="['#fc8200', '#f1eff0']" />
              </el-col>
              <el-col :span="8" :offset="2">
                <el-statistic
                  :value="`${opsResourceStore.currentNodesRes.netio_speed_send || 0} ${opsResourceStore.currentNodesRes.netio_speed_send_unit || 'Kbps'}`"
                  :precision="0"
                  :value-style="{ color: '#fc8200', fontSize: '18px', fontWeight: 'bold' }"
                >
                  <template #prefix>
                    <div style="display: inline-flex; align-items: center">
                      <CustomIcon name="sending" style="margin-right: 7px" />
                      <span>{{ t('sending') }}</span>
                    </div>
                  </template>
                </el-statistic>
              </el-col>
              <el-col :span="14">
                <LineChart
                  :value="opsResourceStore.currentNodesRes.netReceiveArr || []"
                  :color="['#40455a', '#f0f5ff']"
                />
              </el-col>
              <el-col :span="8" :offset="2">
                <el-statistic
                  :value="`${opsResourceStore.currentNodesRes.netio_speed_receive || 0} ${opsResourceStore.currentNodesRes.netio_speed_receive_unit || 'Kbps'}`"
                  :precision="0"
                  :value-style="{ color: '#40455a', fontSize: '18px', fontWeight: 'bold' }"
                >
                  <template #prefix>
                    <div style="display: inline-flex; align-items: center">
                      <CustomIcon name="receive" style="margin-right: 7px" />
                      <span>{{ t('receive') }}</span>
                    </div>
                  </template>
                </el-statistic>
              </el-col>
            </el-row>
          </div>
        </CustomCard>
      </el-col>
    </el-row>
  </div>
  <div class="running-nodes-body">
    <el-row>
      <el-col>
        <CustomCard
          :title="t('appManager')"
          background="transparent"
          shadow="never"
          border="0px"
          class="app-manamger"
          :expand="isOpen"
          :is-open="isOpen"
          @toggle="handleToggle"
          :style="isOpen ? { height: 'calc(100vh) !important' } : { height: 'calc(100vh - 380px) !important' }"
        >
          <header class="toolbar">
            <div class="button">
              <el-button type="primary" @click="() => openDialog('create')">
                <el-icon class="mr-6">
                  <IEpCirclePlus />
                </el-icon>
                {{ t('add') }}
              </el-button>
              <el-button :disabled="projectIdStatus || selectStatus || !deployStatus" @click="() => openDialog('edit')">
                <el-icon class="mr-6">
                  <IEpEdit />
                </el-icon>
                {{ t('edit') }}
              </el-button>
              <el-button
                :disabled="projectIdStatus || startStopSelectStatus || deployStatus || appStatus"
                type="primary"
                @click="startMultiApp"
              >
                <el-icon class="mr-6">
                  <IEpVideoPlay />
                </el-icon>
                {{ t('start') }}
              </el-button>
              <el-button
                :disabled="projectIdStatus || startStopSelectStatus || deployStatus || !appStatus"
                type="danger"
                @click="stopMultiApp"
              >
                <el-icon class="mr-6">
                  <IEpVideoPause />
                </el-icon>
                {{ t('stop') }}
              </el-button>
              <el-button
                :disabled="projectIdStatus || startStopSelectStatus || deployStatus || !appStatus"
                @click="restartMultiApp"
              >
                <el-icon class="mr-6">
                  <IEpRefreshLeft />
                </el-icon>
                {{ t('restart') }}
              </el-button>
              <el-button :disabled="projectIdStatus || selectStatus || !deployStatus" @click="deployProject">
                <el-icon class="mr-6">
                  <IEpMessageBox />
                </el-icon>
                {{ t('deploy') }}
              </el-button>
              <el-button :disabled="projectIdStatus || selectStatus || deployStatus" @click="reDeployProject">
                <el-icon class="mr-6">
                  <IEpRefreshRight />
                </el-icon>
                {{ t('reDeployed') }}
              </el-button>
              <el-button
                :disabled="projectIdStatus || selectStatus || deployStatus || appStatus"
                @click="RevokeDeployProject"
              >
                <el-icon class="mr-6">
                  <IEpCloseBold />
                </el-icon>
                {{ t('unDeployed') }}
              </el-button>
              <el-button :disabled="projectIdStatus || selectStatus || !deployStatus" type="danger" @click="deleteList">
                <el-icon class="mr-6">
                  <IEpDeleteFilled />
                </el-icon>
                {{ t('delete') }}
              </el-button>
            </div>
            <div class="search-box">
              <el-button :icon="DataAnalysis" @click="appOverviewDialog = true">{{ t('overview') }}</el-button>
              <el-input
                v-model="searchKeyword"
                :placeholder="t('searchKeywork')"
                :suffix-icon="Search"
                class="search-input"
                clearable
              />
            </div>
          </header>
          <CustomStyleTable
            rowKey="appId"
            ref="tableRef"
            class="table-custom"
            :tableData="tableData"
            :selectPageClear="true"
            :maxHeight="isOpen ? 'calc(100vh - 200px)' : 'calc(100vh - 470px)'"
            :calRowClassName="handleTableRowClassName"
            @selectionChange="handleSelectionChange"
            @tableRowClick="handleTableRowClick"
            @selectAll="handleSelectAll"
          >
            <el-table-column align="left" type="selection" width="55" :selectable="handleSelectable" />
            <el-table-column
              v-for="row of tableColumns"
              :key="row.label"
              :label="row.label"
              :min-width="row.minWidth"
              :prop="row.props"
              :formatter="row.formatter"
              align="left"
              show-overflow-tooltip
            />
            <el-table-column :label="t('runtime')" align="center" min-width="12%" show-overflow-tooltip>
              <template #default="{ row }">
                <el-row :gutter="16" align="middle">
                  <el-col :span="24">
                    <span :style="{ color: '#000000', fontsize: '12px' }">
                      {{ formatRunningTime(row) }}
                    </span>
                    <br />
                    <span :style="{ color: '#9ca3af', fontsize: '10px' }">
                      {{ row.appStatus === 'running' ? t('time', formatRunTime(row.aliveTime)) : '' }}
                    </span>
                  </el-col>
                </el-row>
              </template>
            </el-table-column>
            <el-table-column :label="t('status')" align="center" min-width="20%" show-overflow-tooltip>
              <template #default="{ row }">
                <div v-if="row.projectId">
                  <el-tag :type="row.appDeployStatus === 1 ? 'success' : 'info'" round>
                    {{ row.appDeployStatus === 1 ? t('deployed') : t('notDeloyed') }}
                  </el-tag>
                  <el-tag :type="row.appStatus === 'running' ? 'success' : 'info'" round style="margin-left: 14px">
                    {{ row.appStatus === 'running' ? t('running') : t('notRunning') }}
                  </el-tag>
                  <el-tag v-if="row.appStatus === 'running'" type="success" round style="margin-left: 14px">
                    {{ row.authState === 1 ? t('authorized') : t('demoMode') }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('loadOrProxy')" align="center" min-width="8%" show-overflow-tooltip>
              <template #default="{ row }">
                <div v-if="row.projectId">
                  <el-button
                    size="small"
                    :disabled="!row.isProxyed || row.projectType === 2"
                    link
                    :type="row.isProxyed ? 'primary' : 'info'"
                    @click="handleClick(row)"
                  >
                    <el-icon class="mr-6">
                      <IEpView />
                    </el-icon>
                    {{ t('view') }}
                  </el-button>
                </div>
              </template>
            </el-table-column>
            <el-table-column
              :label="t('dataMonitor')"
              align="center"
              min-width="10%"
              show-overflow-tooltip
              class="monitor-btn"
              style="text-overflow: unset"
            >
              <template #default="{ row }">
                <div v-if="row.projectId">
                  <el-button
                    size="small"
                    :disabled="row.projectType !== 2 || row.appStatus !== 'running'"
                    link
                    type="primary"
                    @click="handleMonitorCollectProject(row)"
                  >
                    <el-icon class="mr-6">
                      <IEpAim />
                    </el-icon>
                    <span v-if="row.projectType === 2">{{ t('colmonitor', { wsPort: row.wsPort }) }}</span>
                    <span v-else>{{ t('monitor') }}</span>
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </CustomStyleTable>
        </CustomCard>
      </el-col>
    </el-row>
  </div>
  <component
    :is="activeDialogComponent"
    v-if="dialogVisible"
    v-model:dialogVisible="dialogVisible"
    :rowData="{ ...editRowData, ...{ dialogType }, ...{ enabled } }"
    :rowInfoData="{ ...rowInfoData }"
    @confirm="handleConfirm"
  />
  <Loading :loading="isLoading" :loadingText="loadingText" />
  <collect-monitor
    v-if="realDataMonitor"
    @update:dialogVisible="handleCloseCollectMonitor"
    :projectInfo="selectedCollect"
  ></collect-monitor>
  <AppOverviewDialog v-model="appOverviewDialog" :overview="overview" :loading="loading"></AppOverviewDialog>
</template>

<style lang="scss" scoped>
.running-nodes-title {
  background: #e9f0ff;
  width: 100%;
  padding: 20px 24px;
  border-radius: 16px;
  margin-bottom: 20px;
  .app-nodes-img {
    position: relative;
    padding: 0px;
    opacity: 0.6;
    height: 140px;
    .el-button {
      width: 100px;
      position: absolute;
      left: 40%;
      bottom: -30px;
      transform: translate(-50%, 0);
    }
  }
  .el-form-item {
    background: linear-gradient(90deg, #ffffff40 0%, #ffffff80 100%);
    border-radius: 4px;
    margin-bottom: 10px;
    .el-text {
      font-size: 14px;
      font-weight: bold;
    }
  }
  .el-form-item + .el-form-item {
    margin-top: 15px;
  }
  .el-form-item__label {
    font-size: 14px;
    margin: 0 0 0 15px;
  }
  .speed-card {
    padding: 10px 0px;
    .el-row {
      .el-statistic {
        text-align: center;
        ::v-deep(.el-statistic__content) {
          padding: 10px 0 0 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          .el-statistic__suffix {
            font-size: 12px;
          }
        }
      }
    }
  }
  .hostInfo-card {
    padding: 10px 0;
    .el-col {
      padding: 4px 0;
    }
    .no-auto-width {
      width: 100%;
    }
    .no-auto-width ::v-deep(.el-tag__content) {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
    }
  }
  .node-performance {
    .el-row + .el-row {
      margin-top: 15px;
    }
  }
}
:deep(.el-table__body-wrapper) {
  .el-table__cell {
    height: 65px;
  }
}
.running-nodes-body {
  background: transparent;
  .app-manamger {
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap; // 小屏自动换行
      margin-bottom: 20px;
      gap: 10px;
      .button {
        display: flex;
        flex-wrap: wrap; // 按钮自动换行
        gap: 0; // 按钮之间的间距
        .el-button {
          border-radius: 4px;
        }
      }
      .search-box {
        min-width: 300px;
        margin-top: 8px;
        @media screen and (min-width: 768px) {
          margin-top: 0;
        }

        .search-input {
          margin-left: 10px;
          width: 300px;
        }
      }
    }
    ::v-deep .table-custom .custom-table-class {
      .custom-header-row .el-table-column--selection div {
        display: block;
      }
      .custom-row.parentRow .el-table-column--selection .cell {
        display: none;
      }
    }
  }
}
.custom-radio-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-left: 5px;
}
.custom-icon {
  display: inline-flex;
  align-items: center;
  margin-top: 15px;
}
</style>
<style>
.custom-tooltip {
  max-width: 180px;
  max-height: 200px;
  word-break: break-all;
  word-wrap: break-word;
  color: rgba(102, 104, 107);
  white-space: pre-line;
}
</style>
