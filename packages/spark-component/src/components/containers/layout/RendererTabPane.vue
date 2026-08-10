<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererTabPane
职责：实现 RendererTabPane（r-tab-pane）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer tab pane 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-tab-pane
    :label="paneLabel"
    :name="paneName"
    :disabled="paneDisabled"
    :lazy="paneLazy"
    :closable="paneClosable"
  >
    <div :class="['renderer-tabs-pane-body', paneBodyClass]" :style="paneGridStyle">
        <div
          v-for="(child, index) in paneChildren"
          :key="nodeId(child) ?? `r-tab-pane-child-${index}`"
          class="renderer-tabs-pane-grid-item"
          :style="getPaneChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
        <slot />
    </div>
  </el-tab-pane>
</template>

<script setup lang="ts">
/**
 * @description 标签页面板（r-tabs 内部）。
 * @category internal
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkComponent } from '../../internal'

import { useCompositeItemGrid } from '../runtime/container-layout'
import type { SparkNodeProps } from '../../shared-types'
import { nodeId } from '@spark-appworks/spark-data'

/** r-tabs 内部标签页面板属性，描述标签头和内容区布局。 */
type Props = SparkNodeProps & {
  /** 标签页唯一标识 */
    name?: string | number
    /** 标签页标签文本 */
    label?: string
    /** 是否禁用 */
    disabled?: boolean
    /** 是否延迟加载 */
    lazy?: boolean
    /** 是否可关闭 */
    closable?: boolean
    /** 标签页体自定义 class */
    bodyClass?: string
    /** CSS Grid 列数 */
    gridColumns?: number | string
    /** 栅格行高 */
    gridAutoRows?: string
    /** 栅格间距 */
    gridGap?: number | string
    /** 在父容器中的位置序号 */
    index: number}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-tab-pane',
})

useSparkComponent(props)

const {
  contentChildren: paneChildren,
  contentBodyClass: paneBodyClass,
  contentGridStyle: paneGridStyle,
  getContentChildGridStyle: getPaneChildGridStyle,
} = useCompositeItemGrid({
  children: () => props.children,
  bodyClass: () => props.bodyClass,
  gridColumns: () => props.gridColumns,
  gridAutoRows: () => props.gridAutoRows,
  gridGap: () => props.gridGap,
})

const paneName = computed<string | number>(() => {
  const value = props.name
  return typeof value === 'string' || typeof value === 'number' ? value : `tab-${props.index}`
})

const paneLabel = computed(() => {
  const value = props.label
  return typeof value === 'string' && value.trim().length > 0 ? value : `标签页${props.index + 1}`
})

const paneDisabled = computed(() => props.disabled === true)
const paneLazy = computed(() => props.lazy === true)
const paneClosable = computed(() => props.closable === true)

</script>

