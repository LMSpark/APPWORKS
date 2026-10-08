import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSpaceQueryContext } from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import { DataSpaceQueryTable } from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'

const { runtimeQuery, readRequestScope } = vi.hoisted(() => ({
  runtimeQuery: vi.fn(),
  readRequestScope: vi.fn(() => ({token: 'scope-a', headers: {'X-AppId': 'app-a'}})),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi: {
  readRequestScope, dataSpace: {runtime: {query: runtimeQuery}},
}}))

import { LowcodeDataSpaceModelSourceReader } from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'

type QueryIdentity = Readonly<{metaName: string}>

function context(metaName: string, rows: Record<string, unknown>[], total = rows.length): DataSpaceQueryContext {
  const table = new DataSpaceQueryTable({scenarioId: '8D1AB14DD8277F3E7017CD38F77B09FD', metaName})
  const result = {Result: {data: {Count: total, Items: rows, hasNextPage: false, Action: []},
    primaryKeyField: 'rowid', allowAdd: false}}
  return new DataSpaceQueryContext({identity: table.identity, snapshot: table.applyResult(result),
    scope: 'scope-a', readScope: () => 'scope-a'})
}

const sourceRows = {
  table: {metaName: 'View_TblList', row: {rowid: 'T1', tblname: 'Orders', tbldesc: '订单', dbid: 'DB1', DbName: 'main'}},
  dict: {metaName: '_Base_DictType', row: {rowid: 'D1', TypeName: 'Priority', functiondesc: '优先级'}},
  interface: {metaName: 'Base_DataServiceInterface', row: {rowid: 'I1', Name: 'Search', Desc: '搜索', ProviderID: 'P1'}},
  json: {metaName: 'Base_JsonData', row: {rowid: 'J1', name: 'Tree'}},
  logicView: {metaName: 'Base_DataViewList', row: {rowid: 'L1', name: 'Summary'}},
  databaseView: {metaName: 'View_ViewList', row: {rowid: 'V1', vewname: 'OrdersView', vewdesc: '订单视图', dbid: 'DB1', DbName: 'main'}},
} as const
const sourceCases = (['table', 'dict', 'interface', 'json', 'logicView', 'databaseView'] as const)
  .map(type => [type, sourceRows[type]] as const)

describe('LowcodeDataSpaceModelSourceReader', () => {
  beforeEach(() => {
    runtimeQuery.mockReset()
    readRequestScope.mockReturnValue({token: 'scope-a', headers: {'X-AppId': 'app-a'}})
  })

  it.each(sourceCases)('queries %s by its formal source and rechecks selection identity', async (type, fixture) => {
    runtimeQuery.mockResolvedValue(context(fixture.metaName, [fixture.row]))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const listed = await reader.query({type, page: 1, pageSize: 10})
    expect(listed.total).toBe(1)
    expect(listed.rows[0]?.id).toBe(fixture.row.rowid)
    expect(runtimeQuery.mock.calls[0]?.[0]).toEqual({scenarioId: '8D1AB14DD8277F3E7017CD38F77B09FD', metaName: fixture.metaName})
    expect(runtimeQuery.mock.calls[0]?.[1].page).toEqual({index: 1, size: 10})
    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(
      identity.metaName === fixture.metaName ? context(fixture.metaName, [fixture.row]) : context(identity.metaName, [])))
    const prepared = await reader.prepare(listed.rows[0]!)
    expect(prepared.model.MetaName).toBe(listed.rows[0]?.name)
    expect(runtimeQuery.mock.calls[1]?.[1].filter.toJSON()).toEqual({field: 'rowid', operator: 'eq', value: fixture.row.rowid})
  })

  it('preserves table field type and key marker from fully readable source rows', async () => {
    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(identity.metaName === 'Base_TblField'
      ? context('Base_TblField', [{rowid: 'F1', tblid: 'T1', enname: 'order_id', cnname: '订单 ID', DataType: 'varchar', IsPKey: true}])
      : context('View_TblList', [sourceRows.table.row])))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const source = (await reader.query({type: 'table'})).rows[0]!
    const result = await reader.prepare(source)
    expect(result.model).toMatchObject({Type: '数据库表', DbId: 'DB1', DbName: 'main'})
    expect(result.fields).toEqual([expect.objectContaining({Name: 'order_id', FieldType: 'varchar', IsPKey: 1, IsOutput: 1})])
  })

  it('allows zero output fields and maps parid/pid parameters with the explicit varchar default', async () => {
    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(identity.metaName === '_Base_ParamList'
      ? context('_Base_ParamList', [{parid: 'PAR1', pid: 'I1', parname: 'keyword', pardesc: '关键词'}])
      : identity.metaName === 'Base_TblField' ? context('Base_TblField', [])
        : context('Base_DataServiceInterface', [sourceRows.interface.row])))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const source = (await reader.query({type: 'interface'})).rows[0]!
    const result = await reader.prepare(source)
    expect(result.fields).toEqual([expect.objectContaining({type: 'inputParams', Name: 'keyword', FieldType: 'varchar', IsOutput: 0})])
    expect(result.model.DbId).toBe('P1')
  })

  it('rejects masked identity, source changes, incomplete field pages, and a changed execution scope', async () => {
    const reader = new LowcodeDataSpaceModelSourceReader()
    runtimeQuery.mockResolvedValue(context('View_TblList', [{...sourceRows.table.row,
      lingma_sys_params: {m: ['rowid']}}]))
    await expect(reader.query({type: 'table'})).rejects.toThrow(/rowid.*不可读/)

    runtimeQuery.mockResolvedValue(context('View_TblList', [sourceRows.table.row]))
    const source = (await reader.query({type: 'table'})).rows[0]!
    runtimeQuery.mockResolvedValue(context('View_TblList', [{...sourceRows.table.row, tbldesc: '已变化'}]))
    await expect(reader.prepare(source)).rejects.toThrow(/已变化/)

    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(identity.metaName === 'Base_TblField'
      ? context('Base_TblField', [], 2) : context('View_TblList', [sourceRows.table.row])))
    await expect(reader.prepare(source)).rejects.toThrow(/完整/)

    readRequestScope.mockReturnValue({token: 'scope-b', headers: {'X-AppId': 'app-a'}})
    await expect(reader.query({type: 'table'})).rejects.toThrow(/读取身份已失效/)
  })

  it('does not turn a masked ProviderID or returned masked parzdtype into a fallback', async () => {
    runtimeQuery.mockResolvedValue(context('Base_DataServiceInterface', [{...sourceRows.interface.row,
      lingma_sys_params: {m: ['ProviderID']}}]))
    const reader = new LowcodeDataSpaceModelSourceReader()
    await expect(reader.query({type: 'interface'})).rejects.toThrow(/ProviderID.*不可读/)

    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(identity.metaName === '_Base_ParamList'
      ? context('_Base_ParamList', [{parid: 'PAR1', pid: 'I1', parname: 'keyword', parzdtype: 'secret',
        lingma_sys_params: {m: ['parzdtype']}}])
      : identity.metaName === 'Base_TblField' ? context('Base_TblField', [])
        : context('Base_DataServiceInterface', [sourceRows.interface.row])))
    const source = (await reader.query({type: 'interface'})).rows[0]!
    await expect(reader.prepare(source)).rejects.toThrow(/parzdtype.*不可读/)
  })
})
