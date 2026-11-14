<!--
@module @spark-appworks/spark-component:components/containers/layout/navigation/RendererMenu/RendererMenu
职责：实现 RendererMenu（r-menu）的 Vue 渲染入口，按菜单项树呈现纵向/横向导航菜单并回传选择。
边界：菜单项、激活与当前页由调用方给出；组件不创建导航数据、不判定权限、不跳转路由。
AI用途：需要理解 r-menu 的渲染结构、类名或选择事件时，优先查看本模块。
-->
<template>
  <el-menu
    v-if="isVisible"
    ref="menuRef"
    :class="['r-menu', `r-menu--${mode}`]"
    :mode="mode"
    :collapse="mode === 'vertical' && collapse"
    :collapse-transition="false"
    :ellipsis="mode === 'horizontal' && ellipsis"
    :default-active="activeIndex"
    :menu-trigger="menuTrigger"
    :show-timeout="showTimeout"
    :hide-timeout="hideTimeout"
    :popper-class="popperClass"
    :background-color="backgroundColor"
    :text-color="textColor"
    :active-text-color="activeTextColor"
    :router="false"
  >
    <RendererMenuNode
      v-for="item in items"
      :key="item.index"
      :item="item"
      :show-label="!(mode === 'vertical' && collapse)"
      :nested="false"
      :separator="mode === 'vertical' && !collapse"
      @select="select"
    />
  </el-menu>
</template>

<script setup lang="ts">
/**
 * @description 导航菜单，支持纵向折叠、横向溢出收纳、子菜单与分组、图标与徽标。
 * @category container
 * @notes 菜单项通过 items 给出；激活高亮用 activeIndex 或菜单项 active，选择通过 onSelect 回传。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import type { MenuItem, RMenuProps } from './RendererMenu.props'
import RendererMenuNode from './RendererMenuNode.vue'

const props = withDefaults(defineProps<RMenuProps>(), {
  type: 'r-menu',
  mode: 'vertical',
  collapse: false,
  ellipsis: true,
  menuTrigger: 'hover',
  showTimeout: 300,
  hideTimeout: 300,
})

const { isVisible } = useSparkPageComponent(props)
const menuRef = ref<{ handleResize?: () => void } | null>(null)
const items = computed(() => props.items ?? [])

function select(item: MenuItem): void {
  if (item.disabled) return
  props.onSelect?.(item.index, item)
}

/** 横向溢出只随影响宽度的内容重算；激活态变化不触发重新测量。 */
const layoutSignature = computed(() => JSON.stringify(items.value.map(layoutShape)))

function layoutShape(item: MenuItem): unknown {
  return [item.index, item.label, item.icon ?? '', item.badge ?? '', item.dividerAfter === true, (item.children ?? []).map(layoutShape)]
}

watch(layoutSignature, () => {
  if (props.mode === 'horizontal') void nextTick(() => menuRef.value?.handleResize?.())
}, { flush: 'post' })
</script>

<style scoped>
.r-menu :deep(.r-menu__label) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.r-menu :deep(.r-menu__label--selectable) {
  cursor: pointer;
}

.r-menu :deep(.r-menu__icon) {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.r-menu :deep(.r-menu__text) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.r-menu :deep(.r-menu__badge) {
  flex: 0 0 auto;
  padding: 2px 5px;
  border-radius: 8px;
  background: var(--el-color-danger, #f56c6c);
  color: #fff;
  font-size: 10px;
  line-height: 1;
}

.r-menu--vertical.el-menu--collapse :deep(.r-menu__label) {
  justify-content: center;
}

.r-menu :deep(.r-menu__separator) {
  display: block;
  height: 1px;
  margin: 8px 12px;
  padding: 0;
  list-style: none;
  border: 0;
  background: var(--el-border-color-lighter, #ebeef5);
  pointer-events: none;
}
</style>
