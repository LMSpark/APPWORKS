/**
 * 权限设计态只读 API：按 formKey 拉取功能标签、数据对象策略与对象授权快照。
 * 变更须走 {@link prepareMutation}，与 runtime 入口分离；无法解析的 granttype 记入 diagnostics。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import {
  PermissionDesignReader,
  permissionList,
  permissionText,
  requiredPermissionText,
} from '../permission-wire.js'
import {
  preparePermissionDesignMutation,
  type PermissionDesignMutationCommand,
  type PermissionDesignMutationInput,
} from './permission-design-mutation.js'

/** 功能标签节点；对应 _Base_FunctionNode。 */
export type PermissionFeatureTag = Readonly<{
  tagId: string
  parentId: string
  title: string
  description: string
  code: string
  order: number
}>

/** 数据对象字段级策略；对应 Base_FunctionDetail。 */
export type PermissionDataObjectPolicy = Readonly<{
  policyId: string
  featureTagId: string
  resourceName: string
  databaseName: string
  readableFields: readonly string[]
  editableFields: readonly string[]
  maskedFields: readonly string[]
  showFilter: string
  addFilter: string
  editFilter: string
  deleteFilter: string
  saveFilter: string
}>

/** 授权主体类型；granttype 0/1/2 映射 role/position/user，其余为 unresolved。 */
export type PermissionGrantSubjectKind = 'role' | 'position' | 'user' | 'unresolved'

/** 组织范围；fixed-organization 或 business-field-organization 二选一，否则 unscoped。 */
export type PermissionGrantOrganizationScope =
  | Readonly<{ kind: 'unscoped' }>
  | Readonly<{ kind: 'fixed-organization'; organizationId: string }>
  | Readonly<{ kind: 'business-field-organization'; field: string }>

/** 页面对象授权；对应 FunctionNodeAuth。 */
export type PermissionObjectGrant = Readonly<{
  grantId: string
  pageId: string
  featureTagIds: readonly string[]
  subjectKind: PermissionGrantSubjectKind
  subjectIds: readonly string[]
  organizationScope: PermissionGrantOrganizationScope
  businessId: string
  enabled: boolean
  rawGrantType: number | null
}>

/** 权限设计态完整快照；作为 mutation 写前镜像与读回验收基准。 */
export type PermissionDesignSnapshot = Readonly<{
  formKey: string
  featureTags: readonly PermissionFeatureTag[]
  dataObjectPolicies: readonly PermissionDataObjectPolicy[]
  grants: readonly PermissionObjectGrant[]
  diagnostics: readonly string[]
}>

const FEATURE_TAG_TABLE = '_Base_FunctionNode'
const POLICY_TABLE = 'Base_FunctionDetail'
const GRANT_TABLE = 'FunctionNodeAuth'

function finiteNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function subjectKind(value: unknown): PermissionGrantSubjectKind {
  const grantType = Number(value)
  if (grantType === 0) return 'role'
  if (grantType === 1) return 'position'
  if (grantType === 2) return 'user'
  return 'unresolved'
}

function organizationScope(row: Record<string, unknown>): PermissionGrantOrganizationScope {
  const organizationId = permissionText(row['masterId'])
  if (organizationId) return { kind: 'fixed-organization', organizationId }
  const field = permissionText(row['mastervaluefield'])
  if (field) return { kind: 'business-field-organization', field }
  return { kind: 'unscoped' }
}

function featureTag(row: Record<string, unknown>): PermissionFeatureTag {
  return {
    tagId: requiredPermissionText(row['rowid'], '功能标签 rowid'),
    parentId: permissionText(row['prowid']),
    title: requiredPermissionText(row['Nodetext'], '功能标签 Nodetext'),
    description: permissionText(row['desc']),
    code: permissionText(row['FunCode']),
    order: finiteNumber(row['ordidx']),
  }
}

function dataObjectPolicy(row: Record<string, unknown>): PermissionDataObjectPolicy {
  return {
    policyId: requiredPermissionText(row['rowid'], '数据对象权限 rowid'),
    featureTagId: requiredPermissionText(row['FunId'], '数据对象权限 FunId'),
    resourceName: requiredPermissionText(row['ConName'], '数据对象权限 ConName'),
    databaseName: permissionText(row['DbName']),
    readableFields: permissionList(row['AllowShowFields']),
    editableFields: permissionList(row['AllowEditFields']),
    maskedFields: permissionList(row['DesensitizationFields']),
    showFilter: permissionText(row['ShowFilter']),
    addFilter: permissionText(row['AllowAddFilter']),
    editFilter: permissionText(row['AllowEditFilter']),
    deleteFilter: permissionText(row['AllowDeleteFilter']),
    saveFilter: permissionText(row['EditDataSaveFilter']),
  }
}

function objectGrant(row: Record<string, unknown>): PermissionObjectGrant {
  const rawGrantType = row['granttype'] === undefined || row['granttype'] === null
    ? null
    : finiteNumber(row['granttype'])
  return {
    grantId: requiredPermissionText(row['rowid'], '权限授权 rowid'),
    pageId: requiredPermissionText(row['pageID'], '权限授权 pageID'),
    featureTagIds: permissionList(row['functionoption']),
    subjectKind: subjectKind(rawGrantType),
    subjectIds: permissionList(row['QID']),
    organizationScope: organizationScope(row),
    businessId: permissionText(row['businessId']),
    enabled: row['status'] === undefined || finiteNumber(row['status']) === 1,
    rawGrantType,
  }
}

/** 权限设计态门面；只读拉取与 mutation 命令 prepare，不执行线上写入。 */
export class PermissionDesignApi {
  private readonly reader: PermissionDesignReader

  public constructor(http: HttpClientBase) {
    this.reader = new PermissionDesignReader(http)
  }

  public async read(formKey: string): Promise<PermissionDesignSnapshot> {
    const normalizedFormKey = requiredPermissionText(formKey, 'formKey')
    const [featureTagRows, grantRows] = await Promise.all([
      this.reader.readTable(FEATURE_TAG_TABLE, 'prowid', normalizedFormKey),
      this.reader.readTable(GRANT_TABLE, 'pageID', normalizedFormKey),
    ])
    const featureTags = featureTagRows.map(featureTag)
    const policyRows = await Promise.all(
      featureTags.map((tag) => this.reader.readTable(POLICY_TABLE, 'FunId', tag.tagId)),
    )
    const grants = grantRows.map(objectGrant)
    const diagnostics = grants
      .filter((grant) => grant.subjectKind === 'unresolved')
      .map((grant) => `授权 ${grant.grantId} 的 granttype 无法解析`)
    return {
      formKey: normalizedFormKey,
      featureTags,
      dataObjectPolicies: policyRows.flat().map(dataObjectPolicy),
      grants,
      diagnostics,
    }
  }

  public prepareMutation(input: PermissionDesignMutationInput): PermissionDesignMutationCommand {
    return preparePermissionDesignMutation(input)
  }
}
