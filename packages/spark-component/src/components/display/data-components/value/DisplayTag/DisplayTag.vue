<!--
@module @spark-appworks/spark-component:components/display/data-components/value/DisplayTag/DisplayTag
职责：实现 DisplayTag（display-tag）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/data-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display tag 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-tag
    v-if="isVisible"
    :type="resolvedTagType"
    :closable="closable"
    :disable-transitions="disableTransitions"
    :hit="hit"
    :round="round"
    :color="color"
    :size="size"
    :effect="effect"
    @close="handleClose"
  >
    {{ resolvedContent }}
  </el-tag>
</template>

<script setup lang="ts">
/**
 * @description 标签展示组件，支持类型/尺寸/主题样式和可关闭功能。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import { useDisplayDataSource } from '../../../useDisplayDataSource'
import type { RTagProps, TagType } from './DisplayTag.props'

function normalizeTagType(value: unknown): TagType | undefined {
  if (typeof value !== 'string') return undefined
  if (value === 'success' || value === 'info' || value === 'warning' || value === 'danger') return value
  return undefined
}



const props = withDefaults(defineProps<RTagProps>(), {
  type: 'r-tag',
  closable: false,
  disableTransitions: false,
  hit: false,
  round: false,
  size: 'default',
  effect: 'light',
})

const emit = defineEmits<{
  /** Tag close requested; 用户点击可关闭标签的关闭入口。 */
  close: []
}>()

const { isVisible } = useSparkPageComponent(props)
const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedContent = computed(() => {
  if (props.content !== undefined) return props.content
  const value = dataValue.value
  if (value !== undefined && value !== null) return String(value)
  return ''
})

const resolvedTagType = computed<TagType | undefined>(() => {
  const staticType = normalizeTagType(props.tagType)
  if (staticType) return staticType

  const sourceValue = props.value ?? dataValue.value ?? props.content ?? resolvedContent.value
  if (sourceValue === undefined || sourceValue === null) return undefined

  return normalizeTagType(props.dynamicType?.[String(sourceValue)])
})

function handleClose() {
  emit('close')
}
</script>

