<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayTimelineItem
职责：实现 DisplayTimelineItem（display-timeline-item）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/static-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display timeline item 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-timeline-item
    v-if="isVisible"
    :timestamp="timestamp"
    :hide-timestamp="hideTimestamp"
    :center="center"
    :placement="placement"
    :type="itemType"
    :color="color"
    :size="itemSize"
    :hollow="hollow"
  >
    <template v-if="resolvedChildren.length > 0">
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-timeline-item-child-${index}`"
        :config="child"
      />
    </template>
    <template v-else>{{ content }}</template>
  </el-timeline-item>
</template>

<script setup lang="ts">
/**
 * @description 时间线项。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../internal'
import type { RTimelineItemProps } from './DisplayTimelineItem.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RTimelineItemProps>(), {
  type: 'r-timeline-item',
  hideTimestamp: false,
  center: false,
  placement: 'bottom',
  itemType: 'primary',
  itemSize: 'normal',
  hollow: false,
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>

