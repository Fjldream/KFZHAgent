<script setup>
import { nextTick, watch } from 'vue';

const props = defineProps({
  tableData: {
    type: Array,
    default: () => [],
  },
  totalNum: {
    type: Number,
    default: null,
  },
  paginateValid: {
    type: Boolean,
    default: true,
  },
  showPagination: {
    type: Boolean,
    default: true,
  },
  showHighlight: {
    type: Boolean,
    default: true,
  },
  pageSizes: {
    type: Array,
    default: () => [10, 20, 30, 50, 100, 200],
  },
  maxHeight: {
    type: String,
    default: 'calc(100vh - 166px)',
  },
  tableClass: {
    type: String,
    default: '',
  },
  rowKey: {
    type: String,
    default: 'id',
  },
  mergeFields: {
    type: Array,
    default: () => [],
  },
  selectPageClear: {
    type: Boolean,
    default: false,
  },
  borderVisible: {
    type: Boolean,
    default: false,
  },
  stripeFlag: {
    type: Boolean,
    default: true,
  },
  calRowClassName: {
    type: Function,
    default: () => '',
  },
});

const tableRef = useTemplateRef('tableRef');
const currentPage = ref(1);
const pageSize = ref(10);
const totalNumber = ref(0);
pageSize.value = props.pageSizes[0];
const cssVar = computed(() => ({
  '--table-content__height': props.maxHeight,
}));
const selectedMap = reactive(new Map());
const emits = defineEmits([
  'select',
  'selectAll',
  'rowContextmenu',
  'sortChange',
  'currentChange',
  'sizeChange',
  'tableRowClick',
  'tableRowDBClick',
  'selectionChange',
]);

const displayTableData = computed(() => {
  if (!props.showPagination || !props.paginateValid) {
    return props.tableData;
  }
  const startIndex = (currentPage.value - 1) * pageSize.value;
  const endIndex = startIndex + pageSize.value;
  return props.tableData?.slice(startIndex, endIndex);
});

watch(
  () => displayTableData.value,
  () => {
    nextTick(() => {
      if (!tableRef.value) return;
      tableRecursion(displayTableData.value);
      emits('selectionChange', Array.from(selectedMap.values()));
    });
  },
  { immediate: true },
);

watch(
  () => props.tableData,
  () => {
    nextTick(() => {
      const newData = flattenTreeData(props.tableData);
      totalNumber.value = props.tableData.length;
      const existingIds = new Set(newData.map((item) => item[props.rowKey]));
      for (const key of selectedMap.keys()) {
        if (!existingIds.has(key)) {
          selectedMap.delete(key);
        }
      }
      emits('selectionChange', Array.from(selectedMap.values()));
    });
  },
  { immediate: true },
);
function handleSizeChange(val) {
  pageSize.value = val;
  emits('sizeChange', val);
}

function handleCurrentPage(val) {
  currentPage.value = val;
  //切换分页后清除选中
  if (props.selectPageClear) {
    selectedMap.clear();
  }
  emits('currentChange', val);
}

const selectTable = (selection, row) => {
  const selectedKeySet = new Set(selection.map((item) => item[props.rowKey]));
  selectTableRecursion(displayTableData.value, selectedKeySet);
  emits('selectionChange', Array.from(selectedMap.values()));
};
const flattenTreeData = (data) => {
  const result = [];
  function traverse(node) {
    const { children, ...nodeWithoutChildern } = node;
    result.push(nodeWithoutChildern);
    if (children && children.length > 0) {
      children.forEach((child) => traverse(child));
    }
  }
  data.forEach((node) => traverse(node));
  return result;
};
const tableRecursion = (data) => {
  for (let index = 0; index < data.length; index++) {
    const row = data[index];
    const isSelected = selectedMap.has(row[props.rowKey]);
    tableRef.value.toggleRowSelection(row, isSelected);

    if (isSelected) {
      selectedMap.set(row[props.rowKey], row);
    }
    if (row.children && isSelected) {
      for (const element of row.children) {
        if (selectedMap.has(element[props.rowKey])) {
          continue;
        }
        tableRef.value.toggleRowSelection(element, false);
      }
    }
    if (row.hasOwnProperty('children') && !isSelected) {
      tableRecursion(row.children);
    }
  }
};
const selectTableRecursion = (data, selectedKeySet) => {
  for (let index = 0; index < data.length; index++) {
    const row = data[index];
    const key = row[props.rowKey];
    const isNowSelected = selectedKeySet.has(key);
    const wasSelected = selectedMap.has(key);
    if (isNowSelected && !wasSelected) {
      selectedMap.set(key, row);
      if (row.hasOwnProperty('children') && row.children.length > 0) {
        for (const element of row.children) {
          if (selectedMap.has(element[props.rowKey])) {
            continue;
          }
          tableRef.value.toggleRowSelection(element, false);
        }
      }
      continue;
    }
    if (!isNowSelected && wasSelected) {
      selectedMap.delete(key);
      if (row.hasOwnProperty('children') && row.children.length > 0) {
        for (const element of row.children) {
          if (selectedMap.has(element[props.rowKey])) {
            tableRef.value.toggleRowSelection(element, true);
          }
        }
      }
      continue;
    }
    if (row.hasOwnProperty('children') && row.children.length > 0 && (!isNowSelected || wasSelected)) {
      selectTableRecursion(row.children, selectedKeySet);
    }
  }
};
const selectAll = (selection) => {
  const selectedKeySet = new Set(selection.map((row) => row[props.rowKey]));
  displayTableData.value.forEach((row) => {
    const key = row[props.rowKey];
    const isNowSelected = selectedKeySet.has(key);
    const wasSelected = selectedMap.has(key);
    if (isNowSelected && !wasSelected) {
      selectedMap.set(key, row);
    }
    if (!isNowSelected && wasSelected) {
      selectedMap.delete(key);
    }
  });
  emits('selectionChange', Array.from(selectedMap.values()));
  emits('selectAll', selection, selectedMap);
};
const rowContextmenu = (row, column, e) => {
  emits('rowContextmenu', { row, column, e });
};
const sortChange = (row) => {
  emits('sortChange', row);
};

const rowDblClick = (row, column, e) => {
  emits('tableRowDBClick', row, column, e);
};

const rowClick = (row, column, e) => {
  const isSelected = selectedMap.has(row[props.rowKey]);
  tableRef.value.toggleRowSelection(row, !isSelected);
  if (isSelected) {
    selectedMap.delete(row[props.rowKey]);
  } else {
    selectedMap.set(row[props.rowKey], row);
  }
  emits('selectionChange', Array.from(selectedMap.values()));
  emits('tableRowClick', row, column, e, selectedMap);
};
const selectionChange = () => {
  emits('selectionChange', Array.from(selectedMap.values()));
};
function handleSpanMethod({ row, column, rowIndex }) {
  const field = column.property;
  if (!props.mergeFields.includes(field)) return [1, 1];
  //判断是否需要合并
  const currentValue = row[field];
  const prevRow = props.tableData[rowIndex - 1];
  if (prevRow && prevRow[field] === currentValue) {
    return [0, 0];
  }
  //计算rowspan
  let rowspan = 1;
  for (let index = rowIndex + 1; index < props.tableData.length; index++) {
    if (props.tableData[index][field] === currentValue) {
      rowspan++;
    } else {
      break;
    }
  }
  return [rowspan, 1];
}

const getTableRef = () => {
  return tableRef.value;
};

function tableRowClassName(row) {
  let className = 'custom-row ';
  if (typeof props.calRowClassName === 'function') {
    className += props.calRowClassName(row);
  }
  return className;
}
defineExpose({
  getTableRef,
  handleCurrentPage,
});
</script>

<template>
  <div :style="cssVar" class="table-container">
    <el-table
      class-name="custom-table-class"
      header-row-class-name="custom-header-row"
      :row-class-name="tableRowClassName"
      style="width: 100%"
      ref="tableRef"
      :border="borderVisible"
      :class="tableClass"
      :data="displayTableData"
      :highlight-current-row="showHighlight"
      :stripe="stripeFlag"
      :span-method="handleSpanMethod"
      :row-key="rowKey"
      @rowContextmenu="rowContextmenu"
      @rowDblclick="rowDblClick"
      @select="selectTable"
      @sortChange="sortChange"
      @row-click="rowClick"
      @selection-change="selectionChange"
      @select-all="selectAll"
    >
      <slot name="default"></slot>
    </el-table>
    <el-pagination
      v-if="showPagination"
      size="small"
      :background="false"
      :current-page="currentPage"
      :page-size="pageSize"
      :page-sizes="pageSizes"
      :total="totalNum ? totalNum : totalNumber"
      class="pagination"
      layout="total, sizes, prev, pager, next, jumper"
      @currentChange="handleCurrentPage"
      @size-change="handleSizeChange"
    ></el-pagination>
  </div>
</template>

<style lang="scss">
.table-container {
  display: flex;
  height: var(--table-content__height);
  flex-direction: column;
  justify-content: flex-start;
  background-color: #ffffff;
  border-radius: 16px;
  padding: 16px;
  // 分页的位置放到右下角, 需要在引入的页面添加 class="page-position" 去做分页的定位锚定点
  .pagination {
    align-self: flex-end;
    justify-content: flex-end;
    margin-top: 10px;
    width: 100%;
    position: relative;
    span {
      color: #1f2937 !important;
    }
    .el-pager {
      .is-active {
        border: 1px solid #2563eb;
      }
    }
    .el-pagination__total {
      position: absolute;
      left: 0;
    }
  }
  .custom-table-class {
    flex: 1;
    .custom-header-row {
      border-radius: 16px;
      th.el-table__cell {
        background-color: #f3f4f5; // 表头背景色（浅灰）
        color: #6b7280; // 表头文字颜色
        font-weight: 600;
        font-size: 14px;
        &:first-child {
          border-radius: 10px 0 0 10px;
        }
        &:last-child {
          border-radius: 0 10px 10px 0;
        }
      }
      .el-table-column--selection div {
        display: none;
      }
    }

    .custom-row {
      color: #000000; // 表头文字颜色
      font-weight: 500;
      text-align: center;
      font-size: 14px;

      &:hover {
        background-color: #e8ecf2 !important; // 鼠标移入行颜色（浅蓝）
      }

      &.current-row {
        background-color: #dce3f0; // 当前选中行颜色（更深蓝）
      }
    }
    .success-row {
      --el-table-tr-bg-color: var(--el-color-success-light-9);
    }
    .warning-row {
      --el-table-tr-bg-color: rgba(247, 162, 14, 0.3);
    }
    .error-row {
      --el-table-tr-bg-color: rgba(255, 0, 0, 0.3);
    }
  }
}
</style>
