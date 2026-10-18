/**
 * @module app:lowcode/data-space/input-parameters/lowcode-data-space-input-parameter-references
 * 职责：从元数据空间当前编辑覆盖检查参数引用及命名视图配置来源。
 * 边界：不查询、不保存、不改写引用；声明存在不等于调用时提供值。
 * AI用途：识别声明改名/删除的配置影响，并明确不可读或未装配造成的检查缺口。
 */
import {DataViewFilter, RequestState, type DataRow, type DataSet, type DataView, type DataViewFilterTree} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'

/** 一个命名视图是否在配置中显式提供该参数；不暴露参数值。 */
type ParameterReferenceContext = {
  /** 场景文件中的表键，不作为模型注册名。 */
  tableName: string
  /** 同模型内的命名视图。 */
  viewId: string
  /** 配置含该参数的有效JSON值；调用方仍可能覆盖它。 */
  configured: boolean
}

/** 一个配置中的参数引用，不推断未来运行是否失败。 */
type ParameterReference = {
  /** 引用所属配置域。 */
  kind: 'source-input' | 'view-filter' | 'model-relation'
  /** 正式模型ID；不以表别名或来源名称猜测。 */
  modelId: string
  /** 来源字段记录ID或本地定义行的稳定键。 */
  recordId: string
  /** 配置内的准确属性位置。 */
  path: string
  /** 取值函数使用的参数名，保留实际拼写。 */
  parameterName: string
  /** 当前声明编辑结果包含该名称。 */
  declared: boolean
  /** 原查询声明包含该名称，而当前编辑覆盖不再包含。 */
  removedByEdit: boolean
  /** 各命名视图分别判断；空数组表示尚无已知视图。 */
  contexts: ParameterReferenceContext[]
}

/** 完整性只描述本次读取覆盖，不代表配置均可执行或未来调用一定有值。 */
export type InputParameterInspection = {
  /** 所需记录可读、完整且可解析；旧格式须完整投影来源，原生关系只核当前定义。 */
  complete: boolean
  /** 来源入参、视图过滤和已装配关系中的引用。 */
  references: ParameterReference[]
  /** 不完整原因，不含隐藏字段或损坏原文。 */
  issues: string[]
}

/** 从正式元表和文件定义元表检查当前编辑状态；不持有另一份配置。 */
export class LowcodeDataSpaceInputParameterReferences {
  readonly #issues: string[] = []
  /** 绑定元数据运行实例及被设计目标，不替换元空间身份。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string) {}

  private rows(tableName: string, formal: boolean, fields: readonly string[]): DataRow[] {
    const view = this.dataSet.getView(tableName, 'default')
    if (!view || (formal && (view.requestState !== RequestState.Loaded || view.rows.length !== view.total
      || view.queryContext['dataSpaceId'] !== this.targetId || view.dataTable?.modelBinding?.modelName !== tableName))) {
      this.#issues.push(`${tableName}: 当前记录未完整读取或目标上下文不一致`)
      return []
    }
    const result: DataRow[] = []
    for (const original of view.rows) {
      const key = view.getPkKey(original)
      const row = key === undefined ? undefined : view.getEditingRow(key)
      // 文件定义是本地配置草稿，没有正式查询权限；不能套用业务行授权。
      if (!row || !fields.every(field => Object.hasOwn(row, field)) || (formal && !this.readable(view, row, fields))) {
        this.#issues.push(`${tableName}: 身份或所需配置不可读`)
        continue
      }
      const owner = tableName === 'Base_DataSet' ? row['rowid'] : row['dataSetId']
      if (owner !== this.targetId) {this.#issues.push(`${tableName}: 记录不属于当前空间`); continue}
      result.push(row)
    }
    return result
  }

  private readable(view: DataView, row: DataRow, fields: readonly string[]): boolean {
    return fields.every(field => Object.hasOwn(row, field) && view.fieldAccess(row, field).read === 'visible')
  }

  private names(value: unknown): Set<string> {
    try {
      return new Set(DataSpaceDesignApi.readInputParameters({value, editable: true}).flatMap(item => {
        const name = item['Name'] ?? item['name']
        return typeof name === 'string' && name.trim() ? [name.trim()] : []
      }))
    } catch {this.#issues.push('Base_DataSet.inputParams: 声明无法解析'); return new Set()}
  }

  private filter(value: unknown, path: string, append: (name: string, path: string) => void): void {
    if (value === undefined) return
    const parsed = DataViewFilter.parse(value)
    if (!parsed.ok) {this.#issues.push(`${path}: 过滤配置无法解析`); return}
    const walk = (node: DataViewFilterTree, location: string): void => {
      if ('logic' in node) {node.filters.forEach((child, index) => walk(child, `${location}.filters[${index}]`)); return}
      if (isRecord(node.value) && node.value['Type'] === 'GetInputParam') {
        const name = node.value['ParamName']
        if (typeof name === 'string' && name.trim()) append(name, `${location}.value`)
        else this.#issues.push(`${location}: 参数引用缺少名称`)
      }
    }
    walk(parsed.value.toJSON(), path)
  }

  /** 检查当前元数据及编辑覆盖；每次重算，参数值不会进入返回结果。 */
  inspect(config: ScenarioViewConfig | null): InputParameterInspection {
    this.#issues.length = 0
    const references: ParameterReference[] = []
    const spaces = this.rows('Base_DataSet', true, ['rowid', 'inputParams'])
    if (spaces.length !== 1) return {complete: false, references, issues: [...this.#issues, '参数声明目标未唯一返回']}
    const original = this.dataSet.getView('Base_DataSet', 'default')?.rows[0]
    const before = this.names(original?.['inputParams'])
    const declared = this.names(spaces[0]?.['inputParams'])
    const models = this.rows('Base_DataModel', true, ['rowid', 'dataSetId'])
    const modelIds = new Set(models.map(row => row['rowid']))
    const views = this.rows('DataViewDefinition', false, ['dataSetId', 'dataModelId', 'tableName', 'viewId']).filter(row => {
      if (!modelIds.has(row['dataModelId']) || typeof row['tableName'] !== 'string' || typeof row['viewId'] !== 'string') {
        this.#issues.push('DataViewDefinition: 模型或视图身份无效'); return false
      }
      return true
    })
    const contexts = (name: string, selected: DataRow[]): ParameterReferenceContext[] => selected.map(row => {
      const context = row['queryContext']
      let configured = false
      if (context !== undefined && !isRecord(context)) this.#issues.push('DataViewDefinition.queryContext: 参数配置不是对象')
      if (isRecord(context) && Object.hasOwn(context, name)) {
        configured = context[name] !== undefined && DataViewFilter.parse({field: 'input', operator: 'eq',
          value: {Type: 'GetConstValue', Value: context[name]}}).ok
        if (!configured) this.#issues.push('DataViewDefinition.queryContext: 参数配置值不是有效JSON')
      }
      return {tableName: String(row['tableName']), viewId: String(row['viewId']), configured}
    })
    const append = (input: Pick<ParameterReference, 'kind' | 'modelId' | 'recordId' | 'path' | 'parameterName'>, selected: DataRow[]): void => {
      const name = input.parameterName
      references.push({...input, declared: declared.has(name),
        removedByEdit: before.has(name) && !declared.has(name), contexts: contexts(name, selected)})
    }
    const fieldView = this.dataSet.getView('Base_DataModel_Field', 'default')
    for (const row of this.rows('Base_DataModel_Field', true, ['rowid', 'dataSetId', 'dataModelId', 'type'])) {
      if (row['type'] !== 'inputParams') continue
      if (!fieldView || !modelIds.has(row['dataModelId']) || typeof row['dataModelId'] !== 'string'
        || typeof row['rowid'] !== 'string' || !this.readable(fieldView, row, ['ValueFun'])) {
        this.#issues.push('Base_DataModel_Field: 来源参数归属或取值配置不可核验'); continue
      }
      try {
        const value = row['ValueFun']
        const expression = DataSpaceDesignApi.parseValueFunction(typeof value === 'string' ? value : JSON.stringify(value))
        if (expression?.Type === 'GetInputParam') {
          const name = expression['ParamName']
          if (typeof name !== 'string' || !name.trim()) throw new Error('missing name')
          append({kind: 'source-input', modelId: row['dataModelId'], recordId: row['rowid'], path: 'ValueFun', parameterName: name},
            views.filter(view => view['dataModelId'] === row['dataModelId']))
        }
      } catch {this.#issues.push(`Base_DataModel_Field(${row['rowid']}): 来源取值配置无法解析`)}
    }
    for (const row of views) this.filter(row['filterExpression'], 'filterExpression', (name, path) => {
      append({kind: 'view-filter', modelId: String(row['dataModelId']), recordId: JSON.stringify([row['tableName'], row['viewId']]),
        path, parameterName: name}, [row])
    })
    const relations = this.rows('DataResourceRelationDefinition', false, ['dataSetId', 'definitionKey', 'childTable', 'filterExpression'])
    const sources = new Set(relations.map(row => row['sourceRelationId']))
    if (!config?.usesNativeResourceRelations) {
      for (const row of this.rows('Base_DataModel_Relation', true, ['rowid', 'dataSetId'])) {
        if (!sources.has(row['rowid'])) this.#issues.push(`Base_DataModel_Relation(${String(row['rowid'])}): 关系尚未形成可检查的定义投影`)
      }
    }
    for (const row of relations) {
      const selected = views.filter(view => view['tableName'] === row['childTable'])
      const ids = new Set(selected.map(view => view['dataModelId']))
      if (ids.size !== 1) {this.#issues.push('DataResourceRelationDefinition: 子模型绑定不唯一'); continue}
      this.filter(row['filterExpression'], 'filterExpression', (name, path) => {
        append({kind: 'model-relation', modelId: String(selected[0]?.['dataModelId']), recordId: String(row['definitionKey']),
          path, parameterName: name}, selected)
      })
    }
    return {complete: this.#issues.length === 0, references, issues: [...this.#issues]}
  }
}
