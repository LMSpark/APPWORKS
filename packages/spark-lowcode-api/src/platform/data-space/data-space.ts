/**
 * 数据空间领域模型与前端模型实体：设计态快照的类型合同与构造期不变量校验。
 * {@link DataSpaceFrontendModel} 在实例化时 fail-fast 校验身份、字段唯一性与关系归属，不可绕过。
 */
import { LowcodeApiError } from '../../core/lowcode-api-error.js'
import type { OrderType } from '../../contracts/lowcode-wire-query.js'

/** 数据资源 wire 类型；仅 table/view 可在设计态解析稳定目录身份。 */
export type DataSpaceResourceType = 'table' | 'view' | 'dictionary' | 'interface' | 'json' | 'file'

/** 目录可解析的物理资源子集。 */
export type DataSpaceDatabaseResourceType = Extract<DataSpaceResourceType, 'table' | 'view'>

/** 物理资源字段快照；resourceFieldId 与 name 在同一资源内须唯一。 */
export type DataSpaceResourceField = Readonly<{
  resourceFieldId: string
  name: string
  label: string
  dataType: string
  dataTypeName: string
  length: string
  nullable: boolean | null
  primaryKey: boolean | null
  unique: boolean | null
  system: boolean | null
  defaultValue: string
  description: string
  order: number | null
}>

/** 前端模型绑定的数据资源引用；primaryKeyField 须能在资源字段或模型字段中解析。 */
export type DataSpaceResourceReference = Readonly<{
  resourceId: string
  databaseId: string | null
  resourceName: string
  resourceType: DataSpaceResourceType
  primaryKeyField: string
  databaseName: string
  fields: readonly DataSpaceResourceField[]
}>

/** 前端模型输出字段引用；fieldId 在同一模型内须唯一。 */
export type DataSpaceFieldReference = Readonly<{
  fieldId: string
  resourceFieldId: string | null
  resourceField: string
  alias: string
  fieldType: string
  output: boolean
  order: number
  orderType: OrderType | ''
  group: number
  distinct: boolean
  primaryKey: boolean
  value: string
  valueFunction: string
  expression: string
}>

/** lowcode Base_DataModel_Relation 的只读原始合同。 */
export type LowcodeModelRelationRecord = Readonly<{
  sourceRelationId: string
  dataSpaceId: string
  parentModelId: string
  childModelId: string
  parentResourceName: string
  childResourceName: string
  filterExpression: string
  dependencyType: string
  cascadeDelete: boolean
}>

/** 前端模型查询/联接配置；filter/joinFilter 等字段为序列化 JSON 字符串。 */
export type DataSpaceFrontendModelQuery = Readonly<{
  outputType: string
  filter: string
  distinct: boolean
  businessMain: boolean
  joinType: string
  joinFilter: string
  parentModelId: string
  requestComplete: string
  hasChildField: string
  parentField: string
  foreignKeyFields: string
  requestType: string
  shortName: string
  cacheType: string
  items: string
  selfType: string
  topValue: string
}>

/** {@link DataSpaceFrontendModel} 构造输入；传入前不做不变量校验。 */
export type DataSpaceFrontendModelSnapshot = Readonly<{
  dataSpaceId: string
  modelId: string
  name: string
  resource: DataSpaceResourceReference
  fields: readonly DataSpaceFieldReference[]
  relations: readonly LowcodeModelRelationRecord[]
  query: DataSpaceFrontendModelQuery
}>

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function assertUnique(values: readonly string[], name: string): void {
  if (new Set(values).size !== values.length) {
    throw new LowcodeApiError(0, `${name} 不能重复`)
  }
}

/**
 * 前端模型领域实体：构造期校验 dataSpaceId、字段/关系唯一性与关系归属。
 * 关系须引用当前 modelId；跨 dataSpaceId 的关系会被拒绝。
 */
export class DataSpaceFrontendModel {
  public readonly dataSpaceId: string
  public readonly modelId: string
  public readonly name: string
  public readonly resource: DataSpaceResourceReference
  public readonly fields: readonly DataSpaceFieldReference[]
  public readonly relations: readonly LowcodeModelRelationRecord[]
  public readonly query: DataSpaceFrontendModelQuery

  public constructor(snapshot: DataSpaceFrontendModelSnapshot) {
    this.dataSpaceId = requiredText(snapshot.dataSpaceId, 'dataSpaceId')
    this.modelId = requiredText(snapshot.modelId, 'modelId')
    this.name = requiredText(snapshot.name, '前端模型 name')
    this.resource = {
      ...snapshot.resource,
      resourceId: requiredText(snapshot.resource.resourceId, 'resourceId'),
      resourceName: requiredText(snapshot.resource.resourceName, 'resourceName'),
      primaryKeyField: requiredText(snapshot.resource.primaryKeyField, 'primaryKeyField'),
      fields: snapshot.resource.fields.map((field) => ({
        ...field,
        resourceFieldId: requiredText(field.resourceFieldId, 'resourceFieldId'),
        name: requiredText(field.name, '资源字段 name'),
      })),
    }
    this.fields = snapshot.fields.map((field) => ({
      ...field,
      fieldId: requiredText(field.fieldId, 'fieldId'),
      resourceField: requiredText(field.resourceField, 'resourceField'),
    }))
    this.relations = snapshot.relations.map((relation) => ({
      sourceRelationId: requiredText(relation.sourceRelationId, 'sourceRelationId'),
      dataSpaceId: requiredText(relation.dataSpaceId, 'relation dataSpaceId'),
      parentModelId: requiredText(relation.parentModelId, 'parentModelId'),
      childModelId: requiredText(relation.childModelId, 'childModelId'),
      parentResourceName: requiredText(relation.parentResourceName, 'parentResourceName'),
      childResourceName: requiredText(relation.childResourceName, 'childResourceName'),
      filterExpression: relation.filterExpression,
      dependencyType: relation.dependencyType,
      cascadeDelete: relation.cascadeDelete,
    }))
    this.query = { ...snapshot.query }
    assertUnique(this.resource.fields.map((field) => field.resourceFieldId), 'resourceFieldId')
    assertUnique(this.resource.fields.map((field) => field.name), '资源字段 name')
    assertUnique(this.fields.map((field) => field.fieldId), 'fieldId')
    assertUnique(this.relations.map((relation) => relation.sourceRelationId), 'sourceRelationId')
    for (const relation of this.relations) {
      if (relation.dataSpaceId !== this.dataSpaceId) {
        throw new LowcodeApiError(0, `关系 ${relation.sourceRelationId} 属于其他数据空间`)
      }
      if (relation.parentModelId !== this.modelId && relation.childModelId !== this.modelId) {
        throw new LowcodeApiError(0, `关系 ${relation.sourceRelationId} 未引用当前 modelId`)
      }
    }
  }

  public snapshot(): DataSpaceFrontendModelSnapshot {
    return {
      dataSpaceId: this.dataSpaceId,
      modelId: this.modelId,
      name: this.name,
      resource: this.resource,
      fields: this.fields,
      relations: this.relations,
      query: this.query,
    }
  }
}
