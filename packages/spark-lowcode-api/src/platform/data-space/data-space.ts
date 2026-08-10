import { LowcodeApiError } from '../../core/lowcode-api-error.js'

export type DataSpaceResourceType = 'table' | 'view' | 'dictionary' | 'interface' | 'json' | 'file'

export type DataSpaceResourceReference = Readonly<{
  resourceId?: string
  databaseId?: string
  resourceName: string
  resourceType: DataSpaceResourceType
  primaryKeyField: string
  databaseName?: string
}>

export type DataSpaceFieldReference = Readonly<{
  fieldId: string
  resourceField: string
  alias?: string
}>

export type DataSpaceRelationReference = Readonly<{
  relationId: string
  sourceModelId: string
  targetModelId: string
  expression: string
  dependencyType: string
  cascadeDelete: boolean
}>

export type DataSpaceFrontendModelSnapshot = Readonly<{
  dataSpaceId: string
  modelId: string
  name: string
  resource: DataSpaceResourceReference
  fields: readonly DataSpaceFieldReference[]
  relations: readonly DataSpaceRelationReference[]
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

export class DataSpaceFrontendModel {
  public readonly dataSpaceId: string
  public readonly modelId: string
  public readonly name: string
  public readonly resource: DataSpaceResourceReference
  public readonly fields: readonly DataSpaceFieldReference[]
  public readonly relations: readonly DataSpaceRelationReference[]

  public constructor(snapshot: DataSpaceFrontendModelSnapshot) {
    this.dataSpaceId = requiredText(snapshot.dataSpaceId, 'dataSpaceId')
    this.modelId = requiredText(snapshot.modelId, 'modelId')
    this.name = requiredText(snapshot.name, '前端模型 name')
    this.resource = {
      ...snapshot.resource,
      resourceName: requiredText(snapshot.resource.resourceName, 'resourceName'),
      primaryKeyField: requiredText(snapshot.resource.primaryKeyField, 'primaryKeyField'),
    }
    this.fields = snapshot.fields.map((field) => ({
      ...field,
      fieldId: requiredText(field.fieldId, 'fieldId'),
      resourceField: requiredText(field.resourceField, 'resourceField'),
    }))
    this.relations = snapshot.relations.map((relation) => ({
      relationId: requiredText(relation.relationId, 'relationId'),
      sourceModelId: requiredText(relation.sourceModelId, 'sourceModelId'),
      targetModelId: requiredText(relation.targetModelId, 'targetModelId'),
      expression: relation.expression,
      dependencyType: relation.dependencyType,
      cascadeDelete: relation.cascadeDelete,
    }))
    assertUnique(this.fields.map((field) => field.fieldId), 'fieldId')
    assertUnique(this.relations.map((relation) => relation.relationId), 'relationId')
    for (const relation of this.relations) {
      if (relation.sourceModelId !== this.modelId && relation.targetModelId !== this.modelId) {
        throw new LowcodeApiError(0, `关系 ${relation.relationId} 未引用当前 modelId`)
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
    }
  }
}
