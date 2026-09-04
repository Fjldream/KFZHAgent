<script setup>
import { useLangStore } from '@/stores/langStore.js';

const langStore = useLangStore();
</script>

<template>
  <el-config-provider :locale="langStore.elementLocale">
    <router-view />
  </el-config-provider>
</template>
