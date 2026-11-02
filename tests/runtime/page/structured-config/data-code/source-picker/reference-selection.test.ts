import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
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
