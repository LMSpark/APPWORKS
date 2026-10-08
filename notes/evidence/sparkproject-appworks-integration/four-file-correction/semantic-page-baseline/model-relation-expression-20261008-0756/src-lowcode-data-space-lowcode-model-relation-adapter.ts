/**
 * @module app:lowcode/data-space/lowcode-model-relation-adapter
 * 职责：将正式模型关系映射为稳定表名间的结构关系。模型关系不定义前端视图输入级联；后者仅由场景配置表达。
 */
import type { DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import type { DataResourceRelation } from '@spark-appworks/spark-data'

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
      const pairs: Array<{ sourceField: string; targetField: string }> = []
      const collect = (tree: ReturnType<typeof relation.filterExpression.toJSON>): boolean => {
        if ('logic' in tree) return tree.logic === 'and' && tree.filters.length > 0 && tree.filters.every(collect)
        const value = tree.value
        if (tree.operator !== 'eq' || value === null || typeof value !== 'object' || Array.isArray(value)
          || !('Type' in value) || value['Type'] !== 'GetTableField' || !('Field' in value) || typeof value['Field'] !== 'string') return false
        const source = fieldReference(value['Field'])
        const target = fieldReference(tree.field)
        if (!source || !target || (source.qualifier !== '' && source.qualifier !== relation.parentResourceName)
          || (target.qualifier !== '' && target.qualifier !== relation.childResourceName)) return false
        pairs.push({sourceField: source.field, targetField: target.field})
        return true
      }
      if (!collect(relation.filterExpression.toJSON())) {
        diagnostics.push(`关系 ${relation.sourceRelationId} 无法解析为正式模型字段映射`)
        continue
      }
      for (const [parentTable, parent] of parents) for (const [childTable, child] of children) {
        const mapped = pairs.map(pair => {
          const source = parent.fields.find(field => field.name === pair.sourceField && field.output)
          const target = child.fields.find(field => field.name === pair.targetField && field.output)
          if (!source || !target) throw new Error(`正式关系字段未解析: ${relation.sourceRelationId}`)
          return {sourceField: source.canonicalName, targetField: target.canonicalName}
        })
        resourceRelations.push({relationId: `${relation.sourceRelationId}:${parentTable}:${childTable}`,
          sourceRelationId: relation.sourceRelationId, parentTable, childTable,
          fieldMappings: mapped.map(pair => ({parentResourceField: pair.sourceField, childResourceField: pair.targetField})),
          cascadeDelete: relation.cascadeDelete})
      }
    }
    return {resourceRelations, diagnostics}
  }

}
