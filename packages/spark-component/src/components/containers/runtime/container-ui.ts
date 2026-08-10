/**
 * @module @spark-appworks/spark-component:components/containers/runtime/container-ui
 * 职责：提供 container ui 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */

import { computed, onUnmounted, ref, toValue } from 'vue'
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type { ContextSnapshot } from '@spark-appworks/spark-utils'
import type { ModuleContextCapability } from '../../../core/capability-keys.js'
import { getSparkNodeChildren } from '@spark-appworks/spark-data'
import type { SparkNode, SparkNodeChildren } from '@spark-appworks/spark-data'

// ============================================================
// § 工具栏常量
// ============================================================

/** 工具栏位置白名单。 */
const TOOLBAR_POSITIONS = ['top', 'bottom', 'left', 'right'] as const
/** 工具栏默认样式类。 */
const DEFAULT_TOOLBAR_CLASS = 'renderer-toolbar-default'
/** 工具栏默认位置。 */
const DEFAULT_TOOLBAR_POSITION: ToolbarPosition = 'top'

// ============================================================
// § useContainerModuleContext
// ============================================================

/**
 * 订阅 ContextSnapshot 并在组件卸载时自动取消。
 *
 * - 无 capability 时返回 `ref(null)`（fail-safe，无副作用）
 * - 有 capability 时同步到 moduleContext ref，并注册 onUnmounted 清理
 */
export function useContainerModuleContext(
  capability: ModuleContextCapability | null,
): Ref<ContextSnapshot | null> {
  const moduleContext = ref<ContextSnapshot | null>(capability?.getCurrent() ?? null)

  const unsubscribe = capability?.subscribe((next) => {
    moduleContext.value = next
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  return moduleContext
}

// ============================================================
// § useContainerToolbar
// ============================================================

/** 工具栏位置枚举。 */
export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'

/** 工具栏节点所需的最小属性形状（与 RToolbarProps 结构对齐）。 */
type ToolbarLike = {
    /** 子节点集合。 */
children?: SparkNodeChildren
    /** position 字段。 */
position?: string
    /** class 字段。 */
class?: string | string[]}

/** Use Container Toolbar Options 的调用配置。 */
type UseContainerToolbarOptions = {
  /** toolbar SparkNode（响应式 getter 或 ref）。 */
  toolbarNode: MaybeRefOrGetter<ToolbarLike | null | undefined>
  /**
   * class 回退值（toolbar.class 未设置时使用）。
   * @default 'renderer-toolbar-default'
   */
  defaultClass?: string
  /**
   * position 回退值（toolbar.position 未设置或无效时使用）。
   * @default 'top'
   */
  defaultPosition?: ToolbarPosition}

/** `useContainerToolbar` 返回状态。 */
export type ContainerToolbarState = {
  /** 当前可见的工具栏子节点列表。 */
  visibleToolbarConfigs: ComputedRef<SparkNode[]>
  /** 工具栏位置（经过合法性校验后的值）。 */
  toolbarPositionValue: ComputedRef<ToolbarPosition>
  /** 工具栏 CSS class（来自节点属性或回退值）。 */
  toolbarClassValue: ComputedRef<string>
  /** 工具栏是否可见（至少有一个子节点时为 true）。 */
  showToolbar: ComputedRef<boolean>}

function isToolbarPosition(value: unknown): value is ToolbarPosition {
  return typeof value === 'string' && TOOLBAR_POSITIONS.some(p => p === value)
}

/**
 * 将 toolbar SparkNode 投影为可见性/位置/样式等运行时状态。
 */
export function useContainerToolbar(options: UseContainerToolbarOptions): ContainerToolbarState {
  const fallbackClass = options.defaultClass ?? DEFAULT_TOOLBAR_CLASS
  const fallbackPosition = options.defaultPosition ?? DEFAULT_TOOLBAR_POSITION
  const toolbarNodeValue = computed(() => toValue(options.toolbarNode))

  const visibleToolbarConfigs = computed(() =>
    getSparkNodeChildren(toolbarNodeValue.value?.children),
  )

  const toolbarPositionValue = computed<ToolbarPosition>(() => {
    const position = toolbarNodeValue.value?.position
    return isToolbarPosition(position) ? position : fallbackPosition
  })

  const toolbarClassValue = computed(() => {
    const className = toolbarNodeValue.value?.class
    return typeof className === 'string' ? className : fallbackClass
  })

  const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

  return {
    visibleToolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
    showToolbar,
  }
}

// ============================================================
// § useDataViewSyncGuard
// ============================================================

/** `useDataViewSyncGuard` 返回状态。 */
export type DataViewSyncGuardState = {
  /**
   * 在同步深度保护内执行同步操作。
   * 同步深度 > 0 时，事件桥接层可跳过循环回写。
   */
  runWithViewSync: <T>(action: () => T) => T
  /** 在同步深度保护内执行异步操作（Promise 版）。 */
  runWithViewSyncAsync: <T>(action: () => Promise<T>) => Promise<T>
  /** 当前是否处于同步保护中（syncDepth > 0）。 */
  isViewSyncing: () => boolean
  /** 获取当前同步保护的嵌套深度。 */
  getSyncDepth: () => number}

/**
 * 同步深度追踪守卫。
 *
 * 通过 syncDepth 计数器防止"A 写 DataView → DataView 事件 → A 再次被触发"的循环回写。
 * 调用方在修改 DataView 前后包裹 `runWithViewSync`，
 * 事件回调内通过 `isViewSyncing()` 检测是否跳过。
 */
export function useDataViewSyncGuard(): DataViewSyncGuardState {
  let syncDepth = 0

  function runWithViewSync<T>(action: () => T): T {
    syncDepth += 1
    try { return action() } finally { syncDepth = Math.max(0, syncDepth - 1) }
  }

  async function runWithViewSyncAsync<T>(action: () => Promise<T>): Promise<T> {
    syncDepth += 1
    try { return await action() } finally { syncDepth = Math.max(0, syncDepth - 1) }
  }

  function isViewSyncing(): boolean { return syncDepth > 0 }
  function getSyncDepth(): number { return syncDepth }

  return { runWithViewSync, runWithViewSyncAsync, isViewSyncing, getSyncDepth }
}
