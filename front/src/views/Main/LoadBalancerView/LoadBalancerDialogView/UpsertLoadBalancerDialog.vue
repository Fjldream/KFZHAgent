<script setup>
import { useI18n } from 'vue-i18n';
import { regexValidator } from '@/utils/regexRules';
import { useOpsResourceStore } from '@/stores/opsResourceStore';
import CustomDialog from '@/components/CustomDialog/CustomDialog.vue';

const { t } = useI18n();
const opsResourceStore = useOpsResourceStore();
const props = defineProps({
  dialogVisible: Boolean,
  rowData: Object,
});
const emit = defineEmits(['update:dialogVisible', 'confirm']);
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
// 表单控件
const formRef = ref(null);
const rules = reactive({
  name: [regexValidator('safaText', t('rulesName'))],
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
  nodeName: [regexValidator('notEmpty', t('rulesNodeName'))],
  description: [regexValidator('', t('rulesDescription'), false)],
  showSSLCrt: [regexValidator('notEmpty', t('rulesSSLCrt'))],
  showSSLKey: [regexValidator('notEmpty', t('rulesSSLKey'))],
});

const defaultForm = {
  name: '',
  port: '',
  nodeId: '',
  nodeName: '',
  description: '',
  httpType: '1',
  SSLCertificatePath: '',
  showSSLCrt: '',
  SSLCertificate: '',
  SSLKeyPath: '',
  showSSLKey: '',
  SSLKey: '',
  appId: '',
};
const form = reactive(props.rowData.dialogType === 'edit' ? { ...defaultForm, ...props.rowData } : { ...defaultForm });
if (props.rowData.dialogType === 'edit') {
  form.showSSLCrt = getFileNameFromPath(form.SSLCertificatePath);
  form.showSSLKey = getFileNameFromPath(form.SSLKeyPath);
}
const nodeVisible = ref(false); //节点选择弹窗显隐
const selectedNode = ref(null);

const nodeInfotreeData = computed(() => {
  return opsResourceStore.nodeResourceData
    .filter((item) => item.nodeStatus === 'running')
    .map((node) => ({ nodeId: node.nodeId, nodeName: node.nodeName }));
});
const crtUploadRef = ref(null);
const keyUploadRef = ref(null);
const protocalOption = [
  {
    value: '1',
    label: 'https',
  },
  {
    value: '0',
    label: 'http',
  },
];
//正则根据复选框变化
const formRules = computed(() => {
  if (form.httpType === '1') {
    rules.showSSLCrt = [regexValidator('notEmpty', t('rulesSSLCrt'))];
    rules.showSSLKey = [regexValidator('notEmpty', t('rulesSSLKey'))];
  } else {
    delete rules.showSSLCrt;
    delete rules.showSSLKey;
  }
  return rules;
});
// 文件上传
const crtFileChange = async (file) => {
  form.showSSLCrt = file.name;
  form.SSLCertificate = file.raw;
};

const crtExceedHandle = (files) => {
  crtUploadRef.value?.clearFiles();
  const file = files[0];
  crtploadRef.value?.handleStart(file);
};
//选择node
function selectNode() {
  selectedNode.value = null;
  nodeVisible.value = true;
}
//选择某个工程
function handleNodeSelect(data, node) {
  selectedNode.value = data;
}
//选择工程确认
function handleSave() {
  if (selectedNode.value) {
    const selectedNodeObj = { ...selectedNode.value };
    form.nodeId = selectedNodeObj.nodeId;
    form.nodeName = selectedNodeObj.nodeName;
    selectedNode.value = null;
    nodeVisible.value = false;
  } else {
    ElMessage({
      message: t('messageSelectNode'),
      type: 'info',
    });
  }
}
// 文件上传
const keyFileChange = async (file) => {
  form.showSSLKey = file.name;
  form.SSLKey = file.raw;
};

const keyExceedHandle = (files) => {
  keyUploadRef.value?.clearFiles();
  const file = files[0];
  keyUploadRef.value?.handleStart(file);
};
const emitConfirm = () => {
  formRef.value.validate((valid, errorFields) => {
    if (valid) {
      const formData = { ...form };
      //当http时不传证书及秘钥
      if (formData.httpType === '0') {
        delete formData.SSLCertificate;
        delete formData.SSLKey;
        delete formData.SSLCertificatePath;
        delete formData.SSLKeyPath;
      }
      if (props.rowData.dialogType !== 'edit') {
        delete formData.appId;
      } else {
        if (formData.httpType === '1') {
          if (formData.SSLCertificate) {
            delete formData.SSLCertificatePath;
          } else {
            delete formData.SSLCertificate;
          }
          if (formData.SSLKey) {
            delete formData.SSLKeyPath;
          } else {
            delete formData.SSLKey;
          }
        }
      }
      delete formData.showSSLCrt;
      delete formData.showSSLKey;
      delete formData.nodeName;
      emit('confirm', formData);
    }
  });
};
function getFileNameFromPath(path) {
  if (!path) return '';
  return path
    .replace(/[/\\]+/g, '/')
    .split('/')
    .pop();
}
</script>
<template>
  <CustomDialog
    :dialogVisible="dialogVisible"
    :title="form.id ? t('editLoadBalancer') : t('addLoadBalancer')"
    :width="420"
    @confirm="emitConfirm"
    @update:dialogVisible="emit('update:dialogVisible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="formRules" :validate-on-rule-change="false" label-width="auto">
      <el-form-item :label="t('protocol')">
        <el-select v-model="form.httpType" :placeholder="t('pleaseSelect')">
          <el-option
            v-for="item in protocalOption"
            :key="item.label"
            :label="item.label"
            :value="item.value"
          ></el-option>
        </el-select>
      </el-form-item>
      <el-form-item :label="t('listeningPort')" prop="port">
        <el-input v-model="form.port" />
      </el-form-item>
      <el-form-item :label="t('name')" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item :label="t('proxyNode')" prop="nodeName">
        <div class="flex-2">
          <el-input v-model="form.nodeName" disabled />
          <el-button plain type="primary" @click="selectNode">{{ t('select') }}</el-button>
        </div>
      </el-form-item>
      <el-form-item :label="t('description')" prop="description">
        <el-input v-model="form.description" :rows="3" type="textarea" />
      </el-form-item>
      <el-form-item :label="t('sslCertificate')" prop="showSSLCrt">
        <div class="flex-2">
          <el-input v-model="form.showSSLCrt" disabled />
          <el-upload
            :ref="crtUploadRef"
            :auto-upload="false"
            :limit="1"
            :on-change="crtFileChange"
            :on-exceed="crtExceedHandle"
            :show-file-list="false"
            accept=".crt"
            class="ml-10"
          >
            <el-button plain :disabled="form.httpType === '0'" type="primary">{{ t('select') }}</el-button>
          </el-upload>
        </div>
      </el-form-item>
      <el-form-item :label="t('sslPrvivateKey')" prop="showSSLKey">
        <div class="flex-2">
          <el-input v-model="form.showSSLKey" disabled />
          <el-upload
            :ref="keyUploadRef"
            :auto-upload="false"
            :limit="1"
            :on-change="keyFileChange"
            :on-exceed="keyExceedHandle"
            :show-file-list="false"
            accept=".key"
            class="ml-10"
          >
            <el-button plain :disabled="form.httpType === '0'" type="primary">{{ t('select') }}</el-button>
          </el-upload>
        </div>
      </el-form-item>
    </el-form>
  </CustomDialog>
  <CustomDialog
    v-if="nodeVisible"
    v-model:dialogVisible="nodeVisible"
    :title="t('runningNodeSelect')"
    :width="420"
    @confirm="handleSave"
  >
    <div class="dialog-container-node">
      <el-row :gutter="0">
        <el-col :span="24">
          <div class="node-tree">
            <el-tree
              :data="nodeInfotreeData"
              :props="{ label: 'nodeName', children: 'children' }"
              default-expand-all
              highlight-current
              node-key="nodeId"
              @node-click="handleNodeSelect"
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
.flex-2 {
  display: flex;
  width: 100%;
}
.dialog-container-node {
  .node-tree {
    padding: 10px;
    height: 200px;
    border: 1px solid #eee;
  }
}
</style>
