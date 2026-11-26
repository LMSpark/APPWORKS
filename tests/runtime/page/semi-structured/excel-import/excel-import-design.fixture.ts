import designText from '../../../../../config/pages/semi-structured/excel-import-editor/pagedata.json?raw'
import {buildFormalModels} from '../../structured-config/catalog/structured-config-catalog.fixture'
import {vi} from 'vitest'
import {isSparkNode, nodeId, RequestState, type SparkNode} from '@spark-appworks/spark-data'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import {PageRuntime, ScenarioViewConfig, type PageTool} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/platform-adapters/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {LowcodeExcelImport} from '@/platform-adapters/resources/semi-structured/excel-import/resource'
import designRules from '@/views/features/data-platform/semi-structured/excel-import/ui/design-tool/rule.json'
export {designText}
export const EXCEL_DESIGN = '0F93B82141CF40852021D704B0E30BF4'
export const EXCEL_DICTIONARY='69B79AB779DF4C12A5595DACDF3283F1'

/** 从正式工具中取独立控制器挂载用的规则节点，含命名槽的节点属性。 */
export function excelDesignRegions(ids: readonly string[]): SparkNode[] {
  const found = new Map<string, SparkNode>()
  function visit(value: unknown): void {
    if (value === null || typeof value !== 'object') return
    if (isSparkNode(value)) {
      const id = nodeId(value)
      if (id && ids.includes(id)) {
        if (found.has(id)) throw new Error(`Excel 工具区域重复：${id}`)
        found.set(id, value)
      }
    }
    for (const child of Object.values(value)) visit(child)
  }
  visit(designRules)
  return ids.map(id => {
    const region = found.get(id)
    if (!region) throw new Error(`Excel 工具缺少区域：${id}`)
    return region
  })
}

export function excelDictionaryReferenceModels(){
  return buildFormalModels({_Base_DictType:['rowid','TypeName','functiondesc','val','txt','secondValue','thirdValue','fourthvalue','fiveValue'],_Base_DictData:['rowid','typeid','txt','val','ordIdx']})
    .map(model=>({...model,id:model.name==='_Base_DictType'?'69B79AB779DF4C12A5595DACDF3283F1p000':'FBC266CB81A3E3D1D6D67F9B9D7FFF04'}))
}
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

export async function excelDesignRuntime(records: Record<string, Record<string, unknown>[]>, importConfigId = 'E1', nodeId = 'C1', tool?:PageTool) {
  const http = new ApiBackend(); http.primaryKeys['Base_Import_Transform_Rule'] = 'id'; http.records = records
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const ds = new LowcodeDataSpaceAssembler(api, http).assemble({config: new ScenarioViewConfig(EXCEL_DESIGN, designText),
    space: {dataSpaceId: EXCEL_DESIGN, name: 'Excel'}, models: excelDesignModels(), relations: []}).dataSet
  LowcodeExcelImport.bindEditorModelRules(ds)
  const runtime = new PageRuntime({...(tool?{tool}:{pageId:'excel-design-domain'}), scenarioIds: [EXCEL_DESIGN], scenarioInputs: {[EXCEL_DESIGN]: {importConfigId}}, loadScenario: async () => ds})
  await runtime.load(); ds.triggerAutoLoad()
  const nodes = ds.getView('Base_ImportData_Config')!, fields = ds.getView('Base_ImportData_Field')!, rules = ds.getView('Base_Import_Transform_Rule')!
  await vi.waitFor(() => expectLoaded(nodes.requestState))
  const row = nodes.rows.find(row => nodes.getPkKey(row) === nodeId)!
  nodes.setCurrentRow(row); nodes.setSelectedRows([row])
  await vi.waitFor(() => {expectLoaded(fields.requestState); expectLoaded(rules.requestState)})
  return {http, ds, runtime, nodes, fields, rules}
}
function expectLoaded(state: RequestState): void {if (state !== RequestState.Loaded) throw new Error('fixture view not loaded')}
