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
import { Logger,isRecord } from '@spark-appworks/spark-utils'
import {parseJsonValue} from '@spark-appworks/spark-json-document'
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
  executeDiscardChanges,
  executeSetField,
  executeSaveDataSet,
  executeSubmitCurrentForm,
} from './action-data'

// ── UI 类动作执行器（不涉及数据变更） ─────────────────────────────────────

/** 展示消息通知，不阻塞，直接返回。 */
function executeShowMessage(desc: ShowMessageAction, ctx: ActionExecutionContext): boolean {
  const ps = ctx.getPageService()
  if (!ps) return false
  ps.showMessage(desc.message, desc.messageType ?? 'info')
  return true
}

type HostCommandInputContext=Readonly<{
 query:Readonly<Record<string,unknown>>
 scope:ActionExecutionScope|undefined
 dataSource:DataView|null|undefined
 promptValue:string|undefined
}>

function collectHostCommandRouteKeys(value:unknown,keys:Set<string>):void{
 if(Array.isArray(value)) {
 for(const item of value)collectHostCommandRouteKeys(item,keys)
 return
 }
 if(!isRecord(value))return
 if(typeof value['$route']==='string')keys.add(value['$route'])
 for(const item of Object.values(value))collectHostCommandRouteKeys(item,keys)
}

function resolveHostCommandInput(value:unknown,context:HostCommandInputContext):unknown{
 if(Array.isArray(value))return value.map(item=>resolveHostCommandInput(item,context))
 if(!isRecord(value))return value
 const record=value
 if(typeof record['$route']==='string') {
  const selected=context.query[record['$route']] ?? record['default']
  if(record['parse']==='json') {
   if(typeof selected!=='string')throw Error('host-command 路由 JSON 输入缺失')
   return parseJsonValue(selected)
  }
  return selected
 }
 if(record['$rowKey']===true) {
  const row=context.scope?.row
  return row && context.dataSource ? context.dataSource.getPkKey(row) : undefined
 }
 if(record['$row']===true)return context.scope?.row
 if(typeof record['$row']==='string')return context.scope?.row?.[record['$row']]
 if(record['$prompt']===true)return context.promptValue
 return Object.fromEntries(Object.entries(record).map(([key,item])=>[key,resolveHostCommandInput(item,context)]))
}

function readHostCommandResultPath(value:unknown,path:string):unknown{
 if(!path.trim())return value
 return path.split('.').reduce<unknown>((current,part)=>{
  if(!isRecord(current))return undefined
  return current[part]
 },value)
}

function serializeHostCommandResult(value:unknown):string{
 return JSON.stringify(value,(_key:string,item:unknown)=>typeof item==='function'?undefined:item)
}

async function callHostCommandResultMethod(result:unknown,methodPath:string,args:unknown[]):Promise<unknown>{
 const parts=methodPath.split('.').filter(Boolean)
 if(parts.length===0)throw Error('host-command 结果方法为空')
 const methodName=parts.pop()
 const owner=parts.length===0?result:readHostCommandResultPath(result,parts.join('.'))
 const method=methodName && isRecord(owner) ? owner[methodName] : undefined
 if(typeof method!=='function')throw Error('host-command 结果方法缺失')
 return await Reflect.apply(method,owner,args)
}

/** 展示 Alert 弹窗（异步阻塞，只有确认按钮）。 */
async function executeAlert(desc: ShowAlertAction, ctx: ActionExecutionContext): Promise<boolean> {
  const ps = ctx.getPageService()
  if (!ps) return false
  await ps.showAlert(desc.message, desc.title, {})
  return true
}

/**
 * 展示确认弹窗，根据用户选择执行对应子动作分支。
 *
 * - 确认 → 执行 desc.onConfirm（若存在）
 * - 取消 → 执行 desc.onCancel（若存在）
 * - 确认分支的结果决定外层成功续接。取消分支独立执行。
 */
async function executeConfirm(input: ConfirmExecutionInput): Promise<boolean> {
  const { desc, ctx, scope, eventArgs, control } = input
  const ps = ctx.getPageService()
  if (!ps) return false

  const opts: { type?: PageMessageType } = {}
  if (desc.confirmType) opts.type = desc.confirmType

  const confirmed = await ps.showConfirm(desc.message, desc.title ?? '确认', opts)
  const options = childActionOptions(scope, eventArgs, control)
  if (confirmed) {
    return desc.onConfirm ? runActionDescriptor(desc.onConfirm, ctx, options) : true
  }
  if (desc.onCancel) await runActionDescriptor(desc.onCancel, ctx, options)
  return false
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

async function executeNavigate(input: NavigateExecutionInput): Promise<boolean> {
  const { desc, ctx, scope, eventArgs } = input
  const router = ctx.getRouter()
  if (!router) return false

  let path = desc.path
  if (path.includes('{')) {
    path = interpolate(path, {}, resolveNavigateRow(ctx, scope, eventArgs))
  }

  await router.push(path)
  return true
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

type ConfirmExecutionInput = {
  desc: ShowConfirmAction
  ctx: ActionExecutionContext
  scope: ActionExecutionScope | undefined
  eventArgs: unknown[] | undefined
  control: ActionExecutionControl | undefined
}

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
  await runActionDescriptor(descriptor, ctx, options)
}

async function runActionDescriptor(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
  options: ActionExecutionOptions,
): Promise<boolean> {
  const { eventArgs, scope } = options
  const control = options.control ?? extractActionExecutionControl(eventArgs)

  try {
    if (!isActionExecutionPermitted(descriptor, ctx, scope)) {
      if (control) control.cancel = true
      ctx.getPageService()?.showMessage(`后端权限不允许执行 ${descriptor.action}`, 'warning')
      return false
    }

    if (descriptor.cancelDefault && control) control.cancel = true

    const completed = await dispatchAction({ descriptor, ctx, scope, eventArgs, control })
    if (!completed) return false
  } catch (error) {
    handleTopLevelError(descriptor, ctx, error)
    return false
  }

  return descriptor.then
    ? runActionDescriptor(descriptor.then, ctx, childActionOptions(scope, eventArgs, control))
    : true
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
    case 'discard-changes':
      return resolveActionDataCapabilities(descriptor.dataViewKey, ctx)
    case 'show-message':
    case 'confirm':
    case 'alert':
    case 'navigate':
    case 'open':
    case 'save-dataset':
      return { dataSource: null }
    case 'host-command':
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
    case 'discard-changes':
    case 'host-command':
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
async function dispatchAction(input: DispatchActionInput): Promise<boolean> {
  const { descriptor, ctx, scope, eventArgs, control } = input
  switch (descriptor.action) {
    case 'show-message':
      return executeShowMessage(descriptor, ctx)
    case 'confirm':
      return executeConfirm({ desc: descriptor, ctx, scope, eventArgs, control })
    case 'alert':
      return executeAlert(descriptor, ctx)
    case 'navigate':
      return executeNavigate({ desc: descriptor, ctx, scope, eventArgs })
    case 'open':
      executeOpen(descriptor)
      return true
    case 'set-field':
      return executeSetField(descriptor, ctx)
    case 'append-row':
      return executeAppendRow(descriptor, ctx, scope)
    case 'delete':
      return executeDelete(descriptor, ctx, scope)
    case 'patch':
      return executePatch(descriptor, ctx, scope)
    case 'move':
      return executeMove(descriptor, ctx, scope)
    case 'message-row':
      return executeMessageRow(descriptor, ctx, scope)
    case 'refresh':
      return executeRefresh(descriptor, ctx)
    case 'clear-rows':
      return executeClearRows(descriptor, ctx)
    case 'submit-current-form':
      return executeSubmitCurrentForm(descriptor, ctx, scope)
    case 'save-dataset':
      return executeSaveDataSet(descriptor, ctx)
    case 'discard-changes':
      return executeDiscardChanges(descriptor, ctx)
    case 'host-command': {
      if(!descriptor.command.trim()||!ctx.invokeHostCommand)throw Error('host-command 缺少命令宿主')
      const resultBinding = descriptor.resultDataViewKey
      const resultView = resultBinding ? ctx.resolveView(resultBinding) : null
      const assertResultView = (): void => {
        if (resultBinding && (!resultView || resultView.destroyed || ctx.resolveView(resultBinding) !== resultView)) {
          throw Error('host-command 结果 DataView 未就绪')
        }
      }
      assertResultView()
      const querySnapshotSource=ctx.getRouteQuery?.()??{}
      const pageService=ctx.getPageService()
      const promptValue=descriptor.prompt
        ? await pageService?.showPrompt(descriptor.prompt.message,descriptor.prompt.title??'输入')
        : undefined
      if (descriptor.prompt && !promptValue) return false
      const inputContext:HostCommandInputContext={
       query:querySnapshotSource,scope,
       dataSource:ctx.getDataSource?.()??null,
       promptValue:promptValue??undefined,
      }
      const routeKeys=new Set<string>()
      collectHostCommandRouteKeys(descriptor.input,routeKeys)
      collectHostCommandRouteKeys(descriptor.methodArgs,routeKeys)
      const routeSnapshot=Object.fromEntries(Array.from(routeKeys).map(key=>[key,inputContext.query[key]]))
      const assertRouteCurrent=()=>{
       const current=ctx.getRouteQuery?.()??{}
       for(const [key,value] of Object.entries(routeSnapshot)) {
        if(current[key]!==value)throw Error('host-command 路由输入已失效')
       }
      }
      const commandInput=resolveHostCommandInput(descriptor.input,inputContext)
      assertResultView()
      let result=await ctx.invokeHostCommand(descriptor.command,commandInput)
      assertRouteCurrent()
      assertResultView()
      const assertCurrent = result !== null && typeof result === 'object' && 'assertCurrent' in result
        ? result['assertCurrent'] : undefined
      if(typeof assertCurrent==='function')Reflect.apply(assertCurrent,result,[])
      if(descriptor.resultMethod) {
       const args=(descriptor.methodArgs??[]).map(value=>resolveHostCommandInput(value,inputContext))
       result=await callHostCommandResultMethod(result,descriptor.resultMethod,args)
       assertRouteCurrent()
       const methodAssert=result !== null && typeof result === 'object' && 'assertCurrent' in result
        ? result['assertCurrent'] : undefined
       if(typeof methodAssert==='function')Reflect.apply(methodAssert,result,[])
      }
      if (resultView) {
       assertResultView()
       const selected=descriptor.resultPath?readHostCommandResultPath(result,descriptor.resultPath):result
       const json=parseJsonValue(serializeHostCommandResult(selected))
       const values=Array.isArray(json)?json:[json]
       const rows:DataRow[]=[]
       for(const value of values)if(isRecord(value))rows.push({...value})
       resultView.replaceRows(rows)
      }
      if(descriptor.resultAlertTitle){
       const selected=descriptor.resultAlertPath?readHostCommandResultPath(result,descriptor.resultAlertPath):result
       const text=typeof selected==='string'?selected:serializeHostCommandResult(selected)
       await ctx.getPageService()?.showAlert(text,descriptor.resultAlertTitle,{})
      }
      if(descriptor.successMessage)ctx.getPageService()?.showMessage(descriptor.successMessage,'success')
      return true
    }
    default: {
      const exhaustive: never = descriptor
      logger.warn(`未知 action 类型: ${readUnknownActionName(exhaustive)}`)
      return false
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
