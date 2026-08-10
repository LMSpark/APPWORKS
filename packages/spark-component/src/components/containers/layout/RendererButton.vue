<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererButton
职责：实现 RendererButton（r-button）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer button 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-button
    v-if="effectiveVisible"
    :type="resolved.buttonType"
    :size="resolved.buttonSize"
    :plain="resolved.plain"
    :text="resolved.text"
    :bg="bg"
    :link="resolved.link"
    :round="resolved.round"
    :circle="resolved.circle"
    :loading="loading"
    :disabled="effectiveDisabled"
    :icon="resolvedIcon"
    :auto-insert-space="autoInsertSpace"
    :color="color"
    :dark="dark"
    @click="handleClick"
  >
    {{ resolved.label }}
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-button-child-${index}`"
      :config="child"
    />
  </el-button>
</template>

<script setup lang="ts">
/**
 * @description 声明式动作按钮，支持 action（CRUD 动作）+ template（样式预设）+ 显式 props 三层样式合并。
 * @category container
 * @binding action
 * @notes 常用 action: append-row, refresh, patch-row, delete-row, delete-selected, message-row
 */
import { computed, markRaw, type Component } from 'vue'
import * as ElIcons from '@element-plus/icons-vue'
import {
  DATA_ROW,
  DATA_SOURCE,
  PAGE_DATASET,
  PAGE_SERVICE,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
  useSparkPageComponent,
  type SparkNode,
} from '../../internal'
import { resolveButtonStyle } from '../../../page/actions/index'
import type { RButtonProps } from './RendererButton.props'
import { extractPermissionSnapshot, usePermission } from '../../../permission'
import type { DataView, DataRow } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'
import { useActionButtonRuntime } from './useActionButtonRuntime'

type ClickHandler = {
  (...args: unknown[]): unknown}

const props = withDefaults(defineProps<RButtonProps>(), {
  type: 'r-button',
  bg: false,
  loading: false,
  autoInsertSpace: false,
  dark: false,
})

function isClickHandler(value: unknown): value is ClickHandler {
  return typeof value === 'function'
}

// ── 一、基础能力与上下文 ─────────────────────────────────────────────────
// useSparkPageComponent 负责接入可见性、禁用态、规范化 props 以及 capability 消费入口。
const { isVisible, isDisabled, resolvedProps, sparkConsume, logger } = useSparkPageComponent(props)
// 权限能力用于模型级与行级动作授权判断。
const permission = usePermission()

// ── 二、动作节点建模 ─────────────────────────────────────────────────────
const currentNode = computed<SparkNode>(() => ({
  type: props.type,
  props: resolvedProps.value,
  ...(props.children !== undefined ? { children: props.children } : {}),
}))

function resolveActionView(): DataView | null {
  return sparkConsume(DATA_SOURCE)
}

// 优先 DATA_ROW；退化到 DATA_SOURCE.currentRow（覆盖行内按钮与工具栏按钮）
function resolveScopedRow(): DataRow | undefined {
  const dataSource = sparkConsume(DATA_SOURCE)
  const dataRow = sparkConsume(DATA_ROW)
  return (dataRow ?? dataSource?.currentRow) ?? undefined
}

function resolvePermissionScopeRows(): DataRow[] {
  const dataRow = sparkConsume(DATA_ROW)
  if (dataRow !== null) {
    return [dataRow]
  }
  const dataSource = sparkConsume(DATA_SOURCE)
  if (dataSource && dataSource.isMultiSelect === true) {
    const selected = dataSource.selectedRows ?? []
    return selected.length > 0 ? selected.slice() : []
  }
  const currentRow = dataSource?.currentRow
  return currentRow !== null && currentRow !== undefined ? [currentRow] : []
}

// ── 三、内置动作运行时（beforeRender → disabled → execute） ─────────────
const { hasBuiltinAction, hostActionDisabled, executeAction } = useActionButtonRuntime({
  currentNode,
  resolveView: resolveActionView,
  resolveScopedRow,
  resolveContext: () => ({
    getDataSet: () => sparkConsume(PAGE_DATASET),
    getDataSource: resolveActionView,
    getPageService: () => sparkConsume(PAGE_SERVICE),
    getRouter: () => null,
  }),
  warn: (msg) => logger.warn(msg),
})

// ── 四、权限判定与可见/禁用策略 ─────────────────────────────────────────
const permissionAllowed = computed(() => {
  const dataSource = sparkConsume(DATA_SOURCE)
  const permissionSnapshot = extractPermissionSnapshot(dataSource)

  if (!permission.isModelActionAllowed(currentNode.value, permissionSnapshot)) return false

  const scopeRows = resolvePermissionScopeRows()
  if (scopeRows.length === 0) {
    return permission.isRowActionAllowed(currentNode.value, undefined)
  }
  return scopeRows.every((row) => permission.isRowActionAllowed(currentNode.value, row))
})

// 拒绝策略：hide 表示隐藏；disable 表示保留展示但不可点击。
const permissionDeniedMode = computed<'disable' | 'hide'>(() => {
  const mode = resolvedProps.value['permissionDeniedMode']
  return mode === 'hide' ? 'hide' : 'disable'
})

// 最终可见性：先看组件自身显示条件，再叠加权限策略。
const effectiveVisible = computed(() => {
  if (!isVisible.value) return false
  if (permissionAllowed.value) return true
  return permissionDeniedMode.value !== 'hide'
})

// 最终禁用态：权限拒绝且策略为 disable 时强制禁用；否则叠加自身与宿主禁用态。
const effectiveDisabled = computed(() => {
  if (!permissionAllowed.value && permissionDeniedMode.value === 'disable') {
    return true
  }
  return isDisabled.value || hostActionDisabled.value
})

// ── 五、视觉样式解析 ─────────────────────────────────────────────────────
// 显式 props 优先，action/template 为兜底与预设来源。
const resolved = computed(() => {
  const explicit: Record<string, unknown> = {}
  if (props.buttonType !== undefined) explicit['buttonType'] = props.buttonType
  if (props.buttonSize !== undefined) explicit['buttonSize'] = props.buttonSize
  if (props.plain !== undefined) explicit['plain'] = props.plain
  if (props.text !== undefined) explicit['text'] = props.text
  if (props.link !== undefined) explicit['link'] = props.link
  if (props.round !== undefined) explicit['round'] = props.round
  if (props.circle !== undefined) explicit['circle'] = props.circle
  if (props.icon !== undefined) explicit['icon'] = props.icon
  if (props.label !== undefined) explicit['label'] = props.label
  return resolveButtonStyle(props.action, props.template, explicit)
})

// icon 名称字符串转换为 Element Plus 图标组件。
const resolvedIcon = computed((): Component | null => {
  const name = resolved.value.icon
  if (!name) return null
  const entry = Object.entries(ElIcons).find(([key]) => key === name)
  return entry ? markRaw(entry[1]) : null
})

// children 统一规范化，避免模板层处理原始 mixed children。
const resolvedChildren = computed(() => getSparkNodeChildren(props.children))

// ── 六、业务 click 处理器解析 ───────────────────────────────────────────
// 支持 props.on.click 和 props.onClick 两种声明式入口。
const resolvedOnClick = computed<((...args: unknown[]) => unknown) | null>(() => {
  const on = resolvedProps.value['on']
  if (isRecord(on)) {
    const click = on['click']
    if (isClickHandler(click)) return click
  }
  const onClick = resolvedProps.value['onClick']
  if (isClickHandler(onClick)) return onClick
  return null
})

// ── 七、点击执行流 ─────────────────────────────────────────────────────
async function handleClick(event: MouseEvent): Promise<void> {
  if (hasBuiltinAction.value) {
    if (!resolveActionView()) return
    await executeAction()
    return
  }

  const onClick = resolvedOnClick.value
  if (!onClick) return
  const scopedRow = resolveScopedRow()
  await (scopedRow !== undefined ? onClick(scopedRow, event) : onClick(event))
}
</script>
