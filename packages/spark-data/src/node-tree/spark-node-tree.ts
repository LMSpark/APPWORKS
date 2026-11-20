/**
 * @module @spark-appworks/spark-data:node-tree/spark-node-tree
 * 职责：提供 spark-data 数据管线中的 spark node tree 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * SparkNodeTree - 组件节点树的不可变编辑模型。
 *
 * 围绕单个 SparkNode 实例及其递归子树，提供查询、写入、undo/redo 等完整能力。
 * 是页面设计器中规则编辑能力的真实本体。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组（按树编辑生命周期）                          │
 * │                                                      │
 * │  1. 入口常量：  SPARK_PAGE_NODE_TYPE / SPARK_PAGE_ROOT_ID│
 * │  2. JSON 输入： SparkNodeTreeJsonInput                │
 * │                SparkNodeTreeRuleJsonInput             │
 * │  3. 构造参数：  SparkNodeTreeRootParams               │
 * │                SparkNodeTreeFromJsonOptions           │
 * │  4. 查询参数：  SparkNodeTreeLookupParams             │
 * │                SparkNodeTreeChildrenParams            │
 * │                SparkNodeFindByTypeParams              │
 * │  5. 写入参数：  SparkNodeTreeAddParams                │
 * │                SparkNodeTreeAddNodesParams            │
 * │                SparkNodeTreeMoveParams                │
 * │                SparkNodeTreeSetPropsParams            │
 * │                SparkNodeTreeSetPropsBatchParams       │
 * │                SparkNodeTreeReplaceParams             │
 * │                SparkNodeTreeReplaceNodesParams        │
 * │                SparkNodeTreeRemoveParams              │
 * │                SparkNodeTreeRemoveNodesParams         │
 * │  6. 位置/结果：  SparkNodeLocation                    │
 * │                SparkNodeAddResult / AddNodesResult    │
 * │                SparkNodeMoveResult                    │
 * │                SparkNodeSetPropsResult                │
 * │                SparkNodeReplaceResult                 │
 * │                SparkNodeRemoveResult                  │
 * │                SparkNodeFindByTypeMatch/Result        │
 * │  7. 方法名联合：SparkNodeTreeMethodKey                │
 * └──────────────────────────────────────────────────────┘
 */

import { isSparkNode, normalizeSparkNode, nodeId, type SparkNode, type SparkNodeChildren } from './spark-node.js'
import { isRecord, SnapshotHistory } from '@spark-appworks/spark-utils'

// ═══════════════════════════════════════════════════════
// 1. 入口常量
// ═══════════════════════════════════════════════════════

/** 页面根节点类型标识符 */
export const SPARK_PAGE_NODE_TYPE = 'spark-page'
/** 页面根节点默认 ID */
export const SPARK_PAGE_ROOT_ID = 'spark-page-root'
const readNodeId = nodeId

/** Visit DataView keys only at declared SparkNode binding/configuration locations. */
export function visitSparkNodeDataViewBindings(
  nodes: readonly SparkNode[],
  visit: (key: string, replace: (next: string) => void) => void,
): void {
  const bindingProperties = ['dataViewKey', 'optionDataViewKey', 'edgeDataViewKey', 'additionalEdgeDataViewKey'] as const
  const structuredProperties = ['toolbar', 'actions', 'filter', 'header', 'footer', 'tail'] as const
  const visited = new WeakSet<object>()

  const visitProperty = (record: Record<string, unknown>, property: string): void => {
    const key = record[property]
    if (typeof key === 'string' && key.length > 0) visit(key, next => { record[property] = next })
  }

  const visitNode = (node: SparkNode): void => {
    if (visited.has(node)) return
    visited.add(node)
    if (node.props) visitConfig(node.props)
    if (Array.isArray(node.children)) {
      for (const child of node.children) if (isSparkNode(child)) visitNode(child)
    }
  }

  const visitConfig = (config: Record<string, unknown>): void => {
    if (visited.has(config)) return
    visited.add(config)
    for (const property of bindingProperties) visitProperty(config, property)
    const additionalNodeSources = config['additionalNodeSources']
    if (Array.isArray(additionalNodeSources)) {
      for (const source of additionalNodeSources) {
        if (isRecord(source)) visitProperty(source, 'dataViewKey')
      }
    }
    const children = config['children']
    if (Array.isArray(children)) {
      for (const child of children) if (isSparkNode(child)) visitNode(child)
    }
    for (const property of structuredProperties) {
      const nested = config[property]
      if (isRecord(nested)) visitConfig(nested)
    }
  }

  for (const node of nodes) visitNode(node)
}

function createSparkPageRoot(children: readonly SparkNode[] = []): SparkNode {
  return {
    type: SPARK_PAGE_NODE_TYPE,
    id: SPARK_PAGE_ROOT_ID,
    children: [...children],
  }
}

// ═══════════════════════════════════════════════════════
// 2. JSON 输入
//
// fromJson / fromRuleJson 的原始输入类型。
// ═══════════════════════════════════════════════════════

/** fromJson 的输入：SparkNode 对象、任意对象或 JSON 字符串 */
export type SparkNodeTreeJsonInput = SparkNode | Record<string, unknown> | string

/**
 * fromRuleJson 的输入：rule.json 的合法形态。
 * 可以是单个节点、节点数组、任意对象或数组、JSON 字符串。
 */
export type SparkNodeTreeRuleJsonInput =
  | SparkNode
  | readonly SparkNode[]
  | Record<string, unknown>
  | ReadonlyArray<Record<string, unknown>>
  | string

// ═══════════════════════════════════════════════════════
// 3. 构造参数
//
// 创建 SparkNodeTree 实例时传入的参数。
// ═══════════════════════════════════════════════════════

/** 创建 SparkNodeTree 实例的输入参数 */
export type SparkNodeTreeRootParams = {
  /** 当前被编辑的组件实例节点，可以是任意 SparkNode */
  root: SparkNode
  /** 历史记录最大条目数，默认 50；设为 0 时禁用 undo/redo */
  historyLimit?: number
}

/** SparkNodeTree.fromJson 的可选参数 */
export type SparkNodeTreeFromJsonOptions = {
  /** 历史记录最大条目数 */
  historyLimit?: number
  /** 是否在反序列化时为缺失 id 的节点自动补齐组件 id，默认 true */
  fillMissingComponentId?: boolean
}

/** SparkNodeTree 历史栈状态摘要。 */
export type SparkNodeTreeHistoryStats = {
  /** 历史快照条目数。 */
  length: number
  /** 当前历史游标位置。 */
  cursor: number
  /** 当前是否可以撤销。 */
  canUndo: boolean
  /** 当前是否可以重做。 */
  canRedo: boolean
}

// ═══════════════════════════════════════════════════════
// 4. 查询参数
//
// 查询类方法（只读，不修改树状态）的输入参数。
// ═══════════════════════════════════════════════════════

/** 按 componentId 查找节点的参数 */
export type SparkNodeTreeLookupParams = {
  /** 组件节点 ID */
  componentId: string
}

/** 定位父节点 children 的参数 */
export type SparkNodeTreeChildrenParams = {
  /** 父节点 ID，省略时表示当前根节点 */
  parentComponentId?: string | null
}

/** findByType 的查询参数 */
export type SparkNodeFindByTypeParams = {
  /** 要搜索的组件类型名，精确匹配 */
  type: string
  /** 可选，从哪个节点开始向下递归搜索，省略时从根节点开始 */
  startComponentId?: string
  /** 可选，最多返回多少条匹配结果，默认不限制 */
  limit?: number
}

// ═══════════════════════════════════════════════════════
// 5. 写入参数
//
// 写入类方法（修改树状态，触发历史快照）的输入参数。
// ═══════════════════════════════════════════════════════

/** 添加单个节点的参数 */
export type SparkNodeTreeAddParams = SparkNodeTreeChildrenParams & {
  /** 待添加的节点 */
  node: SparkNode
  /** 插入位置索引，省略时追加到末尾 */
  index?: number
}

/** 批量添加节点的参数 */
export type SparkNodeTreeAddNodesParams = SparkNodeTreeChildrenParams & {
  /** 待添加的节点列表 */
  nodes: SparkNode[]
  /** 起始插入位置索引 */
  index?: number
}

/** 移动已有节点的参数 */
export type SparkNodeTreeMoveParams = SparkNodeTreeChildrenParams & {
  /** 待移动节点的 ID */
  componentId: string
  /** 目标插入位置索引 */
  index?: number
}

/** 设置单个节点 props 的参数 */
export type SparkNodeTreeSetPropsParams = SparkNodeTreeLookupParams & {
  /** 待设置的属性键值对 */
  props: Record<string, unknown>
  /** 是否浅合并，false 时表示直接替换 */
  merge?: boolean
}

/** 批量设置节点 props 的单项参数 */
export type SparkNodeTreeSetPropsBatchItem = SparkNodeTreeLookupParams & {
  /** 待设置的属性键值对 */
  props: Record<string, unknown>
  /** 是否浅合并 */
  merge?: boolean
}

/** 批量设置节点 props 的参数 */
export type SparkNodeTreeSetPropsBatchParams = {
  /** 批量设置项列表 */
  items: SparkNodeTreeSetPropsBatchItem[]
}

/** 替换单个节点的参数 */
export type SparkNodeTreeReplaceParams = SparkNodeTreeLookupParams & {
  /** 用于替换的新节点 */
  node: SparkNode
}

/** 批量替换节点的单项参数 */
export type SparkNodeTreeReplaceNodesItem = SparkNodeTreeLookupParams & {
  /** 用于替换的新节点 */
  node: SparkNode
}

/** 批量替换节点的参数 */
export type SparkNodeTreeReplaceNodesParams = {
  /** 批量替换项列表 */
  items: SparkNodeTreeReplaceNodesItem[]
}

/** 删除单个节点的参数 */
export type SparkNodeTreeRemoveParams = {
  /** 待删除节点的 ID */
  componentId: string
}

/** 批量删除节点的参数 */
export type SparkNodeTreeRemoveNodesParams = {
  /** 待删除的节点 ID 列表 */
  componentIds: string[]
}

// ═══════════════════════════════════════════════════════
// 6. 位置信息 / 返回结果
//
// 查询和写入方法的返回值类型。
// ═══════════════════════════════════════════════════════

/** 节点在树中的位置信息 */
export type SparkNodeLocation = {
  /** 命中的节点本身 */
  node: SparkNode
  /** 直接父节点，根节点时为 null */
  parent: SparkNode | null
  /** 在父节点 children 中的索引，根节点时为 -1 */
  index: number
  /** 深度，根节点为 0 */
  depth: number
}

/** addNode 的返回结果 */
export type SparkNodeAddResult = {
  /** 已添加的节点 */
  node: SparkNode
  /** 插入位置索引 */
  index: number
}

/** addNodes 的返回结果 */
export type SparkNodeAddNodesResult = {
  /** 已添加的节点列表 */
  nodes: SparkNode[]
  /** 各节点的插入位置索引 */
  indexes: number[]
}

/** moveNode 的返回结果 */
export type SparkNodeMoveResult = {
  /** 被移动的节点 ID */
  componentId: string
  /** 原父节点 ID */
  fromParentComponentId: string | null
  /** 新父节点 ID */
  toParentComponentId: string | null
  /** 原位置索引 */
  previousIndex: number
  /** 新位置索引 */
  index: number
}

/** setProps 的返回结果 */
export type SparkNodeSetPropsResult = {
  /** 设置属性后的节点 */
  node: SparkNode
}

/** setPropsBatch 的返回结果 */
export type SparkNodeSetPropsBatchResult = {
  /** 设置属性后的节点列表 */
  nodes: SparkNode[]
}

/** replaceNode 的返回结果 */
export type SparkNodeReplaceResult = {
  /** 替换后的新节点 */
  node: SparkNode
  /** 被替换的旧节点 */
  previous: SparkNode
}

/** replaceNodes 的返回结果 */
export type SparkNodeReplaceNodesResult = {
  /** 各节点的替换结果 */
  items: SparkNodeReplaceResult[]
}

/** removeNode 的返回结果 */
export type SparkNodeRemoveResult = {
  /** 被删除的节点 */
  removed: SparkNode
  /** 被删除时的位置索引 */
  index: number
}

/** removeNodes 的返回结果 */
export type SparkNodeRemoveNodesResult = {
  /** 各节点的删除结果 */
  items: SparkNodeRemoveResult[]
}

/** findByType 单条匹配结果 */
export type SparkNodeFindByTypeMatch = {
  /** 节点的真实 id，未设置 id 时为 undefined */
  id: string | undefined
  /** 组件类型名 */
  type: string
  /** 节点在树中的深度 */
  depth: number
  /** 直接父节点 id，根节点时为 null，父节点未设置 id 时为 undefined */
  parentId: string | null | undefined
}

/** findByType 的返回结果 */
export type SparkNodeFindByTypeResult = {
  /** 按深度优先顺序排列的匹配结果 */
  matches: SparkNodeFindByTypeMatch[]
  /** 命中数；提供 limit 且提前终止时等于 matches.length */
  total: number
}

// ═══════════════════════════════════════════════════════
// 7. 方法名联合
//
// SparkNodeTree 所有公开方法的键名集合，用于动态分发。
// ═══════════════════════════════════════════════════════

/** SparkNodeTree 公开方法键名联合类型 */
export type SparkNodeTreeMethodKey =
  | 'getNode'
  | 'getLocation'
  | 'hasNode'
  | 'getParent'
  | 'listChildren'
  | 'countNodes'
  | 'getAllData'
  | 'collectDataViewKeys'
  | 'collectHandlerNames'
  | 'findByType'
  | 'addNode'
  | 'addNodes'
  | 'moveNode'
  | 'setProps'
  | 'setPropsBatch'
  | 'replaceNode'
  | 'replaceNodes'
  | 'removeNode'
  | 'removeNodes'

// ====================
// 公共 API（SparkNodeTree 编辑模型本体）
// ====================

/**
 * SparkNodeTree
 *
 * 面向单个组件实例（SparkNode）及其子树的结构编辑核心。
 *
 * 这里的 root 表示“当前被编辑的组件实例”。
 * 它既可以是页面组件，也可以是页面中的任意子组件；页面只是递归 SparkNode 模型里的一个更大组件。
 *
 * 在上层设计里，SparkNodeTree 是设计时编辑能力的真实本体：
 * 1. 调用方先查询组件列表，选择合适的组件 type；
 * 2. 再根据组件规格构造一个 SparkNode 节点对象；
 * 3. 最后调用 SparkNodeTree 的公开方法，把该节点写入当前子树，或对已有节点做查询与修改。
 *
 * 因此，这个类提供的不是“组件清单”，而是“树编辑能力集合”。
 * 上层的 tool catalog / function 列表，只是在此基础上做协议投影。
 *
 * 当前公开能力大致可分为四类：
 * 1. 节点查询：getNode / getLocation / hasNode / getParent / listChildren / findByType。
 * 2. 子树统计：countNodes / collectDataViewKeys / collectHandlerNames。
 * 3. 节点写入：addNode / addNodes / moveNode / replaceNode / replaceNodes / removeNode / removeNodes。
 * 4. 属性写入：setProps / setPropsBatch。
 *
 *
 * 设计目标：
 * 1. 构造时绑定一个当前组件实例，后续所有方法都围绕该组件及其子树工作。
 * 2. 查询类方法不修改当前树状态。
 * 3. 写操作通过不可变重写生成新子树，并回写到实例内部 root。
 * 4. 全部公开方法只接受命名参数对象，不提供位置参数重载。
 */
export class SparkNodeTree {
  private _root: SparkNode
  private readonly _history: SnapshotHistory<SparkNode>
  private _version = -1
  private _nodePaths: Map<string, number[]> | null = null

  /**
   * 从 JSON 输入创建 SparkNodeTree。
   *
   * - 支持对象或 JSON 字符串输入
   * - 默认会在反序列化过程中补齐缺失组件 id
   */
  static fromJson(
    json: SparkNode | Record<string, unknown> | string,
    options: SparkNodeTreeFromJsonOptions = {},
  ): SparkNodeTree {
    const next = normalizeFromJsonOptions(options)
    const root = normalizeRootFromJsonInput(json, next.fillMissingComponentId)
    return new SparkNodeTree({
      root,
      ...(next.historyLimit !== undefined ? { historyLimit: next.historyLimit } : {}),
    })
  }

  /**
   * 从 rule.json 输入创建页面树。
   *
   * rule.json 可以是：
   * - 单个 SparkNode：作为页面唯一顶层组件
   * - SparkNode[]：作为页面 children
   * - spark-page 根节点：作为完整页面树
   *
   * 进入 SparkNodeTree 后统一为单根 `spark-page`。
   */
  static fromRuleJson(
    json: SparkNodeTreeRuleJsonInput,
    options: SparkNodeTreeFromJsonOptions = {},
  ): SparkNodeTree {
    const next = normalizeFromJsonOptions(options)
    const root = normalizeRuleRootFromJsonInput(json, next.fillMissingComponentId)
    return new SparkNodeTree({
      root,
      ...(next.historyLimit !== undefined ? { historyLimit: next.historyLimit } : {}),
    })
  }

  /**
   * 从页面 children 创建单根页面树。
   */
  static fromPageChildren(
    children: readonly SparkNode[],
    options: SparkNodeTreeFromJsonOptions = {},
  ): SparkNodeTree {
    return SparkNodeTree.fromJson(createSparkPageRoot(children), options)
  }

  /**
   * 使用一个当前组件实例节点创建树操作实例。
   * 构造时自动创建 version 0 作为初始快照。
   *
   * @param params 根节点和历史栈配置。
   */
  constructor(params: SparkNodeTreeRootParams) {
    const next = normalizeRootParams(params, 'constructor')
    this._root = next.root
    const limit = normalizeHistoryLimit(params.historyLimit)
    this._history = new SnapshotHistory<SparkNode>(limit)
    if (limit > 0) {
      this._version++
      this._history.push(this._root)
    }
  }

  /**
   * 当前实例持有的最新组件实例根节点。
   */
  get root(): SparkNode {
    return this._root
  }

  /**
   * 当前版本号（单调递增）。
   */
  get version(): number {
    return Math.max(this._version, 0)
  }

  /**
   * 导出当前组件实例子树快照。
   */
  toJSON(): SparkNode {
    return this._root
  }

  /**
   * 获取当前绑定子树的完整数据快照。
   * 语义上等价于 toJSON()。
   *
   */
  getAllData(): SparkNode {
    return this.toJSON()
  }

  // ─── Undo / Redo（委托 SnapshotHistory）────────────────────────

  /**
   * 是否可撤销。
   */
  get canUndo(): boolean {
    return this._history.canUndo
  }

  /**
   * 是否可重做。
   */
  get canRedo(): boolean {
    return this._history.canRedo
  }

  /**
   * 当前历史游标位置（供 EditTransaction 记录）。
   */
  get historyCursor(): number {
    return this._history.cursor
  }

  /**
   * 撤销最近一次写操作，还原到上一个快照。
   * 返回撤销后的 root；无可撤销时返回 null 不修改状态。
   */
  undo(): SparkNode | null {
    const snapshot = this._history.undo()
    if (snapshot === null) return null
    this._root = snapshot
    return this._root
  }

  /**
   * 重做最近一次被撤销的写操作。
   * 返回重做后的 root；无可重做时返回 null 不修改状态。
   */
  redo(): SparkNode | null {
    const snapshot = this._history.redo()
    if (snapshot === null) return null
    this._root = snapshot
    return this._root
  }

  /**
   * 清空全部历史，仅保留当前快照。
   */
  clearHistory(): void {
    const current = this._history.current
    this._history.clear()
    if (current !== null) {
      this._history.push(current)
    }
  }

  /**
   * 估算单个快照的节点数量，用于评估历史栈的相对内存占用。
   * 由于不可变树的结构共享特性，实际内存开销小于该值 × 历史长度。
   */
  estimateHistorySize(): number {
    return countRecursive(this._root)
  }

  /**
   * 返回历史栈的统计信息。
   */
  getHistoryStats(): SparkNodeTreeHistoryStats {
    return {
      length: this._history.length,
      cursor: this._history.cursor,
      canUndo: this._history.canUndo,
      canRedo: this._history.canRedo,
    }
  }

  /**
   * 加载新的根节点，替换当前根并以新根作为历史基线重新开始。
   * 清空既有历史栈，等价于 DataSetCrudTool.replaceFromJson。
   *
   * @param newRoot 新的根节点。
   */
  loadRoot(newRoot: SparkNode): void {
    const next = normalizeRootParams({ root: newRoot }, 'loadRoot')
    this._root = next.root
    this._history.clear()
    this._version = 0
    this._history.push(this._root)
  }

  /**
   * 替换当前根节点并将变更提交到历史（可 undo/redo）。
   * 用于“文本整体替换”等粗粒度写操作，保留既有历史栈。
   *
   * @param newRoot 新的根节点。
   */
  replaceRoot(newRoot: SparkNode): void {
    const next = normalizeRootParams({ root: newRoot }, 'replaceRoot')
    this._commitWrite(next.root, 'replaceRoot')
  }

  // ─── 内部历史管理 ──────────────────────────────────────────────

  /**
   * 写操作确认成功后调用：更新 root 并追加历史快照。
   */
  private _commitWrite(nextRoot: SparkNode, _label: string): void {
    this._root = nextRoot
    this._version++
    this._history.push(this._root)
    this._nodePaths = null
  }

  // ─── 路径索引：将 O(n) 查找降为 O(depth) ────────────────────────

  private _buildPathIndex(): Map<string, number[]> {
    const index = new Map<string, number[]>()
    buildPathIndexRecursive(this._root, [], index)
    return index
  }

  private _ensurePathIndex(): Map<string, number[]> {
    this._nodePaths ??= this._buildPathIndex()
    return this._nodePaths
  }

  private _findNodeByPath(path: number[]): SparkNode | null {
    let node = this._root
    for (const idx of path) {
      if (!Array.isArray(node.children) || idx >= node.children.length) return null
      const candidate = node.children[idx]
      if (!isSparkNode(candidate)) return null
      node = candidate
    }
    return node
  }

  // ─── 查询 / 统计 API：供设计时工具读取、定位目标节点、推导下一步修改策略 ───────────

  /**
   * 按 componentId 查找节点；未命中时返回 null。
   *
   * @param params 节点查找参数。
   */
  getNode(params: SparkNodeTreeLookupParams): SparkNode | null {
    const next = normalizeLookupParams(params, 'getNode')
    const path = this._ensurePathIndex().get(next.componentId)
    if (path !== undefined) {
      return this._findNodeByPath(path)
    }
    return findLocationRecursive({
      current: this._root,
      targetNodeId: next.componentId,
      parent: null,
      index: -1,
      depth: 0,
    })?.node ?? null
  }

  /**
   * 获取节点在树中的完整位置信息；未命中时返回 null。
   *
   * @param params 节点查找参数。
   */
  getLocation(params: SparkNodeTreeLookupParams): SparkNodeLocation | null {
    const next = normalizeLookupParams(params, 'getLocation')
    const path = this._ensurePathIndex().get(next.componentId)
    if (path !== undefined) {
      const node = this._findNodeByPath(path)
      if (node) {
        const parentPath = path.slice(0, -1)
        const parent = parentPath.length > 0 ? this._findNodeByPath(parentPath) : null
        const lastIndex = path.at(-1)
        if (lastIndex === undefined) {
          throw new Error(`Path for node "${next.componentId}" is invalid`)
        }
        return { node, parent, index: lastIndex, depth: path.length }
      }
    }
    return findLocationRecursive({
      current: this._root,
      targetNodeId: next.componentId,
      parent: null,
      index: -1,
      depth: 0,
    })
  }

  /**
   * 判断指定 componentId 是否存在。
   *
   * @param params 节点查找参数。
   */
  hasNode(params: SparkNodeTreeLookupParams): boolean {
    return this.getNode(normalizeLookupParams(params, 'hasNode')) !== null
  }

  /**
    * 获取目标节点的直接父节点；当前绑定 root 或未命中时返回 null。
   *
   * @param params 节点查找参数。
   */
  getParent(params: SparkNodeTreeLookupParams): SparkNode | null {
    return this.getLocation(normalizeLookupParams(params, 'getParent'))?.parent ?? null
  }

  /**
   * 读取当前组件实例或指定子组件的直接 children。
   *
   * 返回的是 children 的浅拷贝，避免调用方直接改写实例内部数组引用。
   *
   * @param params 子节点读取参数；省略时读取当前根节点 children。
   */
  listChildren(params: SparkNodeTreeChildrenParams = {}): SparkNodeChildren {
    const next = normalizeChildrenParams(params, 'listChildren')
    const parent = resolveParentNode(this._root, next.parentComponentId)
    return [...(parent.children ?? [])]
  }

  /**
   * 统计当前组件实例子树中的结构节点数量。
   *
   */
  countNodes(): number {
    return countRecursive(this._root)
  }

  /**
   * 收集当前组件实例子树中出现过的全部唯一 DataView 定位键。
   *
   * 包括节点绑定、动态选项/边绑定、工具栏/动作/筛选/头尾区域中的结构化绑定，
   * 以及 Graph 等组件声明的 additionalNodeSources。普通业务 payload 和静态 options
   * 不作为绑定配置递归解释。
   *
   */
  collectDataViewKeys(): Set<string> {
    const keys = new Set<string>()
    visitSparkNodeDataViewBindings([this._root], key => keys.add(key))
    return keys
  }

  /**
   * 收集当前组件实例子树中 props.on 里声明过的全部唯一处理器名。
   *
   */
  collectHandlerNames(): Set<string> {
    const handlers = new Set<string>()
    collectHandlerNamesRecursive(this._root, handlers)
    return handlers
  }

  // ─── 写入 API：供设计时工具把新 SparkNode 写入树中，或修改既有节点结构 / 属性 ─────────

  /**
   * 按组件类型名递归搜索子树，返回所有匹配节点的真实 id、深度和父 id。
   *
   * 典型用法：当调用方知道目标组件类型（如 'r-tabs'）但不知道其节点 id 时，
   * 调用此方法可一步获取可直接用于 getNode / setProps / removeNode 的真实 id。
   *
   * @param params 组件类型查询参数。
   */
  findByType(params: SparkNodeFindByTypeParams): SparkNodeFindByTypeResult {
    const next = normalizeFindByTypeParams(params)
    const startNode = next.startComponentId !== undefined
      ? requireLocation(this._root, next.startComponentId).node
      : this._root
    const allMatches: SparkNodeFindByTypeMatch[] = []
    findByTypeRecursive({
      current: startNode,
      targetType: next.type,
      parentId: null,
      depth: 0,
      out: allMatches,
      limit: next.limit,
    })
    return { matches: allMatches, total: allMatches.length }
  }

  /**
   * 向当前组件实例或指定子组件的 children 中添加一个新节点。
   *
   * 这是“先构造 SparkNode，再放入 SparkNodeTree”这条链路的最直接入口。
   *
   * @param params 单节点添加参数。
   */
  addNode(params: SparkNodeTreeAddParams): SparkNodeAddResult {
    const next = normalizeAddParams(params)
    const operation = applyAddNode(this._root, next)
    this._commitWrite(operation.nextRoot, 'addNode')
    return operation.result
  }

  /**
   * 向同一个子组件容器批量插入多个新节点。
   *
   * - nodes 按传入顺序依次插入
   * - index 省略时整体追加到末尾
   * - index 提供时，从该位置开始连续插入
   *
   * @param params 批量节点添加参数。
   */
  addNodes(params: SparkNodeTreeAddNodesParams): SparkNodeAddNodesResult {
    const next = normalizeAddNodesParams(params)
    let workingRoot = this._root
    let nextIndex = next.index
    const indexes: number[] = []

    for (const node of next.nodes) {
      const operation = applyAddNode(workingRoot, {
        node,
        ...(next.parentComponentId !== undefined ? { parentComponentId: next.parentComponentId } : {}),
        ...(nextIndex !== undefined ? { index: nextIndex } : {}),
      })
      workingRoot = operation.nextRoot
      indexes.push(operation.result.index)
      if (nextIndex !== undefined) {
        nextIndex = operation.result.index + 1
      }
    }

    this._commitWrite(workingRoot, 'addNodes')
    return {
      nodes: [...next.nodes],
      indexes,
    }
  }

  /**
   * 把已有节点移动到当前组件实例或指定子组件的 children 中。
   *
   * 返回值只包含移动摘要，不回传完整节点子树，避免结果膨胀。
   *
   * @param params 节点移动参数。
   */
  moveNode(params: SparkNodeTreeMoveParams): SparkNodeMoveResult {
    const next = normalizeMoveParams(params)
    const operation = applyMoveNode(this._root, next)
    this._commitWrite(operation.nextRoot, 'moveNode')
    return operation.result
  }

  /**
   * 设置目标节点的 props。
   *
   * - merge !== false 时，采用浅合并语义
   * - merge === false 时，直接替换整个 props 对象
   *
   * 这类方法承载的是“修改属性值”能力，而不是组件选择能力。
   *
   * @param params props 设置参数。
   */
  setProps(params: SparkNodeTreeSetPropsParams): SparkNodeSetPropsResult {
    const next = normalizeSetPropsParams(params)
    const operation = applySetProps(this._root, next)
    this._commitWrite(operation.nextRoot, 'setProps')
    return operation.result
  }

  /**
   * 批量设置多个节点的 props。
   *
   * @param params 批量 props 设置参数。
   */
  setPropsBatch(params: SparkNodeTreeSetPropsBatchParams): SparkNodeSetPropsBatchResult {
    const next = normalizeSetPropsBatchParams(params)
    let workingRoot = this._root
    const nodes: SparkNode[] = []

    for (const item of next.items) {
      const operation = applySetProps(workingRoot, item)
      workingRoot = operation.nextRoot
      nodes.push(operation.result.node)
    }

    this._commitWrite(workingRoot, 'setPropsBatch')
    return { nodes }
  }

  /**
   * 用一个新的 SparkNode 完整替换目标节点。
   *
   * 这类方法承载的是“修改节点结构”能力：节点 type、props、children 都可以整体替换。
   *
   * @param params 节点替换参数。
   */
  replaceNode(params: SparkNodeTreeReplaceParams): SparkNodeReplaceResult {
    const next = normalizeReplaceParams(params)
    const operation = applyReplaceNode(this._root, next)
    this._commitWrite(operation.nextRoot, 'replaceNode')
    return operation.result
  }

  /**
   * 批量替换多个节点。
   *
   * @param params 批量节点替换参数。
   */
  replaceNodes(params: SparkNodeTreeReplaceNodesParams): SparkNodeReplaceNodesResult {
    const next = normalizeReplaceNodesParams(params)
    let workingRoot = this._root
    const items: SparkNodeReplaceResult[] = []

    for (const item of next.items) {
      const operation = applyReplaceNode(workingRoot, item)
      workingRoot = operation.nextRoot
      items.push(operation.result)
    }

    this._commitWrite(workingRoot, 'replaceNodes')
    return { items }
  }

  /**
   * 删除当前组件实例子树内的指定节点。
   *
   * 当前绑定的 root 自身不允许删除；调用方如果要整体替换当前组件实例，应直接创建新的实例或重建 root。
   *
   * @param params 节点删除参数。
   */
  removeNode(params: SparkNodeTreeRemoveParams): SparkNodeRemoveResult {
    const next = normalizeRemoveParams(params)
    const operation = applyRemoveNode(this._root, next)
    this._commitWrite(operation.nextRoot, 'removeNode')
    return operation.result
  }

  /**
   * 批量删除多个节点。
   *
   * @param params 批量节点删除参数。
   */
  removeNodes(params: SparkNodeTreeRemoveNodesParams): SparkNodeRemoveNodesResult {
    const next = normalizeRemoveNodesParams(params)
    let workingRoot = this._root
    const items: SparkNodeRemoveResult[] = []

    for (const componentId of next.componentIds) {
      const operation = applyRemoveNode(workingRoot, { componentId })
      workingRoot = operation.nextRoot
      items.push(operation.result)
    }

    this._commitWrite(workingRoot, 'removeNodes')
    return { items }
  }

}

// ====================
// 内部辅助类型
// ====================

/**
 * 路径重写的内部返回结构。
 */
type NodeRewriteResult<TResult> = {
  next: SparkNode | null
  changed: boolean
  result: TResult | null
}

// ====================
// 内部参数归一化
// ====================

const DEFAULT_HISTORY_LIMIT = 50

/**
 * 归一化 historyLimit 参数。
 */
function normalizeHistoryLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_HISTORY_LIMIT
  if (!Number.isInteger(value) || value < 0) return DEFAULT_HISTORY_LIMIT
  return value
}

/**
 * 归一化构造参数。
 */
function normalizeRootParams(
  params: SparkNodeTreeRootParams,
  methodName: string,
): SparkNodeTreeRootParams {
  const next = requireObjectArg(params, `${methodName}.params`)
  return {
    root: requireSparkNode(next.root, `${methodName}.root`),
  }
}

/**
 * 归一化 fromJson 选项。
 */
function normalizeFromJsonOptions(
  options: SparkNodeTreeFromJsonOptions,
): Required<Pick<SparkNodeTreeFromJsonOptions, 'fillMissingComponentId'>> & Pick<SparkNodeTreeFromJsonOptions, 'historyLimit'> {
  const next = requireObjectArg(options, 'fromJson.options')
  if (next.fillMissingComponentId !== undefined && typeof next.fillMissingComponentId !== 'boolean') {
    throw new Error('fromJson.options.fillMissingComponentId must be a boolean')
  }
  if (next.historyLimit !== undefined && (!Number.isInteger(next.historyLimit) || next.historyLimit < 0)) {
    throw new Error('fromJson.options.historyLimit must be a non-negative integer')
  }

  return {
    fillMissingComponentId: next.fillMissingComponentId ?? true,
    ...(next.historyLimit !== undefined ? { historyLimit: next.historyLimit } : {}),
  }
}

/**
 * 归一化 nodeId 查询参数。
 */
function normalizeLookupParams(
  params: SparkNodeTreeLookupParams,
  methodName: string,
): SparkNodeTreeLookupParams {
  const next = requireObjectArg(params, `${methodName}.params`)
  return {
    componentId: requireNonEmptyString(next.componentId, `${methodName}.componentId`),
  }
}

/**
 * 归一化 children 选择参数。
 */
function normalizeChildrenParams(
  params: SparkNodeTreeChildrenParams,
  methodName: string,
): SparkNodeTreeChildrenParams {
  const next = requireObjectArg(params, `${methodName}.params`)
  if (next.parentComponentId === undefined) {
    return {}
  }

  const parentComponentId = normalizeOptionalNodeId(next.parentComponentId, `${methodName}.parentComponentId`)
  return parentComponentId === undefined ? {} : { parentComponentId }
}

/**
 * 归一化 addNode 输入参数。
 */
function normalizeAddParams(params: SparkNodeTreeAddParams): SparkNodeTreeAddParams {
  const next = requireObjectArg(params, 'addNode.params')
  if (next.index !== undefined) {
    assertNonNegativeInteger(next.index, 'addNode.index')
  }

  const parentComponentId = next.parentComponentId === undefined
    ? undefined
    : normalizeOptionalNodeId(next.parentComponentId, 'addNode.parentComponentId')

  return {
    node: requireSparkNode(next.node, 'addNode.node'),
    ...(parentComponentId !== undefined ? { parentComponentId } : {}),
    ...(next.index !== undefined ? { index: next.index } : {}),
  }
}

/**
 * 归一化 addNodes 输入参数。
 */
function normalizeAddNodesParams(params: SparkNodeTreeAddNodesParams): SparkNodeTreeAddNodesParams {
  const next = requireObjectArg(params, 'addNodes.params')
  if (next.index !== undefined) {
    assertNonNegativeInteger(next.index, 'addNodes.index')
  }

  const parentComponentId = next.parentComponentId === undefined
    ? undefined
    : normalizeOptionalNodeId(next.parentComponentId, 'addNodes.parentComponentId')

  return {
    nodes: requireNonEmptySparkNodeArray(next.nodes, 'addNodes.nodes'),
    ...(parentComponentId !== undefined ? { parentComponentId } : {}),
    ...(next.index !== undefined ? { index: next.index } : {}),
  }
}

/**
 * 归一化 moveNode 输入参数。
 */
function normalizeMoveParams(params: SparkNodeTreeMoveParams): SparkNodeTreeMoveParams {
  const next = requireObjectArg(params, 'moveNode.params')
  if (next.index !== undefined) {
    assertNonNegativeInteger(next.index, 'moveNode.index')
  }

  const parentComponentId = next.parentComponentId === undefined
    ? undefined
    : normalizeOptionalNodeId(next.parentComponentId, 'moveNode.parentComponentId')

  return {
    componentId: requireNonEmptyString(next.componentId, 'moveNode.componentId'),
    ...(parentComponentId !== undefined ? { parentComponentId } : {}),
    ...(next.index !== undefined ? { index: next.index } : {}),
  }
}

/**
 * 归一化 setProps 输入参数。
 */
function normalizeSetPropsParams(params: SparkNodeTreeSetPropsParams): SparkNodeTreeSetPropsParams {
  const next = requireObjectArg(params, 'setProps.params')
  return {
    componentId: requireNonEmptyString(next.componentId, 'setProps.componentId'),
    props: requireRecord(next.props, 'setProps.props'),
    ...(next.merge !== undefined ? { merge: next.merge } : {}),
  }
}

/**
 * 归一化 setPropsBatch 输入参数。
 */
function normalizeSetPropsBatchParams(
  params: SparkNodeTreeSetPropsBatchParams,
): SparkNodeTreeSetPropsBatchParams {
  const next = requireObjectArg(params, 'setPropsBatch.params')
  const items = requireObjectArray(next.items, 'setPropsBatch.items').map((item, index) => {
    return {
      componentId: requireNonEmptyString(
        typeof item['componentId'] === 'string' ? item['componentId'] : undefined,
        `setPropsBatch.items[${index}].componentId`,
      ),
      props: requireRecord(item['props'], `setPropsBatch.items[${index}].props`),
      ...(item['merge'] !== undefined ? { merge: requireBoolean(item['merge'], `setPropsBatch.items[${index}].merge`) } : {}),
    }
  })
  assertUniqueNodeIds(items.map((item) => item.componentId), 'setPropsBatch.items')
  return { items }
}

/**
 * 归一化 replaceNode 输入参数。
 */
function normalizeReplaceParams(params: SparkNodeTreeReplaceParams): SparkNodeTreeReplaceParams {
  const next = requireObjectArg(params, 'replaceNode.params')
  return {
    componentId: requireNonEmptyString(next.componentId, 'replaceNode.componentId'),
    node: requireSparkNode(next.node, 'replaceNode.node'),
  }
}

/**
 * 归一化 replaceNodes 输入参数。
 */
function normalizeReplaceNodesParams(
  params: SparkNodeTreeReplaceNodesParams,
): SparkNodeTreeReplaceNodesParams {
  const next = requireObjectArg(params, 'replaceNodes.params')
  const items = requireObjectArray(next.items, 'replaceNodes.items').map((item, index) => {
    return {
      componentId: requireNonEmptyString(
        typeof item['componentId'] === 'string' ? item['componentId'] : undefined,
        `replaceNodes.items[${index}].componentId`,
      ),
      node: requireSparkNode(item['node'], `replaceNodes.items[${index}].node`),
    }
  })
  assertUniqueNodeIds(items.map((item) => item.componentId), 'replaceNodes.items')
  return { items }
}

/**
 * 归一化 removeNode 输入参数。
 */
function normalizeRemoveParams(params: SparkNodeTreeRemoveParams): SparkNodeTreeRemoveParams {
  return normalizeLookupParams(params, 'removeNode')
}

/**
 * 归一化 removeNodes 输入参数。
 */
function normalizeRemoveNodesParams(
  params: SparkNodeTreeRemoveNodesParams,
): SparkNodeTreeRemoveNodesParams {
  const next = requireObjectArg(params, 'removeNodes.params')
  const componentIds = requireNonEmptyStringArray(next.componentIds, 'removeNodes.componentIds')
  assertUniqueNodeIds(componentIds, 'removeNodes.componentIds')
  return { componentIds }
}

// ====================
// 内部辅助方法
// ====================

const KEEP = Symbol('spark-node-tree:keep')

type KeepValue = typeof KEEP

/**
 * 断言字符串参数是非空字符串，并返回收窄后的值。
 */
function requireNonEmptyString(value: string | undefined, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }
  return value
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`)
  }
  return value
}

/**
 * 断言输入是对象参数。
 */
function requireObjectArg<T extends object>(value: T | undefined | null, fieldName: string): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`)
  }
  return value
}

/**
 * 断言输入至少是一个像 SparkNode 的对象。
 */
function assertNodeLike(node: unknown, fieldName: string): asserts node is SparkNode {
  if (typeof node !== 'object' || node === null) {
    throw new Error(`${fieldName} must be a SparkNode with a non-empty type`)
  }

  if (!('type' in node) || typeof node.type !== 'string' || node.type.length === 0) {
    throw new Error(`${fieldName} must be a SparkNode with a non-empty type`)
  }
}

/**
 * 断言并返回 SparkNode。
 */
function requireSparkNode(value: unknown, fieldName: string): SparkNode {
  assertNodeLike(value, fieldName)
  return normalizeSparkNode(value)
}

/**
 * 断言输入是可作为 props 使用的对象记录。
 */
function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`)
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.getOwnPropertyNames(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key)
    if (desc) result[key] = desc.value
  }
  return result
}

/**
 * 归一化可选节点 ID。
 */
function normalizeOptionalNodeId(
  value: string | null | undefined,
  fieldName: string,
): string | null | undefined {
  if (value === null || value === undefined) {
    return value
  }
  return requireNonEmptyString(value, fieldName)
}

/**
 * 断言数值是非负整数。
 */
function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`)
  }
}

/**
 * 断言 childIds 是非空字符串数组。
 */
function requireNonEmptyStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array`)
  }

  return value.map((entry, index) => requireNonEmptyString(
    typeof entry === 'string' ? entry : undefined,
    `${fieldName}[${index}]`,
  ))
}

/**
 * 断言输入是对象数组。
 */
function requireObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array`)
  }

  return value.map((entry, index) => requireRecord(entry, `${fieldName}[${index}]`))
}

/**
 * 断言输入是 SparkNode 数组。
 */
function requireNonEmptySparkNodeArray(value: unknown, fieldName: string): SparkNode[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array`)
  }

  return value.map((entry, index) => requireSparkNode(entry, `${fieldName}[${index}]`))
}

/**
 * 断言 nodeId 列表中不存在重复项。
 */
function assertUniqueNodeIds(nodeIds: string[], fieldName: string): void {
  const seen = new Set<string>()
  for (const currentNodeId of nodeIds) {
    if (seen.has(currentNodeId)) {
      throw new Error(`Duplicate node id "${currentNodeId}" in ${fieldName}`)
    }
    seen.add(currentNodeId)
  }
}

/**
 * 计算插入位置。
 */
function clampInsertIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length
  return Math.min(index, length)
}

/**
 * 以最小字段集构造 SparkNode。
 */
function buildSparkNode(params: {
  type: string
  id?: string
  props?: Record<string, unknown>
  children?: SparkNodeChildren
}): SparkNode {
  const normalizedId = typeof params.id === 'string' ? params.id : undefined

  return {
    type: params.type,
    ...(normalizedId !== undefined ? { id: normalizedId } : {}),
    ...(params.props !== undefined ? { props: params.props } : {}),
    ...(params.children !== undefined ? { children: params.children } : {}),
  }
}

/**
 * 基于旧节点复制出一个新节点，并允许对部分字段做定点替换。
 */
type CopySparkNodeInput = Readonly<{
  node: SparkNode
  nextType?: string | KeepValue | undefined
  nextProps?: Record<string, unknown> | undefined | KeepValue
  nextChildren?: SparkNodeChildren | undefined | KeepValue
}>

function copySparkNode(input: CopySparkNodeInput): SparkNode {
  const { node } = input
  const nextType = Object.prototype.hasOwnProperty.call(input, 'nextType') ? input.nextType ?? KEEP : KEEP
  const nextProps = Object.prototype.hasOwnProperty.call(input, 'nextProps') ? input.nextProps : KEEP
  const nextChildren = Object.prototype.hasOwnProperty.call(input, 'nextChildren') ? input.nextChildren : KEEP
  const type = nextType === KEEP ? node.type : nextType
  const props = nextProps === KEEP ? node.props : nextProps
  const children = nextChildren === KEEP ? node.children : nextChildren
  const nextId = readNodeId(node)

  return buildSparkNode({
    type,
    ...(nextId !== undefined ? { id: nextId } : {}),
    ...(props !== undefined ? { props } : {}),
    ...(children !== undefined ? { children } : {}),
  })
}

/**
 * 递归查找 nodeId 对应的位置信息。
 */
type FindLocationRecursiveState = {
  current: SparkNode
  targetNodeId: string
  parent: SparkNode | null
  index: number
  depth: number}

function findLocationRecursive(state: FindLocationRecursiveState): SparkNodeLocation | null {
  const { current, targetNodeId, parent, index, depth } = state
  if (readNodeId(current) === targetNodeId) {
    return { node: current, parent, index, depth }
  }

  if (!Array.isArray(current.children) || current.children.length === 0) return null

  for (let childIndex = 0; childIndex < current.children.length; childIndex += 1) {
    const child = current.children[childIndex]
    if (!isSparkNode(child)) continue
    const found = findLocationRecursive({
      current: child,
      targetNodeId,
      parent: current,
      index: childIndex,
      depth: depth + 1,
    })
    if (found !== null) return found
  }

  return null
}

/**
 * 递归构建 nodeId → path 的映射表，path 是从根到该节点的 children 索引序列。
 */
function buildPathIndexRecursive(
  current: SparkNode,
  path: number[],
  index: Map<string, number[]>,
): void {
  const id = readNodeId(current)
  if (id !== undefined) {
    index.set(id, [...path])
  }
  if (!Array.isArray(current.children) || current.children.length === 0) return
  for (let i = 0; i < current.children.length; i++) {
    const child = current.children[i]
    if (!isSparkNode(child)) continue
    buildPathIndexRecursive(child, [...path, i], index)
  }
}

/**
 * 强制要求某个节点存在；不存在时立即 fail-fast。
 */
function requireLocation(root: SparkNode, targetNodeId: string): SparkNodeLocation {
  const location = findLocationRecursive({
    current: root,
    targetNodeId,
    parent: null,
    index: -1,
    depth: 0,
  })
  if (location === null) {
    throw new Error(`Node "${targetNodeId}" not found`)
  }
  return location
}

/**
 * 解析 parentId 对应的父节点。
 */
function resolveParentNode(root: SparkNode, parentId: string | null | undefined): SparkNode {
  if (parentId === null || parentId === undefined) return root
  return requireLocation(root, parentId).node
}

/**
 * 递归收集类型匹配的节点，结果按深度优先顺序追加到 out 数组。
 * 当提供 limit 且已收集足够结果时提前终止遍历。
 */
type FindByTypeRecursiveState = {
  current: SparkNode
  targetType: string
  parentId: string | null | undefined
  depth: number
  out: SparkNodeFindByTypeMatch[]
  limit: number | undefined}

function findByTypeRecursive(state: FindByTypeRecursiveState): boolean {
  const { current, targetType, parentId, depth, out, limit } = state
  if (current.type === targetType) {
    out.push({
      id: readNodeId(current),
      type: current.type,
      depth,
      parentId,
    })
    if (limit !== undefined && out.length >= limit) return true
  }

  if (!Array.isArray(current.children) || current.children.length === 0) return false

  const currentId = readNodeId(current)
  for (const child of current.children) {
    if (!isSparkNode(child)) continue
    if (findByTypeRecursive({
      current: child,
      targetType,
      parentId: currentId,
      depth: depth + 1,
      out,
      limit,
    })) return true
  }
  return false
}

/**
 * 归一化 findByType 输入参数。
 */
function normalizeFindByTypeParams(params: SparkNodeFindByTypeParams): SparkNodeFindByTypeParams {
  const next = requireObjectArg(params, 'findByType.params')
  const type = requireNonEmptyString(
    typeof next.type === 'string' ? next.type : undefined,
    'findByType.type',
  )

  const startComponentId = next.startComponentId === undefined
    ? undefined
    : requireNonEmptyString(
        typeof next.startComponentId === 'string' ? next.startComponentId : undefined,
        'findByType.startComponentId',
      )

  if (next.limit !== undefined) {
    assertNonNegativeInteger(next.limit, 'findByType.limit')
  }

  return {
    type,
    ...(startComponentId !== undefined ? { startComponentId } : {}),
    ...(next.limit !== undefined ? { limit: next.limit } : {}),
  }
}

/**
 * 归一化 fromJson 输入，并按需补齐缺失组件 id。
 */
function normalizeRootFromJsonInput(
  json: SparkNodeTreeJsonInput,
  fillMissingComponentId: boolean,
): SparkNode {
  const parsed = parseSparkNodeJsonInput(json)
  const root = requireSparkNode(parsed, 'fromJson.root')
  return normalizeSparkNodeWithComponentIds(root, fillMissingComponentId)
}

function normalizeRuleRootFromJsonInput(
  json: SparkNodeTreeRuleJsonInput,
  fillMissingComponentId: boolean,
): SparkNode {
  const parsed = parseSparkNodeJsonInput(json)
  if (Array.isArray(parsed)) {
    return normalizeSparkNodeWithComponentIds(createSparkPageRoot(requireRuleChildren(parsed)), fillMissingComponentId)
  }
  if (!isSparkNode(parsed)) {
    throw new Error('rule.json 顶层必须是 SparkNode 或 SparkNode[]')
  }

  const normalized = requireSparkNode(parsed, 'rule.json.root')
  if (normalized.type === SPARK_PAGE_NODE_TYPE) {
    return normalizeSparkNodeWithComponentIds(normalizeSparkPageRoot(normalized), fillMissingComponentId)
  }
  return normalizeSparkNodeWithComponentIds(createSparkPageRoot([normalized]), fillMissingComponentId)
}

function normalizeSparkPageRoot(root: SparkNode): SparkNode {
  const children = Array.isArray(root.children) ? requireRuleChildren(root.children) : []
  return {
    ...root,
    id: readNodeId(root) ?? SPARK_PAGE_ROOT_ID,
    children,
  }
}

function requireRuleChildren(children: readonly unknown[]): SparkNode[] {
  return children.map((child, index) => {
    if (!isSparkNode(child)) {
      throw new Error(`rule.json 节点必须是 SparkNode：第 ${index} 项需要非空字符串 type`)
    }
    return requireSparkNode(child, `rule.json[${index}]`)
  })
}

/**
 * 解析 SparkNode JSON 输入。
 */
function parseSparkNodeJsonInput(json: SparkNodeTreeJsonInput | SparkNodeTreeRuleJsonInput): unknown {
  if (typeof json !== 'string') return json
  const trimmed = json.trim()
  if (trimmed.length === 0) {
    throw new Error('fromJson.json must not be an empty string')
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error('fromJson.json must be valid JSON')
  }
}

/**
 * 递归归一化整棵节点树，并按需补齐缺失组件 id。
 */
function normalizeSparkNodeWithComponentIds(root: SparkNode, fillMissingComponentId: boolean): SparkNode {
  const usedIds = new Set<string>()
  return normalizeSparkNodeWithComponentIdsRecursive({
    node: root,
    fillMissingComponentId,
    usedIds,
    path: [0],
  })
}

type NormalizeSparkNodeRecursiveInput = Readonly<{
  node: SparkNode
  fillMissingComponentId: boolean
  usedIds: Set<string>
  path: number[]
}>

function normalizeSparkNodeWithComponentIdsRecursive(input: NormalizeSparkNodeRecursiveInput): SparkNode {
  const { node, fillMissingComponentId, usedIds, path } = input
  const normalized = normalizeSparkNode(node)

  const sourceChildren = normalized.children ?? []
  const children = sourceChildren.map((child, index) => {
    if (!isSparkNode(child)) return child
    return normalizeSparkNodeWithComponentIdsRecursive({
      node: child,
      fillMissingComponentId,
      usedIds,
      path: [...path, index],
    })
  })

  let componentId = readNodeId(normalized)
  if (componentId === undefined && fillMissingComponentId) {
    componentId = generateAutoComponentId(normalized.type, path)
  }

  if (componentId !== undefined) {
    if (usedIds.has(componentId)) {
      throw new Error(`fromJson.componentId duplicated: ${componentId}`)
    }
    usedIds.add(componentId)
  }

  const nextProps = normalized.props !== undefined && Object.keys(normalized.props).length > 0
    ? { ...normalized.props }
    : undefined

  const nextNode: SparkNode = {
    type: normalized.type,
    ...(componentId !== undefined ? { id: componentId } : {}),
    ...(nextProps !== undefined ? { props: nextProps } : {}),
    children,
  }

  return nextNode
}

function generateAutoComponentId(type: string, path: number[]): string {
  const safeType = type.replace(/[^a-zA-Z0-9_-]/g, '-') || 'node'
  return `${safeType}__${path.join('_')}`
}

/**
 * 对 addNode 做一次不可变写入，返回新 root 与动作结果。
 */
function applyAddNode(
  root: SparkNode,
  params: SparkNodeTreeAddParams,
): { nextRoot: SparkNode; result: SparkNodeAddResult } {
  const parent = resolveParentNode(root, params.parentComponentId)
  const currentChildren = parent.children ?? []
  const index = clampInsertIndex(params.index, currentChildren.length)
  const nextChildren = [...currentChildren]
  nextChildren.splice(index, 0, params.node)

  if (params.parentComponentId === null || params.parentComponentId === undefined) {
    return {
      nextRoot: copySparkNode({ node: root, nextChildren }),
      result: {
        node: params.node,
        index,
      },
    }
  }

  const rewritten = rewriteNodeById({
    current: root,
    targetNodeId: params.parentComponentId,
    updater: (location) => ({
      nextNode: copySparkNode({ node: location.node, nextChildren }),
      result: {
        node: params.node,
        index,
      },
    }),
  })
  const { next, result } = assertRewriteSucceeded(rewritten, 'addNode')
  return {
    nextRoot: next,
    result,
  }
}

/**
 * 对 moveNode 做一次不可变写入。
 */
function applyMoveNode(
  root: SparkNode,
  params: SparkNodeTreeMoveParams,
): { nextRoot: SparkNode; result: SparkNodeMoveResult } {
  const location = requireLocation(root, params.componentId)
  if (location.parent === null) {
    throw new Error('Cannot move root node')
  }

  if (params.parentComponentId !== null && params.parentComponentId !== undefined) {
    if (findLocationRecursive({
      current: location.node,
      targetNodeId: params.parentComponentId,
      parent: null,
      index: -1,
      depth: 0,
    }) !== null) {
      throw new Error('Cannot move node into itself or descendant')
    }
    requireLocation(root, params.parentComponentId)
  }

  const removed = applyRemoveNode(root, { componentId: params.componentId })
  const added = applyAddNode(removed.nextRoot, {
    node: removed.result.removed,
    ...(params.parentComponentId !== undefined ? { parentComponentId: params.parentComponentId } : {}),
    ...(params.index !== undefined ? { index: params.index } : {}),
  })

  return {
    nextRoot: added.nextRoot,
    result: {
      componentId: params.componentId,
      fromParentComponentId: readNodeId(location.parent) ?? null,
      toParentComponentId: params.parentComponentId ?? null,
      previousIndex: location.index,
      index: added.result.index,
    },
  }
}

/**
 * 对 setProps 做一次不可变写入。
 */
function applySetProps(
  root: SparkNode,
  params: SparkNodeTreeSetPropsParams,
): { nextRoot: SparkNode; result: SparkNodeSetPropsResult } {
  const location = requireLocation(root, params.componentId)
  const nextProps = params.merge === false
    ? { ...params.props }
    : { ...(location.node.props ?? {}), ...params.props }

  const rewritten = rewriteNodeById({
    current: root,
    targetNodeId: params.componentId,
    updater: (currentLocation) => {
      const nextNode = copySparkNode({ node: currentLocation.node, nextProps })
      return {
        nextNode,
        result: {
          node: nextNode,
        },
      }
    },
  })

  const { next, result } = assertRewriteSucceeded(rewritten, 'setProps')
  return {
    nextRoot: next,
    result,
  }
}

/**
 * 对 replaceNode 做一次不可变写入。
 */
function applyReplaceNode(
  root: SparkNode,
  params: SparkNodeTreeReplaceParams,
): { nextRoot: SparkNode; result: SparkNodeReplaceResult } {
  const previous = requireLocation(root, params.componentId).node

  const rewritten = rewriteNodeById({
    current: root,
    targetNodeId: params.componentId,
    updater: () => ({
      nextNode: params.node,
      result: {
        node: params.node,
        previous,
      },
    }),
  })

  const { next, result } = assertRewriteSucceeded(rewritten, 'replaceNode')
  return {
    nextRoot: next,
    result,
  }
}

/**
 * 对 removeNode 做一次不可变写入。
 */
function applyRemoveNode(
  root: SparkNode,
  params: SparkNodeTreeRemoveParams,
): { nextRoot: SparkNode; result: SparkNodeRemoveResult } {
  const location = requireLocation(root, params.componentId)
  if (location.parent === null) {
    throw new Error('Cannot remove root node')
  }

  const rewritten = rewriteNodeById({
    current: root,
    targetNodeId: params.componentId,
    updater: (currentLocation) => ({
      nextNode: null,
      result: {
        removed: currentLocation.node,
        index: location.index,
      },
    }),
  })

  const { next, result } = assertRewriteSucceeded(rewritten, 'removeNode')
  return {
    nextRoot: next,
    result,
  }
}

/**
 * 按 nodeId 对树做路径级不可变重写。
 */
type RewriteNodeByIdRequest<TResult> = {
  current: SparkNode,
  targetNodeId: string
  updater: (location: SparkNodeLocation) => { nextNode: SparkNode | null; result: TResult }
  parent?: SparkNode | null
  index?: number
  depth?: number}

function rewriteNodeById<TResult>(request: RewriteNodeByIdRequest<TResult>): NodeRewriteResult<TResult> {
  const {
    current,
    targetNodeId,
    updater,
    parent = null,
    index = -1,
    depth = 0,
  } = request
  if (readNodeId(current) === targetNodeId) {
    const updated = updater({ node: current, parent, index, depth })
    return {
      next: updated.nextNode,
      changed: true,
      result: updated.result,
    }
  }

  if (!Array.isArray(current.children) || current.children.length === 0) {
    return { next: current, changed: false, result: null }
  }

  let changed = false
  let result: TResult | null = null
  const nextChildren: SparkNodeChildren = []

  for (let childIndex = 0; childIndex < current.children.length; childIndex += 1) {
    const child = current.children[childIndex]
    if (child === undefined) continue
    if (!isSparkNode(child)) {
      nextChildren.push(child)
      continue
    }

    const childResult = rewriteNodeById({
      current: child,
      targetNodeId,
      updater,
      parent: current,
      index: childIndex,
      depth: depth + 1,
    })
    if (!childResult.changed) {
      nextChildren.push(child)
      continue
    }

    changed = true
    result = childResult.result
    if (childResult.next !== null) {
      nextChildren.push(childResult.next)
    }
  }

  if (!changed) {
    return { next: current, changed: false, result: null }
  }

  return {
    next: copySparkNode({ node: current, nextChildren }),
    changed: true,
    result,
  }
}

/**
 * 递归统计结构节点数量。
 */
function countRecursive(node: SparkNode): number {
  let count = 1
  if (!Array.isArray(node.children)) return count
  for (const child of node.children) {
    if (isSparkNode(child)) count += countRecursive(child)
  }
  return count
}

/**
 * 递归收集所有 props.on 中声明的处理器名。
 */
function collectHandlerNamesRecursive(node: SparkNode, out: Set<string>): void {
  const on = node.props?.['on']
  if (on !== null && typeof on === 'object') {
    for (const key of Object.keys(on)) {
      const desc = Object.getOwnPropertyDescriptor(on, key)
      if (desc && typeof desc.value === 'string' && desc.value.length > 0) {
        out.add(desc.value)
      }
    }
  }
  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    if (isSparkNode(child)) collectHandlerNamesRecursive(child, out)
  }
}

/**
 * 把内部 rewrite 结果收口成对外安全可用的成功结果。
 */
function assertRewriteSucceeded<TResult>(
  rewriteResult: NodeRewriteResult<TResult>,
  action: string,
): { next: SparkNode; result: TResult } {
  if (!rewriteResult.changed || rewriteResult.next === null || rewriteResult.result === null) {
    throw new Error(`SparkNodeTree.${action} failed unexpectedly`)
  }
  return {
    next: rewriteResult.next,
    result: rewriteResult.result,
  }
}


