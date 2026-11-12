import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import pagedata from '../../../../config/pages/structured-config/dimension-design/pagedata.json?raw'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

export const scenario = '88A4D51B01702C3856F4632E234BF34B'
export const keys = {
  rule: `${scenario}@Bil_Dimension_Rule@default`,
  condition: `${scenario}@Bil_Dimension_Rule_Condition@byRule`,
  result: `${scenario}@Bil_Dimension_Rule_Result@byRule`,
  event: `${scenario}@Bil_Dimension_Rule_Template@default`,
  binding: `${scenario}@Bil_Dimension_Source_Binding@default`,
  validationBinding: `${scenario}@Bil_Dimension_Source_Binding@validationByEvent`,
}
type Table = Readonly<{modelBinding: {modelId: string; modelName: string}
  views: Record<string, {queryConfig?: {fields?: string[]}; filterExpression?: unknown}>}>

export async function createDimensionRuntime(ruleId = 'R1', anchorMetadata = true, preload = true) {
  const parsed = JSON.parse(pagedata) as {tables: Record<string, Table>; viewCascades: unknown[]}
  const source = parsed.tables
  const names = Object.keys(source)
  const tables = Object.fromEntries(names.map(name => [name, source[name]]))
  const fields = Object.fromEntries(names.map(name => {
    const all = new Set<string>()
    for (const view of Object.values(source[name]!.views)) {
      for (const field of view.queryConfig?.fields ?? []) all.add(field)
      for (const match of JSON.stringify(view.filterExpression ?? {}).matchAll(/"field":"([^"]+)"/g)) if (match[1]) all.add(match[1])
    }
    return [name, [...all]]
  }))
  const bindingFields = fields['Bil_Dimension_Source_Binding']
  if (!bindingFields) throw new Error('维度来源模型缺失')
  if (anchorMetadata) {
    bindingFields.push('source_model_id', 'effective_from', 'effective_to')
    const mappingFields = fields['Bil_Dimension_Source_Mapping']
    mappingFields?.push(...['source_field_id', 'target_definition_id'].filter(name => !mappingFields.includes(name)))
  }
  const models = buildFormalModels(fields).map(model => {
    const binding = source[model.name]!.modelBinding
    const pk = ['Bil_Dimension_Source_Binding', 'Bil_Dimension_Source_Mapping', 'Bil_Dimension_Definition'].includes(model.name) ? 'id' : 'rowid'
    return {...model, id: binding.modelId, primaryKey: pk, fields: model.fields.map(field => ({...field, modelId: binding.modelId,
      primaryKey: field.name === pk, type: ['priority', 'sort_no'].includes(field.name) ? 'number' :
        ['voucher_required', 'auto_voucher_write', 'stop_after_match', 'required_flag'].includes(field.name)
          || field.name === 'status' && model.name !== 'Bil_Dimension_Source_Binding' ? 'boolean' : field.type}))}
  })
  const http = new ApiBackend()
  for (const name of ['Bil_Dimension_Source_Binding', 'Bil_Dimension_Source_Mapping', 'Bil_Dimension_Definition']) http.primaryKeys[name] = 'id'
  http.records = {
    Bil_Dimension_Rule: [],
    Bil_Dimension_Rule_Condition: [],
    Bil_Dimension_Rule_Result: [],
    Bil_Dimension_Rule_Template: [{rowid: 'EVENT1', event_code: 'expense', template_name: '费用事件', biz_category: 'finance', status: true}],
    Bil_Dimension_Source_Binding: [],
  }
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const config = new ScenarioViewConfig(scenario, JSON.stringify({scenarioId: scenario, tables, viewCascades: parsed.viewCascades}))
  const dataSet = new LowcodeDataSpaceAssembler(api, http).assemble({
    config, space: {dataSpaceId: scenario, name: 'Dimension'}, models, relations: [],
  }).dataSet
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
