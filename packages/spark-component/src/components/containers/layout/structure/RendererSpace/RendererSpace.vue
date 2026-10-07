<!--
@module @spark-appworks/spark-component:components/containers/layout/structure/RendererSpace/RendererSpace
职责：实现 RendererSpace（r-space）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer space 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div v-if="isVisible" :class="spaceClasses" :style="spaceStyle">
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-space-child-${index}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 间距容器，使用 flex 布局为子组件提供均匀的水平或垂直间距，支持换行和填充。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../../../internal'
import type { RSpaceProps } from './RendererSpace.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RSpaceProps>(), {
  type: 'r-space',
  direction: 'horizontal',
  size: 12,
  wrap: false,
  fill: false,
  alignment: 'center',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))

const spaceClasses = computed(() => [
  'r-space',
  `r-space--${props.direction}`,
  { 'r-space--wrap': props.wrap, 'r-space--fill': props.fill },
])

const gapValue = computed(() => {
  if (typeof props.size === 'number') return `${props.size}px`
  return props.size
})

const spaceStyle = computed(() => ({
  display: 'flex',
  flexDirection: props.direction === 'vertical' ? ('column' as const) : ('row' as const),
  gap: gapValue.value,
  flexWrap: props.wrap ? ('wrap' as const) : ('nowrap' as const),
  alignItems: props.alignment,
  ...(props.fill ? { width: '100%' } : {}),
}))
</script>

<style scoped>
.r-space--fill > * {
  flex: 1;
}
</style>

