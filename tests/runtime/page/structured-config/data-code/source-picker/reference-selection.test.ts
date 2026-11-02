import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
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
})
