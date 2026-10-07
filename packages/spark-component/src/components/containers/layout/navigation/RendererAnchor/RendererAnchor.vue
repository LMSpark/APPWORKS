<!--
@module @spark-appworks/spark-component:components/containers/layout/navigation/RendererAnchor/RendererAnchor
职责：实现 RendererAnchor（r-anchor）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer anchor 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-anchor
    v-if="isVisible"
    :container="container"
    :offset="offset"
    :bound="bound"
    :duration="duration"
    :marker="marker"
    :direction="direction"
    :type="anchorType"
    @change="handleChange"
    @click="handleClick"
  >
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-anchor-child-${i}`"
      :config="child"
    />
  </el-anchor>
</template>

<script setup lang="ts">
/**
 * @description 锚点导航容器。
 */
import { computed } from 'vue'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
} from '../../../../internal'
import type { RAnchorProps } from './RendererAnchor.props'

const props = withDefaults(defineProps<RAnchorProps>(), {
  type: 'r-anchor',
  offset: 0,
  bound: 15,
  duration: 300,
  marker: true,
  direction: 'vertical',
  anchorType: 'default',
})

const emit = defineEmits<{
  /**
   * Anchor target changed; 用户滚动或点击后切换到新的锚点。
   * @param href Active anchor href.
   */
  change: [href: string]
  /**
   * Anchor clicked; 用户点击某个锚点入口。
   * @param e Native click event.
   * @param href Clicked anchor href.
   */
  click: [e: MouseEvent, href?: string]
}>()

const { isVisible } = useSparkPageComponent(props)

const children = computed(() => getSparkNodeChildren(props.children))

function handleChange(href: string) {
  emit('change', href)
}

function handleClick(e: MouseEvent, href?: string) {
  emit('click', e, href)
}
</script>

