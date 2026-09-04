import { ElMessage } from 'element-plus';
import { useConfirm } from '@/composables/useConfirm';
import { useOpsResourceData, useUpdateAppStatus } from '@/composables/useOpsResource';
import {
  createApps,
  deleteApps,
  deployApps,
  getAppStructure,
  getInformation,
  modifyApps,
  restartApps,
  restartMultiApps,
  startApps,
  startMultiApps,
  stopApps,
  stopMultiApps,
  undeployApps,
  syncNodeInfo,
} from '@/api/allRequest/appAPI.js';
import { getNodesResServer } from '@/api/allRequest/verifyAPI.js';
import { formatTime } from '@/utils/dayjsUtil';
import LoadBalancerInfoDialog from '@/views/Main/RunningNodesManagerView/RunningNodesManagerDialogView/LoadBalancerInfoDialog.vue';
import UpsertRunningNodesManagerDialog from '@/views/Main/RunningNodesManagerView/RunningNodesManagerDialogView/UpsertRunningNodesManagerDialog.vue';

export const useRunningNodesManagerList = ({ t, opsResourceStore }) => {
  const { start, multiStart } = useUpdateAppStatus();
  const { setCurrentNodesRes } = opsResourceStore;

  const tableColumns = computed(() => {
    return [
      {
        label: t('name'),
        props: 'appName',
        minWidth: '10%',
      },
      {
        label: t('description'),
        props: 'appDescription',
        minWidth: '10%',
      },
      {
        label: t('port'),
        props: 'port',
        minWidth: '6%',
      },
      {
        label: t('projectType'),
        props: 'projectType',
        minWidth: '8%',
        formatter: (row) => {
          if (row.projectType === 1) {
            return t('clientProject');
          } else if (row.projectType === 0) {
            return t('calculationProject');
          } else if (row.projectType === 2) {
            return t('collectProject');
          } else if (row.projectType === 3) {
            return t('dataSourceProject');
          } else if (row.projectType === 4) {
            return t('alarmProject');
          }
        },
      },
      {
        label: t('cpuUseRate'),
        props: 'cpuUseRate',
        minWidth: '8%',
        formatter: (row) => {
          if (row.appStatus !== 'running') {
            return '';
          } else {
            return row.cpuUseRate;
          }
        },
      },
      {
        label: t('memUseRate'),
        props: 'memUseRate',
        minWidth: '8%',
        formatter: (row) => {
          if (row.appStatus !== 'running') {
            return '';
          } else {
            return row.memUseRate;
          }
        },
      },
    ];
  });
  // 响应式列表及选中行
  const dialogVisible = ref(false);
  const dialogType = ref('');
  const isLoading = ref(false); // 控制 loading 展示
  const loadingText = ref(''); // 控制 loading 文本
  const activeDialogComponent = shallowRef(null); // 当前要显示的弹窗组件
  const searchKeyword = ref(''); // 搜索数据
  const selectRows = ref([]); // 复选框选中行
  const editRowData = ref({}); // 编辑行数据
  const rowInfoData = ref({});
  const enabled = ref(false);
  const isOpen = ref(false);
  const realDataMonitor = ref(false);
  const appOverviewDialog = ref(false);
  const selectedCollect = ref(null);
  const tableRef = useTemplateRef('tableRef');
  const deployMode = ref('quick');
  //当前工程节点信息
  const currentRunningNodeEngineer = computed(() => {
    let currentRunningNode = {};
    if (opsResourceStore.currentNodeId) {
      currentRunningNode = opsResourceStore.nodeResourceData.find(
        (item) => item.nodeId === opsResourceStore.currentNodeId,
      );
    }
    return currentRunningNode;
  });
  watchEffect(async () => {
    if (opsResourceStore.currentNodeId) {
      //获取节点性能数据
      const nodeRes = await getNodesResServer({ nodeId: opsResourceStore.currentNodeId });
      if (nodeRes) {
        setCurrentNodesRes(nodeRes);
      }
    } else {
      setCurrentNodesRes(null);
    }
  });
  //多选部署状态
  const deployStatus = computed(() => {
    return selectRows.value.some((item) => item.appDeployStatus === 0);
  });
  //多选app运行状态
  const appStatus = computed(() => {
    return selectRows.value.some((item) => item.appStatus === 'running');
  });
  const selectStatus = computed(() => {
    return selectRows.value.length !== 1;
  });
  // 批量启停选择状态
  const startStopSelectStatus = computed(() => {
    return selectRows.value.length <= 0;
  });
  //是否为工程节点
  const projectIdStatus = computed(() => {
    return selectRows.value.some((item) => !item.projectId);
  });
  //检索
  const tableData = computed(() => {
    if (currentRunningNodeEngineer.value.apps) {
      const datas = currentRunningNodeEngineer.value.apps.filter((item) => {
        item.address = currentRunningNodeEngineer.value.address;
        return item.appName.toLowerCase().includes(searchKeyword.value.toLowerCase());
      });
      return transFormData(datas);
    }
    return [];
  });
  const overview = computed(() => {
    let deployNum = currentRunningNodeEngineer.value.apps?.filter((item) => item.appDeployStatus == 1).length;
    let runningNum = currentRunningNodeEngineer.value.apps?.filter((item) => item.appStatus === 'running').length;
    return {
      nodeName: currentRunningNodeEngineer.value.nodeName,
      nodeIp: currentRunningNodeEngineer.value.address,
      online: currentRunningNodeEngineer.value.nodeStatus == 'running',
      total: currentRunningNodeEngineer.value.apps?.length,
      deployed: deployNum,
      undeployed: currentRunningNodeEngineer.value.apps?.length - deployNum,
      running: runningNum,
      stopped: deployNum - runningNum,
    };
  });

  //点击展开
  const handleToggle = () => {
    isOpen.value = !isOpen.value;
  };

  // 打开指定类型弹窗
  const openDialog = async (type) => {
    dialogType.value = type;
    switch (type) {
      case 'create':
        activeDialogComponent.value = UpsertRunningNodesManagerDialog;
        dialogVisible.value = true;
        break;
      case 'edit':
        const result = await getEditRowData();
        if (result) {
          editRowData.value = result;
          enabled.value = !!editRowData.value.loadBalancerId;
          activeDialogComponent.value = UpsertRunningNodesManagerDialog;
          dialogVisible.value = true;
        } else {
          ElMessage.error(t('messageNodeErr'));
        }
        break;
      default:
        break;
    }
  };

  //编辑传参的值
  async function getEditRowData() {
    let rowData = null;
    let selectIsLoadApp = false;
    let selectLoadAppInfo = null;
    const { appId } = selectRows.value[0];
    const result = await getAppStructure(appId);
    if (result && result.code === 0) {
      const {
        data: { mainAppInfo, balancerInfo, appTreeArr },
      } = result;
      const balancerInstanceArr = [];
      appTreeArr.forEach((item) => {
        if (item.appId === appId) {
          selectIsLoadApp = true;
          selectLoadAppInfo = item;
        }
        balancerInstanceArr.push({
          id: item.appId,
          insNodeId: item.nodeId,
          insNodeName: item.appName,
          insPort: item.port,
        });
      });
      rowData = {
        appName: mainAppInfo.appName,
        balancerInstanceArr: balancerInstanceArr, //负载实例
        description: mainAppInfo.appDescription,
        loadBalancerId: balancerInfo?.appId || '', //选择的代理与负载均衡器Id
        nodeId: mainAppInfo.nodeId,
        port: mainAppInfo.port,
        project: mainAppInfo,
        wsPort: mainAppInfo.wsPort,
      };
      if (selectIsLoadApp) {
        rowData['selectLoadAppInfo'] = selectLoadAppInfo;
        rowData['selectIsLoadApp'] = selectIsLoadApp;
      }
    }
    return rowData;
  }

  // 复选框选中的行的数据改变
  const handleSelectionChange = (val) => {
    selectRows.value = val;
  };
  // 确认及取消
  const handleConfirm = async (data) => {
    loadingText.value = t('messageOperation');
    isLoading.value = true;
    if (dialogType.value === 'create') {
      //创建app
      const result = await createApps({ ...data });
      if (result && result.code === 0) {
        //延迟1500毫秒
        await delay(2500);
        //成功后更新节点内node列表
        await useOpsResourceData();
        ElMessage.success(t('messageCreateSuccess'));
        dialogVisible.value = false;
      }
    } else {
      //创建app
      const result = await modifyApps({ ...data });
      if (result && result.code === 0) {
        //延迟1500毫秒
        await delay(2500);
        //成功后更新节点内node列表
        await useOpsResourceData();
        ElMessage.success(t('messageEditSuccess'));
        dialogVisible.value = false;
      }
    }
    isLoading.value = false;
    loadingText.value = '';
  };

  //删除
  const deleteList = async () => {
    try {
      await useConfirm(t(`messageDeleteValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const { appId, appName } = selectRows.value[0];
      const result = await deleteApps({ appId, appName });
      if (result && result.code === 0) {
        //延迟1500毫秒
        await delay(2500);
        await useOpsResourceData();
        ElMessage.success(t('messageDeleteSuccess'));
      }
    } catch (error) {
      ElMessage.info(t('messageDeleteUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };

  //启动
  const startApp = async () => {
    try {
      await useConfirm(t(`messageStartValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const { appId, projectType, tenantId: solutionId, appName } = { ...selectRows.value[0] };
      const result = await startApps({ appId, projectType, solutionId, appName });
      if (result && result.code === 0) {
        const { cmdId } = result.data;
        const appStatusInfo = await start(cmdId);
        if (appStatusInfo) {
          ElMessage.success(t('messageStartSuccess'));
        } else {
          ElMessage.warning(t('messageStartTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageStartUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };

  // 批量启动
  const startMultiApp = async () => {
    try {
      await useConfirm(t(`messageStartValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const appList = selectRows.value.map((app) => {
        const { appId, projectType, tenantId: solutionId, appName } = { ...app };
        return { appId, projectType, solutionId, appName };
      });
      const result = await startMultiApps(appList);
      if (result && result.code === 0) {
        const { cmdIds } = result.data;
        const appStatusInfo = await multiStart(cmdIds);
        if (appStatusInfo) {
          ElMessage.success(t('messageStartSuccess'));
        } else {
          ElMessage.warning(t('messageStartTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageStartUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };

  //停止
  const stopApp = async () => {
    try {
      await useConfirm(t(`messageStopValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const { appId, appName } = { ...selectRows.value[0] };
      const result = await stopApps({ appId, appName });
      if (result && result.code === 0) {
        const { cmdId } = result.data;
        const appStatusInfo = await start(cmdId);
        if (appStatusInfo) {
          ElMessage.success(t('messageStopSuccess'));
        } else {
          ElMessage.warning(t('messageStopTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageStopUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };

  // 批量停止
  const stopMultiApp = async () => {
    try {
      await useConfirm(t(`messageStopValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const appList = selectRows.value.map((app) => {
        const { appId, appName } = { ...app };
        return { appId, appName };
      });
      const result = await stopMultiApps(appList);
      if (result && result.code === 0) {
        const { cmdIds } = result.data;
        const appStatusInfo = await multiStart(cmdIds);
        if (appStatusInfo) {
          ElMessage.success(t('messageStopSuccess'));
        } else {
          ElMessage.warning(t('messageStopTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageStopUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };

  //重启
  const restartApp = async () => {
    try {
      await useConfirm(t(`messageRestartValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const { appId, projectType, tenantId: solutionId, appName } = { ...selectRows.value[0] };
      const result = await restartApps({ appId, projectType, solutionId, appName });
      if (result && result.code === 0) {
        const { cmdId } = result.data;
        const appStatusInfo = await start(cmdId);
        if (appStatusInfo) {
          ElMessage.success(t('messageRestartSuccess'));
        } else {
          ElMessage.warning(t('messageRestartTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageRestartUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };

  // 批量重启
  const restartMultiApp = async () => {
    try {
      await useConfirm(t(`messageRestartValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const appList = selectRows.value.map((app) => {
        const { appId, projectType, tenantId: solutionId, appName } = { ...app };
        return { appId, projectType, solutionId, appName };
      });
      const result = await restartMultiApps(appList);
      if (result && result.code === 0) {
        const { cmdIds } = result.data;
        const appStatusInfo = await multiStart(cmdIds);
        if (appStatusInfo) {
          ElMessage.success(t('messageRestartSuccess'));
        } else {
          ElMessage.warning(t('messageRestartTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageRestartUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };

  //部署
  const deployProject = async () => {
    try {
      await useConfirm(t(`messageDeployValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const { appId, projectType, tenantId: solutionId, appName } = { ...selectRows.value[0] };
      const result = await deployApps({ appId, projectType, solutionId, appName, deployMode: deployMode.value });
      if (result && result.code === 0) {
        const { cmdId } = result.data;
        const appStatusInfo = await start(cmdId);
        if (appStatusInfo) {
          ElMessage.success(t('messageDeploySuccess'));
        } else {
          ElMessage.warning(t('messageDeployTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageDeployUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };

  //重新部署
  const reDeployProject = async () => {
    try {
      await useConfirm(t(`messageRedeployValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const { appId, projectType, tenantId: solutionId, appName } = { ...selectRows.value[0] };
      const result = await deployApps({ appId, projectType, solutionId, appName, deployMode: deployMode.value });
      //延迟1500毫秒
      await delay(2500);
      if (result && result.code === 0) {
        const { cmdId } = result.data;
        const appStatusInfo = await start(cmdId);
        if (appStatusInfo) {
          ElMessage.success(t('messageRedeploySuccess'));
        } else {
          ElMessage.warning(t('messageRedeployTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageRedeployUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };

  //撤销部署
  const RevokeDeployProject = async () => {
    try {
      await useConfirm(t(`messageRvdeployValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const { appId, appName } = { ...selectRows.value[0] };
      const result = await undeployApps({ appId, appName });
      if (result && result.code === 0) {
        const { cmdId } = result.data;
        const appStatusInfo = await start(cmdId);
        if (appStatusInfo) {
          ElMessage.success(t('messageRvdeploySuccess'));
        } else {
          ElMessage.warning(t('messageRvdeployTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageRvdeployUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };
  //延迟
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  //查看按钮
  async function handleClick(row) {
    const { appId } = row;
    const result = await getInformation(appId);
    if (result && result.code === 0) {
      const {
        balancerInfo: { appName: balancerAppName, nodeId },
        loadAccess,
        appTreeArr,
      } = result.data;
      let balancerNodeName = '';
      if (opsResourceStore.nodeResourceData && opsResourceStore.nodeResourceData.length) {
        balancerNodeName = opsResourceStore.nodeResourceData.find((item) => item.nodeId === nodeId)?.nodeName || '';
      }
      rowInfoData.value = {
        balancerAppName,
        balancerNodeName,
        loadAccess,
        appTreeArr,
      };
      activeDialogComponent.value = LoadBalancerInfoDialog;
      dialogVisible.value = true;
    } else {
      ElMessage.error(t('messageLoadOrProxyErr'));
    }
  }
  function formatRunningTime(row) {
    return row.appStatus === 'running' && row.startTime ? formatTime(row.startTime) : '';
  }
  const transFormData = (data) => {
    const result = [];
    const parentMap = new Map();
    data.forEach((item) => {
      //判断是否负载app
      if (item.isLoadApp) {
        const parentItem = {
          address: item.address,
          appName: item.execFileName,
          appId: `${item.projectId}-parent`,
          id: `${item.projectId}-parent`,
          children: [],
        };
        parentMap.set(item.projectId, parentItem);
        if (!result.some((el) => el.id === parentItem.id)) {
          result.push(parentItem);
        }
      } else {
        if (data.filter((apps) => apps.projectName === item.appName).length < 2) {
          const parentItem = {
            ...item,
            id: `${item.projectId}-parent`,
            children: [],
          };
          parentMap.set(item.projectId, parentItem);
          result.push(parentItem);
        }
      }
    });
    data.forEach((item) => {
      const parent = parentMap.get(item.projectId);
      if (parent && item.projectName === parent.appName) {
        const currentParent = result.find((el) => el.id === parent.id);
        if (currentParent) {
          if (item.isLoadApp) {
            currentParent.children.push({
              ...item,
              id: `${item.projectId}-child-${item.appName}`,
            });
          } else {
            if (data.filter((apps) => apps.projectName === item.appName).length > 1) {
              currentParent.children.push({
                ...item,
                id: `${item.projectId}-child-${item.appName}`,
              });
            }
          }
        }
      }
    });
    return result;
  };
  const handleMonitorCollectProject = (data) => {
    selectedCollect.value = data;
    realDataMonitor.value = true;
  };
  const handleCloseCollectMonitor = (val) => {
    realDataMonitor.value = val;
  };
  const handleSyncNodeInfo = async (nodeName) => {
    try {
      await useConfirm(t(`messageSyncNodeInfo`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      const result = await syncNodeInfo(nodeName);
      if (result && result.code === 0) {
        const { cmdId } = result.data;
        const appStatusInfo = await start(cmdId);
        if (appStatusInfo) {
          ElMessage.success(t('messageSyncNodeSuccess'));
        } else {
          ElMessage.warning(t('messageSyncNodeTimeout'));
        }
      }
    } catch (error) {
      ElMessage.info(t('messageRvdeployUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };
  // BUG29564 运维中心工程存在负载时,展开行父节点勾选框隐藏
  const handleTableRowClassName = (data) => {
    return data.row.children && data.row.children.length ? 'parentRow' : '';
  };
  const handleSelectable = (row) => {
    return !(row.children && row.children.length);
  };
  const handleTableRowClick = (row, column, e, selectedMap) => {
    // 点击展开行时, 取消其选中状态
    if (row.children && row.children.length) {
      tableRef.value.getTableRef().toggleRowSelection(row, false);
      selectedMap.delete(row['appId']);
      selectRows.value = Array.from(selectedMap.values());
    }
  };
  // BUG29565 运维中心app管理增加全选
  const handleSelectAll = (selection, selectedMap) => {
    if (selection.length > 0) {
      selectedMap.clear();
      selection.forEach((row) => {
        selectedMap.set(row['appId'], row);
      });
      selectRows.value = Array.from(selectedMap.values());
    } else {
      selectedMap.clear();
      selectRows.value = [];
    }
  };
  return {
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
    selectedCollect,
    overview,
    handleToggle,
    openDialog,
    handleSelectionChange,
    handleConfirm,
    deleteList,
    startApp,
    startMultiApp,
    stopApp,
    stopMultiApp,
    restartApp,
    restartMultiApp,
    deployProject,
    reDeployProject,
    RevokeDeployProject,
    handleClick,
    formatRunningTime,
    handleMonitorCollectProject,
    handleCloseCollectMonitor,
    handleSyncNodeInfo,
    handleTableRowClassName,
    handleSelectable,
    handleTableRowClick,
    handleSelectAll,
  };
};
