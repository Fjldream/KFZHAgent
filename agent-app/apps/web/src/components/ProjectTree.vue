<script setup lang="ts">
import type { SolutionTreeNode } from "../types";

/**
 * 解决方案树（brief Step 3）：第一子节点为「客户端工程」；
 * 未支持的注册域显示为 disabled 能力，而不是空编辑器。
 */
defineProps<{
  tree: SolutionTreeNode;
}>();
</script>

<template>
  <section class="panel tree" data-testid="project-tree">
    <h2>解决方案</h2>
    <div class="tree-node root">{{ tree.label }}</div>
    <ul class="tree-children">
      <li v-for="child in tree.children" :key="child.domain ?? child.label" class="tree-node" :data-domain="child.domain">
        <span v-if="child.supported === false" disabled class="capability" :data-domain="child.domain">
          {{ child.label }}（未支持）
        </span>
        <span v-else class="capability" :data-domain="child.domain">{{ child.label }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 1rem;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}
.panel h2 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}
.tree-node {
  font-size: 0.9rem;
  padding: 0.25rem 0;
}
.tree-node.root {
  font-weight: 700;
}
.tree-children {
  list-style: none;
  margin: 0;
  padding-left: 1rem;
}
.capability {
  display: inline-block;
}
.capability[disabled] {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}
</style>
