/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-index
 * 职责：提供项目蓝图节点内存索引与树投影。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/** ProjectBlueprintIndex — 蓝图 nodesById 的内存索引（树投影 / 查找），非存储形状。 */
import type { ProjectBlueprintTreeNodeData, ProjectBlueprintTreeNodeLocation } from './project-blueprint-node'
import { buildProjectBlueprintTree, findFlatNodeLocation } from './project-blueprint-tree'

/** Navigation Tree Node Like 的语义模型。 */
export type ProjectBlueprintTreeNodeLike = {
    /** 唯一标识。 */
readonly id: string
    /** pid 字段。 */
readonly pid: string
    /** order 字段。 */
readonly order: number
  /** 将索引节点转回完整 ProjectBlueprintTreeNodeData；用于从扁平索引重建树结构或输出持久化格式 */
  toNodeData(): ProjectBlueprintTreeNodeData
}

export function compareProjectBlueprintNodes(
  a: ProjectBlueprintTreeNodeLike,
  b: ProjectBlueprintTreeNodeLike,
): number {
  return a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
}

/**
 * 蓝图索引：id → node 映射 + pid → children 查询。
 */
export class ProjectBlueprintIndex<TNode extends ProjectBlueprintTreeNodeLike> {
  private readonly nodesById: Map<string, TNode>
  private childrenByPid = new Map<string, TNode[]>()
  private treeCache: ProjectBlueprintTreeNodeData[] | null = null

    /** 创建 Navigation Index 实例。 */
constructor(nodesById: Map<string, TNode>) {
    this.nodesById = nodesById
  }

    /** 执行 rebuild 操作。 */
rebuild(): void {
    this.childrenByPid.clear()
    this.treeCache = null
    for (const node of this.nodesById.values()) {
      const pid = node.pid
      let bucket = this.childrenByPid.get(pid)
      if (!bucket) {
        bucket = []
        this.childrenByPid.set(pid, bucket)
      }
      bucket.push(node)
    }
    for (const bucket of this.childrenByPid.values()) {
      bucket.sort(compareProjectBlueprintNodes)
    }
  }

    /** 执行 invalidate Tree 操作。 */
invalidateTree(): void {
    this.treeCache = null
  }

    /** 读取 Children。 */
getChildren(pid: string): readonly TNode[] {
    return this.childrenByPid.get(pid.trim()) ?? []
  }

    /** 执行 collect Descendants 操作。 */
collectDescendants(nodeId: string): TNode[] {
    const result: TNode[] = []
    const stack = [...this.getChildren(nodeId)]
    while (stack.length > 0) {
      const node = stack.pop()
      if (node === undefined) continue
      result.push(node)
      stack.push(...this.getChildren(node.id))
    }
    return result
  }

    /** 执行 next Child Order 操作。 */
nextChildOrder(pid: string): number {
    const siblings = this.getChildren(pid)
    let max = -1
    for (const node of siblings) max = Math.max(max, node.order)
    return max + 1
  }

    /** 执行 build Tree 操作。 */
buildTree(): ProjectBlueprintTreeNodeData[] {
    if (this.treeCache !== null) return this.treeCache
    this.treeCache = buildProjectBlueprintTree(this.nodesById.values())
    return this.treeCache
  }

    /** 执行 find Node Location 操作。 */
findNodeLocation(targetId: string): ProjectBlueprintTreeNodeLocation | null {
    return findFlatNodeLocation(this.nodesById, (pid) => this.getChildren(pid), targetId)
  }
}
