<!-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代 -->
<script setup lang="ts">
import { ref } from "vue";
import "../../styles/workbench-reference.css";
withDefaults(defineProps<{
  title: string; workspaceName?: string; inspectorVisible?: boolean;
  connectionLabel?: string; sequence?: number; preview?: boolean;
}>(), { workspaceName: "", inspectorVisible: true, connectionLabel: "等待连接", sequence: 0, preview: false });
const annotated = ref(false);
const sidebarOpen = ref(false);
const inspectorOpen = ref(false);
const maximized = ref(false);
</script>
<template>
  <div class="workbench-page" :class="{ annotate: annotated, maximized, 'inspector-hidden': !inspectorVisible }" @keydown.esc="sidebarOpen = false; inspectorOpen = false">
    <div class="shell window" :class="{ 'inspector-hidden': !inspectorVisible }">
      <header class="titlebar">
        <div class="traffic" aria-hidden="true"><span class="tl close" /><span class="tl min" /><span class="tl zoom" /></div>
        <button class="mobile-nav" type="button" aria-label="切换会话导航" :aria-expanded="sidebarOpen" @click="sidebarOpen = !sidebarOpen">☰</button>
        <div class="title">{{ title }}<span v-if="workspaceName" class="ws-name">— {{ workspaceName }}</span></div>
        <div class="right titlebar-end">
          <slot name="titlebar" />
          <button type="button" class="anno-switch" role="switch" aria-label="任务标注" :aria-checked="annotated" @click="annotated = !annotated">
            <span>任务标注</span><span class="switch" :class="{ on: annotated }" />
          </button>
          <button class="window-expand" type="button" :aria-label="maximized ? '还原窗口' : '展开窗口'" @click="maximized = !maximized">⤢</button>
        </div>
      </header>
      <div class="content">
        <button v-if="sidebarOpen || inspectorOpen" class="drawer-backdrop" type="button" aria-label="关闭侧栏" @click="sidebarOpen = false; inspectorOpen = false" />
        <aside class="sidebar" :class="{ show: sidebarOpen }" aria-label="会话"><span class="task-badge tb-region">T14</span><slot name="sidebar" /></aside>
        <main class="main main-body">
          <div class="main-head"><slot name="mainhead" /><button v-if="inspectorVisible" class="insp-drawer-toggle" type="button" :aria-expanded="inspectorOpen" @click="inspectorOpen = !inspectorOpen">ⓘ 检查器</button></div>
          <slot name="main" />
        </main>
        <aside v-if="inspectorVisible" class="inspector" :class="{ show: inspectorOpen }" aria-label="情境面板"><span class="task-badge tb-region">T13/T17/T24</span><slot name="inspector" /></aside>
      </div>
      <footer class="statusbar">
        <span><span class="dot-live" />{{ connectionLabel }}<template v-if="sequence > 0"> · 事件 seq {{ sequence }}</template></span>
        <span class="flags"><span class="flag beta">工作台</span><span v-if="preview" class="flag">设计预览 · 示例数据</span></span>
        <span class="right"><slot name="statusbar" /><a href="/workspaces">全部工程 ↗</a></span>
      </footer>
    </div>
  </div>
</template>
<!-- end -->
