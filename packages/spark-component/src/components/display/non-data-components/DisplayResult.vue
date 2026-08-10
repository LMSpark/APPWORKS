<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayResult
职责：实现 DisplayResult（display-result）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/static-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display result 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-result
    v-if="isVisible"
    :icon="icon"
    :title="title"
    :sub-title="subTitle"
  >
    <template v-if="resolvedChildren.length > 0" #extra>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-result-child-${index}`"
        :config="child"
      />
    </template>
  </el-result>
</template>

<script setup lang="ts">
/**
 * @description 结果页组件，含标题、副标题和按钮区。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../internal'
import type { RResultProps } from './DisplayResult.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RResultProps>(), {
  type: 'r-result',
  icon: 'info',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>

