<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
/**
 * 工作台三栏外壳，结构对齐 UI 设计稿（agent-app-ui-macos-20261020）：
 * 左 240px 会话栏 / 中 主区（对话与执行过程）/ 右 320px 情境面板。
 * 窄屏（<1100px）收起右侧面板，主区优先。
 */
// Vue 会把缺省的 boolean prop 强制转成 false，必须显式给默认值，否则右侧面板永远不显示。
withDefaults(defineProps<{
  title: string;
  inspectorVisible?: boolean;
}>(), { inspectorVisible: true });
</script>

<template>
  <div class="shell" :class="{ 'inspector-hidden': inspectorVisible === false }">
    <aside class="sidebar" aria-label="会话">
      <slot name="sidebar" />
    </aside>

    <section class="main">
      <header class="titlebar">
        <span class="brand">◈ 智绘</span>
        <span class="sep" aria-hidden="true" />
        <h1 class="title">{{ title }}</h1>
        <div class="titlebar-end"><slot name="titlebar" /></div>
      </header>
      <div class="main-body"><slot name="main" /></div>
    </section>

    <aside v-if="inspectorVisible !== false" class="inspector" aria-label="情境面板">
      <slot name="inspector" />
    </aside>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr) var(--inspector-w);
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
}

.shell.inspector-hidden {
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
}

.sidebar {
  overflow-y: auto;
  background: var(--sidebar-bg);
  backdrop-filter: var(--blur-glass);
  -webkit-backdrop-filter: var(--blur-glass);
  border-right: 1px solid var(--color-border);
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.titlebar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: var(--titlebar-bg);
  backdrop-filter: var(--blur-glass);
  -webkit-backdrop-filter: var(--blur-glass);
  border-bottom: 1px solid var(--color-border);
}

.brand {
  font-weight: 600;
  letter-spacing: -0.02em;
}

.sep {
  width: 1px;
  height: 16px;
  background: var(--color-border);
}

.title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.titlebar-end {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.main-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.inspector {
  overflow-y: auto;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
}

@media (max-width: 1100px) {
  .shell {
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  }
  .inspector {
    display: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .sidebar,
  .titlebar {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--sidebar-bg-solid);
  }
}
</style>
<!-- end -->
