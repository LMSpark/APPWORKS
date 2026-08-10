<!--
@module @spark-appworks/spark-component:components/display/data-components/DisplayAvatar
职责：实现 DisplayAvatar（display-avatar）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/data-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display avatar 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-avatar
    v-if="isVisible"
    :size="avatarSize"
    :shape="shape"
    :icon="iconComponent"
    :src="resolvedSrc"
    :src-set="srcSet"
    :alt="alt"
    :fit="fit"
  >
    <template v-if="text">{{ text }}</template>
  </el-avatar>
</template>

<script setup lang="ts">
/**
 * @description 头像展示组件，支持图片/图标/文字多种模式和尺寸配置。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { RAvatarProps } from './DisplayAvatar.props'

const props = withDefaults(defineProps<RAvatarProps>(), {
  type: 'r-avatar',
  avatarSize: 'default',
  shape: 'circle',
  fit: 'cover',
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedSrc = computed(() => {
  if (props.src) return props.src
  const v = dataValue.value
  if (typeof v === 'string') return v
  return undefined
})

const iconComponent = computed(() => {
  // el-avatar accepts Component or undefined for icon prop
  // In SparkNode config mode, we skip icon components
  return undefined
})
</script>

