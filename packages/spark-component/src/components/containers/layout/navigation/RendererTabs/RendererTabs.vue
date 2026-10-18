<!--
@module @spark-appworks/spark-component:components/containers/layout/navigation/RendererTabs/RendererTabs
职责：实现 RendererTabs（r-tabs）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer tabs 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div :key="scopeKey" :class="['renderer-tabs-layout', `renderer-tabs-layout--${toolbarPositionValue}`, {'renderer-tabs-layout--header': props.toolbarPlacement === 'header'}]">
    <div v-if="toolbarConfig" :class="['renderer-tabs-toolbar', toolbarClassValue]">
      <SparkComponentRenderer :config="toolbarConfig" />
    </div>

    <div class="renderer-tabs-main">
      <p v-if="aggregateError" role="alert">{{ aggregateError.message }}</p>
      <el-tabs
        :model-value="currentActiveName"
        @update:model-value="handleModelUpdate"
        @tab-click="handleTabClick"
        @tab-change="handleTabChange"
      >
        <template v-if="paneConfigs.length">
          <SparkComponentRenderer
            v-for="(pane, index) in paneConfigs"
            :key="getPaneKey(pane, index)"
            :config="createPaneRendererConfig(pane, index)"
          />
        </template>
        <slot v-else />
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 标签页容器，支持工具栏。
 * @category container
 * @notes children 内放 r-tab-pane，每个 tab-pane 内可嵌套任意组件
 */
import { computed } from 'vue'
import { SparkComponentRenderer } from '../../../../internal'
import { useLayoutDataContext } from '../../../runtime/layout-data-context'

import { useContainerToolbar } from '../../../runtime/container-ui'
import type { RendererTabsApi } from './types'
import { createRendererTabsZeroCode } from './zero-code'
import { useDefaultedSelection } from '../../state'

import type { RTabsProps, TabsClickEvent } from './RendererTabs.props'
import { type SparkNode, getSparkNodeChildren, nodeInputProps, nodeInputProp, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RTabsProps>(), {
  type: 'r-tabs',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const { registerApi, scopeKey, aggregateError } = useLayoutDataContext(props)

// 工具栏优先通过 props.toolbar 输入；children 作为面板内容输入。
const paneConfigs = computed(() => getSparkNodeChildren(props.children))
const currentActiveName = useDefaultedSelection({
  value: computed(() => props.modelValue),
  items: paneConfigs,
  getValue: getPaneName,
})

const { toolbarConfig, toolbarPositionValue, toolbarClassValue } =
  useContainerToolbar({ toolbarNode: () => props.toolbar })

// ── r-tabs 包装 API ──────────────────────────────────────────────────────

const {
  tabsApi,
  handleModelUpdate,
  handleTabChange,
}: {
  tabsApi: RendererTabsApi
  handleModelUpdate: (value: string | number) => void
  handleTabChange: (value: string | number) => void
} = createRendererTabsZeroCode({
  emit,
  currentActiveName,
  paneConfigs,
  getPaneName,
  onTabChange: props.onTabChange,
})

registerApi(tabsApi)

function getPaneName(pane: SparkNode, index: number): string | number {
  const value = nodeInputProp(pane, 'name') ?? nodeInputProp(pane, 'value') ?? nodeId(pane)
  return typeof value === 'string' || typeof value === 'number' ? value : `tab-${index}`
}

function getPaneKey(pane: SparkNode, index: number): string | number {
  return nodeId(pane) ?? getPaneName(pane, index)
}

function getPaneComponentProps(pane: SparkNode): Record<string, unknown> {
  return {
    ...(pane.children !== undefined ? { children: pane.children } : {}),
    ...nodeInputProps(pane),
  }
}

function createPaneRendererConfig(pane: SparkNode, index: number): SparkNode {
  const resolvedId = nodeId(pane)
  return {
    type: 'r-tab-pane',
    ...(resolvedId !== undefined ? { id: resolvedId } : {}),
    props: {
      ...getPaneComponentProps(pane),
      name: getPaneName(pane, index),
      index,
    },
  }
}

function handleTabClick(pane: TabsClickEvent, event: Event): void {
  props.onTabClick?.(pane, event)
}

</script>

<style scoped>
.renderer-tabs-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-tabs-layout--top,
.renderer-tabs-layout--bottom {
  flex-direction: column;
}

.renderer-tabs-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-tabs-layout--right {
  flex-direction: row-reverse;
}

.renderer-tabs-main {
  min-width: 0;
  flex: 1;
}

.renderer-tabs-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-tabs-layout--left .renderer-tabs-toolbar,
.renderer-tabs-layout--right .renderer-tabs-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-tabs-pane-body {
  width: 100%;
  min-width: 0;
  padding-top: 8px;
}

.renderer-tabs-pane-grid-item {
  min-width: 0;
}
.renderer-tabs-layout--header {display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:start; column-gap:16px; row-gap:8px;}
.renderer-tabs-layout--header > .renderer-tabs-toolbar {grid-column:2; grid-row:1; justify-content:flex-end;}
.renderer-tabs-layout--header > .renderer-tabs-main,
.renderer-tabs-layout--header :deep(.renderer-tabs-main > .el-tabs) {display:contents;}
.renderer-tabs-layout--header :deep(.renderer-tabs-main > .el-tabs > .el-tabs__header) {grid-column:1; grid-row:1; min-width:0; margin:0;}
.renderer-tabs-layout--header :deep(.renderer-tabs-main > .el-tabs > .el-tabs__content) {grid-column:1 / -1; grid-row:2; min-width:0;}
@media (max-width:760px) {
  .renderer-tabs-layout--header {grid-template-columns:minmax(0,1fr);}
  .renderer-tabs-layout--header > .renderer-tabs-toolbar {grid-column:1; grid-row:2; justify-content:flex-start;}
  .renderer-tabs-layout--header :deep(.renderer-tabs-main > .el-tabs > .el-tabs__content) {grid-row:3;}
}
</style>
