import {DataSpaceRuntimeApi, LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {DataSet} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {registerDimensionSourceModelRules} from '@/lowcode/resources/structured-config/dimension-source/model-rules'
import pagedata from '../../../../config/pages/structured-config/dimension-design/pagedata.json?raw'
import blueprint from '../../../../config/pages/application/project-blueprint/pagedata.json?raw'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

export const scenario = '88A4D51B01702C3856F4632E234BF34B'
export const catalogScenario = LOWCODE_APPLICATION_CATALOG_FORM_KEY
export const keys = {
  rule: `${scenario}@Bil_Dimension_Rule@default`,
  condition: `${scenario}@Bil_Dimension_Rule_Condition@byRule`,
  result: `${scenario}@Bil_Dimension_Rule_Result@byRule`,
  event: `${scenario}@Bil_Dimension_Rule_Template@default`,
  binding: `${scenario}@Bil_Dimension_Source_Binding@default`,
  validationBinding: `${scenario}@Bil_Dimension_Source_Binding@validationByEvent`,
}
type Table = Readonly<{modelBinding: {modelId: string; modelName: string}; columns?: Array<{name: string; computeExpression?: string}>
  views: Record<string, {queryConfig?: {fields?: string[]}; filterExpression?: unknown; sortExpression?: unknown}>}>
type Row = Record<string, unknown>

/** 按正式 pagedata 推导模型字段：视图投影、过滤/排序引用与非计算列规则的并集。 */
function derivedFields(source: Record<string, Table>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(source).map(([name, table]) => {
    const all = new Set<string>()
    for (const column of table.columns ?? []) if (!column.computeExpression) all.add(column.name)
    for (const view of Object.values(table.views)) {
      for (const field of view.queryConfig?.fields ?? []) all.add(field)
      for (const match of JSON.stringify([view.filterExpression ?? {}, view.sortExpression ?? []]).matchAll(/"field":"([^"]+)"/g)) {
        if (match[1]) all.add(match[1])
      }
    }
    return [name, [...all]]
  }))
}

function assembleDimension(http: ApiBackend, api: DataSpaceRuntimeApi, anchorMetadata: boolean): DataSet {
  const parsed = JSON.parse(pagedata) as {tables: Record<string, Table>; viewCascades: unknown[]}
  const source = parsed.tables
  const fields = derivedFields(source)
  const extend = (table: string, names: readonly string[]) => {
    const list = fields[table] ?? (fields[table] = [])
    list.push(...names.filter(name => !list.includes(name)))
  }
  if (anchorMetadata) {
    extend('Bil_Dimension_Source_Binding', ['source_model_id', 'effective_from', 'effective_to', 'projection_role', 'account_field_id', 'account_field_name'])
    extend('Bil_Dimension_Source_Mapping', ['source_field_id', 'target_definition_id'])
    extend('Bil_Dimension_Source_Collection', ['id'])
    extend('Bil_Dimension_Source_Commit_Policy', ['id', 'status'])
    extend('Bil_Dimension_Source_Commit_Field', ['id', 'source_path', 'required_flag'])
    extend('Bil_Dimension_Rule_Template', ['template_category', 'source_pk_field', 'biz_no_field', 'biz_date_field', 'builtin_flag',
      'voucher_required', 'auto_voucher_write', 'stop_after_match'])
  }
  const idKeyed = ['Bil_Dimension_Source_Binding', 'Bil_Dimension_Source_Mapping', 'Bil_Dimension_Definition', 'Bil_Dimension_Source_Collection',
    'Bil_Dimension_Source_Commit_Policy', 'Bil_Dimension_Source_Commit_Field']
  const integerStatus = ['Bil_Dimension_Source_Binding', 'Bil_Dimension_Source_Commit_Policy']
  const models = buildFormalModels(fields).map(model => {
    const binding = source[model.name]!.modelBinding
    const pk = idKeyed.includes(model.name) ? 'id' : 'rowid'
    return {...model, id: binding.modelId, primaryKey: pk, fields: model.fields.map(field => ({...field, modelId: binding.modelId,
      primaryKey: field.name === pk, type: ['priority', 'sort_no'].includes(field.name) ? 'number' :
        ['voucher_required', 'auto_voucher_write', 'stop_after_match', 'required_flag', 'builtin_flag'].includes(field.name)
          || field.name === 'status' && !integerStatus.includes(model.name) ? 'boolean' : field.type}))}
  })
  for (const name of idKeyed) http.primaryKeys[name] = 'id'
  const config = new ScenarioViewConfig(scenario, JSON.stringify({scenarioId: scenario, tables: source, viewCascades: parsed.viewCascades}))
  const dataSet = new LowcodeDataSpaceAssembler(api, http).assemble({
    config, space: {dataSpaceId: scenario, name: 'Dimension'}, models, relations: [],
  }).dataSet
  if (anchorMetadata) registerDimensionSourceModelRules(dataSet)
  return dataSet
}

/** 7AB 应用目录空间中维度来源候选所用的正式模型与字段表，视图与计算列取自真实蓝图 pagedata。 */
function assembleCatalog(http: ApiBackend, api: DataSpaceRuntimeApi): DataSet {
  const all = (JSON.parse(blueprint) as {tables: Record<string, Table>}).tables
  const tables = {Base_DataModel: all['Base_DataModel']!, Base_DataModel_Field: all['Base_DataModel_Field']!}
  const fields = derivedFields(tables)
  fields['Base_DataModel_Field']!.push(...['type', 'IsOutput', 'IsPKey', 'ValueFun'].filter(name => !fields['Base_DataModel_Field']!.includes(name)))
  const models = buildFormalModels(fields).map(model => {
    const binding = tables[model.name as keyof typeof tables].modelBinding
    return {...model, id: binding.modelId, fields: model.fields.map(field => ({...field, modelId: binding.modelId,
      type: ['IsOutput', 'IsPKey'].includes(field.name) ? 'number' : field.type}))}
  })
  const config = new ScenarioViewConfig(catalogScenario, JSON.stringify({scenarioId: catalogScenario, tables, viewCascades: []}))
  return new LowcodeDataSpaceAssembler(api, http).assemble({
    config, space: {dataSpaceId: catalogScenario, name: 'Catalog'}, models, relations: [],
  }).dataSet
}

export async function createDimensionRuntime(ruleId = 'R1', anchorMetadata = true, preload = true) {
  const http = new ApiBackend()
  http.records = {
    Bil_Dimension_Rule: [],
    Bil_Dimension_Rule_Condition: [],
    Bil_Dimension_Rule_Result: [],
    Bil_Dimension_Rule_Template: [{rowid: 'EVENT1', event_code: 'expense', template_name: '费用事件', biz_category: 'finance', status: true}],
    Bil_Dimension_Source_Binding: [],
  }
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const dataSet = assembleDimension(http, api, anchorMetadata)
  const runtime = new PageRuntime({pageId: 'dimension-test', scenarioIds: [scenario], loadScenario: async () => dataSet})
  await runtime.load()
  const rule = dataSet.getView('Bil_Dimension_Rule')
  const condition = dataSet.getView('Bil_Dimension_Rule_Condition', 'byRule')
  const result = dataSet.getView('Bil_Dimension_Rule_Result', 'byRule')
  const events = dataSet.getView('Bil_Dimension_Rule_Template')
  const bindings = dataSet.getView('Bil_Dimension_Source_Binding')
  const validationBindings = dataSet.getView('Bil_Dimension_Source_Binding', 'validationByEvent')
  if (!rule || !condition || !result || !events || !bindings || !validationBindings) throw new Error('维度测试视图缺失')
  condition.queryContext = {ruleId}
  result.queryContext = {ruleId}
  if (preload) await Promise.all([rule.refresh(), condition.refresh(), result.refresh(), events.refresh(), bindings.refresh()])
  return {http, dataSet, runtime, rule, condition, result, events, bindings, validationBindings}
}

/** 正式模型字段记录（Base_DataModel_Field）。 */
export function catalogField(rowid: string, dataModelId: string, Name: string, changes: Row = {}): Row {
  return {rowid, dataModelId, dataSetId: 'SPACE-A', Name, AsName: null, FieldType: 'string', description: Name, type: 'dataModel',
    IsOutput: 1, IsPKey: 0, ValueFun: null, ...changes}
}

/** 维度来源编辑场景：88A4 与 7AB 同处一个 PageRuntime，节点数据空间 SPACE-A 下有费用单与费用明细两个正式模型。 */
export async function createDimensionSourceRuntime() {
  const http = new ApiBackend()
  http.records = {
    Base_DataModel: [
      {rowid: 'MODEL', dataSetId: 'SPACE-A', Name: 'Expense', MetaName: 'expense_table', Type: '数据库表'},
      {rowid: 'LINE', dataSetId: 'SPACE-A', Name: 'ExpenseLine', MetaName: 'expense_line_table', Type: '数据库表'},
      {rowid: 'FOREIGN', dataSetId: 'SPACE-B', Name: 'Foreign', MetaName: 'foreign_table', Type: '数据库表'},
    ],
    Base_DataModel_Field: [
      catalogField('F-ROWID', 'MODEL', 'RowID', {IsPKey: 1}), catalogField('F-AMOUNT', 'MODEL', 'amount'),
      catalogField('F-SECRET', 'MODEL', 'secret', {IsOutput: 0}), catalogField('F-ACCOUNT', 'MODEL', 'account_set'),
      catalogField('F-TOTAL', 'MODEL', 'total', {ValueFun: 'amount * 2'}), catalogField('F-COMMIT', 'MODEL', 'commit_id'),
      catalogField('L-ROWID', 'LINE', 'rowid', {IsPKey: 1}), catalogField('L-EXPENSE', 'LINE', 'expense_id'), catalogField('L-AMOUNT', 'LINE', 'amount'),
    ],
    Bil_Dimension_Rule_Template: [],
    Bil_Dimension_Rule: [],
    Bil_Dimension_Source_Binding: [],
    Bil_Dimension_Source_Mapping: [],
    Bil_Dimension_Source_Collection: [],
    Bil_Dimension_Source_Commit_Policy: [],
    Bil_Dimension_Source_Commit_Field: [],
    Bil_Dimension_Definition: [
      {id: 'D1', definition_code: 'cost', definition_name: '成本', status: true},
      {id: 'D2', definition_code: 'dept', definition_name: '部门', status: false},
      {id: 'D-STATUS', definition_code: 'task.status', definition_name: '任务状态', status: true},
    ],
    Bil_Dimension_Biz_Category: [{rowid: 'C1', biz_category_code: 'finance', biz_category_name: '财务', status: 1},
      {rowid: 'C2', biz_category_code: 'retired', biz_category_name: '停用', status: 0}],
  }
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const dataSet = assembleDimension(http, api, true)
  const catalog = assembleCatalog(http, api)
  const runtime = new PageRuntime({pageId: 'dimension-source-test', scenarioIds: [scenario, catalogScenario],
    loadScenario: async id => id === scenario ? dataSet : catalog})
  await runtime.load()
  return {http, dataSet, catalog, runtime}
}

export async function seedDimensionRule(f: Awaited<ReturnType<typeof createDimensionRuntime>>): Promise<void> {
  f.http.records['Bil_Dimension_Rule'] = [{rowid: 'R1', rule_code: 'existing', rule_name: '原规则', event_code: 'expense',
    biz_category: 'finance', account_set_id: 'GLOBAL', priority: 0, voucher_required: false, auto_voucher_write: false,
    stop_after_match: false, status: false}]
  f.http.records['Bil_Dimension_Rule_Result'] = [{rowid: 'RESULT1', rule_id: 'R1', account_set_id: 'GLOBAL', sort_no: 1,
    dim_category: 'finance', dim_code_type: 'CONST', dim_code: 'cost', value_type: 'FIELD', value_expr: 'item.code',
    amount_type: 'NONE', required_flag: true}]
  f.http.records['Bil_Dimension_Rule_Condition'] = [{rowid: 'COND1', rule_id: 'R1', result_id: 'RESULT1', account_set_id: 'GLOBAL',
    sort_no: 1, field_code: 'kind', operator: 'equal', value_source: 'CONST', compare_value: 'x'}]
  await Promise.all([f.rule.refresh(), f.condition.refresh(), f.result.refresh()])
}
