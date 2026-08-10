import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import type { DataSpaceFrontendModel } from '../data-space.js'
import type { DataSpaceRuntimeRow, DataSpaceRuntimeSnapshot } from './data-space-runtime-api.js'

export type DataSpaceAddedRow = Readonly<Record<string, unknown>>

export type DataSpaceChangedRow = Readonly<{
  primaryKey: unknown
  values: Readonly<Record<string, unknown>>
}>

export type DataSpaceDeletedRow = Readonly<{
  primaryKey: unknown
}>

export type DataSpaceRuntimeChanges = Readonly<{
  added?: readonly DataSpaceAddedRow[]
  changed?: readonly DataSpaceChangedRow[]
  deleted?: readonly DataSpaceDeletedRow[]
}>

export type DataSpaceRuntimeMutationInput = Readonly<{
  formKey: string
  model: DataSpaceFrontendModel
  preimage: DataSpaceRuntimeSnapshot
  idempotencyKey: string
  changes: DataSpaceRuntimeChanges
}>

export type DataSpaceRuntimeMutationCommand = Readonly<{
  kind: 'data-space-runtime-mutation'
  formKey: string
  dataSpaceId: string
  modelId: string
  idempotencyKey: string
  preimage: DataSpaceRuntimeSnapshot
  added: ReadonlyArray<Readonly<Record<string, unknown>>>
  changed: ReadonlyArray<Readonly<Record<string, unknown>>>
  deleted: ReadonlyArray<Readonly<Record<string, unknown>>>
  risk: 'medium'
  journal: Readonly<{ required: true }>
  readback: Readonly<{
    required: true
    formKey: string
    dataSpaceId: string
    modelId: string
  }>
  compensation: Readonly<{
    kind: 'restore-data-space-runtime-snapshot'
    preimage: DataSpaceRuntimeSnapshot
  }>
}>

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function matchingRow(input: DataSpaceRuntimeMutationInput, primaryKey: unknown): DataSpaceRuntimeRow {
  const primaryKeyField = input.model.resource.primaryKeyField
  const row = input.preimage.rows.find((candidate) => candidate[primaryKeyField] === primaryKey)
  if (row === undefined) {
    throw new LowcodeApiError(0, `preimage 中不存在主键 ${String(primaryKey)}`)
  }
  return row
}

function assertIdentity(input: DataSpaceRuntimeMutationInput): void {
  const formKey = requiredText(input.formKey, 'formKey')
  requiredText(input.idempotencyKey, 'idempotencyKey')
  if (formKey !== input.preimage.formKey) throw new LowcodeApiError(0, 'mutation FormKey 与 preimage 不一致')
  if (input.model.dataSpaceId !== input.preimage.dataSpaceId) {
    throw new LowcodeApiError(0, 'mutation dataSpaceId 与 preimage 不一致')
  }
  if (input.model.modelId !== input.preimage.modelId) {
    throw new LowcodeApiError(0, 'mutation modelId 与 preimage 不一致')
  }
}

function assertBusinessFields(input: DataSpaceRuntimeMutationInput, values: Readonly<Record<string, unknown>>): void {
  const permitted = new Set(input.model.fields.map((field) => field.resourceField))
  permitted.add(input.model.resource.primaryKeyField)
  for (const fieldName of Object.keys(values)) {
    if (fieldName.startsWith('lingma_sys_')) {
      throw new LowcodeApiError(0, `业务变更不能直接提交系统字段 ${fieldName}`)
    }
    if (!permitted.has(fieldName)) {
      throw new LowcodeApiError(0, `字段 ${fieldName} 不属于前端模型 ${input.model.modelId}`)
    }
  }
}

function prepareAdded(input: DataSpaceRuntimeMutationInput): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const added = input.changes.added ?? []
  if (added.length === 0) return []
  if (!input.preimage.allowAdd) throw new LowcodeApiError(0, '后端权限不允许新增')
  const systemKey = requiredText(input.preimage.systemKey, '新增所需 lingma_sys_key')
  return added.map((values) => {
    assertBusinessFields(input, values)
    return { ...values, lingma_sys_key: systemKey }
  })
}

function prepareChanged(input: DataSpaceRuntimeMutationInput): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const primaryKeyField = input.model.resource.primaryKeyField
  return (input.changes.changed ?? []).map((change) => {
    assertBusinessFields(input, change.values)
    if (primaryKeyField in change.values) {
      throw new LowcodeApiError(0, `主键 ${primaryKeyField} 只能通过 primaryKey 定位，不能作为变更字段`)
    }
    const row = matchingRow(input, change.primaryKey)
    const editable = new Set([...row.lingma_sys_params.r, ...row.lingma_sys_params.e])
    for (const fieldName of Object.keys(change.values)) {
      if (!editable.has(fieldName)) {
        throw new LowcodeApiError(0, `后端权限不允许修改字段 ${fieldName}`)
      }
    }
    const systemKey = requiredText(row.lingma_sys_key, '修改所需 lingma_sys_key')
    return {
      ...change.values,
      [primaryKeyField]: change.primaryKey,
      lingma_sys_key: systemKey,
    }
  })
}

function prepareDeleted(input: DataSpaceRuntimeMutationInput): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const primaryKeyField = input.model.resource.primaryKeyField
  return (input.changes.deleted ?? []).map((change) => {
    const row = matchingRow(input, change.primaryKey)
    if (!row.lingma_sys_params.d) throw new LowcodeApiError(0, `后端权限不允许删除主键 ${String(change.primaryKey)}`)
    const systemKey = requiredText(row.lingma_sys_key, '删除所需 lingma_sys_key')
    return { [primaryKeyField]: change.primaryKey, lingma_sys_key: systemKey }
  })
}

export function prepareDataSpaceRuntimeMutation(
  input: DataSpaceRuntimeMutationInput,
): DataSpaceRuntimeMutationCommand {
  assertIdentity(input)
  const added = prepareAdded(input)
  const changed = prepareChanged(input)
  const deleted = prepareDeleted(input)
  if (added.length + changed.length + deleted.length === 0) {
    throw new LowcodeApiError(0, '数据空间 mutation 至少需要一项变更')
  }
  return {
    kind: 'data-space-runtime-mutation',
    formKey: input.formKey.trim(),
    dataSpaceId: input.model.dataSpaceId,
    modelId: input.model.modelId,
    idempotencyKey: input.idempotencyKey.trim(),
    preimage: input.preimage,
    added,
    changed,
    deleted,
    risk: 'medium',
    journal: { required: true },
    readback: {
      required: true,
      formKey: input.formKey.trim(),
      dataSpaceId: input.model.dataSpaceId,
      modelId: input.model.modelId,
    },
    compensation: {
      kind: 'restore-data-space-runtime-snapshot',
      preimage: input.preimage,
    },
  }
}
