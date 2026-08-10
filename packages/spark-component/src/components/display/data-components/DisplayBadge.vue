<!--
@module @spark-appworks/spark-component:components/display/data-components/DisplayBadge
职责：实现 DisplayBadge（display-badge）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/data-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display badge 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-badge
    v-if="isVisible"
    :value="resolvedBadgeValue"
    :max="max"
    :is-dot="isDot"
    :hidden="hiddenBadge"
    :type="badgeType"
    :show-zero="showZero"
    :color="color"
    :offset="offset"
    :badge-style="badgeStyle"
    :badge-class="badgeClass"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-badge-child-${index}`"
      :config="child"
    />
  </el-badge>
</template>

<script setup lang="ts">
/**
 * @description 徽章展示组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { RBadgeProps } from './DisplayBadge.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RBadgeProps>(), {
  type: 'r-badge',
  max: 99,
  isDot: false,
  hiddenBadge: false,
  badgeType: 'danger',
  showZero: true,
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedBadgeValue = computed(() => {
  if (props.badgeValue !== undefined) return props.badgeValue
  const v = dataValue.value
  if (typeof v === 'number' || typeof v === 'string') return v
  return undefined
})

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>

