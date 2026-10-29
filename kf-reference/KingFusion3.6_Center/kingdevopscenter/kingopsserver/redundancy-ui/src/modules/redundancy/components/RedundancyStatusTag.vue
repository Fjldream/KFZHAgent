<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ status: string }>();

const presentation = computed(() => {
  const map: Record<
    string,
    {
      label: string;
      type: "success" | "danger" | "warning" | "info" | "primary";
    }
  > = {
    NORMAL: { label: "正常", type: "success" },
    ABNORMAL: { label: "异常", type: "danger" },
    DISABLED: { label: "未生效", type: "info" },
    ENABLED: { label: "已生效", type: "success" },
    ENABLING: { label: "生效中", type: "warning" },
    DISABLING: { label: "停用中", type: "warning" },
    RUNNING: { label: "运行", type: "success" },
    STOPPED: { label: "停止", type: "info" },
    OFFLINE: { label: "离线", type: "danger" },
    ONLINE: { label: "在线", type: "success" },
    ACTIVE: { label: "激活", type: "primary" },
    INACTIVE: { label: "失活", type: "info" },
    SUCCEEDED: { label: "成功", type: "success" },
    FAILED: { label: "失败", type: "danger" },
    INTERRUPTED: { label: "已中断", type: "warning" },
    RUNNING_TASK: { label: "执行中", type: "warning" },
  };
  return (
    map[props.status] ?? {
      label: props.status || "未知",
      type: "info" as const,
    }
  );
});
</script>

<template>
  <el-tag :type="presentation.type" size="small" effect="light" round>
    {{ presentation.label }}
  </el-tag>
</template>
