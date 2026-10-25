/**
 * @module app:lowcode/data-space/view-design/lowcode-data-space-view-fields
 * 职责：装配完整正式模型列，按命名视图投影核对可用输出与选择引用。
 * 边界：模型结构与视图输出分别处理，不推导数据权限或改变原配置。
 * AI用途：按需字段目录、设计暂存与运行装配共用原生字段合同。
 */
import {DataTable, DataViewQuery, type DataColumn, type DataView, type DataViewFieldProjection} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi, DataSpaceRuntimeApi, DataSpaceQueryAggregation} from '@spark-appworks/spark-lowcode-api'
import {isRecord} from '@spark-appworks/spark-utils'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type ViewFieldProjectInput = Readonly<{
  model: FormalModel
  tableName: string
  configured: unknown
  viewId: string
  definition: Record<string, unknown>
}>

/** 单个原生视图的只读字段目录；仅用于设计候选，不包含业务行或持久编辑。 */
export type LowcodeDataSpaceViewFieldCatalog = {
  /** 正式模型可用输出的只读投影模板；不是当前视图配置，须用户显式初始化才写入定义。文件资源不提供。 */
  readonly outputProjection?: readonly DataViewFieldProjection[]
  /** 当前视图投影的输出字段。 */
  readonly columns: readonly DataColumn[]
  /** 输出字段及原生身份/树依赖中可供绑定选择的字段。 */
  readonly selectionColumns: readonly DataColumn[]
  /** 视图实际主键字段；包含复合主键，不可作为级联写入目标。 */
  readonly primaryKeys: readonly string[]
}

/** Selection references must resolve in the owning view, including explicitly available computed outputs. */
export class LowcodeDataSpaceViewFields {
  /** 完整正式模型列及本地扩展；输出范围由所属DataView.fieldProjection表达。 */
  static columns(model: FormalModel, configured: unknown, tableName: string): DataColumn[] {
    const fields = DataSpaceDesignApi.resolveFields(model)
    const names = new Set(fields.map(field => field.canonicalName))
    const outputs = new Set(fields.filter(field => field.output).map(field => field.canonicalName))
    const rules = new Map<string, Record<string, unknown>>()
    const local: DataColumn[] = []
    if (configured !== undefined) {
     if (!Array.isArray(configured)) throw new Error(`${tableName}.columns 必须是数组`)
     for (const input of configured) {
      if (!isRecord(input)) throw new Error(`${tableName}.columns 必须是对象`)
      const rule = input
      const fieldName = rule['name']
      if (typeof fieldName !== 'string' || rules.has(fieldName) || local.some(column => column.name === fieldName)) {
       throw new Error(`${tableName}.columns 字段名重复或无效: ${String(fieldName)}`)
      }
      if (Object.hasOwn(rule, 'computeExpression')) {
       if (names.has(fieldName)) throw new Error(`${tableName}.columns 本地计算列与正式字段重名: ${fieldName}`)
       local.push({name: fieldName, type: String(rule['type']),
        ...Object.fromEntries(Object.entries(rule).filter(([key]) => key !== 'name' && key !== 'type' && key !== 'allowAIAdd'))})
       continue
      }
      if (!outputs.has(fieldName)) {
       throw new Error(`${tableName}.columns 未解析到唯一正式输出字段: ${fieldName}`)
      }
      rules.set(fieldName, rule)
     }
    }
    return [...fields.map(field => {
     const rule = rules.get(field.canonicalName)
     const validation = rule ? Object.fromEntries(Object.entries(rule).filter(([key]) => key !== 'name')) : {}
     return { name: field.canonicalName, type: field.type || 'string', label: field.description || field.canonicalName,
      isPrimaryKey: field.canonicalName === model.primaryKey, ...validation, allowAIAdd: field.allowAIAdd === true }
    }), ...local]
  }

  /** 视图可配置GetData安全聚合及分组；正式字段身份、类型及任意计算定义保持不变。 */
  static validateProjection(view: Record<string, unknown>, model: FormalModel, path: string): void {
    const projection = view['fieldProjection']
    if (projection === undefined) return
    if (!Array.isArray(projection) || projection.length === 0) throw new Error(`${path} 正式模型输出投影必须是非空数组`)
    const seen = new Set<string>()
    for (const input of projection) {
     if (!isRecord(input)) throw new Error(`${path}.fieldProjection 必须是对象`)
     const field = input
     const matches = model.fields.filter(candidate => candidate.id === field['fieldId'] && candidate.output)
     const formal = matches[0]
     if (!formal || matches.length !== 1 || formal.canonicalName !== field['resourceField'] || formal.canonicalName !== field['viewField']
       || formal.primaryKey !== field['primaryKey'] || (formal.type || 'string') !== field['type']
       || field['expression'] !== '' || field['value'] !== ''
       || field['distinct'] !== false || seen.has(formal.canonicalName)) {
      throw new Error(`${path} 投影不得覆盖正式模型字段身份或计算定义`)
     }
     DataSpaceQueryAggregation.group(field['group'])
     DataSpaceQueryAggregation.normalize(field['valueFunction'], formal)
     seen.add(formal.canonicalName)
    }
  }

  /** Project one view's field catalog with native DataTable semantics; never bind query/save owners or load rows. */
  static project(input: ViewFieldProjectInput): LowcodeDataSpaceViewFieldCatalog {
    const {model, tableName, configured, viewId, definition} = input
    this.validateProjection(definition, model, `${tableName}@${viewId}`)
    const projection = DataSpaceDesignApi.createFieldProjection(model)
    const viewConfig = {fieldProjection: projection, ...Object.fromEntries(['fieldProjection', 'treeConfig', 'queryConfig']
      .filter(key => definition[key] !== undefined).map(key => [key, structuredClone(definition[key])]))}
    const table = DataTable.fromJson({tableName, columns: this.columns(model, configured, tableName),
      views: {default: {}, [viewId]: viewConfig}})
    try {
      const view = table.getOrCreateView(viewId)
      view.primaryKey = model.primaryKey
      const outputProjection = projection.filter(field => field.output)
      return {columns: [...view.columns], selectionColumns: this.selectionColumns(view, new Set(outputProjection.map(field => field.viewField))),
        primaryKeys: [...view.effectivePkFields], outputProjection}
    } finally {table.destroy()}
  }

  /** Projection plus the formal query's identity/tree dependencies; omitted ordinary columns stay unavailable. */
  static selectionColumns(view: DataView, available?: ReadonlySet<string>): readonly DataColumn[] {
    const columns = new Map(view.columns.filter(column => column.name !== '_pk').map(column => [column.name, column]))
    const formal = view.dataTable?.columns.filter(column => column.name !== '_pk' && !column.computeExpression
      && (available === undefined || available.has(column.name))) ?? []
    const treeFields = DataSpaceRuntimeApi.resolveTreeFields(view, new Set(formal.map(column => column.name)))
    for (const name of [view.primaryKey, ...treeFields]) {
      const column = formal.find(candidate => candidate.name === name)
      if (column && !columns.has(name)) columns.set(name, column)
    }
    return [...columns.values()]
  }

  /** Preserve the existing empty-string default and array format; reject missing field references. */
  static validateSelection(view: Readonly<Record<string, unknown>>, fields: ReadonlySet<string>): void {
    const check = (name: unknown, path: string): void => {
      if (name === '' && (path === 'valueField' || path === 'labelField')) return
      if (typeof name !== 'string' || !fields.has(name)) throw new Error(`SCENARIO_VIEW_FIELD: ${path} 不是当前正式输出字段`)
    }
    const valueField = view['valueField']
    if (typeof valueField === 'string') check(valueField, 'valueField')
    else if (Array.isArray(valueField)) valueField.forEach((name, index) => check(name, `valueField[${index}]`))
    if (view['labelField'] !== undefined) check(view['labelField'], 'labelField')
  }

  /** 查询用排序与树身份引用正式字段；显示与聚合可引用已声明的本地计算列。保存和运行装配共用，不解析后端过滤值函数。 */
  static validateReferences(view: Readonly<Record<string, unknown>>, fields: ReadonlySet<string>, local: ReadonlySet<string>): void {
    const check = (name: unknown, path: string, allowLocal = false): void => {
      if (typeof name !== 'string' || (!fields.has(name) && !(allowLocal && local.has(name)))) {
        throw new Error(`SCENARIO_VIEW_FIELD: ${path} 不是当前正式输出字段`)
      }
    }
    this.validateSelection(view, new Set([...fields, ...local]))
    if (view['queryConfig'] !== undefined) DataViewQuery.validateFields(DataViewQuery.parse(view['queryConfig']), fields)
    const sort = view['sortExpression']
    if (Array.isArray(sort)) sort.forEach((item, index) => {
      if (isRecord(item)) check(item['field'], `sortExpression[${index}].field`)
    })
    const tree = view['treeConfig']
    if (isRecord(tree)) for (const key of ['idField', 'parentIdField', 'textField']) {
      if (tree[key] !== undefined) check(tree[key], `treeConfig.${key}`, key === 'textField')
    }
    const aggregates = view['aggregates']
    if (isRecord(aggregates)) for (const [name, value] of Object.entries(aggregates)) {
      if (isRecord(value)) check(value['field'] ?? name, `aggregates.${name}.field`, true)
    }
  }
}
