import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../api-provider/api-provider.fixture'
import {buildFormalModels} from '../structured-config/catalog/structured-config-catalog.fixture'
const DESIGN = '0F93B82141CF40852021D704B0E30BF4', path = 'config/pages/semi-structured/excel-import-editor/pagedata.json'
const pages: PageRuntime[] = []
afterEach(() => pages.splice(0).forEach(page => page.dispose()))
async function fixture(importConfigId = 'E1') {
  expect(existsSync(path), 'independent formal Excel design scene must exist').toBe(true)
  const text = await readFile(path, 'utf8')
  const config = JSON.parse(text) as {tables: Record<string, {modelBinding: {modelId: string}; views: Record<string, {queryConfig: {fields: string[]}}>}>}
  const models = Object.entries(config.tables).flatMap(([name, table]) => {
    const key = name === 'Base_Import_Transform_Rule' ? 'id' : 'rowid'
    const fields = [...new Set(Object.values(table.views).flatMap(view => view.queryConfig.fields))]
    return buildFormalModels({[name]: fields}).map(model => ({...model, id: table.modelBinding.modelId, primaryKey: key,
      fields: model.fields.map(field => ({...field, modelId: table.modelBinding.modelId, primaryKey: field.name === key,
        type: ['sheet', 'titleIndex', 'dataIndex', 'type', 'isReadOnly', 'isDict', 'enabled', 'sort_order', 'ordIdx'].includes(field.name) ? 'int' : 'varchar'}))}))
  })
  const http = new ApiBackend(); http.primaryKeys['Base_Import_Transform_Rule'] = 'id'
  http.records = {
    Base_ImportData_Config: [{rowid: 'C1', schemeid: 'E1', pid: 'E1', sheetName: '订单', sheet: 1, sheet_layout_json: '{"keep":false}'},
      {rowid: 'C2', schemeid: 'E2', pid: 'E2', sheetName: '其他方案', sheet: 1}],
    Base_ImportData_Field: [{rowid: 'F1', configid: 'C1', name: 'code', title: '编码', index: '01', type: 1},
      {rowid: 'F2', configid: 'C2', name: 'private', title: '其他字段', type: 1}],
    Base_Import_Transform_Rule: [{id: 'R1', scheme_id: 'E1', config_id: 'C1', rule_name: '去空格', config_json: '{"keep":true}'},
      {id: 'R2', scheme_id: 'E2', config_id: 'C2', rule_name: '其他规则'}],
    ImportExportMethods: [{rowid: 'M1', val: 'import', txt: '导入', ordIdx: 1}],
  }
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'EXECUTION_APP'}})})
  const assembly = new LowcodeDataSpaceAssembler(api, http).assemble({config: new ScenarioViewConfig(DESIGN, text),
    space: {dataSpaceId: DESIGN, name: 'Excel配置设计'}, models, relations: []})
  expect(assembly.diagnostics).toEqual([])
  const ds = assembly.dataSet
  const page = new PageRuntime({pageId: 'excel-design-test', scenarioIds: [DESIGN], scenarioInputs: {[DESIGN]: {importConfigId}}, loadScenario: async () => ds})
  pages.push(page); await page.load(); ds.triggerAutoLoad()
  const nodes = ds.getView('Base_ImportData_Config')!, fields = ds.getView('Base_ImportData_Field')!, rules = ds.getView('Base_Import_Transform_Rule')!
  await vi.waitFor(() => expect(nodes.requestState).toBe(RequestState.Loaded))
  const choose = async () => {
    nodes.setCurrentRow(nodes.rows[0]!); nodes.setSelectedRows([nodes.rows[0]!])
    await vi.waitFor(() => {expect(fields.requestState).toBe(RequestState.Loaded); expect(rules.requestState).toBe(RequestState.Loaded)})
  }
  return {ds, nodes, fields, rules, http, choose}
}
describe('independent formal Excel design scenario', () => {
  it('loads only the requested scheme, then queries fields and transform rules for the selected node', async () => {
    const f = await fixture()
    expect(f.nodes.rows.map(row => row['rowid'])).toEqual(['C1'])
    expect(f.http.reads.map(read => read.table)).not.toContain('Base_ImportData_Field')
    expect(f.http.reads.map(read => read.table)).not.toContain('Base_Import_Transform_Rule')
    await f.choose()
    expect(f.fields.rows.map(row => row['rowid'])).toEqual(['F1'])
    expect(f.rules.rows.map(row => row['id'])).toEqual(['R1'])
    expect(f.rules.primaryKey).toBe('id')
    expect(f.http.saves).toEqual([])
  })
  it('submits changed fields without persisting layout or rule edits and cancels those independently', async () => {
    const f = await fixture(); await f.choose()
    f.nodes.updateEditingValue('C1', 'sheet_layout_json', '{"keep":false,"pending":1}')
    f.rules.updateEditingValue('R1', 'rule_name', '未保存规则')
    f.fields.updateEditingValue('F1', 'title', '订单编码')
    expect((await f.ds.saveChanges({views: [{tableName: 'Base_ImportData_Field', viewId: 'default'}]})).success).toBe(true)
    expect(f.http.saves.map(save => save.table)).toEqual(['Base_ImportData_Field'])
    expect(f.http.records['Base_ImportData_Field']![0]!['title']).toBe('订单编码')
    expect(f.http.records['Base_ImportData_Config']![0]!['sheet_layout_json']).toBe('{"keep":false}')
    f.nodes.discardPendingChanges(); f.rules.discardPendingChanges()
    expect(f.nodes.hasEditingChanges()).toBe(false); expect(f.rules.hasEditingChanges()).toBe(false)
  })
  it('prepares new fields and rules with native query ownership and retains the transform primary key', async () => {
    const f = await fixture(); await f.choose()
    const field = await f.fields.addRow({name: 'new', title: '新字段', index: '02', type: 1})
    const rule = await f.rules.addRow({rule_name: '新规则', config_json: '{"keep":false}'})
    expect(field).toMatchObject({configid: 'C1'})
    expect(rule).toMatchObject({config_id: 'C1', scheme_id: 'E1'})
    expect(rule).toMatchObject({id: expect.any(String)}); expect(rule).not.toHaveProperty('rowid')
    expect((await f.ds.saveChanges({views: [{tableName: 'Base_ImportData_Field', viewId: 'default'}, {tableName: 'Base_Import_Transform_Rule', viewId: 'default'}]})).success).toBe(true)
    expect(f.http.saves.map(save => save.table)).toEqual(['Base_ImportData_Field', 'Base_Import_Transform_Rule'])
  })
  it('isolates a different scheme and refuses to replace a child query with unsaved changes', async () => {
    const f = await fixture('E2'); await f.choose()
    expect(f.nodes.rows.map(row => row['rowid'])).toEqual(['C2'])
    expect(f.fields.rows.map(row => row['rowid'])).toEqual(['F2'])
    f.fields.updateEditingValue('F2', 'title', '未保存')
    await expect(f.fields.setPage(2)).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(f.http.saves).toEqual([])
  })
})
