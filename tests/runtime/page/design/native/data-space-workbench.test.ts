import {afterEach, describe, expect, it, vi} from 'vitest'
import {dataSpacePageFixture} from './data-space-page.fixture'
import {DataSpaceWorkbench} from '@/views/features/data-platform/data-set-management/design/workbench/data-space-workbench'
import {RequestState} from '@spark-appworks/spark-data'
import {ScenarioDefinitionResource} from '@spark-appworks/spark-project-model'
import definitionConfig from '../../../../../config/pages/data-platform/data-space-design/pagedata.json'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => fixtures.splice(0).forEach(f => f.dispose()))

async function definitionSummary(populated = true) {
  const f = dataSpacePageFixture({overviewOnly: true}); fixtures.push(f)
  f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, tables: {
    OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}},
    CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}},
    ...(populated ? {FileViews: definitionConfig.tables.DataViewDefinition, FileTables: definitionConfig.tables.DataTableBindingDefinition} : {}),
  }, resourceRelations: populated ? ['R1', 'R2'].map(relationId => ({relationId, parentTable: 'OrdersAlias', childTable: 'CustomersAlias',
    filterExpression: {field: 'rowid', operator: 'eq', value: relationId}})) : []}))
  const session = await f.open('A', {deferDefinition: true}), data = session.metadataDataSet
  const files = data.getView('DataTableBindingDefinition', 'fileModels')!, graph = data.getView('DataResourceRelationDefinition', 'graph')!
  await files.refresh()
  const summary = new DataSpaceWorkbench(data, 'A')
  summary.refresh()
  expect(summary.view.currentRow).toMatchObject({modelCount: populated ? '4' : '2', relationCount: populated ? '2' : '0'})
  return {f, session, files, graph, summary}
}

describe('reference designer workbench overview', () => {
  it.each(['files', 'graph'] as const)('keeps %s totals unknown while the original query is loading and accepts its completed result', async kind => {
    const {f, files, graph, summary} = await definitionSummary(), source = kind === 'files' ? files : graph
    let release!: () => void, started!: () => void
    const gate = new Promise<void>(resolve => {release = resolve}), ready = new Promise<void>(resolve => {started = resolve})
    const original = ScenarioDefinitionResource.prototype.executeQuery
    const read = vi.spyOn(ScenarioDefinitionResource.prototype, 'executeQuery').mockImplementation(async function(this: ScenarioDefinitionResource, view, params) {
      if (view === source) {started(); await gate}
      return original.call(this, view, params)
    })
    const pending = source.refresh()
    try {
      await ready
      expect(source.requestState).toBe(RequestState.Loading)
      const requests = f.requests.length, queries = read.mock.calls.length
      summary.refresh()
      expect(summary.view.currentRow?.[kind === 'files' ? 'modelCount' : 'relationCount']).toBe('—')
      expect(f.requests).toHaveLength(requests); expect(read).toHaveBeenCalledTimes(queries)
      release(); await pending; summary.refresh()
      expect(summary.view.currentRow).toMatchObject({modelCount: '4', relationCount: '2'})
      expect(f.fileWrites).toHaveLength(0)
    } finally {release(); await pending; read.mockRestore()}
  })

  it.each(['files', 'graph'] as const)('uses the original %s query total when only one result page is loaded', async kind => {
    const {f, files, graph, summary} = await definitionSummary(), source = kind === 'files' ? files : graph
    expect((await source.loadFromServer({page: 1, pageSize: 1, allPages: false})).success).toBe(true)
    expect(source.rows).toHaveLength(1); expect(source.total).toBe(2)
    const requests = f.requests.length
    summary.refresh()
    expect(summary.view.currentRow).toMatchObject({modelCount: '4', relationCount: '2'})
    expect(f.requests).toHaveLength(requests); expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['unloaded', 'failed', 'foreign', 'destroyed'] as const)('does not publish a zero or stale count from %s definition views', async state => {
    const {f, files, graph, summary} = await definitionSummary()
    for (const source of [files, graph]) {
      if (state === 'unloaded') source.clearAll()
      else if (state === 'destroyed') source.destroy()
      else {
        source.queryContext = {...source.queryContext, dataSpaceId: 'B'}
        if (state === 'failed') {
          await source.refresh()
          expect(source.requestState).toBe(RequestState.Failed)
          source.queryContext = {...source.queryContext, dataSpaceId: 'A'}
        }
      }
    }
    const requests = f.requests.length
    summary.refresh()
    expect(summary.view.currentRow).toMatchObject({modelCount: '—', relationCount: '—'})
    expect(f.requests).toHaveLength(requests); expect(f.fileWrites).toHaveLength(0)
  })

  it('publishes confirmed empty definition queries as zero without loading model fields', async () => {
    const {f, session, summary} = await definitionSummary(false)
    const requests = f.requests.length
    summary.refresh()
    expect(summary.view.currentRow).toMatchObject({modelCount: '2', relationCount: '0'})
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).not.toBe(RequestState.Loaded)
    expect(f.requests).toHaveLength(requests); expect(f.fileWrites).toHaveLength(0)
  })

  it('locates already queried orphan fields in their original views without reloading or borrowing permissions', async () => {
    const f = dataSpacePageFixture({overviewOnly: true, sourceFields: [
      {rowid: 'KNOWN', dataModelId: 'M1', Name: 'normal', type: 'dataModel'},
      {rowid: 'ORPHAN', dataModelId: 'MISSING', Name: 'orphan', type: 'dataModel'},
    ]}); fixtures.push(f)
    const session = await f.open('A', {deferDefinition: true}), data = session.metadataDataSet
    const template = data.getView('Base_DataModel_Field', 'modelInputFields')!, scoped = template.createQueryView('orphan-check')
    scoped.queryContext = {dataSpaceId: 'A', modelIds: ['M1', 'MISSING']}
    await scoped.loadFromServer({allPages: true})
    const workbench = new DataSpaceWorkbench(data, 'A'), count = f.requests.length
    const entries = workbench.unplacedNamedFields()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.view).toBe(scoped)
    expect(scoped.rows[entries[0]!.recordIndex]?.['rowid']).toBe('ORPHAN')
    expect(data.getView('Base_DataModel_Field')!.rows).toHaveLength(0)
    expect(f.requests).toHaveLength(count)
    scoped.queryContext = {dataSpaceId: 'B', modelIds: ['M1', 'MISSING']}
    expect(workbench.unplacedNamedFields()).toEqual([])
    scoped.queryContext = {dataSpaceId: 'A', modelIds: ['M1', 'MISSING']}
    scoped.clearAll()
    expect(workbench.unplacedNamedFields()).toEqual([])
  })

  it('binds a read-only summary to the metadata DataSet, updates after readback and keeps every main model', async () => {
    const f = dataSpacePageFixture(); fixtures.push(f)
    f.setModelValues({IsBusinessMain: 1}); f.setModelValues({IsBusinessMain: 1}, 'A', 'M2')
    const session = await f.open('A'), summary = new DataSpaceWorkbench(session.metadataDataSet, 'A')
    await session.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')!.refresh()
    summary.refresh()
    const replace = vi.spyOn(summary.view, 'replaceRows')
    summary.refresh(); expect(replace).not.toHaveBeenCalled()
    expect(summary.view.currentRow).toMatchObject({modelCount: '2', mainModels: 'Orders、Customers', mainCount: '2'})
    expect(summary.view.dataTable?.resourceType).toBe('static-data')
    f.setModelValues({IsBusinessMain: 0}, 'A', 'M2')
    await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
    summary.refresh()
    expect(summary.view.currentRow).toMatchObject({mainModels: 'Orders', mainCount: '1'})
    expect(f.requests.filter(r => r.url?.includes('BatchTableOperate'))).toHaveLength(0)
  })
  it('does not reveal hidden business flags or names through summary text and rejects a changed target', async () => {
    const f = dataSpacePageFixture({hiddenModelProperties: ['IsBusinessMain', 'Type']}); fixtures.push(f)
    f.setModelValues({IsBusinessMain: 1})
    const session = await f.open('A'), summary = new DataSpaceWorkbench(session.metadataDataSet, 'A')
    await session.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')!.refresh()
    summary.refresh()
    expect(summary.view.currentRow).toMatchObject({mainModels: '主业务标记未完整公开', mainCount: '—', sourceSummary: '未公开来源 2'})
    session.metadataDataSet.getView('Base_DataModel', 'default')!.queryContext = {dataSpaceId: 'B'}
    expect(() => summary.refresh()).toThrow(/目标/)
    expect(summary.view.rows).toHaveLength(0)
    const replace = vi.spyOn(summary.view, 'replaceRows')
    expect(() => summary.refresh()).toThrow(/目标/)
    expect(replace).not.toHaveBeenCalled()
  })
})
