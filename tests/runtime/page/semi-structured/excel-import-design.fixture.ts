import designText from '../../../../config/pages/semi-structured/excel-import-editor/pagedata.json?raw'
import {buildFormalModels} from '../structured-config/catalog/structured-config-catalog.fixture'
import {vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../api-provider/api-provider.fixture'
export {designText}
export const EXCEL_DESIGN = '0F93B82141CF40852021D704B0E30BF4'
export function excelDesignModels() {
  const config = JSON.parse(designText) as {tables: Record<string, {modelBinding: {modelId: string}; views: Record<string, {queryConfig: {fields: string[]}}>}>}
  return Object.entries(config.tables).flatMap(([name, table]) => {
    const key = name === 'Base_Import_Transform_Rule' ? 'id' : 'rowid'
    const fields = [...new Set(Object.values(table.views).flatMap(view => view.queryConfig.fields))]
    return buildFormalModels({[name]: fields}).map(model => ({...model, id: table.modelBinding.modelId, primaryKey: key,
      fields: model.fields.map(field => ({...field, modelId: table.modelBinding.modelId, primaryKey: field.name === key,
        type: ['sheet', 'titleIndex', 'dataIndex', 'type', 'isReadOnly', 'isDict', 'enabled', 'sort_order', 'ordIdx'].includes(field.name) ? 'int' : 'varchar'}))}))
  })
}

export async function excelDesignRuntime(records: Record<string, Record<string, unknown>[]>, importConfigId = 'E1', nodeId = 'C1') {
  const http = new ApiBackend(); http.primaryKeys['Base_Import_Transform_Rule'] = 'id'; http.records = records
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const ds = new LowcodeDataSpaceAssembler(api, http).assemble({config: new ScenarioViewConfig(EXCEL_DESIGN, designText),
    space: {dataSpaceId: EXCEL_DESIGN, name: 'Excel'}, models: excelDesignModels(), relations: []}).dataSet
  const runtime = new PageRuntime({pageId: 'excel-design-domain', scenarioIds: [EXCEL_DESIGN], scenarioInputs: {[EXCEL_DESIGN]: {importConfigId}}, loadScenario: async () => ds})
  await runtime.load(); ds.triggerAutoLoad()
  const nodes = ds.getView('Base_ImportData_Config')!, fields = ds.getView('Base_ImportData_Field')!, rules = ds.getView('Base_Import_Transform_Rule')!
  await vi.waitFor(() => expectLoaded(nodes.requestState))
  const row = nodes.rows.find(row => nodes.getPkKey(row) === nodeId)!
  nodes.setCurrentRow(row); nodes.setSelectedRows([row])
  await vi.waitFor(() => {expectLoaded(fields.requestState); expectLoaded(rules.requestState)})
  return {http, ds, runtime, nodes, fields, rules}
}
function expectLoaded(state: RequestState): void {if (state !== RequestState.Loaded) throw new Error('fixture view not loaded')}
