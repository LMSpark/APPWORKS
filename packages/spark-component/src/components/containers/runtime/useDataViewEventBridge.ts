/**
 * @module @spark-appworks/spark-component:components/containers/runtime/useDataViewEventBridge
 * 职责：提供 use Data View Event Bridge 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * useDataViewEventBridge.ts
 *
 * DataView → Vue 细粒度事件桥。
 *
 * 基于 view.events.on/off 注册容器状态回调，带 originatorId 过滤，
 * 防止 UI 与 DataView 之间循环回写。
 */

// ============================================================
// § 第 0 段：导入
// ============================================================

import { watchEffect } from 'vue'
import type { DataView, DataRow } from '@spark-appworks/spark-data'

// ============================================================
// § 类型定义
// ============================================================

/** DataView 事件名（桥接层内部统一使用）。 */
export type DataViewBridgeEventName =
  | 'currentRowChanged'
  | 'selectedRowsChanged'
  | 'rowsChanged'
  | 'cleared'
  | 'requestStateChanged'
  | 'summaryChanged'
  | 'selectionSummaryChanged'
  | 'mutatingChanged'
  | 'configChanged'
  | 'editingChanged'

type NoArgBridgeEventName = Extract<DataViewBridgeEventName, 'rowsChanged' | 'cleared' | 'summaryChanged' | 'selectionSummaryChanged' | 'configChanged' | 'editingChanged'>
type OriginatorBridgeEventName = Extract<DataViewBridgeEventName, 'currentRowChanged' | 'selectedRowsChanged'>
/** Data View Request State 的运行状态。 */
type DataViewRequestState = DataView['requestState']

/** 桥接层基础上下文：用于统一错误处理、诊断与日志。 */
export type DataViewBridgeBaseContext = {
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: DataViewBridgeEventName}

/** Current Row Changed Context 的运行上下文。 */
export type CurrentRowChangedContext = {
    /** 当前行数据。 */
row: DataRow | null
    /** originator Id 标识。 */
originatorId?: string
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'currentRowChanged'}

/** Selected Rows Changed Context 的运行上下文。 */
export type SelectedRowsChangedContext = {
    /** 行数据集合。 */
rows: DataRow[]
    /** originator Id 标识。 */
originatorId?: string
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'selectedRowsChanged'}

/** Rows Changed Context 的运行上下文。 */
export type RowsChangedContext = {
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'rowsChanged'}

/** Cleared Context 的运行上下文。 */
export type ClearedContext = {
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'cleared'}

/** Request State Changed Context 的运行上下文。 */
export type RequestStateChangedContext = {
    /** 当前运行状态。 */
state: DataViewRequestState
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'requestStateChanged'}

/** Summary Changed Context 的运行上下文。 */
export type SummaryChangedContext = {
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'summaryChanged'}

/** Selection Summary Changed Context 的运行上下文。 */
export type SelectionSummaryChangedContext = {
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'selectionSummaryChanged'}

/** Mutating Changed Context 的运行上下文。 */
export type MutatingChangedContext = {
    /** mutating 字段。 */
mutating: boolean
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'mutatingChanged'}

/** Config Changed Context 的运行上下文。 */
export type ConfigChangedContext = {
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'configChanged'}

/** Editing Changed Context 的运行上下文。 */
export type EditingChangedContext = {
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'editingChanged'}

/** Originator Filter Context 的运行上下文。 */
export type OriginatorFilterContext = {
    /** originator Id 标识。 */
originatorId: string | undefined
    /** view 字段。 */
view: DataView
    /** event Name 名称。 */
eventName: 'currentRowChanged' | 'selectedRowsChanged'}

/**
 * DataView 事件桥接的配置项。
 *
 * 设计目标：
 * - 让调用方只声明“需要哪些事件回调”，桥接层负责注册与清理。
 * - 对 originatorId 提供统一过滤点，避免由每个调用方重复实现。
 */
export type DataViewEventBridgeOptions = {
  /** 已解析 DataView（为空时桥接层处于 detached 状态）。 */
  resolvedView: { readonly value: DataView | null }
  /** 命中该 originatorId 的事件会被过滤。 */
  ignoreOriginatorId?: string
  /** 自定义 originatorId 过滤策略（返回 false 则不分发）。 */
  shouldDispatchByOriginatorId?: (context: OriginatorFilterContext) => boolean
  /** 总开关：false 时不注册任何监听。 */
  enabled?: boolean
  /** 当 view 为空或 enabled=false 时触发（可做 UI 复位）。 */
  onDetached?: () => void
  /** 每次成功绑定到 view 时触发。 */
  onAttached?: (view: DataView) => void
  /** currentRowChanged 事件回调。 */
  onCurrentRowChanged?: (context: CurrentRowChangedContext) => void | Promise<void>
  /** selectedRowsChanged 事件回调。 */
  onSelectedRowsChanged?: (context: SelectedRowsChangedContext) => void | Promise<void>
  /** rowsChanged 事件回调。 */
  onRowsChanged?: (context: RowsChangedContext) => void | Promise<void>
  /** cleared 事件回调。 */
  onCleared?: (context: ClearedContext) => void | Promise<void>
  /** requestStateChanged 事件回调。 */
  onRequestStateChanged?: (context: RequestStateChangedContext) => void | Promise<void>
  /** summaryChanged 事件回调。 */
  onSummaryChanged?: (context: SummaryChangedContext) => void | Promise<void>
  /** selectionSummaryChanged 事件回调。 */
  onSelectionSummaryChanged?: (context: SelectionSummaryChangedContext) => void | Promise<void>
  /** mutatingChanged 事件回调。 */
  onMutatingChanged?: (context: MutatingChangedContext) => void | Promise<void>
  /** configChanged 事件回调。 */
  onConfigChanged?: (context: ConfigChangedContext) => void | Promise<void>
  /** editingChanged 事件回调。 */
  onEditingChanged?: (context: EditingChangedContext) => void | Promise<void>
  /** 事件被 originatorId 过滤时触发。 */
  onIgnoredByOriginatorId?: (context: OriginatorFilterContext) => void
  /** 统一错误处理；未提供时默认抛错。 */
  onError?: (error: unknown, context: DataViewBridgeBaseContext) => void}

// ============================================================
// § 内部类型与工具
// ============================================================

type DataViewBridgeEventArgs =
  | [currentRow: DataRow | null, originatorId?: string]
  | [selectedRows: DataRow[], originatorId?: string]
  | []
  | [requestState: DataViewRequestState]
  | [mutating: boolean]

type DataViewBridgeEventHandler = {
  (...args: DataViewBridgeEventArgs): void}

type BridgeHandlerFactory = {
  (): unknown}

type BridgeRegistrationFactory = {
  enabled: boolean
  eventName: DataViewBridgeEventName
  createHandler: BridgeHandlerFactory}

function isBridgeHandler(value: unknown): value is DataViewBridgeEventHandler {
  return typeof value === 'function'
}

function createBridgeHandler(value: unknown): DataViewBridgeEventHandler | null {
  if (!isBridgeHandler(value)) return null
  return (...args: DataViewBridgeEventArgs) => value(...args)
}

/**
 * 组装 originator 过滤上下文。
 *
 * 单独抽函数是为了保持回调入参 shape 稳定，
 * 同时避免在多个分支里重复构造对象。
 */
function createOriginatorContext(
  originatorId: string | undefined,
  view: DataView,
  eventName: OriginatorBridgeEventName,
): OriginatorFilterContext {
  return { originatorId, view, eventName }
}

/**
 * 批量注册 DataView 事件并返回统一清理函数。
 *
 * 约束：
 * - 仅注册 enabled=true 的条目。
 * - 返回的 cleanup 必须幂等可重入（watchEffect 清理场景）。
 */
function registerDataViewEvents(
  view: DataView,
  registrations: readonly BridgeRegistrationFactory[],
): () => void {
  const cleanupHandlers: Array<() => void> = []

  for (const registration of registrations) {
    if (!registration.enabled) continue
    const handler = createBridgeHandler(registration.createHandler())
    if (!handler) continue
    view.events.on(registration.eventName, handler)
    cleanupHandlers.push(() => {
      view.events.off(registration.eventName, handler)
    })
  }

  return () => {
    for (const cleanup of cleanupHandlers) cleanup()
  }
}

// ============================================================
// § useDataViewEventBridge
// ============================================================

export function useDataViewEventBridge(options: DataViewEventBridgeOptions) {
  /** 统一错误出口：有 onError 就回调，否则抛出。 */
  const handleError = (error: unknown, context: DataViewBridgeBaseContext) => {
    if (options.onError) {
      options.onError(error, context)
      return
    }
    throw error
  }

  /**
   * 统一执行包装：
   * - 同步异常：try/catch 捕获
   * - 异步异常：Promise.catch 捕获
   */
  const runWithErrorBoundary = (
    eventName: DataViewBridgeEventName,
    view: DataView,
    runner: () => void | Promise<void>,
  ) => {
    try {
      const result = runner()
      if (result && typeof result.catch === 'function') {
        void result.catch((error) => {
          handleError(error, { view, eventName })
        })
      }
    } catch (error) {
      handleError(error, { view, eventName })
    }
  }

  const shouldDispatchByOriginator = (
    originatorId: string | undefined,
    view: DataView,
    eventName: OriginatorBridgeEventName,
  ): boolean => {
    // 规则 1：命中固定 ignoreOriginatorId 直接过滤。
    if (options.ignoreOriginatorId && originatorId === options.ignoreOriginatorId) {
      options.onIgnoredByOriginatorId?.(createOriginatorContext(originatorId, view, eventName))
      return false
    }

    // 规则 2：命中自定义过滤策略则过滤。
    if (options.shouldDispatchByOriginatorId && !options.shouldDispatchByOriginatorId({ originatorId, view, eventName })) {
      options.onIgnoredByOriginatorId?.(createOriginatorContext(originatorId, view, eventName))
      return false
    }

    return true
  }

  /**
   * 核心事件注册与生命周期管理
   *
   * 【工作流程】
   * ┌─────────────────────────────────────────────────────────────────┐
   * │ 1. 订阅阶段：watchEffect 监听 resolvedView 变化                  │
   * │    - 若 resolvedView 存在，立即调用 onAttached 回调              │
   * │    - 注册所有启用的事件监听器到 view.events.on()                 │
   * ├─────────────────────────────────────────────────────────────────┤
   * │ 2. 事件分发：DataView.events 触发时，路由到相应回调               │
   * │    - 无参事件（rowsChanged / cleared）：直接调用回调             │
   * │    - 有参事件（currentRowChanged）：传递 row + originatorId      │
   * │    - 发起者过滤：若 originatorId 匹配 ignoreOriginatorId，跳过   │
   * ├─────────────────────────────────────────────────────────────────┤
   * │ 3. 错误隔离：每个事件回调都通过 try-catch 和 Promise.catch 保护   │
   * │    - 同步错误：立即捕获并调用 onError                            │
   * │    - 异步错误：Promise 链路保护，防止未捕获异常                  │
   * ├─────────────────────────────────────────────────────────────────┤
   * │ 4. 清理阶段：onCleanup 时自动注销所有事件监听器                  │
   * │    - 组件卸载或 resolvedView 变化时触发                          │
   * │    - 确保无内存泄漏                                              │
   * └─────────────────────────────────────────────────────────────────┘
   */
  watchEffect((onCleanup) => {
    // 全局禁用：不注册监听，通知 detached。
    if (options.enabled === false) {
      options.onDetached?.()
      return
    }

    const view = options.resolvedView.value
    // 无 view：不注册监听，通知 detached。
    if (!view) {
      options.onDetached?.()
      return
    }

    options.onAttached?.(view)

    const createNoArgBridgeHandler = <T extends NoArgBridgeEventName>(
      eventName: T,
      callback: ((context: { view: DataView; eventName: T }) => void | Promise<void>) | undefined,
    ): (() => void) =>
      () => {
        // 无参事件统一走同一包装。
        runWithErrorBoundary(eventName, view, () => callback?.({ view, eventName }))
      }

    const runOriginatorEvent = (
      eventName: OriginatorBridgeEventName,
      originatorId: string | undefined,
      runner: () => void | Promise<void>,
    ) => {
      if (!shouldDispatchByOriginator(originatorId, view, eventName)) return
      runWithErrorBoundary(eventName, view, runner)
    }

    const handleCurrentRowChanged = (row: DataRow | null, originatorId?: string) => {
      runOriginatorEvent('currentRowChanged', originatorId, () =>
        options.onCurrentRowChanged?.({
          row,
          ...(originatorId !== undefined ? { originatorId } : {}),
          view,
          eventName: 'currentRowChanged',
        })
      )
    }

    const handleSelectedRowsChanged = (rows: DataRow[], originatorId?: string) => {
      runOriginatorEvent('selectedRowsChanged', originatorId, () =>
        options.onSelectedRowsChanged?.({
          rows,
          ...(originatorId !== undefined ? { originatorId } : {}),
          view,
          eventName: 'selectedRowsChanged',
        })
      )
    }

    const handleRowsChanged = createNoArgBridgeHandler('rowsChanged', options.onRowsChanged)

    const handleCleared = createNoArgBridgeHandler('cleared', options.onCleared)

    const handleRequestStateChanged = (state: DataViewRequestState) => {
      runWithErrorBoundary('requestStateChanged', view, () =>
        options.onRequestStateChanged?.({ state, view, eventName: 'requestStateChanged' })
      )
    }

    const handleSummaryChanged = createNoArgBridgeHandler('summaryChanged', options.onSummaryChanged)

    const handleSelectionSummaryChanged = createNoArgBridgeHandler(
      'selectionSummaryChanged',
      options.onSelectionSummaryChanged,
    )

    const handleMutatingChanged = (mutating: boolean) => {
      runWithErrorBoundary('mutatingChanged', view, () =>
        options.onMutatingChanged?.({ mutating, view, eventName: 'mutatingChanged' })
      )
    }

    const handleConfigChanged = createNoArgBridgeHandler('configChanged', options.onConfigChanged)
    const handleEditingChanged = createNoArgBridgeHandler('editingChanged', options.onEditingChanged)

    const registrations: BridgeRegistrationFactory[] = []

    // 小辅助：保持注册配置集中，避免长数组字面量影响可读性。
    const addRegistration = (
      enabled: boolean,
      eventName: DataViewBridgeEventName,
      createHandler: BridgeHandlerFactory,
    ): void => {
      registrations.push({
        enabled,
        eventName,
        createHandler,
      })
    }

    addRegistration(Boolean(options.onCurrentRowChanged), 'currentRowChanged', () => handleCurrentRowChanged)
    addRegistration(Boolean(options.onSelectedRowsChanged), 'selectedRowsChanged', () => handleSelectedRowsChanged)
    addRegistration(Boolean(options.onRowsChanged), 'rowsChanged', () => handleRowsChanged)
    addRegistration(Boolean(options.onCleared), 'cleared', () => handleCleared)
    addRegistration(Boolean(options.onRequestStateChanged), 'requestStateChanged', () => handleRequestStateChanged)
    addRegistration(Boolean(options.onSummaryChanged), 'summaryChanged', () => handleSummaryChanged)
    addRegistration(Boolean(options.onSelectionSummaryChanged), 'selectionSummaryChanged', () => handleSelectionSummaryChanged)
    addRegistration(Boolean(options.onMutatingChanged), 'mutatingChanged', () => handleMutatingChanged)
    addRegistration(Boolean(options.onConfigChanged), 'configChanged', () => handleConfigChanged)
    addRegistration(Boolean(options.onEditingChanged), 'editingChanged', () => handleEditingChanged)

    onCleanup(registerDataViewEvents(view, registrations))
  })
}
