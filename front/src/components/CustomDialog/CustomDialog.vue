<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps({
  title: String,
  width: Number,
  dialogVisible: Boolean,
  footerVisible: {
    type: Boolean,
    default: true,
  },
});
const emits = defineEmits(['update:dialogVisible', 'confirm']);
const emitConfirm = () => emits('confirm');
const emitClose = () => {
  emits('update:dialogVisible', false);
};
</script>

<template>
  <el-dialog
    v-if="dialogVisible"
    :append-to-body="true"
    :before-close="emitClose"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    :draggable="true"
    :model-value="dialogVisible"
    :title="title"
    :width="width"
    align-center
    class="custom-dialog"
    @update:modelValue="emits('update:dialogVisible', $event)"
  >
    <slot name="default"></slot>
    <template v-if="footerVisible" #footer>
      <el-button @click="emitClose">{{ t('cancel') }}</el-button>
      <el-button type="primary" @click="emitConfirm">{{ t('confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<style lang="scss">
.custom-dialog {
  padding: 20px 30px;
  .el-dialog__body {
    flex: 1;
    overflow: hidden;
  }
  .el-dialog__footer {
    padding-top: 12px;
    .el-button {
      font-size: 14px;
      width: 78px;
      height: 34px;
    }
    .el-button--primary {
      margin-left: 15px;
    }
  }
  .el-dialog__title {
    font-size: 16px;
    font-weight: bold;
  }
}
</style>
