<script setup>
defineProps({
  loading: Boolean,
  loadingText: {
    type: String,
    default: '', // 不传时不显示文字
  },
});
</script>

<template>
  <Teleport to="body">
    <div v-if="loading" class="custom-loading-overlay">
      <l-dot-spinner color="#0348dd" size="40" speed="1.5" v-bind="$attrs"></l-dot-spinner>
      <div class="loading-text">{{ loadingText }}</div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.custom-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  width: 100vw;
  height: 100vh;
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  .loading-text {
    margin-bottom: 10px;
    font-size: 14px;
    color: #4f9bf7;
    display: block;
  }
}
</style>
