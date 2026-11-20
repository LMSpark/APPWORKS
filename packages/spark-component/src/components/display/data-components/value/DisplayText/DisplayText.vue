<!--
@module @spark-appworks/spark-component:components/display/data-components/value/DisplayText/DisplayText
职责：实现 DisplayText（r-text-display）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/data-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display text 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <component
    :is="tag"
    v-if="isVisible"
    :class="['r-text-display', textClass]"
    :style="textStyle"
  >
    <template v-if="prefix">{{ prefix }}</template>{{ formattedValue }}<template v-if="suffix">{{ suffix }}</template>
  </component>
</template>

<script setup lang="ts">
/**
 * @description 文本展示组件，以 div/span/p 等 HTML 元素渲染文本值，支持前后缀和数字/货币/百分比/日期格式化。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import { useDisplayDataSource } from '../../../useDisplayDataSource'
import type { RTextDisplayProps } from './DisplayText.props'

const props = withDefaults(defineProps<RTextDisplayProps>(), {
  type: 'r-text-display',
  tag: 'span',
  precision: 2,
  placeholder: '-',
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const formattedValue = computed(() => {
  const v = dataValue.value
  if (v === undefined || v === null || v === '') return props.placeholder

  if (props.format === 'number' && typeof v === 'number') {
    return v.toLocaleString('zh-CN', { minimumFractionDigits: props.precision, maximumFractionDigits: props.precision })
  }
  if (props.format === 'currency' && typeof v === 'number') {
    return v.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: props.precision })
  }
  if (props.format === 'percent' && typeof v === 'number') {
    return `${(v * 100).toFixed(props.precision)}%`
  }
  if (props.format === 'date') {
    if (v instanceof Date) {
      return isNaN(v.getTime()) ? String(v) : v.toLocaleDateString('zh-CN')
    }
    if (typeof v !== 'string' && typeof v !== 'number') return String(v)
    const d = new Date(v)
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('zh-CN')
  }

  return String(v)
})
</script>

<style scoped>
.r-text-display {
  display: inline;
}
</style>

