/**
 * @module @spark-appworks/spark-component:page/binding/build-page-children
 * 职责：提供 build page children 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * SparkNode → page children 绑定器
 *
 * 边界约束：
 * - spark-project-model 负责提供声明式 SparkNode 树
 * - spark-component 负责将其物化为运行时 children（SparkNode[]）
 *
 * 绑定内容：
 * - on / ActionDescriptor 绑定为可执行闭包
 * - children 递归转换
 * - props 内嵌 SparkNode 递归归并
 * - 顶层 id 去重
 */

import type { ActionExecutionContext } from '../actions'
import { normalizeOnProps } from './bind-normalize.js'
import { type SparkNodeChildren, type SparkNode, normalizeSparkNode, isSparkNode } from '@spark-appworks/spark-data'

// ── 导出类型 ───────────────────────────────────────────────────────────────

/** 页面脚本函数调用签名。 */
export type PageScriptCaller = {
  (functionName: string, ...args: unknown[]): unknown}

/** buildPageChildren 运行时依赖。 */
export type BuildPageChildrenOptions = {
  /** 脚本函数调用器，用于把字符串事件名绑定到真实脚本函数。 */
  callFunc: PageScriptCaller
  /** 可选的纯渲染钩子调用器；未提供时沿用普通脚本调用器。 */
  callBeforeRender?: PageScriptCaller
  /** 动作执行上下文，用于把声明式 action descriptor 绑定成可执行闭包。 */
  actionCtx: ActionExecutionContext}

// ── 公开入口 ───────────────────────────────────────────────────────────────

/**
 * 将 SparkNode 树物化为运行时 SparkNode[]。
 *
 * 这里做的是“绑定层”，不是渲染：
 * - 统一绑定 on / on* 事件
 * - 递归处理 children 与 props 中嵌套的 SparkNode
 * - 保证顶层 id 在同一次构建内唯一
 */
export function buildPageChildren(
  rules: SparkNode[],
  options: BuildPageChildrenOptions,
): SparkNode[] {
  const { callFunc, callBeforeRender, actionCtx } = options

  // 同一轮 build 内的 id 去重表。作用域只限当前规则树，避免跨页面污染。
  const usedIds = new Set<string>()

  // ── 基础判定 ───────────────────────────────────────────────────────────

  /**
   * 仅允许字符串、数字或合法 SparkNode 进入 children。
   *
   * 这样可以把 bindValue 后的中间结果安全收敛到 SparkNodeChildren，
   * 同时过滤掉对象空壳、布尔值等不应进入渲染树的值。
   */
  function isSparkChild(value: unknown): value is SparkNodeChildren[number] {
    return typeof value === 'string' || typeof value === 'number' || isSparkNode(value)
  }

  // ── 局部归并辅助 ───────────────────────────────────────────────────────

  /**
  * 为节点顶层 id 生成本轮构建内唯一的稳定值。
   *
   * 规则：
   * - 有显式 id 时优先使用显式 id
   * - 无显式 id 时退回到组件 type
   * - 冲突时追加 `_2` / `_3`... 后缀
   */
  function ensureUniqueId(type: string, existingId: string | undefined): string {
    const base = existingId ?? type
    if (!usedIds.has(base)) {
      usedIds.add(base)
      return base
    }
    let n = 2
    while (usedIds.has(`${base}_${n}`)) n++
    const unique = `${base}_${n}`
    usedIds.add(unique)
    return unique
  }

  /**
   * 递归绑定任意值：
   * - 数组：逐项递归
   * - 普通对象：逐键递归
   * - SparkNode 形态对象：切换到 bindNode 走完整节点归并
   * - 原始值：直接透传
   */
  function bindValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(bindValue)
    if (value === null || typeof value !== 'object') return value

    if (isSparkNode(value)) return bindNode(value)

    const normalizedObject: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      normalizedObject[key] = bindValue(nested)
    }
    return normalizedObject
  }

  // ── 节点绑定主流程 ─────────────────────────────────────────────────────

  /**
   * 将单个 SparkNode 形态对象绑定为运行时 SparkNode。
   *
   * 绑定顺序故意固定：
   * 1. 复制并规范化 props
   * 2. 先处理 props 内的 on* 事件
   * 3. 递归绑定 props 中的普通业务值
   * 4. 绑定 children
   * 5. 最后统一处理顶层 id 去重
   */
  function bindNode(current: SparkNode): SparkNode {
    const normalized = normalizeSparkNode(current)
    const cloned: SparkNode = { type: normalized.type }

    // 仅复制合法 props 对象；数组/null/原始值都视为无 props。
    const propsObj = typeof normalized.props === 'object' && !Array.isArray(normalized.props)
      ? { ...normalized.props }
      : {}

    const beforeRenderHandler = propsObj['onBeforeRender']
    if (typeof beforeRenderHandler === 'string' && callBeforeRender) {
      propsObj['onBeforeRender'] = (...args: unknown[]) => callBeforeRender(beforeRenderHandler, ...args)
    }

    // props 内的 on / onXxx 先归一化，避免后续递归时把字符串事件名当普通值透传。
    normalizeOnProps(propsObj, callFunc, actionCtx)

    // 递归绑定 props 里的业务值；事件类 key 已在上一步处理，这里跳过。
    for (const [propName, propValue] of Object.entries(propsObj)) {
      if (propName === 'on' || propName.startsWith('on')) continue
      propsObj[propName] = bindValue(propValue)
    }

    // children 保持结构位置，不在绑定层做额外结构提升；这里只做递归绑定与类型收敛。
    if (Array.isArray(normalized.children)) {
      const children = normalized.children.map(bindValue).filter(isSparkChild)
      if (children.length > 0) cloned.children = children
    }

    // 仅在存在有效键时回填 props，避免产生空对象噪音。
    if (Object.keys(propsObj).length > 0) {
      cloned.props = propsObj
    }

    // id 去重放在最后；仅接受顶层 id。
    const rawId = normalized.id
    if (rawId !== undefined) {
      const nodeType = cloned.type
      const finalId = ensureUniqueId(nodeType, rawId)
      cloned.id = finalId
    }

    return cloned
  }

  // 根级规则逐项绑定，保持输入顺序稳定。
  return rules.map(bindNode)
}
