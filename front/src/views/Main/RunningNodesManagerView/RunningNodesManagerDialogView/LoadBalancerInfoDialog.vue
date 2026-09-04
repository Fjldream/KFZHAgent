<script setup>
import { useI18n } from 'vue-i18n';
import CustomDialog from '@/components/CustomDialog/CustomDialog.vue';
import CustomStyleTable from '@/components/CustomStyleTable/CustomStyleTable.vue';
const { t } = useI18n();
//通用正则
const formRules = reactive({});
// 表单控件
const formRef = ref(null);
const defaultForm = {
  balancerAppName: '',
  balancerNodeName: '',
  loadAccess: '',
  appTreeArr: [], //负载实例
};

// 表单
const props = defineProps({
  dialogVisible: Boolean,
  rowInfoData: Object,
});
const form = reactive({ ...defaultForm, ...props.rowInfoData });
const emit = defineEmits(['update:dialogVisible']);
</script>

<template>
  <CustomDialog
    :dialogVisible="dialogVisible"
    :footerVisible="false"
    :title="t('loadOrProxyInfo')"
    :width="720"
    @update:dialogVisible="emit('update:dialogVisible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="formRules" :validate-on-rule-change="false" label-width="auto">
      <div class="upper-portion">
        <el-form-item :label="t('proxyName')">
          <el-input disabled v-model="form.balancerAppName" />
        </el-form-item>
        <el-form-item :label="t('proxyHostNode')">
          <el-input disabled v-model="form.balancerNodeName" />
        </el-form-item>
        <el-form-item :label="t('mainProxyProject')">
          <el-input disabled v-model="form.loadAccess" />
        </el-form-item>
        <el-form-item :label="t('loadSharingNode')">
          <div class="param-list-con">
            <CustomStyleTable :showPagination="false" :tableData="form.appTreeArr" maxHeight="calc(30vh - 20px)">
              <el-table-column :label="t('index')" align="center" show-overflow-tooltip type="index" width="100" />
              <el-table-column :label="t('nodeName')" prop="appName" align="center" show-overflow-tooltip />
            </CustomStyleTable>
          </div>
        </el-form-item>
      </div>
    </el-form>
  </CustomDialog>
</template>
<style lang="scss" scoped>
.upper-portion {
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
}
.param-list-con {
  width: 100%;
  min-height: calc(30vh - 10px);
  max-height: calc(30vh - 10px);
  border: 1px solid #dcdfe6;
  ::v-deep(.el-table) {
    font-size: 13px;
    .el-table__body .el-table__row:hover {
      background-color: #fff !important;
    }
    .el-table .el-table__cell {
      padding: 2px 0 !important;
    }
  }
}
</style>
