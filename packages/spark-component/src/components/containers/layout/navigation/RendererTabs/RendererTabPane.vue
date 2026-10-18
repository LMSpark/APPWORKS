<!--
@module @spark-appworks/spark-component:components/containers/layout/navigation/RendererTabs/RendererTabPane
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
    <div :key="scopeKey" :class="['renderer-tabs-pane-body', paneBodyClass]" :style="paneGridStyle">
        <p v-if="aggregateError" role="alert" style="grid-column: 1 / -1">{{ aggregateError.message }}</p>
        <div
          v-for="(child, index) in paneChildren"
          :key="nodeId(child) ?? `r-tab-pane-child-${index}`"
          class="renderer-tabs-pane-grid-item"
          :style="getPaneChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
        <div v-if="$slots['default']" class="renderer-tabs-pane-slot" style="grid-column: 1 / -1; min-width: 0; width: 100%">
          <slot />
        </div>
    </div>
  </el-tab-pane>
</template>

<script setup lang="ts">
/**
 * @description 标签页面板（r-tabs 内部）。
 * @category internal
 */
import { computed } from 'vue'
import { SparkComponentRenderer } from '../../../../internal'

import { useCompositeItemGrid } from '../../../runtime/container-layout'
import { useLayoutDataContext } from '../../../runtime/layout-data-context'
import type { RTabPaneProps } from './RendererTabPane.props'
import { nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RTabPaneProps>(), {
  type: 'r-tab-pane',
})

const {scopeKey, aggregateError} = useLayoutDataContext(props)

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

