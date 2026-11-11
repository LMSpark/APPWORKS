import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {codeModels, codeService, DESIGN, designText} from '../data-code.fixture'
import * as Reference from '@/lowcode/resources/structured-config/data-code/reference-ops'
import {createSourceFixture} from './fixture'
const owners: PageRuntime[] = []
afterEach(() => owners.splice(0).forEach(owner => owner.dispose()))
async function selectedSource() {
  const f = await createSourceFixture(); owners.push(f.runtime)
  const choose = (table: string, id: string, viewId = 'default') => {const view = f.dataSet.getView(table, viewId)!, row = view.rows.find(row => view.getPkKey(row) === id)!; view.setCurrentRow(row); view.setSelectedRows([row])}
  const apps = f.dataSet.getView('Base_AppSystemList')!, databases = f.dataSet.getView('Base_AppAndSource_Relation')!, tables = f.dataSet.getView('_Base_TblList')!
  await vi.waitFor(() => expect(apps.requestState).toBe(RequestState.Loaded)); choose('Base_AppSystemList', 'A1')
  await vi.waitFor(() => expect(databases.rows).toHaveLength(1)); choose('Base_AppAndSource_Relation', 'R1')
  await vi.waitFor(() => expect(tables.rows).toHaveLength(2)); choose('_Base_TblList', 'T1')
  await vi.waitFor(() => expect(f.dataSet.getView('Base_TblField', 'textFields')!.rows).toHaveLength(2))
  choose('Base_TblField', 'F2', 'textFields'); choose('Base_TblField', 'F1', 'valueFields')
  return f
}
describe('native reference-table selection command', () => {
  it('rolls back all business mappings on an interrupted native field update while preserving unrelated edits', async () => {
    const service = codeService(), dataSet = new LowcodeDataSpaceAssembler(service.runtime, service.http).assemble({config: new ScenarioViewConfig(DESIGN, designText),
      space: {dataSpaceId: DESIGN, name: '编码'}, models: codeModels(), relations: []}).dataSet
    const owner = new PageRuntime({pageId: 'business-atomic', scenarioIds: [DESIGN], scenarioInputs: {[DESIGN]: {applicationId: 'A', codeDesignId: 'C1'}}, loadScenario: async () => dataSet})
    owners.push(owner); await owner.load(); dataSet.triggerAutoLoad()
    const view = dataSet.getView('Base_CodeDesign')!
    await vi.waitFor(() => expect(view.requestState).toBe(RequestState.Loaded)); view.updateEditingValue('C1', 'Name', '此前名称草稿')
    const update = view.updateEditingValue.bind(view)
    const fault = vi.spyOn(view, 'updateEditingValue').mockImplementation((id, field, value) => {
      if (field === 'BusTableName') throw new Error('source identity invalidated')
      return update(id, field, value)
    })
    expect(() => Reference.applyCodeBusinessTable(view, 'C1', {TableRowid: 'NEW-TABLE', TableName: 'new_table', ValueFieldName: 'id', TextFieldName: 'name', description: '来源'})).toThrow('identity invalidated')
    fault.mockRestore()
    expect(view.getEditingRow('C1')).toMatchObject({Name: '此前名称草稿', BusTableRowid: 'T1', BusTableName: '订单'})
    expect(service.http.saves).toEqual([])
  })
  it('projects only visible native source fields with physical names and separate output/filter selections', async () => {
    const f = await selectedSource()
    expect(Reference.projectCodeReferenceSelection(f.dataSet)).toEqual({TableRowid: 'T1', TableName: 'table_one', TextFieldName: 'name', ValueFieldName: 'id',
      description: '表：table_one，引用字段：名称，引用表过滤字段：编号'})
    expect(f.http.saves).toEqual([])
  })
  it('rejects an incomplete field choice without guessing a default', async () => {
    const f = await selectedSource(); f.dataSet.getView('Base_TblField', 'valueFields')!.clearSelectedRows()
    expect(() => Reference.projectCodeReferenceSelection(f.dataSet)).toThrow('选择')
  })
  it('restores a saved table and both fields by exact identity without guessing an application', async () => {
    const f = await selectedSource()
    f.http.records['_Base_TblList']!.push({rowid: 'LATE', dbid: 'D2', tblname: 'off_page'})
    f.http.records['Base_TblField']!.push({rowid: 'LT', tblid: 'LATE', enname: 'name', cnname: '名称'}, {rowid: 'LV', tblid: 'LATE', enname: 'id', cnname: '编号'})
    const browse = f.dataSet.getView('_Base_TblList')!, before = browse.readSnapshot()
    await Reference.restoreCodeStoredReference({dataSet: f.dataSet, reference: {tableId: 'LATE', tableName: '旧表名', textField: 'name', valueField: 'id'}, kind: 'class', check: () => {}})
    expect(f.dataSet.getView('_Base_TblList', 'storedObject')!.getSelectedValues()).toEqual(['LATE'])
    expect(f.dataSet.getView('Base_TblField', 'storedTableText')!.getSelectedValues()).toEqual(['LT'])
    expect(f.dataSet.getView('Base_TblField', 'storedTableValue')!.getSelectedValues()).toEqual(['LV'])
    expect(f.dataSet.getView('Base_AppSystemList')!.getSelectedValues()).toEqual(['A1'])
    expect(f.dataSet.getView('Base_AppAndSource_Relation')!.getSelectedValues()).toEqual(['R1'])
    expect(browse.readSnapshot()).toEqual(before)
    expect(Reference.projectCodeStoredSelection(f.dataSet, 'class')).toMatchObject({TableRowid: 'LATE', TextFieldName: 'name', ValueFieldName: 'id'})
    expect(f.http.saves).toEqual([])
  })
  it('keeps unsaved business display fields and missing key fields unselected', async () => {
    const f = await createSourceFixture(); owners.push(f.runtime)
    const reference = {tableId: 'T1', tableName: 'table_one', textField: '', valueField: 'id'}
    await Reference.restoreCodeStoredReference({dataSet: f.dataSet, reference, kind: 'business', check: () => {}})
    expect(f.dataSet.getView('Base_TblField', 'storedTableValue')!.getSelectedValues()).toEqual(['F1'])
    await Reference.restoreCodeStoredReference({dataSet: f.dataSet, reference: {...reference, valueField: ''}, kind: 'business', check: () => {}})
    expect(f.dataSet.getView('Base_TblField', 'storedTableText')!.getSelectedValues()).toEqual([])
    expect(f.dataSet.getView('Base_TblField', 'storedTableValue')!.getSelectedValues()).toEqual([])
    expect(() => Reference.projectCodeStoredSelection(f.dataSet, 'business')).toThrow('选择')
    expect(f.http.saves).toEqual([])
  })
  it('reports missing or ambiguous saved metadata without selecting a same-named table or field', async () => {
    const f = await createSourceFixture(); owners.push(f.runtime)
    const reference = {tableId: 'MISSING', tableName: 'table_one', textField: 'name', valueField: 'id'}
    await expect(Reference.restoreCodeStoredReference({dataSet: f.dataSet, reference, kind: 'class', check: () => {}})).rejects.toThrow('引用表不存在')
    expect(f.dataSet.getView('_Base_TblList', 'storedObject')!.getSelectedValues()).toEqual([])
    await expect(Reference.restoreCodeStoredReference({dataSet: f.dataSet, reference: {...reference, tableId: 'T1', textField: 'deleted'}, kind: 'class', check: () => {}})).rejects.toThrow('字段不存在')
    f.http.records['Base_TblField']!.push({rowid: 'DUP', tblid: 'T1', enname: 'ID', cnname: '重复'})
    await expect(Reference.restoreCodeStoredReference({dataSet: f.dataSet, reference: {...reference, tableId: 'T1'}, kind: 'class', check: () => {}})).rejects.toThrow('名称不唯一')
    expect(f.http.saves).toEqual([])
  })
  it('does not restore a saved field when its current source permission masks the field name', async () => {
    const f = await createSourceFixture(); owners.push(f.runtime)
    f.http.interceptors.response.use({onResponse: response => {
      const body: unknown = response.data
      if (isRecord(body) && isRecord(body['Result']) && isRecord(body['Result']['data']) && Array.isArray(body['Result']['data']['Items'])) {
        for (const row of body['Result']['data']['Items']) if (isRecord(row) && row['rowid'] === 'F1' && isRecord(row['lingma_sys_params'])) {
          row['lingma_sys_params']['m'] = ['enname']
        }
      }
      return response
    }})
    await expect(Reference.restoreCodeStoredReference({dataSet: f.dataSet, reference: {tableId: 'T1', tableName: 'table_one', textField: '', valueField: 'id'}, kind: 'business', check: () => {}})).rejects.toThrow('不可读')
    expect(f.dataSet.getView('Base_TblField', 'storedTableValue')!.getSelectedValues()).toEqual([])
    expect(f.http.saves).toEqual([])
  })
  it('does not let an old cancelled restoration replace a newer table selection', async () => {
    const f = await createSourceFixture(); owners.push(f.runtime)
    let generation = 1, started = false, first = true, release = () => {}
    const barrier = new Promise<void>(resolve => {release = resolve})
    const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
    f.http.interceptors.request.use({onRequest: async request => {
      const body: unknown = request.data
      if (first && record(body) && Array.isArray(body['Table']) && record(body['Table'][0]) && body['Table'][0]['Name'] === '_Base_TblList') {
        first = false; started = true; await barrier
      }
      return request
    }})
    const old = Reference.restoreCodeStoredReference({dataSet: f.dataSet, reference: {tableId: 'T1', tableName: 'table_one', textField: '', valueField: 'id'}, kind: 'business',
      check: () => {if (generation !== 1) throw new Error('旧选择已关闭')}})
    await vi.waitFor(() => expect(started).toBe(true)); generation = 2
    await Reference.restoreCodeStoredReference({dataSet: f.dataSet, reference: {tableId: 'T3', tableName: 'table_three', textField: '', valueField: 'code'}, kind: 'business', check: () => {}})
    release(); await expect(old).rejects.toThrow('旧选择已关闭')
    expect(f.dataSet.getView('_Base_TblList', 'storedObject')!.getSelectedValues()).toEqual(['T3'])
    expect(f.dataSet.getView('Base_TblField', 'storedTableValue')!.getSelectedValues()).toEqual(['F3'])
    expect(f.http.saves).toEqual([])
  })
})
