/**
 * lowcode `Base_NavigationInfo` 的只读事实记录。
 * 本模块只校验 wire 身份与父引用环，不拥有 AppWorks 项目蓝图领域行为或输出投影。
 */
import type { ProjectBlueprintNodeKind } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../../core/lowcode-api-error.js'

/** lowcode `Base_NavigationInfo` 归一化记录；不是 AppWorks 项目蓝图领域实体。 */
export type LowcodeProjectBlueprintRecord = Readonly<{
  id: string
  parentId: string
  projectId: string
  title: string
  kind: ProjectBlueprintNodeKind
  description: string
  planningContent: string
  prototypeHtml: string
  formKey: string
  dataSpaceType: string
  runtimeTarget: string
  fileVersionId: string
  difficultyFactor: number
  manhour: number
  quantity: number
  sum: number
  total: number
  personInCharge: string
  status: string
  navigationType: number
  runtimeNavigationCandidate: boolean
  order: number
  source: Readonly<Record<string, unknown>>
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
    id: nonEmptyText(record.id, 'LowcodeProjectBlueprintRecord.id'),
    projectId: nonEmptyText(record.projectId, 'LowcodeProjectBlueprintRecord.projectId'),
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
      throw new LowcodeApiError(0, `蓝图节点 ${record.id} 属于其他项目 ${record.projectId}`)
    }
    if (byId.has(record.id)) throw new LowcodeApiError(0, `蓝图节点 id 重复：${record.id}`)
    byId.set(record.id, record)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (record: LowcodeProjectBlueprintRecord): void => {
    if (visiting.has(record.id)) throw new LowcodeApiError(0, `项目蓝图存在循环：${record.id}`)
    if (visited.has(record.id)) return
    visiting.add(record.id)
    if (!isRootParent(record.parentId)) {
      const parent = byId.get(record.parentId)
      if (parent !== undefined) visit(parent)
    }
    visiting.delete(record.id)
    visited.add(record.id)
  }
  for (const record of records) visit(record)
  return Object.freeze([...records])
}
