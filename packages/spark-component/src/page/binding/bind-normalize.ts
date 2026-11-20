/**
 * @module @spark-appworks/spark-component:page/binding/bind-normalize
 * 职责：提供 bind normalize 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 事件归一化工具
 *
 * 从 SparkNode 输入中提取/转换事件处理器与 Props 回调。
 * 当前仅被 SparkPageRenderer 生产渲染路径复用。
 *
 * ## 统一零代码事件机制
 *
 * 支持四种 handler 形式：
 * - string → callFunc 闭包（脚本函数名）
 * - { action: "...", cancelDefault?: boolean } → 声明式动作（异步执行，awaitable）
 * - Array<string | ActionDescriptor | Function> → 折叠为单函数，顺序执行
 * - Function → 透传
 *
 * ### cancelDefault 机制
 *
 * action descriptor 上设置 `cancelDefault: true` 时，包装闭包会提取事件参数中
 * 最后一个控制对象（`{ cancel: boolean }`）并交给 action 执行器；
 * 由执行器显式设置 `control.cancel = true`，从而阻止容器/字段默认行为。
 *
 * ### 数组折叠
 *
 * 数组 handler 折叠为**单个 async 函数**，依次执行每个子项。
 * 数组内任一 action descriptor 设了 `cancelDefault`，则整体取消默认行为。
 * 折叠后的单函数可被容器/字段统一控制包装层正确 await 并读取 cancel 标志。
 */

import { isActionDescriptor, executeActionDescriptor } from '../actions'
import type { ActionExecutionContext, ActionDescriptor, ActionExecutionOptions } from '../actions'
import { extractActionExecutionControl } from '../actions'
import { isCallable, isRecord } from '@spark-appworks/spark-utils'

/** 沙箱函数调用签名 */
type CallFunc = {
  (functionName: string, ...args: unknown[]): unknown}

// ── 单项包装 ───────────────────────────────────────────────────────────────

function wrapStringHandler(name: string, callFunc: CallFunc): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => callFunc(name, ...args)
}

function wrapActionDescriptor(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    const options: ActionExecutionOptions = {
      eventArgs: args,
    }
    const control = extractActionExecutionControl(args)
    if (control !== undefined) {
      options.control = control
    }
    await executeActionDescriptor(descriptor, ctx, options)
  }
}

// ── 数组折叠 ───────────────────────────────────────────────────────────────

/**
 * 将数组 handler 折叠为单个 async 函数。
 *
 * - 各项按声明顺序依次 await
 * - 任一 action descriptor 的 cancelDefault 生效后，cancel 标志保持 true
 */
function collapseHandlerArray(
  items: unknown[],
  callFunc: CallFunc,
  actionCtx: ActionExecutionContext | undefined,
): (...args: unknown[]) => Promise<void> {
  const wrapped: Array<(...args: unknown[]) => unknown> = []
  for (const item of items) {
    if (typeof item === 'string') {
      wrapped.push(wrapStringHandler(item, callFunc))
    } else if (actionCtx && isActionDescriptor(item)) {
      wrapped.push(wrapActionDescriptor(item, actionCtx))
    } else if (isCallable(item)) {
      wrapped.push((...args: unknown[]) => item(...args))
    }
  }

  return async (...args: unknown[]) => {
    for (const fn of wrapped) {
      await fn(...args)
    }
  }
}

// ── 公开 API ──────────────────────────────────────────────────────────────

/**
 * 将事件记录中的 handler 归一化为可执行闭包
 *
 * @param actionCtx 可选 — 传入时启用 action descriptor 支持（SparkPageRenderer 提供）
 */
function normalizeRuleEvents(
  on: Record<string, unknown>,
  callFunc: CallFunc,
  actionCtx?: ActionExecutionContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [eventName, handler] of Object.entries(on)) {
    if (typeof handler === 'string') {
      result[eventName] = wrapStringHandler(handler, callFunc)
    } else if (actionCtx && isActionDescriptor(handler)) {
      result[eventName] = wrapActionDescriptor(handler, actionCtx)
    } else if (Array.isArray(handler)) {
      result[eventName] = collapseHandlerArray(handler, callFunc, actionCtx)
    } else {
      result[eventName] = handler
    }
  }
  return result
}

/**
 * 将 props 中 on* 开头的值包装为闭包（就地修改）
 *
 * 支持三种值形式：
 * - string → callFunc 闭包（脚本函数名）
 * - { action: "...", cancelDefault?: boolean } → 声明式动作（async、可取消默认行为）
 * - Array → 折叠为单函数（同 normalizeRuleEvents 数组逻辑）
 *
 * 适用于自定义组件（如 r-tree / r-table）通过 props 传递事件回调的场景。
 *
 * @param actionCtx 可选 — 传入时启用 action descriptor 支持
 */
function normalizeOnProps(
  props: Record<string, unknown>,
  callFunc: CallFunc,
  actionCtx?: ActionExecutionContext,
): void {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'on') {
      if (isRecord(value)) {
        props[key] = normalizeRuleEvents(value, callFunc, actionCtx)
      }
      continue
    }
    if (!key.startsWith('on')) continue
    if (typeof value === 'string') {
      props[key] = wrapStringHandler(value, callFunc)
    } else if (actionCtx && isActionDescriptor(value)) {
      props[key] = wrapActionDescriptor(value, actionCtx)
    } else if (Array.isArray(value)) {
      props[key] = collapseHandlerArray(value, callFunc, actionCtx)
    }
  }
}

export {
  normalizeRuleEvents,
  normalizeOnProps,
}
