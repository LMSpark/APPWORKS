/**
 * @module app:lowcode/data-space/lowcode-model-relation-adapter
 * 职责：将正式模型关系映射为稳定表名间的结构关系。模型关系不定义前端视图输入级联；后者仅由场景配置表达。
 */
import { DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import { DataViewFilterCodec, RequestState, type DataSet, type DataResourceRelation, type DataViewFilter, type DataViewFilterTree } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

type Model = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
/** 正式关系查询返回的一条定义；保留源身份、端点、完整过滤表达式和删除配置，不代表已转换为本仓关系。 */
type Relation = Omit<Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>[number], 'filterExpression'> & Readonly<{
  /** 经正式解码的完整过滤树，继续通过DataViewFilter合同消费和转换。 */
  filterExpression: DataViewFilter
}>
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
  /**
   * 从当次元关系视图读取可确认的正式端点，供画布及上游目录共用。
   * @param dataSet 元数据空间运行实例；关系视图必须已完整查询且无未提交修改。
   * @param targetId 被设计空间ID，核对queryContext、行归属及每个身份字段的数据权限。
   * @returns 正式关系ID和父子模型ID；完整filter仅校验语法，不执行或转换字段别名。
   */
  public readMetadataEndpoints(dataSet: DataSet, targetId: string) {
    return this.metadataRows(dataSet, targetId).map(row => ({sourceRelationId: row['rowid'] as string,
      parentModelId: row['parentModId'] as string, childModelId: row['childModId'] as string}))
  }

  /**
   * 从元空间正式DataView读取完整旧关系，复用SPARK API的来源解码，不重复查询或改写记录。
   * @param dataSet 本次元空间实例；来源须已完整查询、无未提交变更。
   * @param targetId 被设计空间身份；转换消费的资源名、过滤、依赖及删除字段须可读。
   * @returns 与readRelations一致的来源合同，尚未成为原生DataResourceRelation。
   */
  public readMetadataRelations(dataSet: DataSet, targetId: string): readonly Relation[] {
    const view = dataSet.getView('Base_DataModel_Relation', 'default')
    const completeFilter = (tree: DataViewFilterTree | undefined): boolean => !!tree && ('logic' in tree
      ? tree.logic === 'and' && tree.filters.length > 0 && tree.filters.every(completeFilter)
      : tree.field === 'dataSetId' && tree.operator === 'eq' && isRecord(tree.value)
        && tree.value['Type'] === 'GetInputParam' && tree.value['ParamName'] === 'dataSpaceId')
    if (!completeFilter(view?.filterExpression) || view?.queryConfig.filterLookups?.length) {
      throw new Error('旧关系完整转换只接受目标空间的完整范围过滤')
    }
    return DataSpaceDesignApi.decodeRelations(this.metadataRows(dataSet, targetId, ['parentTable', 'childTable', 'depType', 'cascadeDel']))
  }

  private metadataRows(dataSet: DataSet, targetId: string, requiredFields: readonly string[] = []) {
    const view = dataSet.getView('Base_DataModel_Relation', 'default')
    if (dataSet.destroyed || !view || view.destroyed || view.requestState !== RequestState.Loaded || view.total !== view.rows.length || view.mutating
      || view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Relation' || view.queryContext['dataSpaceId'] !== targetId) throw new Error('Base_DataModel_Relation未完整读取')
    const identities = new Set<string>()
    return view.rows.map(row => {
      const id = row['rowid'], parent = row['parentModId'], child = row['childModId'], key = view.getPkKey(row)
      if (key === undefined || view.hasEditingChanges(key) || view.dirtyTracking.isPendingCreate(key)
        || view.dirtyTracking.pendingDeleteIds.has(key) || Object.keys(view.dirtyTracking.getDiff(key, row)).length) throw new Error('Base_DataModel_Relation引用对象有未保存修改')
      if (row['dataSetId'] !== targetId || ['rowid', 'dataSetId', 'parentModId', 'childModId', 'filter', ...requiredFields].some(field => view.fieldAccess(row, field).read !== 'visible')) {
        throw new Error('Base_DataModel_Relation引用身份不可读或范围不符')
      }
      if (typeof id !== 'string' || !id.trim() || identities.has(id) || key !== id
        || typeof parent !== 'string' || !parent.trim() || typeof child !== 'string' || !child.trim()) throw new Error('旧关系身份缺失或不唯一')
      identities.add(id)
      DataViewFilterCodec.decode(row['filter'])
      return row
    })
  }

  /** 将正式模型ID映射为绑定表端点，供目录读取与完整装配共用；不推导级联或伪造过滤表达式。 */
  public endpoints(
    relations: ReadonlyArray<Pick<Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>[number], 'sourceRelationId' | 'parentModelId' | 'childModelId'>>,
    bindings: ReadonlyMap<string, Pick<Model, 'id'>>,
  ): Array<Pick<DataResourceRelation, 'relationId' | 'sourceRelationId' | 'parentTable' | 'childTable'>> {
    return relations.flatMap(relation => {
      const parents = [...bindings].filter(([, model]) => model.id === relation.parentModelId)
      const children = [...bindings].filter(([, model]) => model.id === relation.childModelId)
      return parents.flatMap(([parentTable]) => children.map(([childTable]) => ({
        relationId: `${relation.sourceRelationId}:${parentTable}:${childTable}`, sourceRelationId: relation.sourceRelationId, parentTable, childTable,
      })))
    })
  }

  /**
   * 正式关系已完整读取后，描述端点和值函数引用的模型范围；不读取字段，不执行或持久化表达式。
   * @param relations 当次正式查询解码的全部旧关系。
   * @param bindings 配置表键到正式模型身份；只需ID和模型名，字段留待范围确定后读取。
   * @returns 运行范围依赖；同名多绑定全部保留供原转换器诊断，未绑定引用保留原名供范围校验拒绝。
   */
  public scopeDependencies(relations: readonly Relation[], bindings: ReadonlyMap<string, Pick<Model, 'id' | 'name'>>) {
    return relations.flatMap(relation => this.endpoints([relation], bindings).map(endpoint => {
      const referencedTables = new Set<string>()
      const walk = (tree: DataViewFilterTree): void => {
        if ('logic' in tree) {tree.filters.forEach(walk); return}
        const value = tree.value
        if (!isRecord(value)) return
        const key = value['Type'] === 'GetRefData' ? 'RefTableName' : value['Type'] === 'GetGroupData' ? 'GroupTableName'
          : value['Type'] === 'GetExpData' ? 'refTableName' : undefined
        const formalName = key && typeof value[key] === 'string' ? value[key]
          : value['Type'] === 'GetTableField' ? fieldReference(value['Field'])?.qualifier : undefined
        if (formalName === undefined || formalName === '') return
        const candidates = this.referenceBindings(formalName, relation, endpoint, bindings)
        for (const table of candidates.length ? candidates.map(([boundTable]) => boundTable) : [formalName]) referencedTables.add(table)
      }
      walk(relation.filterExpression.toJSON())
      return {...endpoint, referencedTables: [...referencedTables]}
    }))
  }

  private referenceBindings<T extends Pick<Model, 'id' | 'name'>>(formalName: string, relation: Relation,
    endpoint: Pick<DataResourceRelation, 'parentTable' | 'childTable'>, bindings: ReadonlyMap<string, T>): Array<[string, T]> {
    const table = formalName === relation.parentResourceName ? endpoint.parentTable
      : formalName === relation.childResourceName ? endpoint.childTable : undefined
    return [...bindings].filter(([key, model]) => table === undefined ? model.name === formalName : key === table)
  }

  /**
   * 将完整正式关系转换为运行关系，端点映射与目录共用，字段转换仍核对正式Name及输出别名。
   * @param relations 正式查询已解码的完整关系；不使用depType推导前端级联。
   * @param bindings 配置表名与正式模型定义的绑定，字段必须已读取。
   * @returns 完整原生关系及无法转换的诊断；不改输入或持久化旧记录。
   */
  public adapt(
    relations: Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>,
    bindings: ReadonlyMap<string, Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>,
  ): Readonly<{resourceRelations: DataResourceRelation[]; diagnostics: string[]}> {
    const resourceRelations: DataResourceRelation[] = []
    const diagnostics: string[] = []
    for (const relation of relations) {
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
          const candidates = this.referenceBindings(formalName, relation, {parentTable: parentTableName, childTable: childTableName}, bindings)
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
      for (const endpoint of this.endpoints([relation], bindings)) {
        const {parentTable, childTable} = endpoint
        const parent = bindings.get(parentTable), child = bindings.get(childTable)
        if (!parent || !child) throw new Error('正式关系端点绑定已变化')
        let filterExpression: DataViewFilterTree
        try { filterExpression = translate({tree: relation.filterExpression.toJSON(), parent, child, parentTableName: parentTable, childTableName: childTable}) }
        catch (error) { diagnostics.push(error instanceof Error ? error.message : `正式关系字段未解析: ${relation.sourceRelationId}`); continue }
        resourceRelations.push({...endpoint,
          filterExpression,
          cascadeDelete: relation.cascadeDelete})
      }
    }
    return {resourceRelations, diagnostics}
  }

}
