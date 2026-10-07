<!--
@module @spark-appworks/spark-component:components/display/non-data-components/time/DisplayCalendar/DisplayCalendar
职责：实现 DisplayCalendar（display-calendar）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/static-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display calendar 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-calendar
    v-if="isVisible"
    v-model="modelDate"
    :range="range"
  >
    <template v-if="$slots['date-cell']" #date-cell="scope">
      <slot name="date-cell" v-bind="scope" />
    </template>
    <template v-if="$slots['header']" #header="scope">
      <slot name="header" v-bind="scope" />
    </template>
  </el-calendar>
</template>

<script setup lang="ts">
/**
 * @description 日历展示组件，支持日期范围和选中绑定。
 */
import { ref } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import type { RDisplayCalendarProps } from './DisplayCalendar.props'

const props = withDefaults(defineProps<RDisplayCalendarProps>(), {
  type: 'display-calendar',
})

const { isVisible } = useSparkPageComponent(props)

const modelDate = ref(props.value ?? new Date())
</script>


