<script setup>
import { defineProps } from 'vue';
const props = defineProps({
  value: Array,
  color: {
    type: Array,
    default: ['#1890ff', '#e6f7ff'],
  },
});
//Option
const option = computed(() => ({
  grid: {
    left: 0,
    right: 0,
    top: 10,
    bottom: 0,
  },
  xAxis: {
    type: 'category',
    show: false,
    data: props.value.map((_, index) => (index + 1).toString()),
  },
  yAxis: { show: false, type: 'value' },
  series: [
    {
      type: 'line',
      data: props.value,
      smooth: false,
      symbol: 'none',
      lineStyle: { width: 2, color: props.color[0] },
      areaStyle: { color: props.color[1] },
    },
  ],
}));
</script>

<template>
  <ECharts :option="option" class="custom-echarts" />
</template>

<style scoped>
/* 可根据需要添加默认宽高 */
.custom-echarts {
  display: block;
  width: 100%;
  height: 68px;
}
</style>
