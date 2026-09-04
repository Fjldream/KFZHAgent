<script setup>
import { computed } from 'vue';
import { Close, Refresh } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();

const props = defineProps({
  /** 由父组件通过 v-model 控制弹窗显示与隐藏。 */
  modelValue: {
    type: Boolean,
    required: true,
  },
  /** 节点和 App 统计数据；接口返回后由父组件整体替换该对象即可刷新视图。 */
  overview: {
    type: Object,
    required: true,
  },
  /** 父组件请求接口期间传入 true，用于显示刷新和内容加载状态。 */
  loading: {
    type: Boolean,
    default: false,
  },
  /** 默认挂载到 body；单元测试或特殊容器场景可设为 false。 */
  teleported: {
    type: Boolean,
    default: true,
  },
  /** 支持 Element Plus Dialog 的数字或 CSS 宽度字符串。 */
  width: {
    type: [String, Number],
    default: '650px',
  },
  /** 是否允许点击遮罩关闭，运维场景默认关闭以避免误操作。 */
  closeOnClickModal: {
    type: Boolean,
    default: false,
  },
});

// refresh：预留给父组件重新请求统计接口，组件内部不绑定任何后端地址。
const emit = defineEmits(['update:modelValue', 'refresh']);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const clampPercentage = (value) => Math.min(100, Math.max(0, Math.round(value)));

const deploymentRate = computed(() => {
  if (props.overview.total <= 0) return 0;
  return clampPercentage((props.overview.deployed / props.overview.total) * 100);
});

const runtimeRate = computed(() => {
  if (props.overview.deployed <= 0) return 0;
  return clampPercentage((props.overview.running / props.overview.deployed) * 100);
});

const runtimeSegments = computed(() => {
  if (props.overview.deployed <= 0) {
    return { running: 0, stopped: 0, abnormal: 0 };
  }

  const percentageOfDeployed = (value) => clampPercentage((Math.max(0, value) / props.overview.deployed) * 100);

  return {
    running: percentageOfDeployed(props.overview.running),
    stopped: percentageOfDeployed(props.overview.stopped),
    abnormal: percentageOfDeployed(props.overview.abnormal),
  };
});

const deploymentMetrics = computed(() => [
  { key: 'total', label: t('totalNum'), value: props.overview.total },
  { key: 'deployed', label: t('deployed'), value: props.overview.deployed },
  { key: 'undeployed', label: t('notDeloyed'), value: props.overview.undeployed },
]);

const runtimeMetrics = computed(() => [
  { key: 'running', label: t('inRunning'), value: props.overview.running },
  { key: 'stopped', label: t('notRunning'), value: props.overview.stopped },
]);

/** 预留方法：通知父组件刷新接口数据，不在可复用组件中耦合 axios/fetch。 */
const handleRefresh = () => emit('refresh');

const close = () => emit('update:modelValue', false);
</script>
<template>
  <el-dialog
    v-model="visible"
    class="app-overview-dialog"
    :width="width"
    :teleported="teleported"
    :close-on-click-modal="closeOnClickModal"
    :destroy-on-close="false"
    :show-close="false"
    align-center
  >
    <template #header>
      <div class="app-overview-dialog__header">
        <div class="app-overview-dialog__heading">
          <h2>app{{ t('overview') }}</h2>
          <div class="app-overview-dialog__node">
            <span> {{ overview.nodeName }} · {{ overview.nodeIp }}</span>
            <el-tag :type="overview.online ? 'primary' : 'danger'" effect="plain" round size="small">
              {{ overview.online ? t('online') : t('offline') }}
            </el-tag>
          </div>
        </div>

        <div class="app-overview-dialog__header-actions">
          <!-- <span class="app-overview-dialog__updated-at"> 更新于 {{ overview.updatedAt || '--:--:--' }} </span> -->
          <!-- <el-button
            data-testid="refresh-button"
            :icon="Refresh"
            :loading="loading"
            link
            type="primary"
            @click="handleRefresh"
          >
            刷新
          </el-button> -->
          <el-button class="app-overview-dialog__icon-button" :icon="Close" text @click="close" />
        </div>
      </div>
    </template>

    <div v-loading="loading" class="app-overview-dialog__content">
      <section class="overview-group overview-group--deployment" aria-labelledby="deployment-title">
        <h3 id="deployment-title">{{ t('deployInfo') }}</h3>

        <div class="overview-group__metrics">
          <div v-for="item in deploymentMetrics" :key="item.key" class="overview-metric" :data-status="item.key">
            <span class="overview-metric__label">{{ item.label }}</span>
            <strong class="overview-metric__value" :class="`is-${item.key}`">
              {{ item.value }}
            </strong>
          </div>
        </div>

        <el-progress
          class="overview-group__progress"
          :percentage="deploymentRate"
          :show-text="false"
          :stroke-width="10"
          color="#2f5bea"
        />

        <div class="overview-group__summary">
          <span>{{ overview.deployed }}/{{ overview.total }}</span>
          <span
            >{{ t('deployRate') }} <strong class="is-deployment-rate">{{ deploymentRate }}%</strong></span
          >
        </div>
      </section>

      <section class="overview-group overview-group--runtime" aria-labelledby="runtime-title">
        <h3 id="runtime-title">{{ t('runningInfo') }}</h3>

        <div class="overview-group__metrics">
          <div v-for="item in runtimeMetrics" :key="item.key" class="overview-metric" :data-status="item.key">
            <span class="overview-metric__label">{{ item.label }}</span>
            <strong class="overview-metric__value" :class="`is-${item.key}`">
              {{ item.value }}
            </strong>
          </div>
        </div>

        <div
          class="overview-group__progress overview-runtime-progress"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="runtimeRate"
          data-testid="runtime-progress"
        >
          <span
            class="overview-runtime-progress__segment is-running"
            data-segment="running"
            :style="{ width: `${runtimeSegments.running}%` }"
          />
          <span
            class="overview-runtime-progress__segment is-stopped"
            data-segment="stopped"
            :style="{ width: `${runtimeSegments.stopped}%` }"
          />
          <!-- <span
            class="overview-runtime-progress__segment is-abnormal"
            data-segment="abnormal"
            :style="{ width: `${runtimeSegments.abnormal}%` }"
          /> -->
        </div>

        <div class="overview-group__summary">
          <span>{{ overview.running }}/{{ overview.deployed }}</span>
          <span
            >{{ t('runningRate') }} <strong class="is-running">{{ runtimeRate }}%</strong></span
          >
        </div>
      </section>
    </div>

    <template #footer>
      <div class="app-overview-dialog__footer">
        <el-button data-testid="close-button" type="primary" @click="close">{{ t('close') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<style>
.app-overview-dialog {
  --overview-blue: #2f5bea;
  --overview-green: #45b36b;
  --overview-orange: #e98719;
  --overview-red: #f04438;
  --overview-gray: #9aa3b2;
  --overview-text: #202534;
  --overview-muted: #6f7787;
  border-radius: 12px;
  box-shadow: 0 18px 56px rgb(45 62 104 / 18%);
}

.app-overview-dialog .el-dialog__header {
  margin: 0;
  padding: 18px 24px 14px;
}

.app-overview-dialog .el-dialog__body {
  padding: 20px 24px;
  border-bottom: 1px solid #edf0f6;
  border-top: 1px solid #edf0f6;
}

.app-overview-dialog .el-dialog__footer {
  padding: 0 24px 14px;
}

.app-overview-dialog__header,
.app-overview-dialog__header-actions,
.app-overview-dialog__node,
.app-overview-dialog__footer,
.overview-group__summary {
  display: flex;
  align-items: center;
}

.app-overview-dialog__header {
  justify-content: space-between;
  gap: 24px;
}

.app-overview-dialog__heading h2 {
  margin: 0 0 7px;
  color: var(--overview-text);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.25;
}

.app-overview-dialog__node {
  gap: 8px;
  color: var(--overview-muted);
  font-size: 14px;
}

.app-overview-dialog__header-actions {
  flex: 0 0 auto;
  gap: 10px;
}

.app-overview-dialog__updated-at {
  color: #858d9d;
  font-size: 13px;
}

.app-overview-dialog__icon-button {
  margin-left: 0 !important;
  color: #697286;
}

.app-overview-dialog__content {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 160px;
}

.overview-group {
  min-width: 0;
  padding-right: 28px;
}

.overview-group--runtime {
  padding-right: 0;
  padding-left: 28px;
  border-left: 1px solid #edf0f6;
}

.overview-group h3 {
  margin: 0 0 20px;
  color: #303647;
  font-size: 15px;
  font-weight: 650;
}

.overview-group__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.overview-metric {
  min-width: 0;
  color: inherit;
  text-align: left;
}

.overview-metric:hover .overview-metric__label {
  color: var(--overview-blue);
}

.overview-metric__label {
  display: block;
  overflow: hidden;
  margin-bottom: 8px;
  color: var(--overview-muted);
  font-size: 13px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.16s ease;
}

.overview-metric__value {
  color: var(--overview-text);
  font-size: 27px;
  font-weight: 650;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.is-deployed,
.is-running {
  color: var(--overview-green);
}

.is-deployment-rate,
.overview-metric__value.is-total {
  color: var(--overview-blue);
}

.is-undeployed {
  color: var(--overview-gray);
}

.is-stopped {
  color: var(--overview-orange);
}

.is-abnormal {
  color: var(--overview-red);
}

.overview-group__progress {
  margin-top: 24px;
}

.overview-group__progress .el-progress-bar__outer {
  background-color: #edf0f6;
}

.overview-runtime-progress {
  display: flex;
  width: 100%;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf0f6;
}

.overview-runtime-progress__segment {
  display: block;
  flex: 0 0 auto;
  min-width: 0;
  height: 100%;
}

.overview-runtime-progress__segment + .overview-runtime-progress__segment {
  border-left: 2px solid #fff;
}

.overview-runtime-progress__segment.is-running {
  background: var(--overview-green);
}

.overview-runtime-progress__segment.is-stopped {
  background: var(--overview-orange);
}

.overview-runtime-progress__segment.is-abnormal {
  background: var(--overview-red);
}

.overview-group__summary {
  justify-content: space-between;
  margin-top: 13px;
  color: #535c6f;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.overview-group__summary strong {
  margin-left: 4px;
  font-weight: 650;
}

.app-overview-dialog__footer {
  justify-content: flex-end;
  padding-top: 16px;
  color: #9097a6;
  font-size: 13px;
}

@media (max-width: 760px) {
  .app-overview-dialog__header {
    align-items: flex-start;
  }

  .app-overview-dialog__updated-at {
    display: none;
  }

  .app-overview-dialog__content {
    grid-template-columns: 1fr;
  }

  .overview-group {
    padding: 0 0 24px;
  }

  .overview-group--runtime {
    padding: 24px 0 0;
    border-left: 0;
  }
}
</style>
