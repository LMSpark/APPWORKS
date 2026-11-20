<!--
@module @spark-appworks/spark-component:components/containers/layout/overlay/RendererDropdown/RendererDropdown
职责：实现 RendererDropdown（r-dropdown）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer dropdown 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-dropdown
    v-if="isVisible"
    :trigger="trigger"
    :effect="effect"
    :placement="placement"
    :disabled="isDisabled"
    :hide-on-click="hideOnClick"
    :show-timeout="showTimeout"
    :hide-timeout="hideTimeout"
    :split-button="splitButton"
    :popper-class="popperClass"
    :max-height="maxHeight"
    @command="handleCommand"
  >
    <template #default>
      <template v-if="triggerChildren.length">
        <SparkComponentRenderer
          v-for="(child, index) in triggerChildren"
          :key="nodeId(child) ?? `r-dropdown-trigger-${index}`"
          :config="child"
        />
      </template>
      <slot v-else />
    </template>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="(item, i) in items"
          :key="item.command ?? `dropdown-item-${i}`"
          :command="item.command"
          :disabled="item.disabled"
          :divided="item.divided"
        >
          <DisplayIcon v-if="item.icon" :icon="item.icon" class="r-dropdown__icon" />
          {{ item.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
/**
 * @description 下拉菜单容器，支持分裂按钮模式和命令事件；触发区可用 children 或默认插槽。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../../../internal'
import DisplayIcon from '../../../../display/non-data-components/DisplayIcon/DisplayIcon.vue'
import type { RDropdownProps } from './RendererDropdown.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RDropdownProps>(), {
  type: 'r-dropdown',
  trigger: 'hover',
  effect: 'light',
  placement: 'bottom',
  hideOnClick: true,
  splitButton: false,
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const triggerChildren = computed(() => getSparkNodeChildren(props.children))
const items = computed(() => props.items ?? [])

function handleCommand(command: unknown): void {
  if (typeof command === 'string') props.onCommand?.(command)
}
</script>

<style scoped>
.r-dropdown__icon {
  margin-right: 6px;
}
</style>
