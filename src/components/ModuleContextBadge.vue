<!--
@module app:components/ModuleContextBadge
职责：提供主应用 ModuleContextBadge 能力，围绕 Props 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 components/ModuleContextBadge。
-->
<template>
  <div class="module-context-badge">
    <el-tag size="small" type="info">{{ displayText }}</el-tag>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import {
  useSparkComponent,
  MODULE_CONTEXT,
} from '@spark-appworks/spark-component'
import type { SparkNode } from '@spark-appworks/spark-data'

/** 模块上下文徽标属性，描述当前配置摘要和空态文本。 */
type Props = {
  /** 当前模块上下文配置对象。 */
  config?: SparkNode
  /** 徽标前置标签文本。 */
  label?: string
  /** 配置为空时展示的文本。 */
  emptyText?: string}

const props = withDefaults(defineProps<Props>(), {
  label: '上下文',
  emptyText: '未选择',
})

const { sparkConsume } = useSparkComponent(props.config ?? { type: 'r-module-context-badge' })
const moduleContextCapability = sparkConsume(MODULE_CONTEXT)

const moduleContext = ref(moduleContextCapability?.getCurrent() ?? null)

const selectedLabel = computed(() => {
  const ctx = moduleContext.value
  if (!ctx) return ''
  if (ctx.selected === null) return ''
  const selected = String(ctx.selected)
  const item = ctx.items.find(option => String(option.id) === selected)
  return item?.title ?? selected
})

const displayText = computed(() => {
  const prefix = props.label.trim()
  const current = selectedLabel.value
  const fallback = props.emptyText.trim()
  return `${prefix}：${current.length > 0 ? current : fallback}`
})

const unsubscribe = moduleContextCapability?.subscribe((next) => {
  moduleContext.value = next
}) ?? null

onUnmounted(() => {
  unsubscribe?.()
})
</script>

<style scoped>
.module-context-badge {
  display: inline-flex;
  align-items: center;
}
</style>
