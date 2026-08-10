import type {
  DataSpaceFrontendModel,
  DataSpaceResourceReference,
} from '@spark-appworks/spark-lowcode-api'
import type {
  ColumnType,
  DataColumn,
  DataViewFieldProjection,
  DataViewQueryContext,
  TableResourceType,
} from '@spark-appworks/spark-data'

export type LowcodeDataSpaceAdapterDiagnostic = Readonly<{
  code: string
  message: string
  dataSpaceId: string
  modelId?: string
  resourceId?: string
  sourceRelationId?: string
}>

export type LowcodeAdaptedResource = Readonly<{
  resourceId: string
  resourceName: string
  resourceType: TableResourceType
  databaseId: string | null
  databaseName: string
  primaryKeyField: string
  columns: readonly DataColumn[]
}>

export type LowcodeAdaptedFrontendModel = Readonly<{
  dataSpaceId: string
  modelId: string
  modelName: string
  resourceId: string
  resourceName: string
  viewId: string
  fieldProjection: readonly DataViewFieldProjection[]
  queryContext: DataViewQueryContext
}>

export type LowcodeFrontendModelAdapterResult = Readonly<{
  resources: readonly LowcodeAdaptedResource[]
  models: readonly LowcodeAdaptedFrontendModel[]
  diagnostics: readonly LowcodeDataSpaceAdapterDiagnostic[]
}>

function resourceType(type: DataSpaceResourceReference['resourceType']): TableResourceType {
  if (type === 'table') return 'database-table'
  if (type === 'view') return 'database-view'
  if (type === 'dictionary') return 'dictionary'
  return 'third-party-api'
}

function columnType(resourceField: DataSpaceResourceReference['fields'][number]): ColumnType {
  const type = `${resourceField.dataType} ${resourceField.dataTypeName}`.toLowerCase()
  if (/bool|bit|布尔/.test(type)) return 'boolean'
  if (/datetime|timestamp|日期时间/.test(type)) return 'datetime'
  if (/\bdate\b|日期/.test(type)) return 'date'
  if (/\btime\b|时间/.test(type)) return 'time'
  if (/decimal|numeric|money|定点|小数/.test(type)) return 'decimal'
  if (/int|整数/.test(type)) return 'integer'
  if (/float|double|real|number|数字/.test(type)) return 'number'
  if (/json|object|对象/.test(type)) return 'object'
  return 'string'
}

function firstText(...values: ReadonlyArray<string | undefined>): string {
  return values.find(value => value !== undefined && value.trim() !== '') ?? ''
}

function toResource(resource: DataSpaceResourceReference): LowcodeAdaptedResource {
  return {
    resourceId: resource.resourceId,
    resourceName: resource.resourceName,
    resourceType: resourceType(resource.resourceType),
    databaseId: resource.databaseId,
    databaseName: resource.databaseName,
    primaryKeyField: resource.primaryKeyField,
    columns: resource.fields.map((field) => ({
      name: field.name,
      type: columnType(field),
      label: field.label || field.name,
      ...(field.nullable === null ? {} : { allowDBNull: field.nullable }),
      ...(field.primaryKey === true ? { isPrimaryKey: true } : {}),
      ...(field.defaultValue === '' ? {} : { defaultValue: field.defaultValue }),
    })),
  }
}

function resourceFingerprint(resource: LowcodeAdaptedResource): string {
  return JSON.stringify({
    resourceName: resource.resourceName,
    resourceType: resource.resourceType,
    databaseId: resource.databaseId,
    primaryKeyField: resource.primaryKeyField,
    columns: resource.columns.map((column) => ({
      name: column.name,
      type: column.type,
      isPrimaryKey: column.isPrimaryKey === true,
    })),
  })
}

function projection(model: DataSpaceFrontendModel): readonly DataViewFieldProjection[] {
  const resourceFields = new Map(model.resource.fields.map((field) => [field.name, field]))
  return model.fields.map((field) => {
    const resourceField = resourceFields.get(field.resourceField)
    const source = resourceField === undefined ? 'derived' : 'resource'
    return {
      fieldId: field.fieldId,
      source,
      resourceFieldId: source === 'resource' ? field.resourceFieldId : null,
      resourceField: field.resourceField,
      viewField: firstText(field.alias, field.resourceField),
      type: resourceField === undefined ? 'string' : columnType(resourceField),
      label: firstText(resourceField?.label, field.alias, field.resourceField),
      output: field.output,
      sortOrder: field.order,
      sortDirection: field.orderType === 'ascending'
        ? 'asc'
        : field.orderType === 'descending' ? 'desc' : null,
      group: field.group,
      distinct: field.distinct,
      primaryKey: field.primaryKey,
      value: field.value,
      valueFunction: field.valueFunction,
      expression: field.expression,
    }
  })
}

function toModel(model: DataSpaceFrontendModel): LowcodeAdaptedFrontendModel {
  return {
    dataSpaceId: model.dataSpaceId,
    modelId: model.modelId,
    modelName: model.name,
    resourceId: model.resource.resourceId,
    resourceName: model.resource.resourceName,
    viewId: model.modelId,
    fieldProjection: projection(model),
    queryContext: {
      kind: 'lowcode-frontend-model',
      dataSpaceId: model.dataSpaceId,
      modelId: model.modelId,
    },
  }
}

export class LowcodeFrontendModelAdapter {
  public adapt(models: readonly DataSpaceFrontendModel[]): LowcodeFrontendModelAdapterResult {
    const diagnostics: LowcodeDataSpaceAdapterDiagnostic[] = []
    const duplicateModelIds = new Set<string>()
    const modelIdCounts = new Map<string, number>()
    for (const model of models) modelIdCounts.set(model.modelId, (modelIdCounts.get(model.modelId) ?? 0) + 1)
    for (const [modelId, count] of modelIdCounts) {
      if (count > 1) duplicateModelIds.add(modelId)
    }

    const resources = new Map<string, LowcodeAdaptedResource>()
    const inconsistentResourceIds = new Set<string>()
    for (const model of models) {
      const adapted = toResource(model.resource)
      const current = resources.get(adapted.resourceId)
      if (current === undefined) {
        resources.set(adapted.resourceId, adapted)
      } else if (resourceFingerprint(current) !== resourceFingerprint(adapted)) {
        inconsistentResourceIds.add(adapted.resourceId)
      }
    }

    const adaptedModels: LowcodeAdaptedFrontendModel[] = []
    for (const model of models) {
      if (duplicateModelIds.has(model.modelId)) {
        diagnostics.push({
          code: 'duplicate-model-id',
          message: `前端模型 ID 重复: ${model.modelId}`,
          dataSpaceId: model.dataSpaceId,
          modelId: model.modelId,
        })
        continue
      }
      if (inconsistentResourceIds.has(model.resource.resourceId)) {
        diagnostics.push({
          code: 'resource-readback-mismatch',
          message: `同一资源 ID 的目录 readback 不一致: ${model.resource.resourceId}`,
          dataSpaceId: model.dataSpaceId,
          modelId: model.modelId,
          resourceId: model.resource.resourceId,
        })
        continue
      }
      const adapted = toModel(model)
      const viewFields = adapted.fieldProjection.map((field) => field.viewField)
      if (new Set(viewFields).size !== viewFields.length) {
        diagnostics.push({
          code: 'duplicate-view-field',
          message: `前端模型字段投影名称重复: ${model.modelId}`,
          dataSpaceId: model.dataSpaceId,
          modelId: model.modelId,
          resourceId: model.resource.resourceId,
        })
        continue
      }
      adaptedModels.push(adapted)
    }

    const activeResourceIds = new Set(adaptedModels.map((model) => model.resourceId))
    return {
      resources: [...resources.values()].filter((resource) => (
        activeResourceIds.has(resource.resourceId) && !inconsistentResourceIds.has(resource.resourceId)
      )),
      models: adaptedModels,
      diagnostics,
    }
  }
}
