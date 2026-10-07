<!--
@module @spark-appworks/spark-component:components/containers/layout/navigation/RendererSteps/RendererStepItem
职责：实现 RendererStepItem（r-step-item）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer step item 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-step
    v-if="mode === 'header'"
    :title="stepTitle"
    :description="stepDescription"
    :status="stepStatus"
    :disabled="stepDisabled"
    @click="emit('activate', index)"
  />

  <div v-else :class="['renderer-steps-content-body', stepBodyClass]" :style="stepGridStyle">
      <div
        v-for="(child, index) in stepChildren"
        :key="nodeId(child) ?? `r-step-child-${index}`"
        class="renderer-steps-content-grid-item"
        :style="getStepChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
      <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 步骤项组件（r-steps 内部），双模式渲染：步骤头部与步骤内容区（24 列网格）。
 * @category internal
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkComponent } from '../../../../internal'

import { useCompositeItemGrid } from '../../../runtime/container-layout'
import type { SparkNodeProps } from '../../../../shared-types'
import { nodeId } from '@spark-appworks/spark-data'

/** r-steps 内部步骤项属性，兼容步骤头部和步骤内容区。 */
type Props = SparkNodeProps & {
  /** 步骤标题 */
    title?: string
    /** 步骤描述文本 */
    description?: string
    /** 步骤状态 */
    status?: string
    /** 是否禁用 */
    disabled?: boolean
    /** 步骤体自定义 class */
    bodyClass?: string
    /** CSS Grid 列数 */
    gridColumns?: number | string
    /** 栅格行高 */
    gridAutoRows?: string
    /** 栅格间距 */
    gridGap?: number | string
    /** 在父容器中的位置序号 */
    index: number
    /** 渲染模式：步骤头部或内容区 */
    mode: 'header' | 'content'}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-step',
})

const emit = defineEmits<{
  /**
   * Step activated; 用户选择或激活当前步骤。
   * @param index Step index in the parent steps container.
   */
  activate: [index: number]
}>()

useSparkComponent(props)

const {
  contentChildren: stepChildren,
  contentBodyClass: stepBodyClass,
  contentGridStyle: stepGridStyle,
  getContentChildGridStyle: getStepChildGridStyle,
} = useCompositeItemGrid({
  children: () => props.children,
  bodyClass: () => props.bodyClass,
  gridColumns: () => props.gridColumns,
  gridAutoRows: () => props.gridAutoRows,
  gridGap: () => props.gridGap,
})

const stepTitle = computed(() => {
  const value = props.title
  return typeof value === 'string' && value.trim().length > 0 ? value : `步骤${props.index + 1}`
})

const stepDescription = computed(() => {
  const description = props.description
  return typeof description === 'string' ? description : ''
})

const stepStatus = computed<string | undefined>(() => {
  const status = props.status
  return typeof status === 'string' ? status : undefined
})

const stepDisabled = computed(() => props.disabled === true)

</script>
