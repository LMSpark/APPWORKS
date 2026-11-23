/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-record
 * 职责：定义并校验蓝图四组消费记录、项目身份和父引用环。
 * 边界：不持有原查询权限或签名快照，不拥有项目编辑生命周期或导航授权投影。
 * AI用途：用 nodeId/projectId/kind 与正式分组表达蓝图，避免混用工具、场景和菜单身份。
 */
import type { ProjectBlueprintTreeNodeData } from './project-blueprint-node'

type BlueprintIdentity = Pick<ProjectBlueprintTreeNodeData, 'nodeId' | 'parentNodeId' | 'projectId' | 'kind'>
type BlueprintDataSpace = NonNullable<ProjectBlueprintTreeNodeData['dataSpace']>
type BlueprintModel = BlueprintDataSpace['models'][number]

/** 无 children 的四组消费记录；source 只保留可读投影，不包含原查询签名或权限。 */
export type ProjectBlueprintRecord = Readonly<BlueprintIdentity & {
  capability: Readonly<ProjectBlueprintTreeNodeData['capability']>
  navigation?: Readonly<NonNullable<ProjectBlueprintTreeNodeData['navigation']>>
  dataSpace?: Readonly<BlueprintDataSpace & { models: ReadonlyArray<Readonly<BlueprintModel>> }>
  prototype?: Readonly<NonNullable<ProjectBlueprintTreeNodeData['prototype']>>
  source: Readonly<ProjectBlueprintTreeNodeData['source']>
}>

function nonEmptyText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${name} 不能为空`)
  return normalized
}

function isRootParent(parentId: string): boolean {
  return parentId === '' || parentId === '0' || parentId === '000000'
}

/** 创建冻结的蓝图记录；不构造树、运行菜单或权限。 */
export function createProjectBlueprintRecord(record: ProjectBlueprintRecord): ProjectBlueprintRecord {
  return Object.freeze({
    ...record,
    nodeId: nonEmptyText(record.nodeId, 'ProjectBlueprintRecord.nodeId'),
    projectId: nonEmptyText(record.projectId, 'ProjectBlueprintRecord.projectId'),
    capability: Object.freeze({ ...record.capability }),
    ...(record.navigation === undefined ? {} : { navigation: Object.freeze({ ...record.navigation }) }),
    ...(record.dataSpace === undefined ? {} : {
      dataSpace: Object.freeze({ ...record.dataSpace, models: Object.freeze(record.dataSpace.models.map(model => Object.freeze({ ...model }))) }),
    }),
    ...(record.prototype === undefined ? {} : { prototype: Object.freeze({ ...record.prototype }) }),
    source: Object.freeze({ ...record.source }),
  })
}

/**
 * 校验一次后端读取中的项目身份、节点身份和父引用环，并冻结记录数组。
 * 缺失父节点和多顶层是后端现状，不在 API 层重写或诊断为第二套领域结构。
 */
export function validateProjectBlueprintRecords(
  projectId: string,
  records: readonly ProjectBlueprintRecord[],
): readonly ProjectBlueprintRecord[] {
  const normalizedProjectId = nonEmptyText(projectId, 'projectId')
  const byId = new Map<string, ProjectBlueprintRecord>()
  for (const record of records) {
    if (record.projectId !== normalizedProjectId) {
      throw new Error(`蓝图节点 ${record.nodeId} 属于其他项目 ${record.projectId}`)
    }
    if (byId.has(record.nodeId)) throw new Error(`蓝图节点 id 重复：${record.nodeId}`)
    byId.set(record.nodeId, record)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (record: ProjectBlueprintRecord): void => {
    if (visiting.has(record.nodeId)) throw new Error(`项目蓝图存在循环：${record.nodeId}`)
    if (visited.has(record.nodeId)) return
    visiting.add(record.nodeId)
    if (!isRootParent(record.parentNodeId)) {
      const parent = byId.get(record.parentNodeId)
      if (parent !== undefined) visit(parent)
    }
    visiting.delete(record.nodeId)
    visited.add(record.nodeId)
  }
  for (const record of records) visit(record)
  return Object.freeze([...records])
}
