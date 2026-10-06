/**
 * @module @spark-appworks/spark-component:page/actions/action-executor
 * 职责：提供 action executor 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * Action Descriptor 执行引擎（单一真源）
 *
 * 解析并执行声明式 action descriptor，提供框架无关的行为执行能力。
 * 由 normalizeRuleEvents（on 事件）、容器 wrapper 区域（如 r-toolbar）以及
 * SparkNode 翻译器（nodeToActionDescriptor）共同使用。
 *
 * ## 执行模型
 * ```
 * executeActionDescriptor(descriptor, ctx, options?)
 *   ├─ cancelDefault → control.cancel = true（通知容器跳过默认行为）
 *   ├─ dispatchAction → 按 action 类型路由到具体执行器
 *   │    ├─ UI 类 → executeShowMessage / executeConfirm / executeAlert / executeNavigate / executeOpen
 *   │    └─ 数据类 → action-data.ts 各执行器
 *   ├─ 异常捕获 → handleTopLevelError（拼接 errorMessage 文案，打日志）
 *   └─ then → 链式执行下一个 descriptor
 * ```
 */

import type {
  ActionDescriptor,
  ActionExecutionContext,
  ActionExecutionControl,
  ActionExecutionScope,
  ActionUiDecorator,
  ShowMessageAction,
  ShowConfirmAction,
  ShowAlertAction,
  NavigateAction,
  OpenAction,
} from './action-types'
import { isCancellableControl, type CancellableControl } from '../../components/containers/support/interactionControl.js'
import { Logger } from '@spark-appworks/spark-utils'
import type { DataRow, DataView } from '@spark-appworks/spark-data'
import type { PageMessageType } from '../../components/internal'
import {
  extractErrorMessage,
  interpolate,
  createActionNotifier,
  createDataViewSavePermissionInput,
  isActionDescriptorPermitted,
  isDataViewSavePermitted,
  isRowLike,
  resolveActionDataCapabilities,
} from './executor-helpers'

import {
  executeAppendRow,
  executeDelete,
  executePatch,
  executeMove,
  executeMessageRow,
  executeRefresh,
  executeClearRows,
  executeSetField,
  executeSaveDataSet,
  executeSubmitCurrentForm,
} from './action-data'

// ── UI 类动作执行器（不涉及数据变更） ─────────────────────────────────────

/** 展示消息通知，不阻塞，直接返回。 */
function executeShowMessage(desc: ShowMessageAction, ctx: ActionExecutionContext): void {
  const ps = ctx.getPageService()
  if (ps) ps.showMessage(desc.message, desc.messageType ?? 'info')
}

/** 展示 Alert 弹窗（异步阻塞，只有确认按钮）。 */
async function executeAlert(desc: ShowAlertAction, ctx: ActionExecutionContext): Promise<void> {
  const ps = ctx.getPageService()
  if (ps) await ps.showAlert(desc.message, desc.title, {})
}

/**
 * 展示确认弹窗，根据用户选择执行对应子动作分支。
 *
 * - 确认 → 执行 desc.onConfirm（若存在）
 * - 取消 → 执行 desc.onCancel（若存在）
 * - 子动作使用 runChild 回调以支持递归链式（避免循环依赖）
 */
async function executeConfirm(input: ConfirmExecutionInput): Promise<void> {
  const { desc, ctx, scope, eventArgs, control, runChild } = input
  const ps = ctx.getPageService()
  if (!ps) return

  const opts: { type?: PageMessageType } = {}
  if (desc.confirmType) opts.type = desc.confirmType

  const confirmed = await ps.showConfirm(desc.message, desc.title ?? '确认', opts)
  const nestedControl = control ?? extractActionExecutionControl(eventArgs)

  if (confirmed && desc.onConfirm) {
    await runChild(desc.onConfirm, ctx, childActionOptions(scope, eventArgs, nestedControl))
  } else if (!confirmed && desc.onCancel) {
    await runChild(desc.onCancel, ctx, childActionOptions(scope, eventArgs, nestedControl))
  }
}

/**
 * 路由跳转：支持静态路径和从 eventArgs[0]（事件行）的 `{field}` 插值。
 * 通过 RouterLike 接口调用，不直接依赖 vue-router。
 */
function resolveNavigateRow(
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
  eventArgs: unknown[] | undefined,
): DataRow | null {
  const eventRow = eventArgs?.[0]
  if (isRowLike(eventRow)) return eventRow
  if (isRowLike(scope?.row)) return scope.row

  const scopedView = ctx.getDataSource?.() ?? null
  if (isRowLike(scopedView?.currentRow)) return scopedView.currentRow


  return null
}

type NavigateExecutionInput = Readonly<{
  desc: NavigateAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
  eventArgs?: unknown[] | undefined
}>

function executeNavigate(input: NavigateExecutionInput): void {
  const { desc, ctx, scope, eventArgs } = input
  const router = ctx.getRouter()
  if (!router) return

  let path = desc.path
  if (path.includes('{')) {
    path = interpolate(path, {}, resolveNavigateRow(ctx, scope, eventArgs))
  }

  void router.push(path)
}

/**
 * 触发自定义 DOM 事件 `spark:open`，通知监听容器（Drawer/Dialog）打开指定 target。
 * 采用冒泡事件而非能力调用，避免执行器与具体容器实例直接耦合。
 */
function executeOpen(desc: OpenAction): void {
  const event = new CustomEvent('spark:open', { detail: { target: desc.target }, bubbles: true })
  document.dispatchEvent(event)
}

const logger = Logger('action-executor')

// ── 公开执行入口 ──────────────────────────────────────────────────────────

/** Action Execution Options 的调用配置。 */
export type ActionExecutionOptions = {
  /** 原始事件参数（如行数据、CancellableControl 等） */
  eventArgs?: unknown[]
  /** 流程控制信号（cancelDefault 时置 cancel=true） */
  control?: ActionExecutionControl
  /** 执行作用域（行内动作注入的当前行 + formApi 等） */
  scope?: ActionExecutionScope}

type ChildActionRunner = (
  next: ActionDescriptor,
  ctx: ActionExecutionContext,
  options: ActionExecutionOptions,
) => Promise<void>

type ConfirmExecutionInput = {
  desc: ShowConfirmAction
  ctx: ActionExecutionContext
  scope: ActionExecutionScope | undefined
  eventArgs: unknown[] | undefined
  control: ActionExecutionControl | undefined
  runChild: ChildActionRunner}

type DispatchActionInput = {
  descriptor: ActionDescriptor
  ctx: ActionExecutionContext
  scope: ActionExecutionScope | undefined
  eventArgs: unknown[] | undefined
  control: ActionExecutionControl | undefined}

/**
 * 执行单个 action descriptor（单一真源入口）。
 *
 * @param descriptor - 要执行的动作描述符
 * @param ctx - 执行上下文（DataSet、PageService、Router 等工厂函数）
 * @param options - 执行选项，包含原始事件参数、流程控制信号和执行作用域
 *
 * 执行顺序：
 * 1. cancelDefault 预处理
 * 2. dispatchAction（捕获异常 → handleTopLevelError）
 * 3. then 链式递归
 */
export async function executeActionDescriptor(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
  options: ActionExecutionOptions = {},
): Promise<void> {
  const eventArgs = options.eventArgs
  const control = options.control ?? extractActionExecutionControl(eventArgs)
  const effectiveScope = options.scope

  try {
  if (!isActionExecutionPermitted(descriptor, ctx, effectiveScope)) {
    if (control) control.cancel = true
    ctx.getPageService()?.showMessage(`后端权限不允许执行 ${descriptor.action}`, 'warning')
    return
  }

  if (descriptor.cancelDefault && control) {
    control.cancel = true
  }

    await dispatchAction({ descriptor, ctx, scope: effectiveScope, eventArgs, control })
  } catch (error) {
    handleTopLevelError(descriptor, ctx, error)
    return
  }

  if (descriptor.then) {
    const opts: ActionExecutionOptions = {}
    if (eventArgs !== undefined) opts.eventArgs = eventArgs
    if (control !== undefined) opts.control = control
    if (effectiveScope !== undefined) opts.scope = effectiveScope
    await executeActionDescriptor(descriptor.then, ctx, opts)
  }
}

function isActionExecutionPermitted(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): boolean {
  if (descriptor.action === 'save-dataset') {
    return isDataSetSavePermitted(descriptor, ctx)
  }
  const { dataSource } = resolveActionDataCapabilitiesForGuard(descriptor, ctx)
  return isActionDescriptorPermitted(descriptor, dataSource, scope)
}

type ActionGuardDataSource = Readonly<{
  dataSource: DataView | null
}>

function resolveActionDataCapabilitiesForGuard(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
): ActionGuardDataSource {
  switch (descriptor.action) {
    case 'set-field':
    case 'append-row':
    case 'delete':
    case 'patch':
    case 'move':
    case 'message-row':
    case 'refresh':
    case 'clear-rows':
    case 'submit-current-form':
      return resolveActionDataCapabilities(descriptor.dataViewKey, ctx)
    case 'show-message':
    case 'confirm':
    case 'alert':
    case 'navigate':
    case 'open':
    case 'save-dataset':
      return { dataSource: null }
    default:
      return { dataSource: null }
  }
}

function isDataSetSavePermitted(
  descriptor: Extract<ActionDescriptor, { action: 'save-dataset' }>,
  ctx: ActionExecutionContext,
): boolean {
  if (!descriptor.scenarioId.trim()) throw new Error('save-dataset 必须指定场景 scenarioId')
  const dataSet = ctx.getDataSet(descriptor.scenarioId)
  if (!dataSet) return false

  if (descriptor.views === undefined) {
    return Object.values(dataSet.tables).every(table => Object.values(table.views).every(view => (
      isDataViewSavePermitted(
        createDataViewSavePermissionInput(view, undefined, descriptor.applyEditingRows),
      )
    )))
  }

  if (descriptor.views.length === 0) throw new Error('save-dataset views 不能是空集合')
  for (const selector of descriptor.views) {
    const table = dataSet.tables[selector.tableName]
    if (!table) return false
    if (selector.viewId !== undefined && !selector.viewId.trim()) throw new Error('save-dataset viewId 必须非空')
    const views = selector.viewId !== undefined ? [table.views[selector.viewId]] : Object.values(table.views)
    if (views.length === 0) return false
    for (const view of views) {
      if (!view || !isDataViewSavePermitted(
        createDataViewSavePermissionInput(view, selector.ids, descriptor.applyEditingRows),
      )) return false
    }
  }
  return true
}

/** 提取 descriptor 上的 UI 装饰字段（data-mutating 类型才有，其他类型安全转型取 undefined）。 */
function decoratorOf(descriptor: ActionDescriptor): ActionUiDecorator | undefined {
  switch (descriptor.action) {
    case 'show-message':
    case 'confirm':
    case 'alert':
    case 'navigate':
    case 'open':
    case 'set-field':
      return undefined
    case 'append-row':
    case 'delete':
    case 'patch':
    case 'move':
    case 'message-row':
    case 'refresh':
    case 'clear-rows':
    case 'submit-current-form':
    case 'save-dataset':
      return descriptor
    default:
      return undefined
  }
}

function readUnknownActionName(value: unknown): string {
  if (value !== null && typeof value === 'object' && 'action' in value) {
    if (typeof value.action === 'string') return value.action
  }
  return 'unknown'
}

function childActionOptions(
  scope: ActionExecutionScope | undefined,
  eventArgs: unknown[] | undefined,
  control: ActionExecutionControl | undefined,
): ActionExecutionOptions {
  const options: ActionExecutionOptions = {}
  if (eventArgs !== undefined) options.eventArgs = eventArgs
  if (control !== undefined) options.control = control
  if (scope !== undefined) options.scope = scope
  return options
}

/**
 * 顶层错误处理：捕获执行器抛出的异常，组合 errorMessage 文案后通过 notifier 展示。
 * 同时在开发模式下打 warn 日志，生产环境不额外上报。
 */
function handleTopLevelError(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
  error: unknown,
): void {
  const decorator = decoratorOf(descriptor)
  const detail = extractErrorMessage(error)
  const fallback = decorator?.errorMessage
    ? interpolate(decorator.errorMessage, {}, null)
    : `${descriptor.action}失败`
  const message = detail.length > 0 ? `${fallback}: ${detail}` : fallback
  const notifier = createActionNotifier(ctx, decorator)
  notifier.notifyError(message)
  if (import.meta.env.DEV) {
    logger.warn(`action 执行失败 action=${descriptor.action} message=${message}`)
  }
}

// ── 动作路由分发（switch 穷举，TypeScript 窄化） ──────────────────────────

/**
 * 按 descriptor.action 分发到对应执行器。
 * switch 覆盖所有 ActionDescriptorActionName，default 分支做 never 穷举检查。
 * 新增动作类型时：1) 在 action-types.ts 添加类型；2) 在此处添加 case；3) 在 action-data.ts 实现执行器。
 */
async function dispatchAction(input: DispatchActionInput): Promise<void> {
  const { descriptor, ctx, scope, eventArgs, control } = input
  switch (descriptor.action) {
    case 'show-message':
      executeShowMessage(descriptor, ctx)
      return
    case 'confirm':
      await executeConfirm({
        desc: descriptor,
        ctx,
        scope,
        eventArgs,
        control,
        runChild: async (next, childCtx, childOptions) => {
          await executeActionDescriptor(next, childCtx, childOptions)
        },
      })
      return
    case 'alert':
      await executeAlert(descriptor, ctx)
      return
    case 'navigate':
      executeNavigate({ desc: descriptor, ctx, scope, eventArgs })
      return
    case 'open':
      executeOpen(descriptor)
      return
    case 'set-field':
      await executeSetField(descriptor, ctx)
      return
    case 'append-row':
      await executeAppendRow(descriptor, ctx, scope)
      return
    case 'delete':
      await executeDelete(descriptor, ctx, scope)
      return
    case 'patch':
      await executePatch(descriptor, ctx, scope)
      return
    case 'move':
      await executeMove(descriptor, ctx, scope)
      return
    case 'message-row':
      executeMessageRow(descriptor, ctx, scope)
      return
    case 'refresh':
      await executeRefresh(descriptor, ctx)
      return
    case 'clear-rows':
      await executeClearRows(descriptor, ctx)
      return
    case 'submit-current-form':
      await executeSubmitCurrentForm(descriptor, ctx, scope)
      return
    case 'save-dataset':
      await executeSaveDataSet(descriptor, ctx)
      return
    default: {
      const exhaustive: never = descriptor
      logger.warn(`未知 action 类型: ${readUnknownActionName(exhaustive)}`)
    }
  }
}

// ── 控制信号提取工具 ──────────────────────────────────────────────────────

/**
 * 从事件参数列表的最后一个元素中提取 CancellableControl。
 *
 * 约定：容器在触发事件时将 CancellableControl 作为最后一个参数注入。
 * 例如 r-table 的 `onRowClick([row, index, control])`，或 r-form 的 `onSubmit([formData, control])`。
 * 若最后一个元素不是 CancellableControl，返回 undefined（不影响执行流程）。
 */
export function extractActionExecutionControl(
  eventArgs?: readonly unknown[],
): CancellableControl | undefined {
  if (!Array.isArray(eventArgs) || eventArgs.length === 0) return undefined
  const last: unknown = eventArgs[eventArgs.length - 1]
  if (isCancellableControl(last)) return last
  return undefined
}
