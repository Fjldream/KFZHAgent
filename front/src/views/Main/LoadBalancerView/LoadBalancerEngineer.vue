<script setup>
import { Search } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useLoadBalancerList } from '@/composables/loadBalancerMng/useLoadBalancerEngineer.js';
// 导入所有公共组件
import CustomStyleTable from '@/components/CustomStyleTable/CustomStyleTable.vue';
import Loading from '@/components/Loading/LoadingComponent.vue';
import CustomCard from '@/components/CustomCard/CustomCard.vue';
const { t } = useI18n();
const {
  tableColumns,
  infoTableColumns,
  dialogVisible,
  dialogType,
  isLoading,
  loadingText,
  activeDialogComponent,
  searchKeyword,
  currentRows,
  editRowData,
  tableData,
  tableInfoData,
  openDialog,
  handleTableRowClick,
  handleConfirm,
  deleteList,
  deployProject,
  RevokeDeployProject,
} = useLoadBalancerList();
</script>

<template>
  <CustomCard
    :title="t('loadBalancerOrProxy')"
    iconName="loadBalancer"
    class="load-balancer-manamger"
    shadow="never"
    background="transparent"
    border="0px"
  >
    <header class="toolbar">
      <div class="button">
        <el-button type="primary" @click="() => openDialog('create')">
          <el-icon class="mr-6">
            <IEpCirclePlus />
          </el-icon>
          {{ t('create') }}
        </el-button>
        <el-button
          :disabled="!currentRows || currentRows.appStatus === 1"
          type="primary"
          @click="() => openDialog('edit')"
        >
          <el-icon class="mr-6">
            <IEpEdit />
          </el-icon>
          {{ t('edit') }}
        </el-button>
        <el-button :disabled="!currentRows || currentRows.appStatus === 1" type="danger" @click="deleteList">
          <el-icon class="mr-6">
            <IEpDeleteFilled />
          </el-icon>
          {{ t('delete') }}
        </el-button>
        <el-button :disabled="!currentRows || currentRows.appStatus === 1" @click="deployProject">
          <el-icon class="mr-6">
            <IEpMessageBox />
          </el-icon>
          {{ t('deploy') }}
        </el-button>
        <el-button :disabled="!currentRows || currentRows.appStatus !== 1" @click="RevokeDeployProject">
          <el-icon class="mr-6">
            <IEpCloseBold />
          </el-icon>
          {{ t('unDeployed') }}
        </el-button>
      </div>
      <div class="search-box">
        <el-input
          v-model="searchKeyword"
          :prefix-icon="Search"
          class="search-input"
          clearable
          :placeholder="t('searchKeywork')"
          size="default"
        />
      </div>
    </header>
    <CustomStyleTable
      :tableData="tableData"
      rowKey="appId"
      @tableRowClick="handleTableRowClick"
      maxHeight="calc(50vh - 120px)"
      class="table-custom"
    >
      <el-table-column
        v-for="row of tableColumns"
        :label="row.label"
        :min-width="row.minWidth"
        :prop="row.props"
        align="center"
        show-overflow-tooltip
      />
      <el-table-column :label="t('status')" align="center" min-width="15%" show-overflow-tooltip>
        <template #default="{ row }">
          <span :style="{ color: row.appStatus === 1 ? '#67C23A' : '#000000' }">
            {{ row.appStatus === 1 ? t('deploymentSuccessful') : t('notDeloyed') }}
          </span>
        </template>
      </el-table-column>
    </CustomStyleTable>
  </CustomCard>
  <CustomCard
    :title="t('loadOrProxyInfo')"
    class="load-balancer-info"
    shadow="never"
    background="transparent"
    border="0px"
  >
    <CustomStyleTable
      :tableData="tableInfoData"
      rowKey="appName"
      :mergeFields="['proxyPath']"
      maxHeight="calc(50vh - 150px)"
      class="table-custom"
    >
      <el-table-column
        v-for="row of infoTableColumns"
        :label="row.label"
        :min-width="row.minWidth"
        :prop="row.props"
        align="center"
        show-overflow-tooltip
      />
      <el-table-column :label="t('appStatus')" align="center" min-width="20%" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tag :type="row.appDeployStatus === 1 ? 'success' : 'info'" round>
            {{ row.appDeployStatus === 1 ? t('deployed') : t('notDeloyed') }}
          </el-tag>
          <el-tag :type="row.appStatus === 'running' ? 'success' : 'info'" round style="margin-left: 14px">
            {{ row.appStatus === 'running' ? t('running') : t('notRunning') }}
          </el-tag>
        </template>
      </el-table-column>
    </CustomStyleTable>
  </CustomCard>
  <!-- 动态弹窗组件 -->
  <component
    :is="activeDialogComponent"
    v-if="dialogVisible"
    v-model:dialogVisible="dialogVisible"
    :rowData="{ ...editRowData, ...{ dialogType } }"
    @confirm="handleConfirm"
  />
  <Loading :loading="isLoading" :loadingText="loadingText" />
</template>

<style lang="scss" scoped>
.load-balancer-manamger {
  height: calc(50vh - 10px) !important;
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
    }
    .search-box {
      min-width: 300px;
      margin-top: 8px;
      @media screen and (min-width: 768px) {
        margin-top: 0;
      }

      .search-input {
        width: 300px;
      }
    }
  }
}
.load-balancer-info {
  height: calc(50vh - 90px) !important;
}
</style>
