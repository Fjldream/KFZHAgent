<template>
  <svg :class="[[svgClass], 'svg-icon']" :style="svgStyle" aria-hidden="true">
    <use :xlink:href="`#icon-${name}`" />
  </svg>
</template>

<script setup>
defineProps({
  name: {
    type: String,
    required: true,
  },
  svgClass: String,
  svgStyle: String,
});
</script>

<style scoped>
.svg-icon {
  width: 1.5em;
  height: 1.5em;
  fill: currentColor;
}
</style>
