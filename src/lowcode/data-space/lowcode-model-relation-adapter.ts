/**
 * @module app:lowcode/data-space/lowcode-model-relation-adapter
 * 职责：将正式模型关系映射为稳定表名间的结构关系。模型关系不定义前端视图输入级联；后者仅由场景配置表达。
 */
import type { DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import type { DataResourceRelation, DataViewFilterTree } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

type Model = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type RelationFilterTranslation = Readonly<{tree: DataViewFilterTree; parent: Model; child: Model; parentTableName: string; childTableName: string}>

function text(value: unknown): string { return value === undefined || value === null ? '' : String(value).trim() }

function fieldReference(value: unknown): Readonly<{ qualifier: string; field: string }> | null {
  const reference = text(value)
  if (!reference) return null
  const separator = reference.lastIndexOf('.')
  return separator < 0
    ? { qualifier: '', field: reference }
    : { qualifier: reference.slice(0, separator), field: reference.slice(separator + 1) }
}

/** 无状态关系适配器，可直接无参创建；只消费 readRelations 和 readModel 正式定义，不读取物理目录。 */
export class LowcodeModelRelationAdapter {
  public adapt(
    relations: Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>,
    bindings: ReadonlyMap<string, Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>,
  ): Readonly<{resourceRelations: DataResourceRelation[]; diagnostics: string[]}> {
    const resourceRelations: DataResourceRelation[] = []
    const diagnostics: string[] = []
    for (const relation of relations) {
      const parents = [...bindings].filter(([, model]) => model.id === relation.parentModelId)
      const children = [...bindings].filter(([, model]) => model.id === relation.childModelId)
      if (parents.length === 0 || children.length === 0) continue
      const translate = (options: RelationFilterTranslation): DataViewFilterTree => {
        const {tree, parent, child, parentTableName, childTableName} = options
        if ('logic' in tree) return {logic: tree.logic, filters: tree.filters.map(filter => translate({tree: filter, parent, child, parentTableName, childTableName}))}
        const target = fieldReference(tree.field)
        if (!target || (target.qualifier !== '' && target.qualifier !== relation.childResourceName)) {
          throw new Error(`正式关系字段未解析: ${relation.sourceRelationId}`)
        }
        const targetField = child.fields.find(field => field.name === target.field)
        if (!targetField) throw new Error(`正式关系字段未解析: ${relation.sourceRelationId}`)
        const resolveBoundModel = (formalName: string): Readonly<{tableName: string; model?: Model}> => {
          if (formalName === relation.parentResourceName) return {tableName: parentTableName, model: parent}
          if (formalName === relation.childResourceName) return {tableName: childTableName, model: child}
          const candidates = [...bindings].filter(([, model]) => model.name === formalName)
          if (candidates.length === 0 && bindings.has(formalName)) {
            throw new Error(`正式关系引用身份冲突: ${formalName}`)
          }
          if (candidates.length === 0) return {tableName: formalName}
          if (candidates.length !== 1) throw new Error(`正式关系模型引用不唯一: ${formalName}`)
          const candidate = candidates[0]
          if (!candidate) throw new Error(`正式关系模型引用未绑定: ${formalName}`)
          return {tableName: candidate[0], model: candidate[1]}
        }
        const canonicalField = (model: Model, name: string): string => {
          const matches = model.fields.filter(item => item.name === name || item.canonicalName === name)
          if (matches.length !== 1) throw new Error(`正式关系字段未唯一解析: ${relation.sourceRelationId}:${name}`)
          const field = matches[0]
          if (!field) throw new Error(`正式关系字段未解析: ${relation.sourceRelationId}`)
          return field.canonicalName
        }
        const value = tree.value
        let translatedValue = value
        if (isRecord(value)) {
          if (value['Type'] === 'GetTableField' && typeof value['Field'] === 'string') {
            const source = fieldReference(value['Field'])
            if (!source) throw new Error(`正式关系字段未解析: ${relation.sourceRelationId}`)
            if (source.qualifier === '' || source.qualifier === relation.parentResourceName) {
              const sourceField = parent.fields.find(field => field.name === source.field)
              if (!sourceField) throw new Error(`正式关系字段未解析: ${relation.sourceRelationId}`)
              translatedValue = {...value, Field: sourceField.canonicalName}
            } else {
              const bound = resolveBoundModel(source.qualifier)
              translatedValue = {...value, Field: bound.model
                ? `${bound.tableName}.${canonicalField(bound.model, source.field)}`
                : value['Field']}
            }
          }
          if (value['Type'] === 'GetRefData' && typeof value['RefTableName'] === 'string') {
            const bound = resolveBoundModel(value['RefTableName'])
            translatedValue = {...value, RefTableName: bound.tableName,
              ...(bound.model && typeof value['RefFieldName'] === 'string' ? {RefFieldName: canonicalField(bound.model, value['RefFieldName'])} : {}),
              ...(bound.model && typeof value['FkFieldName'] === 'string' ? {FkFieldName: canonicalField(bound.model, value['FkFieldName'])} : {}),
            }
          }
          if (value['Type'] === 'GetGroupData' && typeof value['GroupTableName'] === 'string') {
            const bound = resolveBoundModel(value['GroupTableName'])
            translatedValue = {...value, GroupTableName: bound.tableName,
              ...(bound.model && typeof value['GroupField'] === 'string' ? {GroupField: canonicalField(bound.model, value['GroupField'])} : {}),
              ...(bound.model && typeof value['Field'] === 'string' ? {Field: canonicalField(bound.model, value['Field'])} : {}),
            }
          }
          if (value['Type'] === 'GetExpData' && typeof value['refTableName'] === 'string') {
            const bound = resolveBoundModel(value['refTableName'])
            translatedValue = {...value, refTableName: bound.tableName}
          }
        }
        return {field: targetField.canonicalName, operator: tree.operator, ...(tree.value !== undefined ? {value: translatedValue} : {})}
      }
      for (const [parentTable, parent] of parents) for (const [childTable, child] of children) {
        let filterExpression: DataViewFilterTree
        try { filterExpression = translate({tree: relation.filterExpression.toJSON(), parent, child, parentTableName: parentTable, childTableName: childTable}) }
        catch (error) { diagnostics.push(error instanceof Error ? error.message : `正式关系字段未解析: ${relation.sourceRelationId}`); continue }
        resourceRelations.push({relationId: `${relation.sourceRelationId}:${parentTable}:${childTable}`,
          sourceRelationId: relation.sourceRelationId, parentTable, childTable,
          filterExpression,
          cascadeDelete: relation.cascadeDelete})
      }
    }
    return {resourceRelations, diagnostics}
  }

}
