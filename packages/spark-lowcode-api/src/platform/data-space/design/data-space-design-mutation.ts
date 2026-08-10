import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import type {
  DataSpaceFieldReference,
  DataSpaceFrontendModelSnapshot,
  LowcodeModelRelationRecord,
} from '../data-space.js'
import type { DataSpaceDesignSnapshot, DataSpaceInputParameter } from './data-space-design-api.js'

type DataSpaceDesignMutationBase = Readonly<{
  dataSpaceId: string
  idempotencyKey: string
  preimage: DataSpaceDesignSnapshot
}>

export type DataSpaceDesignMutationInput =
  | (DataSpaceDesignMutationBase & Readonly<{
      capability: 'update-data-space'
      change: Readonly<{
        name?: string
        description?: string
        inputParameters?: readonly DataSpaceInputParameter[]
      }>
    }>)
  | (DataSpaceDesignMutationBase & Readonly<{
      capability: 'upsert-frontend-model'
      change: DataSpaceFrontendModelSnapshot
    }>)
  | (DataSpaceDesignMutationBase & Readonly<{
      capability: 'update-field-reference'
      modelId: string
      change: DataSpaceFieldReference
    }>)
  | (DataSpaceDesignMutationBase & Readonly<{
      capability: 'update-relation-reference'
      modelId: string
      change: LowcodeModelRelationRecord
    }>)

export type DataSpaceDesignMutationCommand = Readonly<{
  kind: 'data-space-design-mutation'
  dataSpaceId: string
  capability: DataSpaceDesignMutationInput['capability']
  idempotencyKey: string
  preimage: DataSpaceDesignSnapshot
  modelId: string | null
  change: DataSpaceDesignMutationInput['change']
  risk: 'medium'
  journal: Readonly<{ required: true }>
  readback: Readonly<{ required: true; dataSpaceId: string }>
  compensation: Readonly<{
    kind: 'restore-data-space-design-snapshot'
    preimage: DataSpaceDesignSnapshot
  }>
}>

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function inputModelId(input: DataSpaceDesignMutationInput): string | null {
  if (input.capability === 'upsert-frontend-model') return requiredText(input.change.modelId, 'modelId')
  if (input.capability === 'update-field-reference' || input.capability === 'update-relation-reference') {
    return requiredText(input.modelId, 'modelId')
  }
  return null
}

export function prepareDataSpaceDesignMutation(
  input: DataSpaceDesignMutationInput,
): DataSpaceDesignMutationCommand {
  const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  if (input.preimage.dataSpaceId !== dataSpaceId) {
    throw new LowcodeApiError(0, '数据空间设计 mutation 与写前镜像身份不一致')
  }
  const modelId = inputModelId(input)
  if (modelId !== null && input.capability !== 'upsert-frontend-model') {
    const model = input.preimage.models.find(candidate => candidate.modelId === modelId)
    if (model === undefined) throw new LowcodeApiError(0, `前端模型不存在：${modelId}`)
    if (input.capability === 'update-relation-reference') {
      const relation = input.change
      if (relation.parentModelId !== modelId && relation.childModelId !== modelId) {
        throw new LowcodeApiError(0, `关系 ${relation.sourceRelationId} 未引用前端模型 ${modelId}`)
      }
    }
  }
  if (input.capability === 'upsert-frontend-model' && input.change.dataSpaceId !== dataSpaceId) {
    throw new LowcodeApiError(0, `前端模型 ${input.change.modelId} 属于其他数据空间`)
  }
  return {
    kind: 'data-space-design-mutation',
    dataSpaceId,
    capability: input.capability,
    idempotencyKey,
    preimage: input.preimage,
    modelId,
    change: input.change,
    risk: 'medium',
    journal: { required: true },
    readback: { required: true, dataSpaceId },
    compensation: { kind: 'restore-data-space-design-snapshot', preimage: input.preimage },
  }
}
