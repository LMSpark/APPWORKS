import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet, type DataColumn} from '@spark-appworks/spark-data'
import {attachTableSyncMetaDataView} from '@/lowcode/resources/database/dataset-extensions'
import {DatabaseTableViewHttp} from './catalog/table-view.fixture'

const sets: DataSet[] = []
const columns: DataColumn[] = [
  {name: 'rowid', type: 'string', isPrimaryKey: true},
  {name: 'dbid', type: 'string'}, {name: 'tableid', type: 'string'},
]
function setup(existing = false) {
  const dataSet = DataSet.fromJson({dataSetName: 'sync-attachment', scenarioId: 'SYNC-ATTACH', tables: {}})
  sets.push(dataSet)
  if (existing) {
    const table = dataSet.addTable('sync', structuredClone(columns))
    table.resourceType = 'file'
    table.resourceId = 'database-table-sync-metadata'
  }
  const http = new DatabaseTableViewHttp()
  const input = {dataSet, http, sync: 'sync', assertScope: vi.fn()}
  return {dataSet, http, input, attach: () => attachTableSyncMetaDataView(input)}
}
afterEach(() => sets.splice(0).forEach(ds => ds.destroy()))

describe('actual metadata sync attachment', () => {
  it('rejects a formal model masquerading as the same command resource', () => {
    const dataSet = DataSet.fromJson({dataSetName: 'formal-model', scenarioId: 'SYNC-ATTACH', tables: {sync: {
      tableName: 'sync', columns: structuredClone(columns), resourceType: 'file', resourceId: 'database-table-sync-metadata',
      modelBinding: {modelId: 'M1', modelName: '正式模型'},
      views: {default: {tableName: 'sync', viewId: 'default', rows: [], page: 1, pageSize: 20}},
    }}})
    sets.push(dataSet)
    const http = new DatabaseTableViewHttp()
    expect(() => attachTableSyncMetaDataView({dataSet, http, sync: 'sync', assertScope: vi.fn()}))
      .toThrow('DATA_SET_COMMAND_RESOURCE_CONFLICT')
    expect(http.requests).toHaveLength(0)
  })

  it('rejects a missing default without silently recreating it', () => {
    const {dataSet, http, attach} = setup(true)
    dataSet.getTable('sync')!.destroyView('default')
    expect(attach).toThrow('命令视图缺失')
    expect(dataSet.getView('sync')).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })

  it.each(['resource', 'type', 'primary'] as const)('rejects an existing %s collision without dispatch or mode mutation', kind => {
    const {dataSet, http, attach} = setup(true)
    const table = dataSet.getTable('sync')!, view = dataSet.getView('sync')!
    if (kind === 'resource') table.resourceId = 'another-command'
    if (kind === 'type') table.columns.find(column => column.name === 'dbid')!.type = 'number'
    if (kind === 'primary') table.columns.find(column => column.name === 'dbid')!.isPrimaryKey = true
    const mode = view.commitMode
    expect(attach).toThrow(/DATA_SET_COMMAND_(RESOURCE|COLUMNS)_CONFLICT/)
    expect(view.commitMode).toBe(mode)
    expect(http.requests).toHaveLength(0)
  })

  it('rejects a foreign owner even when the declared resource matches', () => {
    const {dataSet, http, attach} = setup(true)
    const view = dataSet.getView('sync')!, mode = view.commitMode
    view.bindQueryExecutor({executeQuery: () => Promise.reject(new Error('foreign owner'))},
      {resource: {resourceType: 'file', resourceId: 'database-table-sync-metadata'}})
    expect(attach).toThrow('DATA_VIEW_QUERY_IDENTITY')
    expect(view.commitMode).toBe(mode)
    expect(http.requests).toHaveLength(0)
  })

  it.each([false, true])('rejects an effective view primary-key override (already bound=%s)', bound => {
    const {dataSet, http, attach} = setup(true)
    if (bound) attach()
    const view = dataSet.getView('sync')!, mode = view.commitMode
    view.primaryKey = 'dbid'
    expect(attach).toThrow('DATABASE_SYNC_PRIMARY_KEY_CONFLICT')
    expect(view.primaryKey).toBe('dbid')
    expect(view.commitMode).toBe(mode)
    expect(http.requests).toHaveLength(0)
  })

  it('actually binds an existing matching unbound view and accepts its real command receipt', async () => {
    const {dataSet, http, attach} = setup(true)
    attach(); attach()
    const view = dataSet.getView('sync')!
    await view.refresh()
    const row = await view.addRow({dbid: 'DB1', tableid: 'T1'})
    const result = await dataSet.saveChanges({views: [{tableName: 'sync', viewId: 'default', ids: [view.getPkKey(row)!]}]})
    expect(result.success).toBe(true)
    expect(http.requests.map(request => request.url)).toEqual(['/api/Table/SyncMetaData/DB1/T1'])
  })

  it('preserves the original unknown capture across repeated attachment', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    const view = dataSet.getView('sync')!
    await view.refresh()
    const row = await view.addRow({dbid: 'DB1', tableid: 'T1'}), id = view.getPkKey(row)!
    http.syncMetadataMode = 'timeout-before'
    await expect(dataSet.saveChanges({views: [{tableName: 'sync', viewId: 'default', ids: [id]}]})).rejects.toThrow()
    view.updateEditingValue(id, 'tableid', 'T3')
    attach()
    expect(await dataSet.resolveUnconfirmedSaves()).toMatchObject({state: 'unknown'})
    expect(view.getEditingRow(id)?.['tableid']).toBe('T3')
    expect(view.hasUnconfirmedSaveFor([id])).toBe(true)
    expect(http.requests.map(request => request.url)).toEqual(['/api/Table/SyncMetaData/DB1/T1'])
  })

  it('does not replay an unknown sync through an implicitly cloned query view', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    const view = dataSet.getView('sync')!
    await view.refresh()
    const row = await view.addRow({dbid: 'DB1', tableid: 'T1'}), id = view.getPkKey(row)!
    http.syncMetadataMode = 'timeout-before'
    await expect(dataSet.saveChanges({views: [{tableName: 'sync', viewId: 'default', ids: [id]}]})).rejects.toThrow()
    expect(() => view.createQueryView('peer')).toThrow('DATA_VIEW_DERIVED_QUERY_UNSUPPORTED')
    expect(dataSet.getView('sync', 'peer')).toBeUndefined()
    expect(await dataSet.resolveUnconfirmedSaves()).toMatchObject({state: 'unknown'})
    expect(view.hasUnconfirmedSaveFor([id])).toBe(true)
    expect(http.requests.map(request => request.url)).toEqual(['/api/Table/SyncMetaData/DB1/T1'])
  })

  it('does not let an option query consume a confirmed sync receipt', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    const view = dataSet.getView('sync')!
    await view.refresh()
    const input = await view.addRow({dbid: 'DB1', tableid: 'T1'})
    await dataSet.saveChanges({views: [{tableName: 'sync', viewId: 'default', ids: [view.getPkKey(input)!]}]})
    const row = view.rows[0]!
    await expect(view.queryOptionRows({fields: ['rowid']})).rejects.toThrow('DATA_VIEW_DERIVED_QUERY_UNSUPPORTED')
    expect(view.rows[0]).toBe(row)
    expect(view.fieldAccess(row, 'rowid').read).toBe('visible')
    expect(http.requests).toHaveLength(1)
  })

  it('revalidates current declarations after binding and preserves the original guard', async () => {
    const {dataSet, http, input, attach} = setup()
    attach()
    const table = dataSet.getTable('sync')!, view = dataSet.getView('sync')!
    table.resourceId = 'another-command'
    expect(attach).toThrow('DATA_SET_COMMAND_RESOURCE_CONFLICT')
    table.resourceId = 'database-table-sync-metadata'
    const replacementHttp = new DatabaseTableViewHttp(), replacementGuard = vi.fn()
    attachTableSyncMetaDataView({...input, http: replacementHttp, assertScope: replacementGuard})
    input.assertScope.mockImplementation(() => {throw new Error('original scope expired')})
    await view.refresh()
    expect(view.loadingError).toHaveProperty('message', 'original scope expired')
    expect(replacementGuard).not.toHaveBeenCalled()
    expect(http.requests).toHaveLength(0)
    expect(replacementHttp.requests).toHaveLength(0)
  })

  it('binds a recreated default view instead of inheriting a stale table marker', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    const table = dataSet.getTable('sync')!, old = dataSet.getView('sync')!
    table.destroyView('default')
    const view = table.addView('default')
    expect(view).not.toBe(old)
    attach()
    await view.refresh()
    expect(view.loadingError).toBeNull()
    const row = await view.addRow({dbid: 'DB1', tableid: 'T1'})
    expect((await dataSet.saveChanges({views: [{tableName: 'sync', viewId: 'default', ids: [view.getPkKey(row)!]}]})).success).toBe(true)
    expect(http.requests).toHaveLength(1)
  })
})
