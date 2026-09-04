import { useI18n } from 'vue-i18n';
import { useWebSocketClient } from '@/composables/useWebSocketClient.js';
import {
  handleQueryGroupServer,
  handleVariablesListServer,
  handleProjectInfoServer,
} from '@/api/allRequest/variablesCollect';
export const useCollectMonitor = () => {
  const { t } = useI18n();
  const tableColumns = computed(() => {
    return [
      {
        label: t('serialNo'),
        props: 'serialNo',
        minWidth: '4%',
      },
      {
        label: t('variableName'),
        props: 'variableName',
        minWidth: '10%',
      },
      {
        label: t('variableDes'),
        props: 'variableDes',
        minWidth: '10%',
      },
      {
        label: t('dataType'),
        props: 'dataType',
        minWidth: '8%',
      },
      {
        label: t('registerName'),
        props: 'registerName',
        minWidth: '6%',
      },
      {
        label: t('registerAddress'),
        props: 'registerAddress',
        minWidth: '8%',
      },
      {
        label: t('readWriteType'),
        props: 'readWriteType',
        minWidth: '8%',
      },
      {
        label: t('collectPeriod'),
        props: 'collectPeriod',
        minWidth: '8%',
      },
      {
        label: t('variableValue'),
        props: 'variableValue',
        minWidth: '8%',
      },
      {
        label: t('timestamp'),
        props: 'timestamp',
        minWidth: '15%',
      },
      {
        label: t('quality'),
        props: 'quality',
        minWidth: '5%',
      },
    ];
  });
  const searchText = ref('');
  const treeRef = ref();
  const defaultProps = ref({
    label: 'text',
    children: 'children',
  });
  const pageSizes = ref([15, 50, 100, 200]);
  const pageSize = ref(15);
  const currentPage = ref(1);
  const tableData = ref([]);
  const treeData = ref([]);
  const projectId = ref('');
  const address = ref('');
  const resultfulPort = ref('');
  const collectAppName = ref('');
  const currProOsType = ref('Windows');
  const tableFilterData = computed(() => {
    const startIndex = (currentPage.value - 1) * pageSize.value;
    const endIndex = startIndex + pageSize.value;
    return tableData.value.filter((item) => item.variableName.includes(searchText.value)).slice(startIndex, endIndex);
  });
  const paginationLength = computed(() => {
    return tableData.value.filter((item) => item.variableName.includes(searchText.value)).length;
  });
  const wsClient = ref(null);
  const loadingFlag = ref(true);
  const tableLoading = ref(false);
  /**
   * @function handleCurrentPage
   * @description 分页切换事件
   * @param {*} val
   */
  function handleCurrentPage(val) {
    currentPage.value = val;
    const subTags = tableFilterData.value.map((item) => item.variableName);
    updateSubVariablesList(subTags);
  }
  /**
   * @function handleSizeChange
   * @description 表格size change事件
   * @param {} val
   */
  function handleSizeChange(val) {
    pageSize.value = val;
    handleCurrentPage(1);
  }
  /**
   * @function initTableData
   * @description 初始化变量列表
   */
  async function initTableData(id, ip, port, appName, callback) {
    address.value = ip;
    projectId.value = id;
    resultfulPort.value = port;
    collectAppName.value = appName;
    const groupListRes = await handleQueryGroupServer(projectId.value);
    if (groupListRes.errorCode === 0) {
      treeData.value = groupListRes.data;
      treeRef.value.setCurrentKey('tagRoot');
    } else {
      callback(false);
      loadingFlag.value = false;
      return;
    }
    const osTypeRes = await handleProjectInfoServer({ projectId: projectId.value });
    if (osTypeRes.errorCode === 0) currProOsType.value = osTypeRes.data.osType;
    await handleNodeClick({ id: 'tagRoot' }, true);
    loadingFlag.value = false;
    startMonitorValue();
  }
  /**
   * @function startMonitorValue
   * @description 打开监视页面连接ws
   */
  function startMonitorValue() {
    const wsUrl = `${location.protocol.replace('http', 'ws')}//${location.host}/ws`;
    wsClient.value = useWebSocketClient({ url: wsUrl, connectCallback: connectMonitor });
    wsClient.value.onMessage(async (message) => {
      try {
        if (message !== 'pang') {
          // 消息处理
          message = JSON.parse(message);
          if (
            message.hasOwnProperty('type') &&
            message.hasOwnProperty('operation') &&
            message.type === 'collect_variable_monitor'
          ) {
            switch (message.operation) {
              case 'realtime_monitor':
                updateRealtimeDataToTable(message.data);
                break;
              default:
                break;
            }
          }
        }
      } catch (error) {}
    });
    wsClient.value.connect();
  }
  /**
   * @function updateRealtimeDataToTable
   * @description 处理实时数据
   * @param {*} data
   */
  function updateRealtimeDataToTable(data) {
    if (!data) return;
    const valueMap = {};
    for (let i = 0; i < data.length; i++)
      valueMap[data[i].tagName] = { V: data[i].tagValue, Q: data[i].quality, T: data[i].timeStamp };
    for (let i = 0; i < tableFilterData.value.length; i++) {
      const element = tableFilterData.value[i];
      if (valueMap[element.variableName]) {
        element.variableValue = valueMap[element.variableName].V;
        element.timestamp = valueMap[element.variableName].T;
        element.quality = valueMap[element.variableName].Q;
      }
    }
  }
  /**
   * @function updateSubVariablesList
   * @description 切换分页，发布新的变量订阅信息
   * @param {*} varList
   */
  function updateSubVariablesList(varList) {
    wsClient.value.send(
      JSON.stringify({
        type: 'collect_variable_monitor',
        from: 'ops',
        operation: 'update_variables',
        msg: {
          variables: varList,
        },
      }),
    );
  }
  /**
   * @function connectMonitor
   * @description 连接ws callback
   * @param {*} reconnect
   */
  function connectMonitor(reconnect) {
    wsClient.value.send(
      JSON.stringify({
        type: 'collect_variable_monitor',
        from: 'ops',
        operation: 'connect_monitor',
        msg: {
          ip: address.value,
          port: resultfulPort.value,
          appName: collectAppName.value,
          osType: currProOsType.value,
        },
      }),
    );
    if (reconnect) handleCurrentPage(1);
  }
  /**
   * @function handleNodeClick
   * @description 树节点点击事件
   * @param {*} data
   */
  async function handleNodeClick(data, isFirst = false) {
    tableLoading.value = true;
    const variablesRes = await handleVariablesListServer({ projectId: projectId.value, groupId: data.id });
    if (variablesRes.errorCode == 0) {
      tableData.value = variablesRes.data;
    }
    tableLoading.value = false;
    if (isFirst) {
      setTimeout(() => {
        handleCurrentPage(1);
      }, 200);
    } else {
      handleCurrentPage(1);
    }
  }
  function calRowClassName(row) {
    if (row.row.quality == '--') return 'warning-row';
    if (row.row.quality != 192) return 'error-row';
    return '';
  }
  function handleSearchTextChange() {
    setTimeout(() => {
      handleCurrentPage(1);
    }, 100);
  }
  return {
    treeRef,
    searchText,
    defaultProps,
    tableColumns,
    pageSizes,
    pageSize,
    currentPage,
    tableData,
    tableFilterData,
    treeData,
    wsClient,
    loadingFlag,
    tableLoading,
    paginationLength,
    handleCurrentPage,
    handleSizeChange,
    startMonitorValue,
    initTableData,
    handleNodeClick,
    calRowClassName,
    handleSearchTextChange,
  };
};
