import type {
  DataSpaceFrontendModel,
  DataSpaceRuntimeFilter,
  DataSpaceRuntimeSnapshot,
  PermissionRuntimeSnapshot,
} from '@spark-appworks/spark-lowcode-api'
import type {
  DataPermissionSnapshotInput,
  DataTable,
} from '@spark-appworks/spark-data'

import { lowcodeApi } from './lowcode-runtime'

export type LowcodeDataSpaceRuntimeLoadInput = Readonly<{
  table: DataTable
  formKey: string
  dataSpaceId: string
  modelId: string
  viewId?: string
  filter?: DataSpaceRuntimeFilter | null
  pageIndex?: number
  pageSize?: number
}>

export type LowcodeDataSpaceRuntimeLoadResult = Readonly<{
  model: DataSpaceFrontendModel
  data: DataSpaceRuntimeSnapshot
  permission: PermissionRuntimeSnapshot
}>

export type LowcodePermissionSnapshotBinding = Readonly<{
  data: DataSpaceRuntimeSnapshot
  permission: PermissionRuntimeSnapshot
}>

function resourcePermissionKey(model: DataSpaceFrontendModel): string {
  const databaseName = model.resource.databaseName?.trim()
  return databaseName ? `${databaseName}@${model.resource.resourceName}` : model.resource.resourceName
}

export function toDataPermissionSnapshotInput(
  model: DataSpaceFrontendModel,
  binding: LowcodePermissionSnapshotBinding,
): DataPermissionSnapshotInput {
  if (binding.data.formKey !== binding.permission.formKey) {
    throw new Error('数据快照与功能权限快照的 FormKey 不一致')
  }
  if (binding.data.dataSpaceId !== model.dataSpaceId || binding.data.modelId !== model.modelId) {
    throw new Error('数据快照与前端模型身份不一致')
  }
  const allowAdd = binding.permission.allowAddByResource[resourcePermissionKey(model)]
  if (allowAdd !== undefined && allowAdd !== binding.data.allowAdd) {
    throw new Error('同一后端运行决策中的 allowAdd 结果不一致')
  }
  return {
    formKey: binding.data.formKey,
    dataSpaceId: binding.data.dataSpaceId,
    modelId: binding.data.modelId,
    rows: binding.data.rows.map((row) => ({ ...row })),
    originalRows: binding.data.originalRows.map((row) => ({ ...row })),
    total: binding.data.total,
    allowAdd: binding.data.allowAdd,
    systemKey: binding.data.systemKey,
    authorizedFeatureTags: [...binding.permission.authorizedFeatureTags],
  }
}

export async function loadLowcodeDataSpaceRuntime(
  input: LowcodeDataSpaceRuntimeLoadInput,
): Promise<LowcodeDataSpaceRuntimeLoadResult> {
  const design = await lowcodeApi.dataSpace.design.read(input.dataSpaceId)
  const model = design.models.find((candidate) => candidate.modelId === input.modelId)
  if (model === undefined) {
    throw new Error(`数据空间 ${input.dataSpaceId} 不包含前端模型 ${input.modelId}`)
  }
  const [data, permission] = await Promise.all([
    lowcodeApi.dataSpace.runtime.query({
      formKey: input.formKey,
      model,
      ...(input.filter === undefined ? {} : { filter: input.filter }),
      ...(input.pageIndex === undefined ? {} : { pageIndex: input.pageIndex }),
      ...(input.pageSize === undefined ? {} : { pageSize: input.pageSize }),
    }),
    lowcodeApi.permission.runtime.read(input.formKey),
  ])
  input.table.ingestPermissionSnapshot(
    toDataPermissionSnapshotInput(model, { data, permission }),
    input.viewId ?? 'default',
  )
  return { model, data, permission }
}
