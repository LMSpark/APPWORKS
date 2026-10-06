/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-index
 * 职责：蓝图节点内存索引与树投影。
 * 边界：非持久化存储形状；不渲染 Vue，不操作 spark-data 运行态。
 * AI用途：从扁平 nodesById 重建树或定位节点时使用本模块。
 */
import type { ProjectBlueprintTreeNodeData, ProjectBlueprintTreeNodeLocation } from './project-blueprint-node'
import { buildProjectBlueprintTree, findFlatNodeLocation } from './project-blueprint-tree'

/** 索引节点最小契约：可比较顺序，并可还原为完整树节点数据。 */
export type ProjectBlueprintTreeNodeLike = {
  readonly id: string
  readonly pid: string
  readonly order: number
  toNodeData(): ProjectBlueprintTreeNodeData
}

export function compareProjectBlueprintNodes(
  a: ProjectBlueprintTreeNodeLike,
  b: ProjectBlueprintTreeNodeLike,
): number {
  return a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
}

/** 蓝图索引：id → node，以及 pid → children 查询与树缓存。 */
export class ProjectBlueprintIndex<TNode extends ProjectBlueprintTreeNodeLike> {
  private readonly nodesById: Map<string, TNode>
  private childrenByPid = new Map<string, TNode[]>()
  private treeCache: ProjectBlueprintTreeNodeData[] | null = null
  /** 持有现有节点集合的索引引用，重建仅更新内存查询和树投影。 */

  constructor(nodesById: Map<string, TNode>) {
    this.nodesById = nodesById
  }

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

  invalidateTree(): void {
    this.treeCache = null
  }

  getChildren(pid: string): readonly TNode[] {
    return this.childrenByPid.get(pid.trim()) ?? []
  }

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

  nextChildOrder(pid: string): number {
    const siblings = this.getChildren(pid)
    let max = -1
    for (const node of siblings) max = Math.max(max, node.order)
    return max + 1
  }

  buildTree(): ProjectBlueprintTreeNodeData[] {
    if (this.treeCache !== null) return this.treeCache
    this.treeCache = buildProjectBlueprintTree(this.nodesById.values())
    return this.treeCache
  }

  findNodeLocation(targetId: string): ProjectBlueprintTreeNodeLocation | null {
    return findFlatNodeLocation(this.nodesById, (pid) => this.getChildren(pid), targetId)
  }
}
