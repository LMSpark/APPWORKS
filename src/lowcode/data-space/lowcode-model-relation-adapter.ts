import type { LowcodeModelRelationRecord } from '@spark-appworks/spark-lowcode-api'
import type {
  DataResourceRelation,
  DataResourceRelationFieldMapping,
  DataViewCascade,
  DependencyType,
} from '@spark-appworks/spark-data'

import type {
  LowcodeAdaptedFrontendModel,
  LowcodeAdaptedResource,
  LowcodeDataSpaceAdapterDiagnostic,
  LowcodeFrontendModelAdapterResult,
} from './lowcode-frontend-model-adapter'
import { LOWCODE_MODEL_VIEW_ID } from './lowcode-frontend-model-adapter'

type RelationFieldPair = Readonly<{
  parentResourceField: string
  childResourceField: string
  parentQualifier: string
  childQualifier: string
}>

export type LowcodeModelRelationAdapterResult = Readonly<{
  resourceRelations: readonly DataResourceRelation[]
  viewCascades: readonly DataViewCascade[]
  diagnostics: readonly LowcodeDataSpaceAdapterDiagnostic[]
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

function fieldReference(value: unknown): Readonly<{ qualifier: string; field: string }> | null {
  const reference = text(value)
  if (!reference) return null
  const separator = reference.lastIndexOf('.')
  return separator < 0
    ? { qualifier: '', field: reference }
    : { qualifier: reference.slice(0, separator), field: reference.slice(separator + 1) }
}

function collectFieldPairs(value: unknown, pairs: RelationFieldPair[]): boolean {
  if (!isRecord(value)) return false
  const children = value['Filters'] ?? value['filters'] ?? value['children']
  if (Array.isArray(children)) {
    return children.length > 0 && children.every(child => collectFieldPairs(child, pairs))
  }

  const valueFunction = value['ValueFun'] ?? value['valueFun']
  if (!isRecord(valueFunction)) return false
  const operator = text(value['Operator'] ?? value['operator']).toLowerCase()
  const functionType = text(valueFunction['Type'] ?? valueFunction['type'])
  if (!['equal', 'equals', '=', '=='].includes(operator) || functionType !== 'GetTableField') return false
  const child = fieldReference(value['Field'] ?? value['field'])
  const parent = fieldReference(valueFunction['Field'] ?? valueFunction['field'])
  if (parent === null || child === null) return false
  pairs.push({
    parentResourceField: parent.field,
    childResourceField: child.field,
    parentQualifier: parent.qualifier,
    childQualifier: child.qualifier,
  })
  return true
}

function parseFieldPairs(relation: LowcodeModelRelationRecord): readonly RelationFieldPair[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(relation.filterExpression)
  } catch {
    return null
  }
  const pairs: RelationFieldPair[] = []
  if (!collectFieldPairs(parsed, pairs)) return null
  const unique = new Map(pairs.map(pair => [
    `${pair.parentResourceField}\u0000${pair.childResourceField}`,
    pair,
  ]))
  const result = [...unique.values()]
  if (result.some(pair => (
    (pair.parentQualifier !== '' && pair.parentQualifier !== relation.parentResourceName)
    || (pair.childQualifier !== '' && pair.childQualifier !== relation.childResourceName)
  ))) return null
  return result.length === 0 ? null : result
}

function dependencyType(value: string): DependencyType | null {
  const normalized = value.trim()
  if (normalized === 'currentRow') return 'currentRow'
  if (normalized === 'selectedRows') return 'selectedRows'
  if (normalized === 'allRows') return 'allRows'
  if (normalized === 'pagedRows') return 'pagedRows'
  return null
}

function resourceFields(resource: LowcodeAdaptedResource): ReadonlySet<string> {
  return new Set(resource.columns.map(column => column.name))
}

function viewField(model: LowcodeAdaptedFrontendModel, resourceField: string): string | null {
  const field = model.fieldProjection.find(candidate => (
    candidate.source === 'resource' && candidate.resourceField === resourceField
  ))
  return field?.viewField ?? null
}

function diagnostic(
  relation: LowcodeModelRelationRecord,
  code: string,
  message: string,
): LowcodeDataSpaceAdapterDiagnostic {
  return {
    code,
    message,
    dataSpaceId: relation.dataSpaceId,
    sourceRelationId: relation.sourceRelationId,
  }
}

export class LowcodeModelRelationAdapter {
  public adapt(
    relations: readonly LowcodeModelRelationRecord[],
    models: LowcodeFrontendModelAdapterResult,
  ): LowcodeModelRelationAdapterResult {
    const diagnostics: LowcodeDataSpaceAdapterDiagnostic[] = []
    const resourceRelations: DataResourceRelation[] = []
    const viewCascades: DataViewCascade[] = []
    const modelsById = new Map(models.models.map(model => [model.modelId, model]))
    const relationCounts = new Map<string, number>()
    for (const relation of relations) {
      relationCounts.set(
        relation.sourceRelationId,
        (relationCounts.get(relation.sourceRelationId) ?? 0) + 1,
      )
    }

    for (const relation of relations) {
      if ((relationCounts.get(relation.sourceRelationId) ?? 0) > 1) {
        diagnostics.push(diagnostic(
          relation,
          'duplicate-source-relation-id',
          `原始模型关系 ID 重复: ${relation.sourceRelationId}`,
        ))
        continue
      }
      const parentModel = modelsById.get(relation.parentModelId)
      const childModel = modelsById.get(relation.childModelId)
      if (parentModel === undefined || childModel === undefined) {
        diagnostics.push(diagnostic(
          relation,
          'relation-model-unresolved',
          `关系模型未解析: ${relation.parentModelId}→${relation.childModelId}`,
        ))
        continue
      }
      if (parentModel.dataSpaceId !== relation.dataSpaceId || childModel.dataSpaceId !== relation.dataSpaceId) {
        diagnostics.push(diagnostic(relation, 'cross-data-space-relation', '模型关系跨越数据空间'))
        continue
      }
      if (parentModel.resource.resourceName !== relation.parentResourceName
        || childModel.resource.resourceName !== relation.childResourceName) {
        diagnostics.push(diagnostic(relation, 'relation-resource-readback-mismatch', '关系资源名称与模型目录 readback 不一致'))
        continue
      }
      const pairs = parseFieldPairs(relation)
      if (pairs === null) {
        diagnostics.push(diagnostic(relation, 'unsupported-relation-filter', '关系 filter 不是受支持的 GetTableField 等值条件树'))
        continue
      }
      const parentFields = resourceFields(parentModel.resource)
      const childFields = resourceFields(childModel.resource)
      if (pairs.some(pair => (
        !parentFields.has(pair.parentResourceField) || !childFields.has(pair.childResourceField)
      ))) {
        diagnostics.push(diagnostic(relation, 'relation-field-unresolved', '关系 filter 引用了不存在的资源字段'))
        continue
      }
      const trigger = dependencyType(relation.dependencyType)
      if (trigger === null) {
        diagnostics.push(diagnostic(relation, 'unsupported-dependency-type', `未知 depType: ${relation.dependencyType}`))
        continue
      }
      const filterBindings = pairs.map(pair => {
        const sourceField = viewField(parentModel, pair.parentResourceField)
        const targetField = viewField(childModel, pair.childResourceField)
        return sourceField === null || targetField === null ? null : { sourceField, targetField }
      })
      if (filterBindings.some(binding => binding === null)) {
        diagnostics.push(diagnostic(relation, 'relation-view-field-unresolved', '关系资源字段未进入对应前端模型投影'))
        continue
      }

      const fieldMappings: readonly DataResourceRelationFieldMapping[] = pairs.map(pair => ({
        parentResourceField: pair.parentResourceField,
        childResourceField: pair.childResourceField,
      }))
      const singleMapping = fieldMappings.length === 1 ? fieldMappings[0] : undefined
      resourceRelations.push({
        relationId: `resource-relation:${relation.sourceRelationId}`,
        sourceRelationId: relation.sourceRelationId,
        parentTable: parentModel.modelId,
        childTable: childModel.modelId,
        fieldMappings: fieldMappings.map(mapping => ({ ...mapping })),
        ...(singleMapping === undefined ? {} : {
          parentField: singleMapping.parentResourceField,
          childField: singleMapping.childResourceField,
        }),
        cascadeDelete: relation.cascadeDelete,
      })
      viewCascades.push({
        cascadeId: `view-cascade:${relation.sourceRelationId}`,
        sourceRelationId: relation.sourceRelationId,
        parentTable: parentModel.modelId,
        parentViewId: LOWCODE_MODEL_VIEW_ID,
        childTable: childModel.modelId,
        childViewId: LOWCODE_MODEL_VIEW_ID,
        filterBindings: filterBindings.map(binding => ({
          sourceField: binding?.sourceField ?? '',
          targetField: binding?.targetField ?? '',
        })),
        dependencyType: trigger,
        autoLoad: true,
      })
    }

    return { resourceRelations, viewCascades, diagnostics }
  }
}
