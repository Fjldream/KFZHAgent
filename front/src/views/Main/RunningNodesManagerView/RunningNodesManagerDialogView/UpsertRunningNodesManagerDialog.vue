<script setup>
import { ElMessage } from 'element-plus';
import { nextTick, reactive } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { regexValidator } from '@/utils/regexRules';
import { getGuid } from '@/utils/nanoID';
import { fileResourceData } from '@/api/allRequest/verifyAPI.js';
import { useOpsResourceStore } from '@/stores/opsResourceStore';
import { useSystemConfigStore } from '@/stores/systemConfigStore.js';
import { handleProjectInfoServer } from '@/api/allRequest/variablesCollect';

import CustomIcon from '@/components/Icons/CustomIcon.vue';
import CustomDialog from '@/components/CustomDialog/CustomDialog.vue';
import CustomStyleTable from '@/components/CustomStyleTable/CustomStyleTable.vue';

const { t } = useI18n();

const systemConfigStore = useSystemConfigStore();
const disallowedPorts = [
  '5566',
  '6376',
  '7000',
  '11001',
  '11002',
  '11003',
  '11004',
  '11005',
  '11006',
  '11007',
  '11008',
  '11009',
  '12000',
  '12001',
  '12002',
  '13000',
];
const opsResourceStore = useOpsResourceStore();
// 表单
const props = defineProps({
  dialogVisible: Boolean,
  rowData: Object,
});
const projectVisible = ref(false); //工程选择弹窗显隐
//通用正则
const formRules = reactive({
  appName: [regexValidator('safaText', t('rulesName'))],
  port: [
    regexValidator('rangePort', t('rulesPort')),
    {
      validator: (rule, value, callback) => {
        if (disallowedPorts.includes(value)) {
          return callback(new Error(t('disallowedPorts', { name: value })));
        }
        callback();
      },
      trigger: ['change', 'blur'],
    },
  ],
  wsPort: [
    regexValidator('rangePort', t('rulesPort')),
    {
      validator: (rule, value, callback) => {
        if (form.project?.projectType != 2 || chooseCollectOs.value == 'Linux') {
          return callback();
        }
        if (form.port === form.wsPort) {
          return callback(new Error(t('restfulPortErr')));
        }
        if (disallowedPorts.includes(value)) {
          return callback(new Error(t('disallowedPorts', { name: value })));
        }
        callback();
      },
      trigger: ['change', 'blur'],
    },
  ],
  description: [regexValidator('', t('rulesDescription'), false)],
  insPort: [
    regexValidator('rangePort', t('rulesPort')),
    {
      validator: (rule, value, callback) => {
        if (disallowedPorts.includes(value)) {
          return callback(new Error(t('disallowedPorts', { name: value })));
        }
        callback();
      },
      trigger: ['change', 'blur'],
    },
  ],
});
// 表单控件
const formRef = ref(null);
const defaultForm = {
  appName: '',
  balancerInstanceArr: [], //负载实例
  bootOrder: 0,
  description: '',
  execVersion: '1.0.0.1',
  loadBalancerId: '', //选择的代理与负载均衡器Id
  nodeId: '',
  port: '',
  wsPort: '',
  project: null,
  selectIsLoadApp: false,
  selectLoadAppInfo: null,
};
//表格添加负载实例单独计数
const counters = ref({});
const publishProjects = ref([]); //发布工程列表
const groupTypeMap = {
  0: { text: t('calculationProject'), showPath: 'calculationProject' },
  2: { text: t('collectProject'), showPath: 'collectProject' },
  1: { text: t('clientProject'), showPath: 'clientProject' },
  3: { text: t('dataSourceProject'), showPath: 'dataSourceProject' },
  4: { text: t('alarmProject'), showPath: 'alarmProject' },
}; //默认选择工程列表
const selectedProject = ref(null);
const currentGroupName = ref(null);
const search = ref('');
const projectTreeRef = ref();
const form = reactive(props.rowData.dialogType === 'edit' ? { ...defaultForm, ...props.rowData } : { ...defaultForm });
const enabled = ref(props.rowData.dialogType === 'edit' ? props.rowData.enabled : false);
const proxyPath = ref(props.rowData.dialogType === 'edit' && props.rowData.enabled ? form.appName : ''); //代理路径

//代理与负载列表
const loadBalancerList = computed(() => {
  return opsResourceStore.balancerResourceData;
});
//节点列表
const loadNodeList = computed(() => {
  return opsResourceStore.nodeResourceData.filter((item) => item.nodeStatus === 'running');
});
//发布工程组
const treeMenuData = computed(() => {
  const map = new Map();
  const cpData = [...publishProjects.value].sort((a, b) => {
    return [1, 3, 0, 4, 2].indexOf(a.groupType) - [1, 3, 0, 4, 2].indexOf(b.groupType);
  });
  for (const group of cpData) {
    const type = group.groupType;
    const groupType = groupTypeMap[type];
    const typeName = groupType.text || 'unknown';
    if (systemConfigStore.mainRoutesConfig.every((row) => groupType.showPath.search(row) === -1)) {
      continue;
    }
    if (!map.has(type)) {
      let icon = '';
      switch (type) {
        case 0:
          icon = 'calculationEngineer';
          break;
        case 1:
          icon = 'clientEngineer';
          break;
        case 2:
          icon = 'collectEngineer';
          break;
        case 3:
          icon = 'dataSourceEngineer';
          break;
        case 4:
          icon = 'alarmEngineer';
          break;
        default:
          break;
      }
      map.set(type, {
        label: typeName,
        type,
        icon,
        children: [],
      });
    }
    map.get(type).children.push({
      label: group.groupName === '默认工程组' ? t('defaultProgroupName') : group.groupName,
      groupName: groupType.text + '/' + group.groupName,
      projectList: group.projectList || [],
    });
  }
  for (const key in groupTypeMap) {
    const groupType = groupTypeMap[key];
    if (systemConfigStore.mainRoutesConfig.every((row) => groupType.showPath.search(row) === -1)) {
      delete groupTypeMap[key];
    }
  }
  Object.entries(groupTypeMap).forEach(([type, groupType]) => {
    if (!map.has(Number(type))) {
      map.set(Number(type), { label: groupType.text, type: Number(type), children: [] });
    }
  });
  return [...map.values()];
});
//根组下面工程
const projectTreeData = computed(() => {
  const rawData = [...publishProjects.value];
  if (!currentGroupName.value) {
    return [];
  }
  const appTypeName = currentGroupName.value.split('/')[0];
  const groupName = currentGroupName.value.split('/')[1];
  const match = rawData.find(
    (group) => group.groupName === groupName && groupTypeMap[group.groupType].text === appTypeName,
  );
  if (match) {
    return match.projectList.map((item) => ({
      label: item.projectName,
      projectId: item.projectId,
      ...item,
    }));
  } else {
    return [];
  }
});
//搜索
const filteredProjectTreeData = computed(() => {
  const keyWord = search.value.trim().toLowerCase();
  if (!keyWord) return projectTreeData.value;
  return projectTreeData.value.filter((project) => {
    return project.label.toLowerCase().includes(keyWord);
  });
});
//工程类型
const projectText = computed(() => {
  return groupTypeMap[form.project?.projectType]?.text || '';
});
//添加负载使能
const addProxyDisabled = computed(() => {
  const { loadBalancerId, appName, project } = form;
  const isEdit = props.rowData.dialogType === 'edit';
  const restrictedTypes = [1, 2, 4];
  return !enabled.value || !loadBalancerId || !appName || isEdit || restrictedTypes.includes(project?.projectType);
});
const emit = defineEmits(['update:dialogVisible', 'confirm']);
const chooseCollectOs = ref('');

nextTick(async () => {
  if (props.rowData.dialogType === 'edit' && form.project.projectType == 2) {
    const data = await handleProjectInfoServer({ projectId: form.project.projectId });
    if (data.errorCode === 0) {
      chooseCollectOs.value = data.data.osType;
    }
  }
});

//切换代理与负载均衡器类型
const selectedChange = (val) => {
  //设置代理路径
  proxyPath.value = form.appName;
  nextTick(() => {
    formRef.value.clearValidate();
  });
};

const emitConfirm = () => {
  try {
    formRef.value.validate((valid, errorFields) => {
      if (valid) {
        const formData = { ...form };

        if (!enabled.value) {
          formData.balancerInstanceArr = [];
          formData.loadBalancerId = '';
        }
        if (props.rowData.dialogType === 'edit') {
          formData.appId = formData.project.appId;
          delete formData.project;
        }
        delete formData.enabled;
        delete formData.dialogType;
        emit('confirm', formData);
      }
    });
  } catch (error) {}
};
//删除一组数据
/**
 * @function deleteList
 * @description 删除参数函数事件
 * @param {Object} row 行数据
 * @returns null
 */
function deleteList(row) {
  form.balancerInstanceArr = form.balancerInstanceArr.filter((item) => item.id !== row.id);
}
//添加一组数据
/**
 * @function handleAddParam
 * @description 添加新参数
 * @returns null
 */
function handleAddParam() {
  form.balancerInstanceArr.push({
    id: getGuid(),
    insNodeId: '',
    insNodeName: '',
    insPort: '',
  });
}
//选择已发布工程部署
async function selectFile() {
  const fileResourceInfo = await fileResourceData();
  if (fileResourceInfo.code === 0) {
    publishProjects.value = fileResourceInfo.data.projectResource;
    projectVisible.value = true;
  } else {
    // 失败，提示错误信息
    ElMessage({
      message: t('messageProjectInfoError'),
      type: 'error',
    });
  }
}
//选择工程确认
function handleSave() {
  if (selectedProject.value) {
    const selectedProjectObj = { ...selectedProject.value };
    form.nodeId = opsResourceStore.currentNodeId;
    form.appName = selectedProjectObj.projectName;
    form.project = selectedProjectObj;
    form.loadBalancerId = '';
    proxyPath.value = '';
    enabled.value = false;
    selectedProject.value = null;
    projectVisible.value = false;
  } else {
    ElMessage({
      message: t('messageSelectProject'),
      type: 'info',
    });
  }
}
//点击组
function handleGroupClick(node) {
  if (node.projectList) {
    currentGroupName.value = node.groupName;
  } else {
    currentGroupName.value = '';
  }
}
//选择某个工程
function handleProjectSelect(data, node) {
  selectedProject.value = data;
}
//负载实例选框
function handleInsChange(row, val) {
  if (!counters.value[val]) {
    counters.value[val] = 1;
  } else {
    counters.value[val]++;
  }
  const label = loadNodeList.value.find((item) => item.nodeId === row.insNodeId)?.nodeName || '';
  row.insNodeName = `${label}.${form.appName}_${counters.value[val]}`;
}

watch(
  () => form.appName,
  async (newValue, oldValue) => {
    if (form.project.projectType == 2) {
      const data = await handleProjectInfoServer({ projectId: form.project.projectId });
      if (data.errorCode === 0) {
        chooseCollectOs.value = data.data.osType;
      }
    }
  },
);
</script>

<template>
  <CustomDialog
    :dialogVisible="dialogVisible"
    :title="props.rowData.dialogType === 'edit' ? t('editApp') : t('addApp')"
    :width="720"
    @confirm="emitConfirm"
    @update:dialogVisible="emit('update:dialogVisible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="formRules" :validate-on-rule-change="false" label-width="auto">
      <div class="upper-portion">
        <!-- 基本配置 -->
        <el-form-item>
          <el-divider direction="vertical" />
          <span>{{ t('basicConfiguration') }}</span>
        </el-form-item>
        <el-form-item :label="t('name')" prop="appName">
          <div class="flex-2">
            <el-input v-model="form.selectLoadAppInfo.appName" disabled v-if="form.selectIsLoadApp" />
            <el-input v-model="form.appName" disabled v-else />
            <el-button plain v-if="props.rowData.dialogType !== 'edit'" type="primary" @click="selectFile">
              {{ t('select') }}
            </el-button>
          </div>
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="t('port')" prop="port">
              <el-input v-model="form.selectLoadAppInfo.port" v-if="form.selectIsLoadApp" disabled />
              <el-input v-model="form.port" v-else />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('projectType')">
              <el-input disabled v-model="projectText" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20" v-if="form.project?.projectType === 2 && chooseCollectOs === 'Windows'">
          <el-col :span="12">
            <el-form-item :label="t('restfulPort')" prop="wsPort">
              <el-input v-model="form.wsPort" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('description')" prop="description">
          <el-input v-model="form.description" />
        </el-form-item>
        <!-- 指定代理与负载均衡器 -->
        <el-form-item v-if="props.rowData.dialogType !== 'edit'">
          <el-divider direction="vertical" />
          <span>{{ t('specifiedProxyLB') }}</span>
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12" v-if="props.rowData.dialogType !== 'edit'">
            <el-form-item :label="t('start')">
              <el-switch
                :disabled="props.rowData.dialogType === 'edit' || form.project?.projectType === 2"
                v-model="enabled"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12" v-if="props.rowData.dialogType !== 'edit'">
            <el-form-item :label="t('proxyOrLoad')">
              <el-select
                :disabled="!enabled || props.rowData.dialogType === 'edit'"
                v-model="form.loadBalancerId"
                :placeholder="t('pleaseSelect')"
                @change="selectedChange"
              >
                <el-option
                  v-for="item in loadBalancerList"
                  :key="item.appId"
                  :label="item.appName"
                  :value="item.appId"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('proxyPath')" v-if="props.rowData.dialogType !== 'edit'">
          <el-input disabled v-model="proxyPath" />
        </el-form-item>
      </div>
      <!-- 生成分担负载实例 -->
      <el-form-item v-if="props.rowData.dialogType !== 'edit'">
        <el-divider direction="vertical" />
        <span>{{ t('creatLoadInstance') }}</span>
      </el-form-item>
      <el-row :gutter="20" v-if="props.rowData.dialogType !== 'edit'">
        <el-col :span="24">
          <div class="param-list-con">
            <CustomStyleTable
              :showPagination="false"
              :tableData="form.balancerInstanceArr"
              maxHeight="calc(30vh - 50px)"
            >
              <el-table-column :label="t('index')" align="center" show-overflow-tooltip type="index" width="100" />
              <el-table-column :label="t('selectLoadNodeInstance')" align="center" show-overflow-tooltip>
                <template #default="scope">
                  <el-select
                    v-model="scope.row.insNodeId"
                    :placeholder="t('pleaseSelect')"
                    @change="(val) => handleInsChange(scope.row, val)"
                    :disabled="props.rowData.dialogType === 'edit'"
                  >
                    <el-option
                      v-for="item in loadNodeList"
                      :key="item.nodeId"
                      :label="item.nodeName"
                      :value="item.nodeId"
                    ></el-option>
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column :label="t('instancePort')" align="center" prop="insPort" show-overflow-tooltip>
                <template #default="{ row, $index }">
                  <el-form-item :prop="`balancerInstanceArr.${$index}.insPort`" :rules="formRules.insPort">
                    <el-input :disabled="props.rowData.dialogType === 'edit'" v-model="row.insPort"></el-input>
                  </el-form-item>
                </template>
              </el-table-column>
              <el-table-column :label="t('operation')" align="center" show-overflow-tooltip>
                <template #default="scope">
                  <el-button
                    :disabled="props.rowData.dialogType === 'edit'"
                    type="danger"
                    @click="deleteList(scope.row)"
                  >
                    {{ t('delete') }}
                  </el-button>
                </template>
              </el-table-column>
            </CustomStyleTable>
            <div
              :class="[
                'add-param-btn',
                {
                  'add-param-btn-disabled': addProxyDisabled,
                },
              ]"
              @click="handleAddParam"
            >
              <el-icon>
                <IEpCirclePlusFilled />
              </el-icon>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-form>
  </CustomDialog>
  <CustomDialog
    v-if="projectVisible"
    v-model:dialogVisible="projectVisible"
    :title="t('selectProject')"
    :width="600"
    @confirm="handleSave"
  >
    <div class="dialog-container-project">
      <el-row :gutter="0">
        <el-col :span="10">
          <div class="left-tree">
            <el-tree
              :data="treeMenuData"
              :props="{ label: 'label', children: 'children' }"
              default-expand-all
              highlight-current
              node-key="groupName"
              @node-click="handleGroupClick"
            >
              <template #default="{ node, data }">
                <div class="df w-100">
                  <CustomIcon v-if="data.icon" :name="data.icon" />
                  <span class="menu-label">{{ node.label }}</span>
                </div>
              </template>
            </el-tree>
          </div>
        </el-col>
        <el-col :span="14">
          <div class="right-tree">
            <el-input
              v-model="search"
              :placeholder="t('searchKeywork')"
              clearable
              :prefix-icon="Search"
              class="search-input"
              size="default"
            />
            <el-tree
              :data="filteredProjectTreeData"
              :props="{ label: 'label', children: 'children' }"
              default-expand-all
              highlight-current
              node-key="projectId"
              @node-click="handleProjectSelect"
              ref="projectTreeRef"
            >
            </el-tree>
          </div>
        </el-col>
      </el-row>
    </div>
  </CustomDialog>
</template>
<style lang="scss" scoped>
.el-divider--vertical {
  border-left: 4px #48a2ff var(--el-border-style);
}
.dialog-container-project {
  .left-tree {
    padding: 5px;
    height: 400px;
    border: 1px solid #eee;
    overflow-y: auto;
  }
  .right-tree {
    padding: 5px;
    height: 400px;
    border: 1px solid #eee;
    border-left: none;
    overflow-y: auto;
    .el-tree {
      overflow: auto;
      height: calc(100% - 37px);
    }
  }
  .el-input {
    padding-bottom: 5px;
  }
  .menu-label {
    margin-left: 10px;
    font-weight: 700;
  }
  .el-tree-node__children {
    .menu-label {
      font-weight: 400;
    }
  }
}

.upper-portion {
  .el-checkbox {
    margin-right: 15px;
  }

  .el-form-item {
    margin-bottom: 15px;
  }

  .el-form-item__label {
    font-size: 14px;
    margin: 0 0 0 15px;
  }

  .el-input__wrapper {
    font-size: 13px;
    min-height: 32px !important;
  }
  .flex-2 {
    display: flex;
    width: 100%;
  }
}
.param-list-con {
  width: 100%;
  border: none;
  min-height: calc(30vh - 10px);
  max-height: calc(30vh - 10px);
  padding: 0 0 0 20px;

  ::v-deep(.el-table) {
    font-size: 13px;
    .el-table__body .el-table__row:hover {
      background-color: #fff !important;
    }
    .el-table .el-table__cell {
      padding: 2px 0 !important;
    }
  }
  .el-form-item {
    margin: 15px 0;
  }
  .add-param-btn {
    width: 100%;
    border: 1px dashed rgb(24, 144, 255);
    height: 36px;
    background: rgba(24, 144, 255, 0.2);
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    &:hover {
      background: rgba(24, 144, 255, 0.4);
    }
  }
  .add-param-btn-disabled {
    pointer-events: none;
    opacity: 0.5;
  }
  .el-icon {
    font-size: 15px;
    color: rgb(24, 144, 255);
  }
  .el-button {
    height: 28px;
  }
}
</style>
