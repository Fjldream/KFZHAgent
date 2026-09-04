<script setup>
import { useI18n } from 'vue-i18n';
import { useSystemConfigStore } from '@/stores/systemConfigStore.js';
import CustomDialog from '@/components/CustomDialog/CustomDialog.vue';
import { updateSystemConfig, getSystemLogConfig, UpdateSystemLogConfig } from '@/api/allRequest/systemConfigAPI.js';
const { t } = useI18n();

const store = useSystemConfigStore();
const formData = ref({
  loginBg: '',
  loginLogoBg: '',
  homeLogoBg: '',
  loginImg: store.loginBackgroundImageUrl,
  logoImg: store.loginLogoImageUrl,
  homeLogoImg: store.homeLogoImageUrl,
  productName: store.config.productName,
  productInfo: store.config.productInfo,
  companyName: store.config.companyName,
  ICPFiling: store.config.subItemList.map((item) => item.name).join(' | '),
});
const activeTab = ref('OEMConfig');
const formRef = ref(null);
const formRules = ref({
  productName: [{ required: true, message: t('plsInputProductName'), trigger: 'blur' }],
  productInfo: [{ required: true, message: t('plsInputProductInfo'), trigger: 'blur' }],
  companyName: [{ required: true, message: t('plsInputCompanyName'), trigger: 'blur' }],
  ICPFiling: [{ required: true, message: t('plsInputICPFiling'), trigger: 'blur' }],
});
const logConfigForm = ref({
  logTime: 1,
});
const logConfigFormRef = ref(null);
const logConfigFormRules = ref({
  logTime: [{ required: true, validator: checkExcuteCnt, trigger: 'blur' }],
});

nextTick(async () => {
  await getLogConfig();
});

function checkExcuteCnt(rule, value, callback) {
  if (!value && value !== 0) {
    return callback(new Error(t('plsInputLogTime')));
  }
  const reg = /^-?\d+$/;
  if (!reg.test(value)) {
    return callback(new Error(t('plsInputSuccessLogTime')));
  }
  if (value <= 0) {
    return callback(new Error(t('plsInputSuccessLogTime')));
  }
  callback();
}

watch(
  () => store.config,
  () => {
    formData.value.productName = store.config.productName;
    formData.value.productInfo = store.config.productInfo;
    formData.value.companyName = store.config.companyName;
    formData.value.ICPFiling = store.config.subItemList.map((item) => item.name).join(' | ');
  },
);
const props = defineProps({
  dialogVisible: Boolean,
});
const emit = defineEmits(['update:dialogVisible']);

const beforeUploadLoginBg = (file) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    formData.value.loginBg = file;
    formData.value.loginImg = e.target.result;
  };
  reader.readAsDataURL(file);
  return false;
};
const beforeUploadLoginLogoBg = (file) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    formData.value.loginLogoBg = file;
    formData.value.logoImg = e.target.result;
  };
  reader.readAsDataURL(file);
  return false;
};
const beforeUploadhomeLogoBg = (file) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    formData.value.homeLogoBg = file;
    formData.value.homeLogoImg = e.target.result;
  };
  reader.readAsDataURL(file);
  return false;
};
const handleConfirm = async () => {
  try {
    switch (activeTab.value) {
      case 'OEMConfig':
        await formRef.value.validate();
        const formDatas = new FormData();
        store.config.productName = formData.value.productName;
        store.config.productInfo = formData.value.productInfo;
        store.config.companyName = formData.value.companyName;
        store.config.subItemList = formData.value.ICPFiling.split('|').map((item) => {
          return {
            name: item,
            link: '',
          };
        });
        formDatas.append('configFile', JSON.stringify(store.config));

        formDatas.append('loginBg', formData.value.loginBg);
        formDatas.append('loginLogoBg', formData.value.loginLogoBg);
        formDatas.append('homeLogoBg', formData.value.homeLogoBg);

        const res = await updateSystemConfig(formDatas);
        if (res.code === 0) {
          ElMessage({
            message: t('configSaveSuccess'),
            type: 'success',
          });
          emit('update:dialogVisible', false);
        } else {
          ElMessage({
            message: t('configSaveError'),
            type: 'warning',
          });
        }
        break;
      case 'logConfig':
        await logConfigFormRef.value.validate();
        const result = await UpdateSystemLogConfig(logConfigForm.value.logTime);
        if (result.code === 0) {
          ElMessage({
            message: t('logConfigConfirmTip'),
            type: 'success',
          });
          emit('update:dialogVisible', false);
        } else {
          ElMessage({
            message: t('configSaveError'),
            type: 'warning',
          });
        }
        break;
      default:
        break;
    }
  } catch (error) {
    ElMessage({
      message: t('configSaveError'),
      type: 'error',
    });
  }
};

async function getLogConfig() {
  const ret = await getSystemLogConfig();
  if (ret.code === 0) {
    logConfigForm.value.logTime = ret.data;
  }
}
</script>
<template>
  <CustomDialog
    :dialogVisible="dialogVisible"
    :title="t('systemConfig')"
    :width="550"
    @confirm="handleConfirm"
    @update:dialogVisible="emit('update:dialogVisible', $event)"
  >
    <el-divider style="margin: 5px 0" />
    <el-tabs v-model="activeTab">
      <el-tab-pane :label="t('OEMConfig')" name="OEMConfig">
        <el-form ref="formRef" :model="formData" :rules="formRules" class="scroll-style">
          <el-descriptions :title="t('setLoginBackground')" border size="small">
            <el-descriptions-item :label="t('jpgTips')" :width="150" align="center">
              <div class="image-container">
                <el-image :src="formData.loginImg" fit="fill" />
              </div>
              <br />
              <el-upload :before-upload="beforeUploadLoginBg" accept=".jpg,.png,.svg" action="#">
                <span class="container-footer">{{ t('changeBackground') }}</span>
              </el-upload>
            </el-descriptions-item>
          </el-descriptions>
          <el-divider />
          <el-descriptions :title="t('setLoginlogo')" border size="small">
            <el-descriptions-item :label="t('jpgTips2')" :width="150" align="center">
              <div class="image-container">
                <el-image :src="formData.logoImg" />
              </div>
              <br />
              <el-upload :before-upload="beforeUploadLoginLogoBg" accept=".jpg,.png,.svg" action="#">
                <span class="container-footer">{{ t('changeBackground') }}</span>
              </el-upload>
            </el-descriptions-item>
          </el-descriptions>
          <el-divider />
          <el-descriptions :title="t('setHomelogo')" border size="small">
            <el-descriptions-item :label="t('jpgTips3')" :width="150" align="center">
              <div class="image-container">
                <el-image :src="formData.homeLogoImg" />
              </div>
              <br />
              <el-upload :before-upload="beforeUploadhomeLogoBg" accept=".jpg,.png,.svg" action="#">
                <span class="container-footer">{{ t('changeBackground') }}</span>
              </el-upload>
            </el-descriptions-item>
          </el-descriptions>
          <el-divider />
          <el-form-item :label="t('productName')" prop="productName">
            <el-input v-model="formData.productName" :placeholder="t('plsInputProductName')"></el-input>
          </el-form-item>
          <el-form-item :label="t('productInfo')" prop="productInfo">
            <el-input v-model="formData.productInfo" :placeholder="t('plsInputProductInfo')"></el-input>
          </el-form-item>
          <el-form-item :label="t('companyName')" prop="companyName">
            <el-input v-model="formData.companyName" :placeholder="t('plsInputCompanyName')"></el-input>
          </el-form-item>
          <el-form-item :label="t('companyInfo')" prop="ICPFiling">
            <el-input v-model="formData.ICPFiling" :placeholder="t('plsInputICPFiling')"></el-input>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane :label="t('logSrorageConfig')" name="logConfig">
        <div class="log-config">
          <el-form ref="logConfigFormRef" :model="logConfigForm" :rules="logConfigFormRules">
            <el-form-item :label="t('logRetentionTime')" prop="logTime">
              <el-input v-model="logConfigForm.logTime" type="number" class="log-config-time"></el-input>
              {{ t('dayTime') }}
            </el-form-item>
            <p class="log-config-tip">{{ t('logSrorageConfigTip') }}</p>
          </el-form>
        </div>
      </el-tab-pane>
    </el-tabs>
  </CustomDialog>
</template>
<style lang="scss" scoped>
:deep(.custom-dialog) {
  padding: 20px 15px 20px 30px;
}
.image-container {
  width: 300px;
  height: 100px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.container-footer:hover {
  cursor: pointer;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-info {
  color: #999;
  font-size: 14px;
  line-height: 1.5;
}

.image-preview {
  margin-top: 10px;
  border: 1px dashed #ddd;
  padding: 5px;
  display: inline-block;
}
.scroll-style {
  height: 600px;
  overflow-y: scroll;
  padding-right: 10px;
}
::-webkit-scrollbar {
  width: 3px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}
.log-config {
  height: 28vh;
  border: #e3e5eb solid 1px;
  padding-top: 16px;
  .log-config-time {
    width: 100px;
    padding-right: 8px;
  }
  .log-config-tip {
    padding-left: 15px;
    color: #9c9da0;
    font-size: 12px;
  }
}
</style>
