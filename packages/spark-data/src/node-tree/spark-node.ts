/**
 * @module @spark-appworks/spark-data:node-tree/spark-node
 * 职责：提供 spark-data 数据管线中的 spark node 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * SparkNode - 页面配置层的组件节点模型。
 *
 * 这是 rule.json 的唯一结构契约，也对应运行时渲染树的最小输入结构。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组（按节点结构定义与操作）                      │
 * │                                                      │
 * │  1. 节点类型：  SparkNode / SparkNodeChildren         │
 * │  2. 结构常量：  SPARK_NODE_STRUCT_KEYS                │
 * │  3. 归一化：    normalizeSparkNode()                  │
 * │                normalizeSparkNodeChildren()           │
 * │                assertSparkNodeRootKeys()              │
 * │  4. 类型守卫：  isSparkNode()                         │
 * │  5. 节点访问：  nodeId() / nodeInputProp()            │
 * │                nodeInputProps() / getSparkNodeChildren()│
 * └──────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════
// 1. 节点类型
// ═══════════════════════════════════════════════════════

/**
 * SparkNode 子节点数组。
 *
 * 允许混合结构节点与纯文本子节点（string / number）；消费侧可用
 * `getSparkNodeChildren()` 过滤出结构节点。
 */
export type SparkNodeChildren = Array<SparkNode | string | number>

/**
 * 页面配置组件节点。
 *
 * rule.json 中每个条目的基本结构，渲染器根据 type 查找对应组件，
 * 将 props 注入为组件属性，递归渲染 children。
 */
export type SparkNode = {
  /** 组件类型（对应 ComponentDefinition.type） */
  type: string
  /** 节点定位 id（SparkNodeTree / renderer key / capability context 等运行时定位统一以此为准） */
  id?: string
  /** 组件属性（业务输入通过 props 传递，如 dataViewKey / class / 组件自有配置项） */
  props?: Record<string, unknown>
  /** 子组件配置（递归）；结构子节点必须是已注册组件 type，也可混入字符串/数字文本节点 */
  children?: SparkNodeChildren
}

// ═══════════════════════════════════════════════════════
// 2. 结构常量
// ═══════════════════════════════════════════════════════

/**
 * SparkNode 结构键集合。
 *
 * 用于校验节点是否包含非法字段，业务输入必须放在 props 中。
 */
export const SPARK_NODE_STRUCT_KEYS: ReadonlySet<string> = new Set<string>(['type', 'id', 'props', 'children'])

// ═══════════════════════════════════════════════════════
// 3. 归一化
//
// 将用户输入或外部来源的节点转为合法形态。
// ═══════════════════════════════════════════════════════

function getOwnPropertyKeys(value: object): string[] {
  const keys: string[] = []
  for (const key of Object.getOwnPropertyNames(value)) {
    try { keys.push(key) } catch { /* ignore */ }
  }
  return keys
}

/** 校验节点不包含非结构键（业务字段必须在 props 中） */
function assertSparkNodeRootKeys(node: SparkNode): void {
  for (const key of getOwnPropertyKeys(node)) {
    if (!SPARK_NODE_STRUCT_KEYS.has(key)) {
      throw new Error(`[spark] SparkNode root field "${key}" is invalid. Put business input under SparkNode.props.`)
    }
  }
}

/** 递归归一化子节点数组：校验类型、过滤非法值 */
function normalizeSparkNodeChildren(children: SparkNodeChildren | undefined): SparkNodeChildren {
  if (!Array.isArray(children)) return []
  return children.map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return child
    if (isSparkNode(child)) return normalizeSparkNode(child)
    throw new Error('[spark] SparkNode.children must contain only SparkNode, string or number')
  })
}

/**
 * 归一化 SparkNode。
 *
 * 统一处理：
 * - type 必须是非空字符串
 * - 节点定位 id：只接受顶层 id
 * - props 非纯对象（null / 数组 / 原始值）→ 省略 props 键
 * - children 缺省或非数组 → `[]`
 */
export function normalizeSparkNode(node: SparkNode): SparkNode {
  assertSparkNodeRootKeys(node)

  if (typeof node.type !== 'string' || node.type.trim().length === 0) {
    throw new Error('[spark] SparkNode.type must be a non-empty string')
  }

  const normalizedProps = node.props !== undefined ? { ...node.props } : undefined

  if (normalizedProps !== undefined && Object.prototype.hasOwnProperty.call(normalizedProps, 'id')) {
    throw new Error('[spark] SparkNode.props.id is invalid. Put component identity on SparkNode.id.')
  }

  return {
    type: node.type,
    ...(typeof node.id === 'string' ? { id: node.id } : {}),
    ...(normalizedProps !== undefined && Object.keys(normalizedProps).length > 0 ? { props: normalizedProps } : {}),
    children: normalizeSparkNodeChildren(node.children),
  }
}

// ═══════════════════════════════════════════════════════
// 4. 类型守卫
// ═══════════════════════════════════════════════════════

function getStringProp(value: object, key: string): string | undefined {
  const desc = Object.getOwnPropertyDescriptor(value, key)
  return desc && typeof desc.value === 'string' ? desc.value : undefined
}

/** 判断值是否为 SparkNode 配置对象 */
export function isSparkNode(value: unknown): value is SparkNode {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const typeVal = getStringProp(value, 'type')
  return typeVal !== undefined && typeVal.trim().length > 0
}

// ═══════════════════════════════════════════════════════
// 5. 节点访问
//
// 从节点中安全读取 id、props 和结构子节点。
// ═══════════════════════════════════════════════════════

/** 从混合 children 中提取结构子节点 */
export function getSparkNodeChildren(children: SparkNodeChildren | undefined): SparkNode[] {
  if (!Array.isArray(children) || children.length === 0) return []
  return children.filter(isSparkNode)
}

/** 读取节点 id */
export function nodeId(node: { id?: unknown; props?: Record<string, unknown> }): string | undefined {
  const topLevelId = node.id
  if (typeof topLevelId === 'string') return topLevelId
  return undefined
}

/** 读取节点单个输入属性 */
export function nodeInputProp(node: SparkNode, key: string): unknown {
  return node.props?.[key]
}

/** 读取节点全部可传递输入属性 */
export function nodeInputProps(node: SparkNode): Record<string, unknown> {
  return node.props ?? {}
}
