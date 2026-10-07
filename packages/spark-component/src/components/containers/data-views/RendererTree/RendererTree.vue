<!--
@module @spark-appworks/spark-component:components/containers/data-views/RendererTree/RendererTree
职责：实现 RendererTree（r-tree）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 table-level/data-view-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer tree 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div :class="['renderer-tree-layout', `renderer-tree-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-tree-toolbar', toolbarClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in visibleToolbarConfigs"
          :key="nodeId(action) ?? `r-tree-toolbar-${index}`"
          :config="action"
        />
    </div>

    <DataViewMetaBar
      :rows="dataState.rows.value"
      :columns="dataState.columns.value"
      :selected-rows="dataState.selectedRows.value"
      :total="dataState.total.value"
      :page="dataState.page.value"
      :page-size="dataState.pageSize.value"
      :request-state="dataState.requestState.value"
      :mutating="dataState.mutating.value"
      :loading-error="dataState.loadingError.value"
      :mutating-error="dataState.mutatingError.value"
      :aggregate-result="dataState.aggregateResult.value"
      :selection-aggregate-result="dataState.selectionAggregateResult.value"
      :show-data-view-meta="props.showDataViewMeta !== false"
      :show-aggregate-summary="props.showAggregateSummary !== false"
      :show-selection-summary="props.showSelectionSummary !== false"
    />

    <div :class="['renderer-tree-body', `renderer-tree-body--editor-${editorPositionValue}`]">
      <el-tree
        ref="nativeTreeRef"
        class="renderer-tree-main"
        :data="treeData"
        :node-key="nodeKeyField"
        :props="elTreeFieldProps"
        v-bind="treePropsValue"
        @node-click="handleNodeClick"
        @node-expand="handleNodeExpand"
        @node-collapse="handleNodeCollapse"
        @node-drop="handleNodeDrop"
      >
        <template #default="slotProps">
          <span class="custom-tree-node">
            <RendererHostScope :row="toScopeRow(slotProps?.data)">
              <template v-if="nodeContentChildren.length > 0">
                <SparkComponentRenderer
                  v-for="(child, index) in nodeContentChildren"
                  :key="nodeId(child) ?? `r-tree-node-content-${index}`"
                  :config="child"
                />
              </template>
              <template v-else>
                <slot :node="slotProps?.node" :data="slotProps?.data">
                  <span class="node-label">{{ getNodeLabel(slotProps?.data) }}</span>
                </slot>
              </template>
              <span
                v-if="hasNodeActions"
                class="tree-node-actions"
              >
                <SparkComponentRenderer :config="rawNodeActionsToolbarConfig" />
              </span>
            </RendererHostScope>
          </span>
        </template>
      </el-tree>

      <div v-if="showEditor" :class="['renderer-tree-editor', editorClassValue]" :style="editorStyleValue">
        <SparkComponentRenderer
          v-for="(child, index) in editorConfigs"
          :key="nodeId(child) ?? `r-tree-editor-${index}`"
          :config="child"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 树形容器，支持懒加载、节点操作和编辑器侧面板。
 * @category container
 * @binding dataViewKey-driven
 * @notes 树形原生属性需通过 props.treeProps 显式声明（如 defaultExpandAll、showCheckbox）
 */
/**
 * RendererTree - 树形容器组件
 *
 * 内部通过 useContainerDataSource 统一解析 dataViewKey，并走能力链读取 PAGE_RUNTIME。
 */
import { computed, nextTick, ref, toRef, watch } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  DATA_SOURCE,
} from '../../../internal'
import type { RTreeProps } from './RendererTree.props'
import { type SparkNode, type DataRow, type DataView, nodeInputProp, nodeId } from '@spark-appworks/spark-data'
import type { RendererTreeApi } from './types'
import {
  createRendererTreeZeroCode,
  type RendererTreeNode,
  type NativeTreeLike,
  type ElTreeNode,
  type ElTreeComponent,
} from './zero-code'
import { useRendererTreeInput } from './input'
import { useContainerDataSource } from '../view-data-source'
import { useRendererTreeViewState } from '../view-tree-state'
import { resolveTreeNodeText, toDataRecord } from '../data-row-utils'
import { resolveNodeBeforeRender, mergeNodeBeforeRenderProps } from '../../../support/beforeRender'
import RendererHostScope from '../../support/scope/RendererHostScope.vue'
import DataViewMetaBar from '../DataViewMetaBar.vue'

const props = withDefaults(defineProps<RTreeProps>(), {
  type: 'r-tree',
})
const treePropsValue = computed<Record<string, unknown>>(() => ({ ...(props.treeProps ?? {}) }))
const {
  nodeContentChildren,
  toolbarConfigs,
  toolbarPositionValue,
  toolbarClassValue,
  nodeActionConfigs,
  hasNodeActions,
  editorConfigs,
  editorPositionValue,
  editorClassValue,
  editorStyleValue,
  showEditor,
} = useRendererTreeInput({ props })

// 接入 SPARK 能力链
const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)

const dataState = useContainerDataSource({
  externalDataSource: toRef(props, 'dataSource'),
  dataViewKey: toRef(props, 'dataViewKey'),
  sparkConsume,
  provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererTree',
})
// -- DataView 投影（SSOT）----------------------------------------------------------

const {
  treeData,
  treeIdField,
  currentRow,
} = useRendererTreeViewState({
  dataState,
})

const nodeKeyField = computed<string>(() =>
  props.nodeKey
  ?? dataState.primaryKey.value
  ?? dataState.treeConfig.value?.idField
  ?? 'id'
)

const labelField = computed(() => dataState.treeConfig.value?.textField ?? 'label')

function getNodeLabel(data: unknown): string {
  const node = toDataRecord(data)
  if (!node) return '节点'
  return resolveTreeNodeText(node, labelField.value, '节点')
}

function toScopeRow(data: unknown): DataRow | undefined {
  return toDataRecord(data) ?? undefined
}

const elTreeFieldProps = computed(() => ({
  children: 'children',
  label: labelField.value,
}))

function resolveToolbarActionNode(node: SparkNode): SparkNode {
  const scopedRow = currentRow.value !== null && typeof currentRow.value === 'object' && !Array.isArray(currentRow.value)
    ? currentRow.value
    : undefined

  const beforeRender = resolveNodeBeforeRender(node, {
    row: scopedRow,
    data: scopedRow,
    dataSource: dataState.resolvedView.value,
    host: { type: 'r-tree-toolbar' },
  })

  return mergeNodeBeforeRenderProps(node, beforeRender.propsPatch, { markResolved: true })
}

const visibleToolbarConfigs = computed<SparkNode[]>(() =>
  toolbarConfigs.value
    .map(resolveToolbarActionNode)
    .filter(node => nodeInputProp(node, 'visible') !== false)
)
const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

// ── r-tree 包装 API ──────────────────────────────────────────────────────

const nativeTreeRef = ref<NativeTreeLike | null>(null)

const {
  treeApi,
  getNodeKey,
  syncCurrentByKey,
  handleNodeClick,
  handleNodeExpand,
  handleNodeCollapse,
  handleNodeDrop,
}: {
  treeApi: RendererTreeApi
  getNodeKey: (data: unknown) => string | number | null
  syncCurrentByKey: (key: string | number | null | undefined) => void
  handleNodeClick: (data: RendererTreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeExpand: (data: RendererTreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeCollapse: (data: RendererTreeNode, node: ElTreeNode, component: ElTreeComponent) => Promise<void>
  handleNodeDrop: (draggingNode: ElTreeNode, dropNode: ElTreeNode, dropType: string) => Promise<void>
} = createRendererTreeZeroCode({
  props,
  resolvedView: dataState.resolvedView,
  treeData,
  nativeTreeRef,
  logger,
  nodeKeyField,
  treeIdField,
})

watch(
  currentRow,
  async (nextCurrentRow) => {
    await nextTick()
    const tree = nativeTreeRef.value
    if (!tree?.setCurrentKey) return
    const key = getNodeKey(nextCurrentRow)
    tree.setCurrentKey(key ?? null)
  },
  { immediate: true },
)

watch(
  [() => treeData.value, () => props.expandLevel],
  async ([nextTreeRows, expandLevel]) => {
    if (nextTreeRows.length === 0 || expandLevel === undefined) return
    await applyExpandLevel(treeData.value, {
      treeRef: nativeTreeRef,
      resolveNodeKey: getNodeKey,
      level: expandLevel,
    })
  },
  { immediate: true },
)

watch(
  [() => treeData.value.length, () => props.currentKey],
  async ([rowCount, currentKey]) => {
    if (rowCount === 0 || currentKey === undefined) return
    await nextTick()
    syncCurrentByKey(currentKey)
  },
  { immediate: true },
)

watch(
  [() => treeData.value.length, () => props.expandToKey],
  async ([rowCount, expandToKey]) => {
    if (rowCount === 0 || expandToKey === null || expandToKey === undefined) return
    await treeApi.expandToNode(expandToKey)
  },
  { immediate: true },
)

type ApplyExpandLevelOptions = Readonly<{
  treeRef: { value: NativeTreeLike | null },
  resolveNodeKey: (data: unknown) => string | number | null
  level: number
}>

async function applyExpandLevel(
  nextTreeData: RendererTreeNode[],
  options: ApplyExpandLevelOptions,
): Promise<void> {
  const { treeRef, resolveNodeKey, level } = options
  if (!Number.isFinite(level) || level < 2) return
  await nextTick()
  const tree = treeRef.value
  for (const key of collectExpandKeysByLevel(nextTreeData, { resolveNodeKey, targetLevel: level })) {
    const nativeNode = tree?.getNode?.(key)
    nativeNode?.expand?.()
  }
}

type CollectExpandKeysOptions = Readonly<{
  resolveNodeKey: (data: unknown) => string | number | null
  targetLevel: number
  currentLevel?: number | undefined
}>

function collectExpandKeysByLevel(
  nodes: RendererTreeNode[],
  options: CollectExpandKeysOptions,
): Array<string | number> {
  const { resolveNodeKey, targetLevel } = options
  const currentLevel = options.currentLevel ?? 1
  const result: Array<string | number> = []
  if (targetLevel <= 1) return result

  for (const node of nodes) {
    const key = resolveNodeKey(node)
    if (key !== null && currentLevel < targetLevel) {
      result.push(key)
    }
    const children = Array.isArray(node.children) ? node.children : []
    if (children.length > 0 && currentLevel < targetLevel) {
      result.push(...collectExpandKeysByLevel(children, {
        resolveNodeKey,
        targetLevel,
        currentLevel: currentLevel + 1,
      }))
    }
  }

  return result
}

registerApi(treeApi)

const rawNodeActionsToolbarConfig = computed<SparkNode>(() => ({
  type: 'r-toolbar',
  children: nodeActionConfigs.value,
}))

// 事件处理器与零代码动作由 createRendererTreeZeroCode 收口
</script>

<style scoped>
.renderer-tree-layout {
  display: flex;
  gap: 12px;
  width: 100%;
  min-height: 0;
}

.renderer-tree-layout--top,
.renderer-tree-layout--bottom {
  flex-direction: column;
}

.renderer-tree-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-tree-layout--right {
  flex-direction: row-reverse;
}

.renderer-tree-main {
  min-width: 0;
  flex: 1;
  min-height: 0;
}

.renderer-tree-body {
  display: flex;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.renderer-tree-body--editor-left {
  flex-direction: row-reverse;
}

.renderer-tree-body--editor-top {
  flex-direction: column-reverse;
}

.renderer-tree-body--editor-bottom {
  flex-direction: column;
}

.renderer-tree-editor {
  min-width: 280px;
  width: min(420px, 42%);
  flex-shrink: 0;
}

.renderer-tree-body--editor-top .renderer-tree-editor,
.renderer-tree-body--editor-bottom .renderer-tree-editor {
  width: 100%;
  min-width: 0;
}

.renderer-tree-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.renderer-tree-layout--left .renderer-tree-toolbar,
.renderer-tree-layout--right .renderer-tree-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.custom-tree-node {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 8px;
  padding-right: 8px;
}

.tree-node-actions {
  display: inline-flex;
  gap: 4px;
  margin-left: auto;
}

.node-label {
  font-size: 14px;
  color: #303133;
}
</style>
