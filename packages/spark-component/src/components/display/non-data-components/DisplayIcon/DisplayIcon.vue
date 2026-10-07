<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayIcon/DisplayIcon
职责：实现 DisplayIcon（display-icon）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/static-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display icon 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-icon v-if="isVisible" :size="iconSize" :color="color">
    <component :is="resolvedIconComponent" v-if="resolvedIconComponent" />
  </el-icon>
</template>

<script setup lang="ts">
/**
 * @description 图标展示组件，解析图标名称渲染为 Element Plus 图标组件，支持尺寸和颜色配置。
 */
import { computed, markRaw, type Component } from 'vue'
import * as ElIcons from '@element-plus/icons-vue'
import { useSparkPageComponent } from '../../../internal'
import type { RDisplayIconProps } from './DisplayIcon.props'

const props = withDefaults(defineProps<RDisplayIconProps>(), {
  type: 'display-icon',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedIconComponent = computed((): Component | null => {
  if (!props.icon) return null
  const entry = Object.entries(ElIcons).find(([key]) => key === props.icon)
  return entry ? markRaw(entry[1]) : null
})
</script>

