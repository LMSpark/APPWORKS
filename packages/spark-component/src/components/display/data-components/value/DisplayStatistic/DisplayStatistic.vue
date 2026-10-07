<!--
@module @spark-appworks/spark-component:components/display/data-components/value/DisplayStatistic/DisplayStatistic
职责：实现 DisplayStatistic（display-statistic）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/data-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display statistic 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-statistic
    v-if="isVisible"
    :title="title"
    :value="resolvedValue"
    :precision="precision"
    :decimal-separator="decimalSeparator"
    :group-separator="groupSeparator"
    :prefix="prefix"
    :suffix="suffix"
    :value-style="valueStyle"
  />
</template>

<script setup lang="ts">
/**
 * @description 统计数值展示组件，支持精度、前后缀和千分位分隔。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import { useDisplayDataSource } from '../../../useDisplayDataSource'
import type { RStatisticProps } from './DisplayStatistic.props'

const props = withDefaults(defineProps<RStatisticProps>(), {
  type: 'r-statistic',
  precision: 0,
  decimalSeparator: '.',
  groupSeparator: ',',
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedValue = computed(() => {
  if (props.value !== undefined) return props.value
  const v = dataValue.value
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v
  return 0
})
</script>


