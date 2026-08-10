/**
 * @module @spark-appworks/spark-component:components/support/beforeRender
 * 职责：支撑 beforeRender（未注册组件类型）在 infrastructure/support 中的运行时协作，补齐配置、状态或渲染器之间的连接逻辑。
 * 边界：只覆盖当前组件目录 support 的局部能力，不定义全局页面模型，也不越级操作业务数据源。
 * AI用途：需要判断 before render 的组件分层、辅助类型或内部接线时，用本模块作为局部语义入口。
 */
import type { DataPermissionSnapshot, DataRow, DataView } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'
import type { SparkNodeChildren, SparkNode } from '@spark-appworks/spark-data'

export const BEFORE_RENDER_RESOLVED_PROP = '$beforeRenderResolved'

/** onBeforeRender 同步钩子接收到的节点渲染上下文。 */
export type BeforeRenderContext = {
  /** 当前节点 id。 */
  id?: string | undefined
  /** 当前节点组件类型。 */
  type: string
  /** 当前节点 props 的安全副本，不包含 onBeforeRender 和内部标记。 */
  props: Record<string, unknown>
  /** 当前节点子节点配置。 */
  children?: SparkNodeChildren | undefined
  /** 当前节点所在行上下文。 */
  row?: DataRow | null | undefined
  /** 当前节点绑定的任意业务数据。 */
  data?: unknown
  /** 当前节点在重复渲染集合中的索引。 */
  index?: number | undefined
  /** 当前节点可访问的 DataView 数据源。 */
  dataSource?: DataView | null | undefined
  /** 当前节点所在模型的后端最终权限快照。 */
  permissionSnapshot?: DataPermissionSnapshot | null | undefined
  /** 当前渲染宿主信息。 */
  host?: {
    /** 宿主组件类型；缺失时为空。 */
    type: string | null
  } | undefined
}

/** onBeforeRender 解析后的渲染决策。 */
export type BeforeRenderState = {
  /** 节点最终是否可见。 */
  visible: boolean
  /** 需要合并回节点 props 的补丁。 */
  propsPatch: Record<string, unknown>
}

type BeforeRenderHandler = {
  (context: BeforeRenderContext): unknown}

/** 合并 beforeRender 补丁时的控制选项。 */
type MergeBeforeRenderOptions = {
  /** 是否写入内部已解析标记，避免同一节点重复执行 onBeforeRender。 */
  markResolved?: boolean
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value['then'] === 'function'
}

function isBeforeRenderHandler(value: unknown): value is BeforeRenderHandler {
  return typeof value === 'function'
}

function sanitizeContextProps(props: Record<string, unknown>): Record<string, unknown> {
  const { onBeforeRender: _onBeforeRender, [BEFORE_RENDER_RESOLVED_PROP]: _resolved, ...next } = props
  return next
}

function sanitizePatch(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}

  const nestedProps = isRecord(value['props']) ? value['props'] : undefined
  const source = nestedProps ? { ...nestedProps, ...value } : { ...value }
  const {
    props: _props,
    display: _display,
    onBeforeRender: _onBeforeRender,
    [BEFORE_RENDER_RESOLVED_PROP]: _resolved,
    ...patch
  } = source
  return patch
}

export function resolveNodeBeforeRender(
  node: SparkNode,
  context: Omit<BeforeRenderContext, 'id' | 'type' | 'props' | 'children'>,
  onWarn?: (message: string, error?: unknown) => void,
): BeforeRenderState {
  const props = node.props ?? {}
  const baseVisible = props['visible'] !== false

  if (props[BEFORE_RENDER_RESOLVED_PROP] === true) {
    return { visible: baseVisible, propsPatch: {} }
  }

  const handler = props['onBeforeRender']

  if (!isBeforeRenderHandler(handler)) {
    return { visible: baseVisible, propsPatch: {} }
  }

  try {
    const result = handler({
      id: node.id,
      type: node.type,
      props: sanitizeContextProps(props),
      children: node.children,
      ...context,
    })

    if (isPromiseLike(result)) {
      onWarn?.('[beforeRender] onBeforeRender 必须同步返回，禁止 Promise/async。', result)
      return { visible: baseVisible, propsPatch: {} }
    }

    if (typeof result === 'boolean') {
      return { visible: result, propsPatch: { visible: result } }
    }

    const visible = isRecord(result)
      ? (typeof result['visible'] === 'boolean'
          ? result['visible']
          : (typeof result['display'] === 'boolean' ? result['display'] : baseVisible))
      : baseVisible

    return {
      visible,
      propsPatch: sanitizePatch(result),
    }
  } catch (error) {
    onWarn?.('[beforeRender] onBeforeRender 执行失败。', error)
    return { visible: baseVisible, propsPatch: {} }
  }
}

export function mergeNodeBeforeRenderProps(
  node: SparkNode,
  patch: Record<string, unknown>,
  options?: MergeBeforeRenderOptions,
): SparkNode {
  if (Object.keys(patch).length === 0 && options?.markResolved !== true) return node

  const nextProps: Record<string, unknown> = {
    ...(node.props ?? {}),
    ...patch,
  }

  if (options?.markResolved === true) {
    nextProps[BEFORE_RENDER_RESOLVED_PROP] = true
  }

  return {
    ...node,
    props: nextProps,
  }
}
