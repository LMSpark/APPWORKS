/**
 * 平台权限运行快照 → spark-data 渲染权限事实的唯一桥。
 * 禁止在 UI / assembler 内散落第二套标签或 allowAdd 推导。
 */
import type { PermissionRuntimeSnapshot } from '@spark-appworks/spark-lowcode-api'
import type { DataPermissionSnapshotInput, DataRow } from '@spark-appworks/spark-data'

export type LowcodeQueryPermissionFacts = Readonly<{
  formKey: string
  dataSpaceId: string
  modelId: string
  resourceId: string
  rows: readonly DataRow[]
  originalRows: ReadonlyArray<Readonly<DataRow>>
  total: number
  systemKey: string
  queryAllowAdd: boolean
}>

/** 功能标签唯一投影。 */
export function authorizedFeatureTagsFromPermissionRuntime(
  permission: PermissionRuntimeSnapshot,
): readonly string[] {
  return permission.authorizedFeatureTags
}

/**
 * allowAdd 裁决：权限资源表硬拒绝优先；否则采用同一次查询响应的 allowAdd。
 */
export function resolveAllowAddFromPermissionRuntime(
  permission: PermissionRuntimeSnapshot,
  resourceId: string,
  queryAllowAdd: boolean,
): boolean {
  const keyed = permission.allowAddByResource[resourceId]
  if (keyed === false) return false
  return queryAllowAdd
}

/** 查询结果 + 平台权限 → DataPermissionSnapshotInput（UI 唯一可消费形状）。 */
export function toDataPermissionSnapshotInput(
  permission: PermissionRuntimeSnapshot,
  facts: LowcodeQueryPermissionFacts,
): DataPermissionSnapshotInput {
  if (permission.formKey !== facts.formKey) {
    throw new Error(`权限 formKey 与查询 formKey 不一致: ${permission.formKey} / ${facts.formKey}`)
  }
  return {
    formKey: facts.formKey,
    dataSpaceId: facts.dataSpaceId,
    modelId: facts.modelId,
    rows: facts.rows,
    originalRows: facts.originalRows,
    total: facts.total,
    systemKey: facts.systemKey,
    allowAdd: resolveAllowAddFromPermissionRuntime(permission, facts.resourceId, facts.queryAllowAdd),
    authorizedFeatureTags: authorizedFeatureTagsFromPermissionRuntime(permission),
  }
}
