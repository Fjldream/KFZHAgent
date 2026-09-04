<script setup>
import CustomIcon from '@/components/Icons/CustomIcon.vue';

const props = defineProps({
  leftMenus: {
    type: Array,
    default: () => [],
  },
  defaultProps: {
    type: Object,
    default: () => {
      return {
        children: 'children',
        label: 'name',
      };
    },
  },
  nodeClickKey: String,
  treeClass: {
    type: String,
    default: 'custom-tree',
  },
});

const emit = defineEmits(['treeClickHandle', 'deleteClickHandle']);

const treeClickHandle = (data) => {
  emit('treeClickHandle', data);
};
const deleteClickHandle = (row) => {
  emit('deleteClickHandle', row);
};
</script>

<template>
  <el-tree
    :class="treeClass"
    :current-node-key="nodeClickKey"
    :data="leftMenus"
    :expand-on-click-node="false"
    :props="defaultProps"
    default-expand-all
    highlight-current
    node-key="id"
    @node-click="treeClickHandle"
  >
    <template #default="{ node, data }">
      <div class="df w-100">
        <CustomIcon v-if="data.icon" :name="data.icon" />
        <el-icon v-if="data.path === 'runningNodesManager'">
          <div :class="data.nodeStatus === 'running' ? 'icon-success' : 'icon-error'"></div>
        </el-icon>
        <el-text class="menu-label" truncated>{{ node.label }}</el-text>
        <div class="icon-content" v-if="data.path === 'runningNodesManager'">
          <el-icon v-if="data.nodeStatus === 0" @click.stop="deleteClickHandle(data)">
            <IEpClose />
          </el-icon>
        </div>
      </div>
    </template>
  </el-tree>
</template>

<style lang="scss" scoped>
.menu-label {
  margin-left: 10px;
  font-weight: 700;
}
.el-tree-node__children {
  .menu-label {
    font-weight: 400;
  }
}
.el-icon {
  order: 0 !important;
  .icon-success {
    background-color: #67c23a;
    border-radius: 50%;
    min-width: 10px;
    min-height: 10px;
  }
  .icon-error {
    background-color: #dd1515;
    border-radius: 50%;
    min-width: 10px;
    min-height: 10px;
  }
}
.icon-content {
  margin-left: auto;
}
</style>
