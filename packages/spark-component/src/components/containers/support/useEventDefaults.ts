/**
 * @module @spark-appworks/spark-component:components/containers/support/useEventDefaults
 * 职责：提供 use Event Defaults 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 统一事件分发器 — useEventDefaults
 *
 * 将「系统默认行为 A」与「业务脚本回调 B」按事件名称自动合并，
 * 实现容器/字段组件的零代码事件机制。
 *
 * ## 核心流程
 *
 * 1. 按事件名称注入系统默认处理方法 A
 * 2. 按事件名称查找业务脚本的事件处理方法 B（从 props/attrs 中自动读取）
 * 3. 当 B 不存在 → 直接执行 A
 * 4. 当 B 存在 → 执行 B，注入「是否阻止 A」的控制参数 C（InteractionControl）
 * 5. 判断 C.cancel → 为 false 则执行 A，为 true 则跳过 A
 *
 * ## 两种声明模式
 *
 * - **有 systemDefault**：分发器按 A/B/C 完整流程自动合并
 *   适用于交互事件（row-click / selection-change / current-change 等）
 *
 * - **无 systemDefault**：分发器仅执行 B 并返回 cancel 控制器
 *   适用于 CRUD 事件（add-row / edit-row / remove-row），调用方需手动执行 A 并处理返回值
 *
 * @example
 * ```typescript
 * const { dispatch } = useEventDefaults({
 *   'row-click': {
 *     systemDefault: (row) => view.selection.setCurrentRow(row),
 *   },
 *   'add-row': {},  // CRUD: 无 systemDefault，仅收集 cancel
 * }, props as Readonly<Record<string, unknown>>)
 *
 * // — 交互事件 → 全自动
 * async function handleRowClick(row, col, event) {
 *   await dispatch('row-click', row, col, event)
 * }
 *
 * // — CRUD → dispatch + 手动执行 A
 * async function addRow(row) {
 *   const { cancel } = await dispatch('add-row', row)
 *   if (cancel) return cancelled
 *   return await view.addRow(row)
 * }
 * ```
 */

import {
  runControlledInteraction,
  createCancellableControl,
  type InteractionControl,
} from './interactionControl'

// ── 类型 ──────────────────────────────────────────────────────────────────

/**
 * 事件默认行为声明
 */
export type EventDefaultDeclaration<TArgs extends readonly unknown[] = readonly unknown[]> = {
  /**
   * 系统默认处理方法 (A)
   *
   * 有值时：dispatch 走完整 A/B/C 流程（B 不取消 → 执行 A）
   * 无值时：dispatch 仅执行 B 并返回 cancel 控制器
   */
  systemDefault?: (...args: TArgs) => void | Promise<void>}

/** dispatch 调用签名 */
export type EventArgsMap = {
  [eventName: string]: readonly unknown[]}

/** Event Default Declarations 的语义模型。 */
export type EventDefaultDeclarations<TEvents extends EventArgsMap> = Readonly<{
  [TName in keyof TEvents]: EventDefaultDeclaration<NoInfer<TEvents[TName]>>
}>

/** Event Dispatcher 的语义模型。 */
export type EventDispatcher<TEvents extends EventArgsMap = Record<string, readonly unknown[]>> = {
  <TName extends Extract<keyof TEvents, string>>(eventName: TName, ...args: TEvents[TName]): Promise<InteractionControl>}

// ── 事件名 → prop 名 ─────────────────────────────────────────────────────

const _propNameCache = new Map<string, string>()

/**
 * kebab-case 事件名转 Vue handler prop 名
 *
 * 'row-click'       → 'onRowClick'
 * 'selection-change' → 'onSelectionChange'
 * 'add-row'          → 'onAddRow'
 */
function toHandlerPropName(eventName: string): string {
  let cached = _propNameCache.get(eventName)
  if (cached !== undefined) return cached
  const camel = eventName.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase())
  cached = `on${camel.charAt(0).toUpperCase()}${camel.slice(1)}`
  _propNameCache.set(eventName, cached)
  return cached
}

// ── 分发器 ────────────────────────────────────────────────────────────────

type HandlerFn = {
  (...a: unknown[]): void | Promise<void>}

function isHandlerFn(value: unknown): value is HandlerFn {
  return typeof value === 'function'
}

/**
 * 从 handlerSource 值中解析出业务回调函数
 *
 * 支持单函数及函数数组（Vue attr 合并可能产生数组）
 */
function resolveHandler(raw: unknown): HandlerFn | undefined {
  if (isHandlerFn(raw)) return raw
  if (Array.isArray(raw)) {
    const fns = raw.filter(isHandlerFn)
    if (fns.length === 0) return undefined
    if (fns.length === 1) return fns[0]
    // 多回调 → 顺序执行，共享同一 control 引用（作为 args 最后一个元素）
    return async (...args: unknown[]) => {
      for (const fn of fns) await fn(...args)
    }
  }
  return undefined
}

/**
 * 创建统一事件分发器
 *
 * @param declarations 事件名 → 系统默认行为声明（步骤 1）
 * @param handlerSource 业务回调来源，通常是组件 props（步骤 2 的查找数据源）
 * @returns `{ dispatch }` — 按事件名称执行 A/B/C 合并分发
 */
export function useEventDefaults<TEvents extends EventArgsMap>(
  declarations: EventDefaultDeclarations<TEvents>,
  handlerSource: Readonly<Record<string, unknown>>,
): { dispatch: EventDispatcher<TEvents> }

export function useEventDefaults(
  declarations: Readonly<Record<string, EventDefaultDeclaration>>,
  handlerSource: Readonly<Record<string, unknown>>,
): { dispatch: EventDispatcher } {
  // 预计算 eventName → propName 映射
  const propNames = new Map<string, string>()
  for (const name of Object.keys(declarations)) {
    propNames.set(name, toHandlerPropName(name))
  }

  async function dispatch(
    eventName: string,
    ...args: unknown[]
  ): Promise<InteractionControl> {
    const entry = declarations[eventName]
    if (!entry) {
      // 未声明的事件 → 透传（不应出现，防御性处理）
      return createCancellableControl()
    }

    // 步骤 2: 按事件名称查找业务回调 B（支持单函数及数组）
    const propName = propNames.get(eventName)
    const raw = propName !== undefined ? handlerSource[propName] : undefined
    const businessHandler = resolveHandler(raw)

    if (entry.systemDefault) {
      // 有系统默认 A: 步骤 3/4/5 完整流程
      const defaultFn = entry.systemDefault
      return runControlledInteraction(
        businessHandler,
        args,
        () => defaultFn(...args),
      )
    }

    // 无系统默认: 仅执行 B + 返回 cancel（CRUD 场景）
    const control = createCancellableControl()
    if (businessHandler) {
      await businessHandler(...args, control)
    }
    return control
  }

  return { dispatch }
}
