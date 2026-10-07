<!--
@module @spark-appworks/spark-component:components/display/non-data-components/feedback/DisplaySkeleton/DisplaySkeleton
职责：实现 DisplaySkeleton（display-skeleton）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/static-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display skeleton 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-skeleton
    v-if="isVisible"
    :rows="rows"
    :count="count"
    :loading="loading"
    :animated="animated"
    :throttle="throttle"
  >
    <template v-if="resolvedChildren.length" #default>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-skeleton-child-${index}`"
        :config="child"
      />
    </template>
  </el-skeleton>
</template>

<script setup lang="ts">
/**
 * @description 骨架屏加载占位组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../../../internal'
import type { RSkeletonProps } from './DisplaySkeleton.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RSkeletonProps>(), {
  type: 'r-skeleton',
  rows: 3,
  count: 1,
  loading: true,
  animated: false,
  throttle: 0,
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>

