import { useI18n } from 'vue-i18n';
import { shallowRef } from 'vue';
import { useConfirm } from '@/composables/useConfirm';
import { appStructure, addBalancer, modifyBalancer, removeBalancer } from '@/api/allRequest/nginxAPI';
import { deployApps, undeployApps } from '@/api/allRequest/appAPI.js';
import { useOpsResourceData, useUpdateAppStatus } from '@/composables/useOpsResource';
import { useOpsResourceStore } from '@/stores/opsResourceStore';
// 导入所有对话框组件
import UpsertLoadBalancerDialog from '@/views/Main/LoadBalancerView/LoadBalancerDialogView/UpsertLoadBalancerDialog.vue';
export const useLoadBalancerList = () => {
  const { t } = useI18n();
  const opsResourceStore = useOpsResourceStore();
  const { start } = useUpdateAppStatus();
  const tableColumns = computed(() => {
    return [
      {
        label: t('name'),
        props: 'appName',
        minWidth: '20%',
      },
      {
        label: t('description'),
        props: 'appDescription',
        minWidth: '25%',
      },
      {
        label: t('listeningPort'),
        props: 'port',
        minWidth: '15%',
      },
      {
        label: t('loadBalancerOrProxyNode'),
        props: 'runningNode',
        minWidth: '20%',
      },
    ];
  });

  const infoTableColumns = computed(() => {
    return [
      {
        label: t('proxyPath'),
        props: 'proxyPath',
        minWidth: '20%',
      },
      {
        label: t('loadOrProxyNode'),
        props: 'loadNodeName',
        minWidth: '20%',
      },
      {
        label: t('loadOrProxyApp'),
        props: 'appName',
        minWidth: '20%',
      },
      {
        label: t('appPort'),
        props: 'appPort',
        minWidth: '20%',
      },
    ];
  });
  // 响应式列表及选中行
  const dialogVisible = ref(false);
  const dialogType = ref('');
  const isLoading = ref(false); // 控制 loading 展示
  const loadingText = ref(''); // 控制 loading 文本
  const activeDialogComponent = shallowRef(null); // 当前要显示的弹窗组件
  const tableInfoData = ref([]);

  // 搜索数据
  const searchKeyword = ref('');
  const currentId = ref('');
  // 选中行
  const currentRows = computed(() => {
    return tableData.value.find((item) => item.appId === currentId.value);
  });
  const editRowData = ref({});

  //检索
  const tableData = computed(() => {
    if (opsResourceStore.balancerResourceData && opsResourceStore.balancerResourceData.length) {
      return opsResourceStore.balancerResourceData.filter((item) =>
        item.appName.toLowerCase().includes(searchKeyword.value.toLowerCase()),
      );
    } else {
      return [];
    }
  });
  // 打开指定类型弹窗
  const openDialog = async (type) => {
    dialogType.value = type;
    switch (type) {
      case 'edit':
        editRowData.value = getEditRowData();
        break;
      default:
        break;
    }
    activeDialogComponent.value = UpsertLoadBalancerDialog;
    dialogVisible.value = true;
  };
  //编辑时处理数据
  function getEditRowData() {
    const {
      appName: name,
      port,
      nodeId,
      runningNode: nodeName,
      appDescription: description,
      netType: httpType,
      SSLCertificate: SSLCertificatePath,
      SSLKey: SSLKeyPath,
      appId,
    } = currentRows.value;
    return {
      name,
      port,
      nodeId,
      nodeName,
      description,
      httpType,
      SSLCertificatePath,
      SSLKeyPath,
      appId,
    };
  }
  // 确认及取消
  const handleConfirm = async (data) => {
    const formData = new FormData();
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        formData.append(key, data[key]);
      }
    }
    if (dialogType.value === 'create') {
      const result = await addBalancer(formData);
      if (result && result.code === 0) {
        //成功后更新节点内node列表
        await useOpsResourceData();
        ElMessage.success(t('messageCreateSuccess'));
      }
    } else {
      const result = await modifyBalancer(formData);
      if (result && result.code === 0) {
        //成功后更新节点内node列表
        await useOpsResourceData();
        ElMessage.success(t('messageEditSuccess'));
      }
    }
    dialogVisible.value = false;
  };
  // 复选框选中的行的数据改变
  const handleTableRowClick = async (val) => {
    currentId.value = val.appId;
    const result = await getAppStructureData();
    if (result) {
      tableInfoData.value = result;
    } else {
      ElMessage.error(t('messageLoadOrProxyErr'));
    }
  };
  //选中代理获取代理的节点信息
  async function getAppStructureData() {
    let rowData = null;
    const { appId } = currentRows.value;
    const result = await appStructure(appId);
    if (result && result.code === 0) {
      const { data } = result;
      let appArr = [];
      data.forEach((loadAppInfo) => {
        const { appName: proxyPath, loadAppArr } = loadAppInfo;
        appArr = [...appArr, ...loadAppArr.map((item) => ({ ...item, proxyPath }))];
      });
      rowData = appArr;
    }
    return rowData;
  }

  //删除
  const deleteList = async () => {
    try {
      await useConfirm(t('messageDeleteLBValue'), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      // 模拟异步发布操作
      await new Promise(async (resolve) => {
        const { appId } = currentRows.value;
        const result = await removeBalancer({ appId });
        //延迟1500毫秒
        await delay(2500);
        if (result && result.code === 0) {
          await useOpsResourceData();
          ElMessage.success(t('messageDeleteSuccess'));
        } else {
          ElMessage.error(result.message);
        }
        resolve();
      });
    } catch (error) {
      ElMessage.info(t('messageDeleteUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };
  //部署
  const deployProject = async () => {
    try {
      await useConfirm(t('messageDeployLBValue'), t('messageTitle'));
      loadingText.value = t('messageDelLBSuccess');
      isLoading.value = true;
      // 模拟异步发布操作
      await new Promise(async (resolve) => {
        const { appId } = currentRows.value;
        const result = await deployApps({ appId });
        if (result && result.code === 0) {
          const { cmdId } = result.data;
          const appStatusInfo = await start(cmdId);
          if (appStatusInfo) {
            await useOpsResourceData();
            ElMessage.success(t('messageDeploySuccess'));
          } else {
            ElMessage.success(t('messageDeployTimeout'));
          }
        } else {
          ElMessage.error(result.message);
        }
        resolve();
      });
    } catch (error) {
      ElMessage.info(t('messageDeployUndo'));
    } finally {
      isLoading.value = false;
      loadingText.value = '';
    }
  };
  //撤销部署
  const RevokeDeployProject = async () => {
    try {
      await useConfirm(t(`messageRvdeployLBValue`), t('messageTitle'));
      loadingText.value = t('messageOperation');
      isLoading.value = true;
      // 模拟异步发布操作
      await new Promise(async (resolve) => {
        const { appId } = currentRows.value;
        const result = await undeployApps({ appId });
        if (result && result.code === 0) {
          const { cmdId } = result.data;
          const appStatusInfo = await start(cmdId);
          if (appStatusInfo) {
            await useOpsResourceData();
            ElMessage.success(t('messageRvdeploySuccess'));
          } else {
            ElMessage.success(t('messageRvdeployTimeout'));
          }
        } else {
          ElMessage.error(result.message);
        }
        resolve();
      });
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
  return {
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
  };
};
