/**
 * 权限设计态 mutation 命令 prepare：只 prepare 命令，不自动执行线上写入。
 * 调用方须持 preimage、journal 与 readback 后再由 provision 层执行；remove 能力须 preimage 存在目标。
 */
import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import type {
  PermissionDataObjectPolicy,
  PermissionDesignSnapshot,
  PermissionFeatureTag,
  PermissionObjectGrant,
} from './permission-design-api.js'

type PermissionDesignMutationBase = Readonly<{
  formKey: string
  idempotencyKey: string
  preimage: PermissionDesignSnapshot
}>

/** 权限设计态 mutation 输入；capability 决定 change 形状与 targetId 解析规则。 */
export type PermissionDesignMutationInput =
  | (PermissionDesignMutationBase & Readonly<{
      capability: 'upsert-feature-tag'
      change: PermissionFeatureTag
    }>)
  | (PermissionDesignMutationBase & Readonly<{
      capability: 'upsert-data-object-policy'
      change: PermissionDataObjectPolicy
    }>)
  | (PermissionDesignMutationBase & Readonly<{
      capability: 'upsert-object-grant'
      change: PermissionObjectGrant
    }>)
  | (PermissionDesignMutationBase & Readonly<{
      capability: 'remove-feature-tag' | 'remove-data-object-policy' | 'remove-object-grant'
      targetId: string
      change: Readonly<{ reason: string }>
    }>)

/** 权限设计态 mutation 命令；risk 固定 high，journal/readback/compensation 均为强制约束。 */
export type PermissionDesignMutationCommand = Readonly<{
  kind: 'permission-design-mutation'
  formKey: string
  capability: PermissionDesignMutationInput['capability']
  targetId: string
  idempotencyKey: string
  preimage: PermissionDesignSnapshot
  change: PermissionDesignMutationInput['change']
  risk: 'high'
  journal: Readonly<{ required: true }>
  readback: Readonly<{ required: true; formKey: string }>
  compensation: Readonly<{
    kind: 'restore-permission-design-snapshot'
    preimage: PermissionDesignSnapshot
  }>
}>

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function mutationTargetId(input: PermissionDesignMutationInput): string {
  if (input.capability === 'upsert-feature-tag') return requiredText(input.change.tagId, 'tagId')
  if (input.capability === 'upsert-data-object-policy') return requiredText(input.change.policyId, 'policyId')
  if (input.capability === 'upsert-object-grant') return requiredText(input.change.grantId, 'grantId')
  return requiredText(input.targetId, 'targetId')
}

function assertRemoveTarget(input: PermissionDesignMutationInput, targetId: string): void {
  if (input.capability === 'remove-feature-tag') {
    if (!input.preimage.featureTags.some(item => item.tagId === targetId)) {
      throw new LowcodeApiError(0, `功能标签不存在：${targetId}`)
    }
  } else if (input.capability === 'remove-data-object-policy') {
    if (!input.preimage.dataObjectPolicies.some(item => item.policyId === targetId)) {
      throw new LowcodeApiError(0, `数据对象权限不存在：${targetId}`)
    }
  } else if (input.capability === 'remove-object-grant') {
    if (!input.preimage.grants.some(item => item.grantId === targetId)) {
      throw new LowcodeApiError(0, `对象授权不存在：${targetId}`)
    }
  }
}

/** 校验 preimage FormKey 与 remove 目标存在性后组装 mutation 命令；不发起 HTTP 写入。 */
export function preparePermissionDesignMutation(
  input: PermissionDesignMutationInput,
): PermissionDesignMutationCommand {
  const formKey = requiredText(input.formKey, 'formKey')
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  if (input.preimage.formKey !== formKey) {
    throw new LowcodeApiError(0, '权限设计 mutation 与写前镜像 FormKey 不一致')
  }
  const targetId = mutationTargetId(input)
  assertRemoveTarget(input, targetId)
  return {
    kind: 'permission-design-mutation',
    formKey,
    capability: input.capability,
    targetId,
    idempotencyKey,
    preimage: input.preimage,
    change: input.change,
    risk: 'high',
    journal: { required: true },
    readback: { required: true, formKey },
    compensation: { kind: 'restore-permission-design-snapshot', preimage: input.preimage },
  }
}
