/**
 * @module @spark-appworks/spark-lowcode-api:platform/project-blueprint/project-blueprint
 * 职责：定义并校验蓝图四组消费记录、项目身份和父引用环。
 * 边界：不持有原查询权限或签名快照，不拥有项目编辑生命周期或导航授权投影。
 * AI用途：用 nodeId/projectId/kind 与正式分组表达蓝图，避免混用工具、场景和菜单身份。
 */
import type { ProjectBlueprintNodeKind } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../../core/lowcode-api-error.js'

/** 节点能力与短需求；不表达导航显示、数据模型或请求权限。 */
type BlueprintCapability = Readonly<{
  name: string
  description?: string
  code?: string
  ownerId?: string
  deliveryStatus?: string
}>

/** 节点导航意图；实际可访问性由独立后端授权与运行投影裁决。 */
type BlueprintNavigation = Readonly<{
  title: string
  icon?: string
  order: number
  placement?: 'top' | 'left' | 'right' | 'parent' | 'tabs' | 'popup'
  target?: string
  mobileTarget?: string
  openMode?: 'subsystem' | 'current' | 'new-window' | 'modal' | 'embedded'
  displayMode?: string
  horizontalAlignment?: string
  publishInMenu: boolean
  showChildren: boolean
  beginGroup: boolean
}>

/** 明确的模型查询 Name 引用；导航行不提供正式字段或模型定义。 */
type BlueprintModel = Readonly<{ metaName: string }>
/** 真实业务场景及模型引用，独立于工具 pageId 和节点 nodeId。 */
type BlueprintDataSpace = Readonly<{ scenarioId: string; models: readonly BlueprintModel[] }>
/** 节点原型说明；不承担运行工具文件或业务数据。 */
type BlueprintPrototype = Readonly<{ htmlDescription?: string }>
/** 已剔除 query 凭据的后端消费行，保留分组外估算和版本字段，不构成授权。 */
type BlueprintSource = Readonly<Record<string, unknown>>

/** SPARK 蓝图四组消费记录；原权限与签名快照只在 API 私有查询上下文中持有。 */
export type LowcodeProjectBlueprintRecord = Readonly<{
  nodeId: string
  parentNodeId: string
  projectId: string
  kind: ProjectBlueprintNodeKind | 'unknown'
  capability: BlueprintCapability
  navigation?: BlueprintNavigation
  dataSpace?: BlueprintDataSpace
  prototype?: BlueprintPrototype
  source: BlueprintSource
}>

function nonEmptyText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function isRootParent(parentId: string): boolean {
  return parentId === '' || parentId === '0' || parentId === '000000'
}

/** 创建冻结的 lowcode 蓝图记录；只执行 wire 边界校验。 */
export function createLowcodeProjectBlueprintRecord(
  record: LowcodeProjectBlueprintRecord,
): LowcodeProjectBlueprintRecord {
  return Object.freeze({
    ...record,
    nodeId: nonEmptyText(record.nodeId, 'LowcodeProjectBlueprintRecord.nodeId'),
    projectId: nonEmptyText(record.projectId, 'LowcodeProjectBlueprintRecord.projectId'),
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
export function validateLowcodeProjectBlueprintRecords(
  projectId: string,
  records: readonly LowcodeProjectBlueprintRecord[],
): readonly LowcodeProjectBlueprintRecord[] {
  const normalizedProjectId = nonEmptyText(projectId, 'projectId')
  const byId = new Map<string, LowcodeProjectBlueprintRecord>()
  for (const record of records) {
    if (record.projectId !== normalizedProjectId) {
      throw new LowcodeApiError(0, `蓝图节点 ${record.nodeId} 属于其他项目 ${record.projectId}`)
    }
    if (byId.has(record.nodeId)) throw new LowcodeApiError(0, `蓝图节点 id 重复：${record.nodeId}`)
    byId.set(record.nodeId, record)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (record: LowcodeProjectBlueprintRecord): void => {
    if (visiting.has(record.nodeId)) throw new LowcodeApiError(0, `项目蓝图存在循环：${record.nodeId}`)
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
