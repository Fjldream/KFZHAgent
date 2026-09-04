<script setup>
import CustomIcon from '@/components/Icons/CustomIcon.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatTime } from '@/utils/dayjsUtil';
const { t } = useI18n();
const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  nodeStatus: {
    type: String,
    default: '',
  },
  nodeAuthInfo: {
    type: Object,
    default: null,
  },
  iconName: {
    type: String,
    default: '',
  },
  width: {
    type: String,
    default: '100%',
  },
  height: {
    type: String,
    default: 'auto',
  },
  background: {
    type: String,
    default: '#f0f5ff',
  },
  border: {
    type: String,
    default: '1px solid #e4e7ed',
  },
  shadow: {
    type: String,
    default: 'always',
  },
  expand: {
    type: Boolean,
    default: false,
  },
  isOpen: {
    type: Boolean,
    default: false,
  },
});
const emits = defineEmits(['toggle']);
const nodeAuthStatus = computed(() => {
  if (!props.nodeAuthInfo || !props.nodeAuthInfo?.nodeAuthStatus) {
    return 0;
  }
  if (props.nodeAuthInfo.authInfo) {
    const auth = props.nodeAuthInfo.authInfo.filter((item) => item.authState == 1);
    return auth.length > 0 ? 1 : 2;
  } else {
    return 2;
  }
});
const nodeAuthInfo = computed(() => {
  const info = props.nodeAuthInfo.authInfo[0];
  return { authExpiredTime: info.expiredTime, authInfo: JSON.stringify(info.authJsonInfo) };
});
</script>

<template>
  <el-card
    :shadow="shadow"
    :class="props.title ? 'title-card' : 'custom-card'"
    :style="{ width, height, background, border }"
  >
    <template #header v-if="title">
      <div class="card-header">
        <div class="mr-10">
          <CustomIcon v-if="iconName" :name="iconName" />
        </div>
        <div class="card-flex">
          <span class="card-title">{{ title }}</span>
          <el-tag
            style="font-size: 12px"
            v-if="nodeStatus || nodeStatus === 0"
            effect="plain"
            round
            :type="nodeStatus === 'running' ? 'primary' : 'danger'"
          >
            {{ nodeStatus === 'running' ? t('online') : t('offline') }}
          </el-tag>
          <el-tooltip effect="dark" placement="bottom" :disabled="nodeAuthStatus !== 1">
            <template #content>
              <div style="">
                <span style="display: inline-block; width: 100px">{{ t('authExpiredTime') }}</span>
                <span>{{ formatTime(new Date(nodeAuthInfo.authExpiredTime)) }}</span>
              </div>
              <div style="display: flex; align-items: flex-start">
                <span style="display: inline-block; width: 100px">{{ t('authInfo') }}</span>
                <span style="flex: 1; word-break: break-word">{{ nodeAuthInfo.authInfo }}</span>
              </div>
            </template>
            <el-tag
              style="font-size: 12px; margin-left: 10px; cursor: pointer"
              v-if="nodeAuthStatus !== 0"
              effect="plain"
              round
              :type="nodeAuthStatus === 1 ? 'primary' : 'danger'"
            >
              {{ nodeAuthStatus === 1 ? t('authorized') : t('demoMode') }}
            </el-tag>
          </el-tooltip>
        </div>
        <div class="card-right" v-if="expand" @click="emits('toggle')">
          <div class="card-flex">
            <el-button link>
              <el-icon v-if="props.isOpen"><IEpView /></el-icon>
              <el-icon v-else><IEpHide /></el-icon>
              {{ props.isOpen ? t('expandPanel') : t('hidePanel') }}
            </el-button>
          </div>
        </div>
      </div>
    </template>
    <slot />
  </el-card>
</template>

<style lang="scss" scoped>
.title-card {
  margin-bottom: 0;
}
.custom-card {
  padding: 20px;
  border-radius: 16px;
}
.card-header {
  display: flex;
  align-items: center;
  font-weight: bold;
  .el-icon {
    margin-right: 8px;
    color: #0066cc;
  }
}
.card-flex {
  order: 1;
  flex: 1;
}
.card-title {
  font-size: 18px;
  padding-right: 8px;
  font-weight: 700;
}
.card-right {
  order: 2;
}
::v-deep(.el-card__header) {
  padding: 0 0 15px 0;
  border: none;
}
</style>
