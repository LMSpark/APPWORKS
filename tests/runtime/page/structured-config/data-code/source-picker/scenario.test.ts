import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState, type DataSet} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {createSourceFixture, SOURCE_SCENE as SCENE} from './fixture'
const owners: PageRuntime[] = []
afterEach(() => owners.splice(0).forEach(owner => owner.dispose()))
async function sourceFixture() { const fixture = await createSourceFixture(); owners.push(fixture.runtime); return fixture }
async function choose(dataSet: DataSet, table: string, id: string) {
  const view = dataSet.getView(table)!, row = view.rows.find(row => view.getPkKey(row) === id)
  expect(row).toBeDefined(); view.setCurrentRow(row!); view.setSelectedRows([row!])
}
describe('reference table source native scene', () => {
  it('registers the original source scene without adding a navigation identity', () => {
    expect(getBuiltinScenarioResource('businessTableSelector')).toMatchObject({scenarioId: SCENE, path: 'config/pages/shared/business-table-selector/pagedata.json'})
  })
  it('loads only app candidates initially and follows application then actual database conid into tables', async () => {
    const f = await sourceFixture(), apps = f.dataSet.getView('Base_AppSystemList')!, databases = f.dataSet.getView('Base_AppAndSource_Relation')!, tables = f.dataSet.getView('_Base_TblList')!
    await vi.waitFor(() => expect(apps.requestState).toBe(RequestState.Loaded))
    expect(f.http.reads.some(read => read.table === '_Base_TblList' || read.table === 'Base_TblField')).toBe(false)
    await choose(f.dataSet, 'Base_AppSystemList', 'A1')
    await vi.waitFor(() => expect(databases.rows.map(row => row['rowid'])).toEqual(['R1']))
    await choose(f.dataSet, 'Base_AppAndSource_Relation', 'R1')
    await vi.waitFor(() => expect(tables.rows.map(row => row['rowid'])).toEqual(['T1', 'T3']))
    expect(tables.rows[0]?.['dbid']).toBeUndefined()
    expect(f.http.saves).toEqual([])
  })
  it('keeps output and filter selections separate and clears old field choices when the table changes', async () => {
    const f = await sourceFixture(), apps = f.dataSet.getView('Base_AppSystemList')!, databases = f.dataSet.getView('Base_AppAndSource_Relation')!, tables = f.dataSet.getView('_Base_TblList')!
    await vi.waitFor(() => expect(apps.requestState).toBe(RequestState.Loaded)); await choose(f.dataSet, 'Base_AppSystemList', 'A1')
    await vi.waitFor(() => expect(databases.rows).toHaveLength(1)); await choose(f.dataSet, 'Base_AppAndSource_Relation', 'R1')
    await vi.waitFor(() => expect(tables.rows).toHaveLength(2)); await choose(f.dataSet, '_Base_TblList', 'T1')
    const output = f.dataSet.getView('Base_TblField', 'textFields')!, value = f.dataSet.getView('Base_TblField', 'valueFields')!
    await vi.waitFor(() => {expect(output.rows).toHaveLength(2); expect(value.rows).toHaveLength(2)})
    output.setSelectedRows([output.rows[0]!]); value.setSelectedRows([value.rows[1]!])
    expect(output.getSelectedValues()).toEqual(['F1']); expect(value.getSelectedValues()).toEqual(['F2'])
    await choose(f.dataSet, '_Base_TblList', 'T3')
    await vi.waitFor(() => {expect(output.rows.map(row => row['rowid'])).toEqual(['F3']); expect(value.rows.map(row => row['rowid'])).toEqual(['F3'])})
    expect(output.getSelectedValues()).toEqual([]); expect(value.getSelectedValues()).toEqual([])
    expect(f.http.saves).toEqual([])
  })
})
