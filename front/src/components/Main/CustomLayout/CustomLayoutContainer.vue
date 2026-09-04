<script setup>
import { useSlots } from 'vue';
import CustomLayoutTree from '@/components/Main/CustomLayout/CustomLayoutTree.vue';

const slots = useSlots();
const props = defineProps({
  editGroupName: String,
  asideWidth: {
    type: String,
    default: '240px',
  },
  leftMenus: {
    type: Array,
    default: () => [],
  },

  asideClass: {
    type: String,
    default: '',
  },
  contentClass: String,
  treeClass: String,
  contentCardClass: String,
  mainContainClass: String,
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
});

const emits = defineEmits(['menuClick', 'menuDeleteClick']);

const menuClickHandle = (row) => {
  emits('menuClick', row);
};
const menuDeleteClickHandle = (row) => {
  emits('menuDeleteClick', row);
};
</script>

<template>
  <el-container :class="props.class" class="content-container">
    <el-aside :class="asideClass" :width="asideWidth">
      <slot name="left" />
      <slot name="tree-left">
        <CustomLayoutTree
          :defaultProps="defaultProps"
          :leftMenus="leftMenus"
          :nodeClickKey="nodeClickKey"
          :treeClass="treeClass"
          @treeClickHandle="menuClickHandle"
          @deleteClickHandle="menuDeleteClickHandle"
        />
      </slot>
      <slot name="left-bottom" />
    </el-aside>

    <el-container :class="[contentClass]">
      <div :class="contentCardClass">
        <el-header v-if="slots['content-header']">
          <slot name="content-header" />
        </el-header>
        <main :class="mainContainClass" class="main-center">
          <div v-if="slots['content-header'] && slots['main']" class="main-slot-wrapper">
            <slot name="main" />
          </div>
          <slot name="main-content">
            <router-view />
          </slot>
        </main>
      </div>
    </el-container>
  </el-container>
</template>

<style lang="scss" scoped>
.main-center {
  width: 100%;
  padding: 20px;
}
</style>
