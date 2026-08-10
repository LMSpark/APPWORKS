<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererCollapseItem
职责：实现 RendererCollapseItem（r-collapse-item）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer collapse item 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-collapse-item
    :name="itemName"
    :title="itemTitle"
    :disabled="itemDisabled"
  >
    <div :class="['renderer-collapse-item-body', itemBodyClass]" :style="itemGridStyle">
        <div
          v-for="(child, index) in itemChildren"
          :key="nodeId(child) ?? `r-collapse-item-child-${index}`"
          class="renderer-collapse-item-grid-item"
          :style="getItemChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
        <slot />
    </div>
  </el-collapse-item>
</template>

<script setup lang="ts">
/**
 * @description 折叠面板项，面板体内以 24 列网格渲染子组件。
 * @category internal
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkComponent } from '../../internal'

import { useCompositeItemGrid } from '../runtime/container-layout'
import type { SparkNodeProps } from '../../shared-types'
import { nodeId } from '@spark-appworks/spark-data'

/** r-collapse-item 内部面板项属性，继承 SparkNode 通用节点属性。 */
type Props = SparkNodeProps & {
  /** 面板唯一标识 */
    name?: string | number
    /** 面板标题 */
    title?: string
    /** 是否禁用 */
    disabled?: boolean
    /** 面板体自定义 class */
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
  type: 'r-collapse-item',
})

useSparkComponent(props)

const {
  contentChildren: itemChildren,
  contentBodyClass: itemBodyClass,
  contentGridStyle: itemGridStyle,
  getContentChildGridStyle: getItemChildGridStyle,
} = useCompositeItemGrid({
  children: () => props.children,
  bodyClass: () => props.bodyClass,
  gridColumns: () => props.gridColumns,
  gridAutoRows: () => props.gridAutoRows,
  gridGap: () => props.gridGap,
})

const itemName = computed<string | number>(() => {
  const value = props.name
  return typeof value === 'string' || typeof value === 'number' ? value : `collapse-${props.index}`
})

const itemTitle = computed(() => {
  const value = props.title
  return typeof value === 'string' && value.trim().length > 0 ? value : `分组${props.index + 1}`
})

const itemDisabled = computed(() => props.disabled === true)
</script>

