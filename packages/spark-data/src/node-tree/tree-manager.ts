/**
 * @module @spark-appworks/spark-data:node-tree/tree-manager
 * 职责：提供 spark-data 数据管线中的 tree manager 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * 树管理器
 * 统一入口：内存缓存 + HTTP 调用（含 flat/nested 双模式接口族）
 * 依赖方向：DataView → TreeManager（单向）
 */

import type {
  TreeConfig,
  TreeApi,
  HttpEndpoint,
  FlatTreeNode,
  NestedTreeNode,
  NestedTreeSearchResult,
  TreePath
} from '../types'
import { resolveUrlTemplate } from '../core/url-template'

import { Logger, isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'

function isFlatTreeNode(value: unknown): value is FlatTreeNode {
  const record = isRecord(value) ? value : null
  return record !== null
    && (typeof record['id'] === 'string' || typeof record['id'] === 'number')
    && typeof record['name'] === 'string'
}

function resolveMovedNode(response: { node?: FlatTreeNode } | FlatTreeNode): FlatTreeNode {
  if (isRecord(response) && isFlatTreeNode(response['node'])) return response['node']
  if (isFlatTreeNode(response)) return response
  throw new Error('[TreeManager] move endpoint returned invalid node')
}

function assertFlatTreeNodeArray(nodes: unknown[]): FlatTreeNode[] {
  const result: FlatTreeNode[] = []
  for (const item of nodes) {
    if (!isFlatTreeNode(item)) {
      throw new Error('TreeManager.fromJson: 节点数组包含无效项')
    }
    result.push(item)
  }
  return result
}

function parseFlatTreeNodesInput(
  json: FlatTreeNode[] | Record<string, unknown> | string,
): FlatTreeNode[] {
  if (typeof json === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new Error('TreeManager.fromJson: 无效的 JSON 数据')
    }
    if (Array.isArray(parsed)) {
      return assertFlatTreeNodeArray(parsed)
    }
    if (isRecord(parsed)) {
      return parseFlatTreeNodesInput(parsed)
    }
    throw new Error('TreeManager.fromJson: JSON 必须解析为节点数组或对象')
  }
  if (Array.isArray(json)) {
    return assertFlatTreeNodeArray(json)
  }
  const wrappedNodes = json['nodes']
  if (Array.isArray(wrappedNodes)) {
    return assertFlatTreeNodeArray(wrappedNodes)
  }
  if (isFlatTreeNode(json)) {
    return [json]
  }
  throw new Error('TreeManager.fromJson: 无法识别的输入结构')
}

/** Tree Manager Options 的调用配置。 */
export type TreeManagerOptions = {
    /** 树结构配置：idField / parentIdField / textField / treeMode / lazy 等。 */
config: TreeConfig
    /** 树 HTTP 接口族配置（children / path / subtree / move / nested / nestedSearch）。 */
api?: TreeApi
    /** 初始扁平节点数组（直接写入缓存，跳过 HTTP 拉取）。 */
initialNodes?: FlatTreeNode[]
    /** HTTP 客户端；远端树操作必须注入，以共享 DataTable 的认证、租户与拦截器。 */
httpClient?: HttpClientBase
    /** 端点上下文提供者（tenantId / projectId 等），用于 scoped URL 归一化。 */
endpointContextProvider?: () => Record<string, unknown>}

/** Fetch Nested Input 的输入数据。 */
export type FetchNestedInput = Readonly<{
  /** 子树根节点 ID；缺省则从全局根节点开始拉取。 */
  rootId?: string | number | null | undefined
  /** 返回节点数量上限；缺省使用端点默认值。 */
  limit?: number | undefined
  /** 拉取深度上限；缺省使用端点或 TreeConfig 中的 depthLimit。 */
  depthLimit?: number | undefined
  /** 树模式：flat=扁平 parentId 索引，nested=服务端嵌套 JSON；缺省使用 TreeConfig.treeMode。 */
  treeMode?: 'flat' | 'nested' | undefined
}>

/**
 * 树管理器类
 * 管理 DataView 中的树形数据视图
 */
export class TreeManager {
  // ===== 属性定义 =====

  /** 树配置 */
  private config: TreeConfig

  /** 节点缓存 */
  private cache: Record<string | number, FlatTreeNode> = {}

  /** 父ID→子ID集合索引（getChildren O(1) 查找） */
  private _parentIndex = new Map<string | number | null | undefined, Set<string | number>>()

  /** 树 HTTP 接口族配置（来自 DataTable.treeApi，可选） */
  private api?: TreeApi

  /** HTTP 客户端；仅远端树操作需要，且必须由所属 DataTable 注入。 */
  private _http?: HttpClientBase

  /** 端点上下文（tenantId/projectId 等），用于内部 scoped URL 归一化 */
  private endpointContextProvider?: (() => Record<string, unknown>) | undefined

  /** 日志记录器 */
  private logger = Logger()

  // ===== 构造函数 =====

  /**
   * 创建树管理器实例
   * @param config 树配置
   * @param initialNodes 初始节点
   * @param dataView 关联的数据视图
   */
  constructor(options: TreeManagerOptions) {
    const { config, api, initialNodes, httpClient, endpointContextProvider } = options
    this.config = {
      idField: 'id',
      parentIdField: 'parentId',
      textField: 'name',
      lazy: true,
      ...config
    }
    if (api) this.api = api
    if (httpClient) this._http = httpClient
    this.endpointContextProvider = endpointContextProvider
    if (initialNodes) {
      this.addNodesToCache(initialNodes)
    }
  }

  // ===== HTTP 辅助 =====

  private _getHttp(): HttpClientBase {
    if (this._http === undefined) {
      throw new Error('[TreeManager] 远端树操作必须注入 DataTable HTTP 客户端')
    }
    return this._http
  }

  /**
   * 调用树端点（自动替换 URL 路径参数，剩余参数作为 query/body）
   */
  private _callEndpoint<T>(endpoint: HttpEndpoint, params: Record<string, unknown> = {}): Promise<T> {
    const contextParams = this.endpointContextProvider?.() ?? {}
    const { url: resolvedUrl, rest } = resolveUrlTemplate(endpoint.url, { ...contextParams, ...params })
    const url = resolvedUrl
    const requestParams = Object.fromEntries(
      Object.entries(rest).filter(([key]) => key !== 'tenantId' && key !== 'projectId')
    )
    const http = this._getHttp()
    const method = endpoint.method ?? 'GET'
    const config = endpoint.headers ? { headers: endpoint.headers } : {}
    switch (method) {
      case 'GET':
        return http.get<T>(url, requestParams, config)
      case 'POST':
      case 'PATCH':
        return http.post<T>(url, requestParams, config)
      case 'PUT':
        return http.put<T>(url, requestParams, config)
      case 'DELETE':
        return http.delete<T>(url, requestParams, config)
    }
  }

  // ===== 配置和缓存访问 =====

  /**
   * 获取树配置
   * @returns 树配置副本
   */
  getConfig(): TreeConfig {
    return { ...this.config }
  }

  // ===== 缓存管理 =====

  /**
   * 添加节点到缓存
   * @param nodes 要添加的节点数组
   */
  addNodesToCache(nodes: FlatTreeNode[]): void {
    for (const node of nodes) {
      // 如果节点已存在且 parentId 变化，先从旧索引移除
      const existing = this.cache[node.id]
      if (existing && existing.parentId !== node.parentId) {
        this._parentIndex.get(existing.parentId)?.delete(node.id)
      }
      this.cache[node.id] = node
      // 维护父索引
      let children = this._parentIndex.get(node.parentId)
      if (!children) { children = new Set(); this._parentIndex.set(node.parentId, children) }
      children.add(node.id)
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache = {}
    this._parentIndex.clear()
  }

  /**
   * 返回缓存中所有扁平节点的数组
   */
  getAllNodes(): FlatTreeNode[] {
    return Object.values(this.cache)
  }

  /**
   * 从 JSON 恢复树缓存（与 toJson 输出格式对应：FlatTreeNode[]）。
   *
   * @param json 节点数组、松散对象或 JSON 字符串
   * @param options TreeManager 构造选项（config 必填）
   */
  static fromJson(
    json: FlatTreeNode[] | Record<string, unknown> | string,
    options: TreeManagerOptions,
  ): TreeManager {
    const nodes = parseFlatTreeNodesInput(json)
    return new TreeManager({
      ...options,
      initialNodes: nodes,
    })
  }

  /**
   * 将所有扁平节点序列化为 JSON 字符串（用于导出）
   */
  toJson(): string {
    return JSON.stringify(this.getAllNodes(), null, 2)
  }

  // ===== 节点查询 =====

  /**
   * 获取指定节点
   * @param id 节点ID
   * @returns 节点对象
   */
  getNode(id: string | number): FlatTreeNode | undefined {
    return this.cache[id]
  }

  /**
   * 获取子节点
   * @param parentId 父节点ID
   * @returns 子节点数组
   */
  getChildren(parentId: string | number | null): FlatTreeNode[] {
    const childIds = this._parentIndex.get(parentId)
    if (!childIds || childIds.size === 0) return []
    const result: FlatTreeNode[] = []
    for (const id of childIds) {
      const node = this.cache[id]
      if (node) result.push(node)
    }
    return result
  }

  /**
   * 获取根节点
   * @returns 根节点数组
   */
  getRoots(): FlatTreeNode[] {
    return this.getChildren(null)
  }

  // ===== HTTP 树操作（需配置 api） =====

  /**
   * 拉取直接子节点并写入缓存（对应 /tree/children）
   */
  async fetchChildren(parentId: string | number | null, limit?: number): Promise<FlatTreeNode[]> {
    const endpoint = this.api?.children
    if (!endpoint) throw new Error('[TreeManager] api.children 未配置')
    const params: Record<string, unknown> = {
      parentId: parentId ?? '',
      treeMode: this.config.treeMode ?? 'flat'
    }
    const effectiveLimit = limit ?? endpoint.limit
    if (effectiveLimit !== undefined) params['limit'] = effectiveLimit
    const nodes = await this._callEndpoint<FlatTreeNode[]>(endpoint, params)
    this.addNodesToCache(nodes)
    return nodes
  }

  /**
   * 获取节点祖先链 ID（对应 /tree/path）
   */
  async fetchPath(id: string | number): Promise<TreePath> {
    const endpoint = this.api?.path
    if (!endpoint) throw new Error('[TreeManager] api.path 未配置')
    const result = await this._callEndpoint<{ pathIds: Array<string | number> }>(endpoint, {
      id,
      treeMode: this.config.treeMode ?? 'flat'
    })
    return { pathIds: result.pathIds }
  }

  /**
   * 展开到目标节点（差量补齐缓存，对应 /tree/path + /tree/subtree）
   */
  async expandToNode(targetId: string | number): Promise<void> {
    // 1. 获取祖先链
    const { pathIds } = await this.fetchPath(targetId)

    // 2. 找出缓存缺失节点
    const missing = pathIds.filter(id => !this.cache[id])
    if (missing.length === 0) {
      this.logger.info('路径已完整缓存，无需补齐')
      return
    }

    // 3. 确定补齐起点
    const firstMissing = missing[0]
    if (firstMissing === undefined) return
    const firstMissingIndex = pathIds.indexOf(firstMissing)
    const fromId = firstMissingIndex > 0 ? pathIds[firstMissingIndex - 1] ?? null : null

    // 4. 拉取缺失区间
    const subtreeEndpoint = this.api?.subtree
    if (!subtreeEndpoint) throw new Error('[TreeManager] api.subtree 未配置')
    this.logger.info(`差量补齐: 从 ${fromId} 到 ${targetId}`)
    const params: Record<string, unknown> = {
      toId: targetId,
      treeMode: this.config.treeMode ?? 'flat',
      includeTargetChildren: subtreeEndpoint.includeTargetChildren ?? true,
    }
    if (fromId !== null) params['fromId'] = fromId
    const result = await this._callEndpoint<Record<string, FlatTreeNode>>(subtreeEndpoint, params)
    this.addNodesToCache(Object.values(result))
  }

    /** 执行 move Node 操作。 */
async moveNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<FlatTreeNode> {
    const existing = this.cache[nodeId]
    if (!existing) throw new Error(`[TreeManager] 节点不存在: ${String(nodeId)}`)

    if (newParentId !== null) {
      const pathIds = this.getNodePath(newParentId).pathIds
      if (pathIds.includes(nodeId)) {
        throw new Error('[TreeManager] 不能将节点移动到其自身的子孙节点下')
      }
    }

    const endpoint = this.api?.move
    if (endpoint) {
      const payload: Record<string, unknown> = { id: nodeId, newParentId }
      if (index !== undefined) payload['index'] = index
      const response = await this._callEndpoint<{ node?: FlatTreeNode } | FlatTreeNode>(endpoint, payload)
      const moved = resolveMovedNode(response)
      const normalized: FlatTreeNode = {
        ...existing,
        ...moved,
        id: moved.id,
        parentId: moved.parentId ?? newParentId,
        name: typeof moved.name === 'string' ? moved.name : existing.name,
      }
      this.addNodesToCache([normalized])
      return normalized
    }

    const moved: FlatTreeNode = {
      ...existing,
      parentId: newParentId ?? null,
    }
    this.addNodesToCache([moved])
    return moved
  }

  /**
   * 嵌套模式远端搜索，返回匹配节点 + 祖先链（对应 /tree/nested/search）
   */
  async fetchNestedSearch(keyword: string, limit?: number): Promise<NestedTreeSearchResult[]> {
    const endpoint = this.api?.nestedSearch
    if (!endpoint) throw new Error('[TreeManager] api.nestedSearch 未配置')
    const params: Record<string, unknown> = {
      keyword,
      treeMode: this.config.treeMode ?? 'flat'
    }
    const effectiveLimit = limit ?? endpoint.limit
    if (effectiveLimit !== undefined) params['limit'] = effectiveLimit
    return this._callEndpoint<NestedTreeSearchResult[]>(endpoint, params)
  }

  /**
   * 拉取完整嵌套树（对应 /tree/nested）
   */
  async fetchNested(input: FetchNestedInput = {}): Promise<NestedTreeNode[]> {
    const { rootId, limit, depthLimit, treeMode } = input
    const endpoint = this.api?.nested
    if (!endpoint) throw new Error('[TreeManager] api.nested 未配置')
    const params: Record<string, unknown> = {
      treeMode: treeMode ?? this.config.treeMode ?? 'flat'
    }
    if (rootId !== undefined && rootId !== null) params['rootId'] = rootId
    const effectiveLimit = limit ?? endpoint.limit
    if (effectiveLimit !== undefined) params['limit'] = effectiveLimit
    const effectiveDepthLimit = depthLimit ?? endpoint.depthLimit ?? this.config.depthLimit
    if (effectiveDepthLimit !== undefined) params['depthLimit'] = effectiveDepthLimit
    return this._callEndpoint<NestedTreeNode[]>(endpoint, params)
  }

  // ===== 搜索功能 =====

  /**
   * 搜索节点
   * @param keyword 搜索关键词
   * @param matchFn 匹配函数
   * @returns 匹配的节点数组
   */
  searchNodes(keyword: string, matchFn?: (node: FlatTreeNode, keyword: string) => boolean): FlatTreeNode[] {
    const defaultMatchFn = (node: FlatTreeNode, kw: string) => {
      const textField = this.config.textField ?? 'name'
      const text = node[textField]
      return typeof text === 'string' && text.toLowerCase().includes(kw.toLowerCase())
    }

    const matcher = matchFn ?? defaultMatchFn

    return Object.values(this.cache).filter(node => matcher(node, keyword))
  }

  /**
   * 嵌套树搜索（层次模式）
   * 对应 /tree/nested/search 接口
   * 返回匹配节点及其祖先链，前端可直接展开定位
   * @param keyword 搜索关键词
   * @param matchFn 自定义匹配函数（默认匹配 textField）
   * @param limit 最大返回结果数（默认不限制）
   * @returns 匹配节点 + 从根到该节点的祖先链数组
   */
  searchNested(
    keyword: string,
    matchFn?: (node: FlatTreeNode, keyword: string) => boolean,
    limit?: number
  ): NestedTreeSearchResult[] {
    const hits = this.searchNodes(keyword, matchFn)
    const limited = limit !== undefined ? hits.slice(0, limit) : hits

    return limited.map(node => {
      const { pathNodes } = this.getNodePath(node.id)
      return {
        node,
        path: pathNodes ?? [node]
      }
    })
  }

  // ===== 路径和层级 =====

  /**
   * 获取节点路径
   * @param nodeId 节点ID
   * @returns 节点路径
   */
  getNodePath(nodeId: string | number): TreePath {
    const pathIds: Array<string | number> = []
    const pathNodes: FlatTreeNode[] = []
    const visited = new Set<string | number>()

    let currentId: string | number | null | undefined = nodeId

    while (currentId !== null && currentId !== undefined) {
      if (visited.has(currentId)) break  // 防止循环引用导致无限循环
      visited.add(currentId)

      const node: FlatTreeNode | undefined = this.cache[currentId]
      if (!node) break

      pathIds.unshift(currentId)
      pathNodes.unshift(node)

      currentId = node.parentId
    }

    return { pathIds, pathNodes }
  }

  // ===== 树构建 =====

  /**
   * 全量构建嵌套树
   * @param rootId 根节点ID
   * @returns 嵌套树数组
   */
  buildNestedTree(rootId?: string | number | null): NestedTreeNode[] {
    const roots: NestedTreeNode[] = []
    const visited = new Set<string | number>()

    // 获取根节点
    const rootNodes = rootId !== undefined && rootId !== null
      ? (this.cache[rootId] ? [this.cache[rootId]] : [])
      : this.getRoots()

    for (const rootNode of rootNodes) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- rootNode 可能为 undefined（当 cache[rootId] 不存在时）
      if (rootNode !== undefined) {
        const nestedRoot = this._buildSubTreeSafe(rootNode.id, visited, 0)
        if (nestedRoot) {
          roots.push(nestedRoot)
        }
      }
    }

    return roots
  }

  /** 树递归最大深度（防止循环引用或超深树导致栈溢出） */
  private static readonly MAX_TREE_DEPTH = 100

  /**
   * 局部构建子树（递归）
   * @param rootId 根节点ID
   * @returns 嵌套子树
   */
  buildSubTree(rootId: string | number): NestedTreeNode | null {
    return this._buildSubTreeSafe(rootId, new Set(), 0)
  }

  /** @internal 带循环引用保护和深度限制的递归实现 */
  private _buildSubTreeSafe(
    rootId: string | number,
    visited: Set<string | number>,
    depth: number,
  ): NestedTreeNode | null {
    const node = this.cache[rootId]
    if (!node) return null

    // 循环引用保护：已访问过的节点不再递归
    if (visited.has(rootId)) {
      this.logger.warn(`检测到循环引用，跳过节点: ${String(rootId)}`)
      return null
    }

    // 深度限制：防止超深树耗尽调用栈
    if (depth >= TreeManager.MAX_TREE_DEPTH) {
      this.logger.warn(`树深度超过 ${TreeManager.MAX_TREE_DEPTH} 层，截断节点: ${String(rootId)}`)
      return { ...node, children: [] }
    }

    visited.add(rootId)
    const nestedNode: NestedTreeNode = { ...node, children: [] }

    // 递归构建子节点
    const children = this.getChildren(rootId)
    for (const child of children) {
      const childTree = this._buildSubTreeSafe(child.id, visited, depth + 1)
      if (childTree) {
        nestedNode.children.push(childTree)
      }
    }

    return nestedNode
  }

}
