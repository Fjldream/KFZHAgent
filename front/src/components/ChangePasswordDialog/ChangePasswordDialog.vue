<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { changeUserPassword, changeUserPasswordForFirstLogin } from '@/api/allRequest/userAPI.js';
import { userStrongPassword } from '@/utils/passwordUtils.js';
import CustomDialog from '@/components/CustomDialog/CustomDialog.vue';

const { t } = useI18n();
const props = defineProps({
  dialogVisible: Boolean,
  title: String,
  isFirstLogin: Boolean,
  userId: [String, Number],
});
const emit = defineEmits(['update:dialogVisible', 'confirm']);
const form = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });
const formRef = ref(null);

const rules = {
  oldPassword: [{ required: true, message: t('inputOldPassword'), trigger: 'blur' }],
  newPassword: [
    { required: true, message: t('inputNewPassword'), trigger: 'blur' },
    {
      min: 6,
      max: 20,
      validator: (rule, value, callback) => {
        if (value === form.value.oldPassword) {
          callback(new Error(t('newPasswordSameOldPassword')));
        } else if (!userStrongPassword(value)) {
          callback(new Error(t('passwordValidator')));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    { required: true, message: t('confirmNewPassword'), trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== form.value.newPassword) {
          callback(new Error(t('confirmPasswordError')));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
};

const confirmHandle = async () => {
  await formRef.value.validate();
  const params = {
    userId: props.userId,
    oldPassword: btoa(form.value.oldPassword),
    newPassword: btoa(form.value.newPassword),
  };
  if (!props.isFirstLogin) {
    const { errorCode } = await changeUserPassword(params);
    if (errorCode === 0) {
      ElMessage.success(t('changePasswordSuccess'));
      emit('update:dialogVisible', false);
    }
  } else {
    params.userName = props.userId;
    const { errorCode } = await changeUserPasswordForFirstLogin(params);
    if (errorCode === 0) {
      ElMessage.success(t('changePasswordSuccess'));
      emit('update:dialogVisible', false);
    }
  }
};
</script>

<template>
  <CustomDialog
    :dialog-visible="dialogVisible"
    :title="title || t('changPassword')"
    :width="500"
    @confirm="confirmHandle"
    @update:dialog-visible="emit('update:dialogVisible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100">
      <el-form-item :label="t('oldPassword')" prop="oldPassword">
        <el-input v-model="form.oldPassword" :placeholder="t('inputOldPassword')" show-password type="password" />
      </el-form-item>
      <el-form-item :label="t('newPassword')" prop="newPassword">
        <el-input v-model="form.newPassword" :placeholder="t('inputNewPassword')" show-password type="password" />
      </el-form-item>
      <el-form-item :label="t('confirmNewPassword')" prop="confirmPassword">
        <el-input v-model="form.confirmPassword" :placeholder="t('plsConfirmPassword')" show-password type="password" />
      </el-form-item>
    </el-form>
  </CustomDialog>
</template>

<style lang="scss" scoped></style>
