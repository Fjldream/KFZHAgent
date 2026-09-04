<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { useCollectMonitor } from '@/composables/collectMonitorMng/useCollectMonitor.js';
import { Search } from '@element-plus/icons-vue';
const props = defineProps({
  projectInfo: {
    type: Object,
    default: () => {},
  },
});
const emit = defineEmits(['update:dialogVisible']);
const {
  treeRef,
  searchText,
  defaultProps,
  tableColumns,
  pageSizes,
  pageSize,
  currentPage,
  treeData,
  wsClient,
  loadingFlag,
  tableLoading,
  tableFilterData,
  paginationLength,
  handleCurrentPage,
  handleSearchTextChange,
  handleSizeChange,
  handleNodeClick,
  initTableData,
  calRowClassName,
} = useCollectMonitor();
function handleCloseMonitor() {
  emit('update:dialogVisible', false);
  wsClient.value?.cleanupSocket();
}
onMounted(async () => {
  initTableData(
    props.projectInfo.projectId,
    props.projectInfo.address,
    props.projectInfo.wsPort,
    props.projectInfo.appName,
    (data) => {
      setTimeout(() => {
        emit('update:dialogVisible', data);
      }, 1000);
    },
  );
});
</script>

<template>
  <div class="data-monitor-con">
    <div class="data-monitor-panel">
      <LoadingComponent :loading="loadingFlag" />
      <header>
        <span>{{ t('dataMonitor') }}</span>
        <el-icon class="mr-6" @click="handleCloseMonitor"><IEpClose /></el-icon>
      </header>
      <main>
        <div class="collect-monitor-main">
          <div class="variable-tree-con">
            <div class="tree-title">{{ t('variableGroup') }}</div>
            <el-tree
              ref="treeRef"
              :data="treeData"
              :props="defaultProps"
              @node-click="handleNodeClick"
              node-key="id"
              highlight-current
              :default-expanded-keys="['tagRoot']"
            >
            </el-tree>
          </div>
          <div class="variable-real-data" v-loading="!loadingFlag && tableLoading">
            <div class="real-data-title">
              <span>{{ t('variableList') }}</span>
              <el-input
                class="variable-search"
                v-model="searchText"
                @change="handleSearchTextChange"
                :placeholder="t('searchKeywork')"
                :prefix-icon="Search"
              />
            </div>
            <CustomStyleTable
              :tableData="tableFilterData"
              :paginateValid="false"
              :showPagination="false"
              :borderVisible="true"
              :stripeFlag="false"
              :calRowClassName="calRowClassName"
              rowKey="appId"
              maxHeight="563px"
              class="table-custom"
            >
              <el-table-column
                v-for="row of tableColumns"
                :key="row.label"
                :label="row.label"
                :min-width="row.minWidth"
                :prop="row.props"
                align="center"
                show-overflow-tooltip
              />
            </CustomStyleTable>
          </div>
        </div>
      </main>
      <footer>
        <div>
          <el-pagination
            size="small"
            :background="false"
            :current-page="currentPage"
            :page-size="pageSize"
            :page-sizes="pageSizes"
            :total="paginationLength"
            layout="total, sizes, prev, pager, next, jumper"
            @currentChange="handleCurrentPage"
            @size-change="handleSizeChange"
          ></el-pagination>
        </div>
        <div>
          <el-button @click="() => emit('update:dialogVisible', false)">
            {{ t('close') }}
          </el-button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.container-title {
  height: 45px;
  line-height: 45px;
  border-bottom: 1px solid #d7d7d7;
  background: #e8ebf2;
  padding-left: 10px;
  font-weight: 600;
}
.data-monitor-con {
  background: rgba($color: #000000, $alpha: 0.3);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  transition: all 300ms linear;
  .data-monitor-panel {
    position: absolute;
    width: 1500px;
    height: 750px;
    background: white;
    left: 50%;
    top: 50%;
    border-radius: 3px;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    header {
      height: 40px;
      padding: 10px 15px 0px 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      span {
        font-size: 15px;
        font-weight: 500;
      }
      i {
        cursor: pointer;
      }
    }
    main {
      flex: 1;
      padding: 0px 25px;
      .collect-monitor-main {
        border: 1px solid #d7d7d7;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: row;
        .variable-tree-con {
          width: 220px;
          height: 608px;
          overflow-y: auto;
          min-width: 220px;
          border-right: 1px solid #d7d7d7;
          .tree-title {
            @extend .container-title;
          }
        }
        .variable-real-data {
          flex: 1;
          min-width: 0;
          .real-data-title {
            @extend .container-title;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-right: 25px;
            .variable-search {
              width: 220px;
              height: 32px;
              background: transparent;
              border-bottom: 1px solid black;
              font-weight: 400;
              ::v-deep(.el-input__wrapper) {
                background: transparent;
                box-shadow: none;
              }
            }
          }
          ::v-deep(.table-custom) {
            padding: 0;
          }
          ::v-deep(.custom-header-row) {
            border-radius: 0;
            th.el-table__cell {
              background-color: #e8ebf2; // 表头背景色（浅灰）
              color: #303133;
              &:first-child {
                border-radius: 0;
              }
              &:last-child {
                border-radius: 0;
              }
            }
          }
          ::v-deep(.el-table__body-wrapper .el-table__cell) {
            height: 34px;
            padding: 0;
          }
        }
      }
    }
    footer {
      height: 100px;
      padding: 15px;
      div {
        &:first-child {
          padding-right: 10px;
          margin-bottom: 10px;
        }
        display: flex;
        justify-content: right;
      }
    }
  }
}
</style>
