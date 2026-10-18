import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSet, DataViewFilter, resolveDataViewMember, type DataView, type QueryParams } from '@spark-appworks/spark-data'
import { DataSpaceQueryContext } from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import { DataSpaceQueryTable } from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceRuntimeApi} from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api'
import {DictionaryHttp} from '../../../../../packages/spark-lowcode-api/src/platform/resources/dictionary/tests/dictionary-workspace.fixture'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'

const { runtimeQuery, readRequestScope, loadDictionaryDefinition } = vi.hoisted(() => ({
  runtimeQuery: vi.fn(),
  loadDictionaryDefinition: vi.fn(),
  readRequestScope: vi.fn(() => ({token: 'scope-a', headers: {'X-AppId': 'app-a'}})),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi: {
  readRequestScope,
}}))
vi.mock('@/lowcode/resources/dictionary/lowcode-dictionary', () => ({LowcodeDictionary: {loadDefinition: loadDictionaryDefinition}}))

import { LowcodeDataSpaceModelSourceReader } from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'
import {DataSpaceSourceControls} from '@/views/features/data-platform/data-set-management/design/model/source/data-space-source-controls'

type QueryIdentity = Readonly<{metaName: string}>
type QueryOptions = Readonly<{filter?: Readonly<{toJSON(): Readonly<{value?: unknown}>}>}>

function context(metaName: string, rows: Record<string, unknown>[], total = rows.length, keyless = false,
  scenarioId = '8D1AB14DD8277F3E7017CD38F77B09FD'): DataSpaceQueryContext {
  const table = new DataSpaceQueryTable({scenarioId, metaName})
  const result = {Result: {data: {Count: total, Items: rows, hasNextPage: false, Action: []},
    primaryKeyField: keyless ? null : metaName === '_Base_ParamList' ? 'parid' : 'rowid', allowAdd: false}}
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

let metadata: DataSet
const dictionaryDefinition = {rowid: 'D1', TypeName: 'Priority', dictionaryType: '0', val: '优先代码', txt: '优先名称',
  secondValue: '颜色', thirdValue: '分组', fourthvalue: '适用范围', fiveValue: '说明'}
const dictionaryDataSets: DataSet[] = []
async function dictionaryFixture(row: Record<string, unknown> = dictionaryDefinition): Promise<DataSet> {
  const scenarioId = '69B79AB779DF4C12A5595DACDF3283F1'
  const dataSet = DataSet.fromJson({scenarioId, tables: {_Base_DictType: {
    modelBinding: {modelId: `${scenarioId}p000`, modelName: '_Base_DictType'},
    columns: Object.keys(dictionaryDefinition).map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
    views: {default: {}},
  }}})
  dictionaryDataSets.push(dataSet)
  const view = dataSet.getView('_Base_DictType', 'default')!
  view.bindQueryExecutor({executeQuery: async () => context('_Base_DictType', [row], 1, false, scenarioId)})
  await view.loadFromServer()
  return dataSet
}
function metadataFixture(): DataSet {
  const definitions = [...Object.values(sourceRows).map(source => ({name: source.metaName, key: 'rowid', fields: Object.keys(source.row)})),
    {name: 'Base_TblField', key: 'rowid', fields: ['rowid', 'tblid', 'enname', 'cnname', 'description', 'DataType', 'IsPKey']},
    {name: '_Base_ParamList', key: 'parid', fields: ['parid', 'pid', 'parname', 'pardesc', 'parzdtype']}]
  const dataSet = DataSet.fromJson({scenarioId: '8D1AB14DD8277F3E7017CD38F77B09FD', dataSetName: 'metadata', tables: Object.fromEntries(definitions.map(model => [model.name, {
    tableName: model.name, modelBinding: {modelId: `fixture-${model.name}`, modelName: model.name},
    columns: [...new Set(model.fields)].map(name => ({name, type: 'string', isPrimaryKey: name === model.key})),
    views: {default: {}, sourceCandidates: {queryConfig: {fields: model.fields}, pageSize: 10, autoCurrentFirst: false, autoSelectFirst: false},
      sourceDetails: {pageSize: 500, autoCurrentFirst: false, autoSelectFirst: false, queryConfig: {fields: model.fields, allPages: true, maxRows: 50000}}},
  }]))})
  const executor = {executeQuery: async (view: DataView, params: QueryParams): Promise<DataSpaceQueryContext> => {
    const filter = params.filter ? DataViewFilter.parse(params.filter) : undefined
    if (filter && !filter.ok) throw new Error('Invalid fixture filter')
    return runtimeQuery(
    {scenarioId: view.dataSet?.scenarioId, metaName: view.dataTable?.modelBinding?.modelName},
    {page: {index: params.page, size: params.pageSize}, fields: params.fields,
      ...(filter?.ok ? {filter: filter.value} : {}), allPages: params.allPages, maxRows: params.maxRows})}}
  for (const table of Object.values(dataSet.tables)) table.forEachView(view => {view.bindQueryExecutor(executor)})
  return dataSet
}

describe('LowcodeDataSpaceModelSourceReader', () => {
  beforeEach(() => {
    runtimeQuery.mockReset()
    loadDictionaryDefinition.mockReset().mockImplementation(() => dictionaryFixture())
    readRequestScope.mockReturnValue({token: 'scope-a', headers: {'X-AppId': 'app-a'}})
    metadata = metadataFixture()
  })
  afterEach(() => {metadata.destroy(); for (const dataSet of dictionaryDataSets.splice(0)) dataSet.destroy()})

  it('uses a keyless formal query pointer without inventing a write identity', async () => {
    metadata.getView('View_TblList', 'sourceCandidates')!.primaryKey = ''
    runtimeQuery.mockResolvedValue(context('View_TblList', [sourceRows.table.row], 1, true))
    const controls = new DataSpaceSourceControls(metadata, vi.fn())
    try {
      controls.setOpen(true)
      await vi.waitFor(() => expect(controls.results.total).toBe(1))
      controls.results.setCurrentRow(controls.results.rows[0]!)
      expect(controls.results.value).toBe('T1')
      expect(resolveDataViewMember({dataViewKey: controls.key(controls.results), dataMember: 'value'}, metadata)).toEqual(['T1'])
      expect(controls.selected()).toMatchObject({id: 'T1', name: 'Orders'})
      expect(controls.results.primaryKey).toBe('')
      expect(controls.results.fieldAccess(controls.results.rows[0]!, 'tblname').write).toBe('denied')
      controls.setOpen(false)
      expect(controls.results.currentRow).toBeNull()
      expect(() => controls.selected()).toThrow('已失效')
    } finally {controls.dispose()}
  })

  it('confirms the list value rather than its pointer and exposes that value to downstream cascades', async () => {
    metadata.getView('View_TblList', 'sourceCandidates')!.primaryKey = ''
    runtimeQuery.mockResolvedValue(context('View_TblList', [sourceRows.table.row, {...sourceRows.table.row, rowid: 'T2', tblname: 'Second'}], 2, true))
    const controls = new DataSpaceSourceControls(metadata, vi.fn())
    const child = metadata.getView('Base_TblField', 'default')!
    const cascade = {cascadeId: 'selected-source', parentTable: controls.results.tableName, parentViewId: controls.results.viewId,
      childTable: child.tableName, childViewId: child.viewId, filterBindings: [{targetField: 'tblid'}], autoLoad: false}
    metadata.addCascade(cascade)
    try {
      controls.setOpen(true)
      await vi.waitFor(() => expect(controls.results.total).toBe(2))
      const view = controls.results
      view.setCurrentRow(view.rows[0]!)
      view.value = 'T2'
      expect(view.currentRow).toBe(view.rows[0])
      expect(controls.selected()).toMatchObject({id: 'T2', name: 'Second'})
      expect(metadata.resolveCascadeFilter(cascade)).toEqual({field: 'tblid', operator: 'in', value: ['T2']})
      view.clearSelectedRows()
      expect(controls.canSelect).toBe(false)
      expect(() => controls.selected()).toThrow('选择')
      view.setSelectedRows(view.rows)
      expect(view.getSelectedValues()).toEqual(['T1', 'T2'])
      expect(controls.canSelect).toBe(false)
      expect(() => controls.selected()).toThrow('选择')
      controls.setOpen(false)
      expect(view.getSelectedValues()).toEqual([])
    } finally {metadata.removeCascade({cascadeId: 'selected-source'}); controls.dispose()}
  })

  it('keeps keyless typed selection, serialization and auto-current/auto-selection independent', async () => {
    metadata.getView('View_TblList', 'sourceCandidates')!.primaryKey = ''
    runtimeQuery.mockResolvedValue(context('View_TblList', [{...sourceRows.table.row, rowid: 0}, {...sourceRows.table.row, rowid: 'A,B'}], 2, true))
    const controls = new DataSpaceSourceControls(metadata, vi.fn())
    try {
      controls.setOpen(true)
      await vi.waitFor(() => expect(controls.results.total).toBe(2))
      const view = controls.results
      view.selectionDelimiter = '|'
      view.setSelectedRows(view.rows)
      expect(view.getSelectedValues()).toEqual([0, 'A,B'])
      expect(view.value).toBe('0|A,B')
      view.clearSelectedRows()
      view.value = 'A,B|0'
      expect(view.getSelectedValues()).toEqual(['A,B', 0])
      const old = view.rows[0]!
      view.configure({...view.toJson(), autoCurrentFirst: true, autoSelectFirst: false, selectionDelimiter: ''})
      await view.refresh()
      expect(view.currentRow).toBe(view.rows[0])
      expect(view.getSelectedValues()).toEqual([])
      view.setSelectedRows([old])
      expect(view.getSelectedValues()).toEqual([])
      view.configure({...view.toJson(), autoCurrentFirst: false, autoSelectFirst: true})
      await view.refresh()
      expect(view.currentRow).toBeNull()
      expect(view.getSelectedValues()).toEqual([0])
      expect(view.value).toBe('0')
      view.selection.addSelectedRows([view.rows[1]!])
      expect(view.getSelectedValues()).toEqual([0, 'A,B'])
      view.selection.removeSelectedRows([view.rows[0]!])
      expect(view.getSelectedValues()).toEqual(['A,B'])
      view.rows = []
      expect(view.cleanupInvalidSelections()).toBe(true)
      expect(view.getSelectedValues()).toEqual([])
    } finally {controls.dispose()}
  })

  it('releases a candidate view when cascade registration fails before subscribing', () => {
    const names = Object.keys(metadata.tables)
    const cascade = vi.spyOn(metadata, 'addCascade').mockImplementationOnce(() => {throw new Error('cascade rejected')})
    try {
      expect(() => new DataSpaceSourceControls(metadata, vi.fn())).toThrow('cascade rejected')
      expect(Object.keys(metadata.tables)).toEqual(names)
      expect(Object.keys(metadata.getTable('View_TblList')!.views)).toEqual(['default', 'sourceCandidates', 'sourceDetails'])
    } finally {cascade.mockRestore()}
  })

  it('binds source candidates directly and cascades every parent through the same query, page and selection state', async () => {
    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(context(identity.metaName,
      identity.metaName === 'View_TblList' ? [sourceRows.table.row] : [sourceRows.dict.row], 25)))
    const controls = new DataSpaceSourceControls(metadata, vi.fn())
    try {
      expect(runtimeQuery).not.toHaveBeenCalled()
      const table = controls.results
      expect(table.dataTable).toBe(metadata.getTable('View_TblList'))
      expect(table).not.toBe(metadata.getView('View_TblList', 'sourceCandidates'))
      controls.setOpen(true)
      await vi.waitFor(() => expect(table.total).toBe(25))
      table.setCurrentRowById('T1')
      expect(controls.selected()).toMatchObject({type: 'table', id: 'T1', name: 'Orders'})
      await table.setPage(2)
      expect(runtimeQuery.mock.calls.at(-1)?.[1].page.index).toBe(2)
      controls.search.updateEditingValue('search', 'keyword', 'Orders')
      controls.search.updateEditingValue('search', 'description', '订单')
      controls.search.updateEditingValue('search', 'databaseName', 'main')
      await vi.waitFor(() => expect(runtimeQuery.mock.calls.at(-1)?.[1].filter?.toJSON()).toEqual({logic: 'and', filters: [
        {field: 'tblname', operator: 'contains', value: 'Orders'}, {field: 'tbldesc', operator: 'contains', value: '订单'},
        {field: 'DbName', operator: 'contains', value: 'main'}]}))
      expect(table.page).toBe(1); expect(controls.canSelect).toBe(false)
      controls.search.updateEditingValue('search', 'type', 'dict')
      await vi.waitFor(() => expect(controls.results.total).toBe(25))
      expect(table.rows).toEqual([])
      expect(runtimeQuery.mock.calls.at(-1)?.[1].filter).toBeUndefined()
      expect(['keyword', 'description', 'databaseName'].map(field => controls.read(field))).toEqual(['', '', ''])
      expect(controls.canSelect).toBe(false)
      controls.search.updateEditingValue('search', 'keyword', 'Priority')
      controls.search.updateEditingValue('search', 'description', '优先级')
      await vi.waitFor(() => expect(runtimeQuery.mock.calls.at(-1)?.[1].filter?.toJSON()).toEqual({logic: 'and', filters: [
        {field: 'TypeName', operator: 'contains', value: 'Priority'}, {field: 'functiondesc', operator: 'contains', value: '优先级'}]}))
      controls.setOpen(false)
      expect(controls.results.rows).toEqual([]); expect(controls.canSelect).toBe(false)
      expect(() => controls.selected()).toThrow('已失效')
    } finally {controls.dispose()}
    expect(metadata.getTable('View_TblList')!.getView('sourceCandidates')?.destroyed).toBe(false)
    expect(metadata.viewCascades).toEqual([])
  })

  it('isolates two model pickers and refuses a late result after closing or disposal', async () => {
    let release!: (result: DataSpaceQueryContext) => void
    runtimeQuery.mockImplementationOnce(() => new Promise<DataSpaceQueryContext>(resolve => {release = resolve}))
      .mockResolvedValue(context('View_TblList', [sourceRows.table.row]))
    const a = new DataSpaceSourceControls(metadata, vi.fn()), b = new DataSpaceSourceControls(metadata, vi.fn())
    const old = a.results
    try {
      a.setOpen(true)
      await vi.waitFor(() => expect(runtimeQuery).toHaveBeenCalledTimes(1))
      b.setOpen(true)
      await vi.waitFor(() => expect(b.results.total).toBe(1))
      a.setOpen(false); a.dispose()
      release(context('View_TblList', [sourceRows.table.row]))
      await Promise.resolve(); await Promise.resolve()
      expect(old.destroyed).toBe(true); expect(old.rows).toEqual([])
      expect(b.results.rows).toMatchObject([{rowid: 'T1'}])
      expect(b.results.fieldAccess(b.results.rows[0]!, 'tblname').read).toBe('visible')
    } finally {b.dispose()}
  })

  it('uses the supplied metadata view and persists query configuration for subsequent native refresh', async () => {
    runtimeQuery.mockResolvedValue(context('View_TblList', [sourceRows.table.row], 25))
    const reader = new LowcodeDataSpaceModelSourceReader()
    await reader.query({type: 'table', keyword: 'Orders', page: 2, pageSize: 10}, metadata)
    const view = metadata.getView('View_TblList', 'sourceCandidates')!
    expect(view.rows[0]?.['rowid']).toBe('T1')
    expect(view.total).toBe(25)
    expect(runtimeQuery.mock.calls.at(-1)?.[1].fields).toEqual(Object.keys(sourceRows.table.row))
    expect(view.page).toBe(2)
    expect(view.filterExpression).toEqual({field: 'tblname', operator: 'contains', value: 'Orders'})
    await view.refresh()
    expect(runtimeQuery.mock.calls.at(-1)?.[1].page).toEqual({index: 2, size: 10})
    expect(runtimeQuery.mock.calls.at(-1)?.[1].filter.toJSON()).toEqual(view.filterExpression)
  })

  it('rejects the wrong metadata space and released views before sending a request', async () => {
    const reader = new LowcodeDataSpaceModelSourceReader()
    const wrong = DataSet.fromJson({scenarioId: 'OTHER', dataSetName: 'wrong', tables: {}})
    try {await expect(reader.query({type: 'table'}, wrong)).rejects.toThrow(/元数据空间/)} finally {wrong.destroy()}
    metadata.destroy()
    await expect(reader.query({type: 'table'}, metadata)).rejects.toThrow(/元数据空间/)
    expect(runtimeQuery).not.toHaveBeenCalled()
  })

  it('lets the DataView reject late results after a newer search or disposal', async () => {
    let release!: (value: DataSpaceQueryContext) => void
    runtimeQuery.mockImplementationOnce(() => new Promise<DataSpaceQueryContext>(resolve => {release = resolve}))
      .mockResolvedValue(context('View_TblList', [{...sourceRows.table.row, rowid: 'T2', tblname: 'New'}]))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const old = reader.query({type: 'table', keyword: 'Old'}, metadata)
    const newer = await reader.query({type: 'table', keyword: 'New'}, metadata)
    release(context('View_TblList', [sourceRows.table.row]))
    await expect(old).rejects.toThrow(/已失效/)
    expect(newer.rows[0]?.id).toBe('T2')
    expect(metadata.getView('View_TblList', 'sourceCandidates')?.rows[0]?.['rowid']).toBe('T2')
    runtimeQuery.mockImplementationOnce(() => new Promise<DataSpaceQueryContext>(resolve => {release = resolve}))
    const disposed = reader.query({type: 'table'}, metadata)
    metadata.destroy()
    release(context('View_TblList', [sourceRows.table.row]))
    await expect(disposed).rejects.toThrow(/元数据空间/)
  })

  it('does not fabricate description filters for models without that output', async () => {
    await expect(new LowcodeDataSpaceModelSourceReader().query({type: 'json', description: 'missing'}, metadata)).rejects.toThrow(/未定义描述字段/)
    expect(runtimeQuery).not.toHaveBeenCalled()
  })

  it.each(sourceCases)('queries %s by its formal source and rechecks selection identity', async (type, fixture) => {
    runtimeQuery.mockResolvedValue(context(fixture.metaName, [fixture.row]))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const listed = await reader.query({type, page: 1, pageSize: 10}, metadata)
    expect(listed.total).toBe(1)
    expect(listed.rows[0]?.id).toBe(fixture.row.rowid)
    expect(runtimeQuery.mock.calls[0]?.[0]).toEqual({scenarioId: '8D1AB14DD8277F3E7017CD38F77B09FD', metaName: fixture.metaName})
    expect(runtimeQuery.mock.calls[0]?.[1].page).toEqual({index: 1, size: 10})
    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(
      identity.metaName === fixture.metaName ? context(fixture.metaName, [fixture.row]) : context(identity.metaName, [])))
    const prepared = await reader.prepare(listed.rows[0]!, metadata)
    expect(prepared.model.MetaName).toBe(listed.rows[0]?.name)
    expect(runtimeQuery.mock.calls[1]?.[1].filter.toJSON()).toEqual({field: 'rowid', operator: 'eq', value: fixture.row.rowid})
  })

  it('plans all six dictionary business fields with titles from the formal definition and releases its space', async () => {
    runtimeQuery.mockResolvedValue(context('_Base_DictType', [sourceRows.dict.row]))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const source = (await reader.query({type: 'dict'}, metadata)).rows[0]!
    const result = await reader.prepare(source, metadata)
    expect(loadDictionaryDefinition).toHaveBeenCalledWith('D1')
    expect(result.fields.map(item => [item.Name, item.description])).toEqual([
      ['rowid', '唯一值（ID）'], ['val', '优先代码'], ['txt', '优先名称'], ['exVal_1', '颜色'],
      ['exVal_2', '分组'], ['exVal_3', '适用范围'], ['exVal_4', '说明'], ['ordIdx', '排序字段'],
    ])
    expect(dictionaryDataSets[0]?.destroyed).toBe(true)
  })

  it('retains extension fields with blank titles instead of shrinking the resource shape', async () => {
    runtimeQuery.mockResolvedValue(context('_Base_DictType', [sourceRows.dict.row]))
    loadDictionaryDefinition.mockImplementation(() => dictionaryFixture({...dictionaryDefinition, fourthvalue: null, fiveValue: ''}))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const source = (await reader.query({type: 'dict'}, metadata)).rows[0]!
    const result = await reader.prepare(source, metadata)
    expect(result.fields.filter(item => item.Name.startsWith('exVal_'))).toHaveLength(4)
    expect(result.fields.find(item => item.Name === 'exVal_4')).toMatchObject({description: '第五文本', IsOutput: 1})
  })

  it.each([
    ['1', 'double'], ['0', 'varchar'], [null, 'varchar'], ['', 'varchar'], [' 1 ', 'varchar'],
  ])('plans dictionary value output from the saved encoding type %j as %s', async (dictionaryType, fieldType) => {
    runtimeQuery.mockResolvedValue(context('_Base_DictType', [sourceRows.dict.row]))
    loadDictionaryDefinition.mockImplementation(() => dictionaryFixture({...dictionaryDefinition, dictionaryType}))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const source = (await reader.query({type: 'dict'}, metadata)).rows[0]!
    const result = await reader.prepare(source, metadata)
    expect(result.fields.find(item => item.Name === 'val')).toMatchObject({FieldType: fieldType, description: '优先代码', IsOutput: 1})
    expect(result.fields.filter(item => item.Name === 'txt' || item.Name.startsWith('exVal_'))
      .map(item => item.FieldType)).toEqual(['varchar', 'varchar', 'varchar', 'varchar', 'varchar'])
    expect(result.fields.find(item => item.Name === 'ordIdx')).toMatchObject({FieldType: 'int', OrderType: 'ascending', Order: 1})
    expect(dictionaryDataSets[0]?.destroyed).toBe(true)
  })

  it.each([
    {encoding: '1', values: [0, -1.5], columnType: 'double', serialized: '0,-1.5'},
    {encoding: '0', values: ['00', '1e2'], columnType: 'varchar', serialized: '00,1e2'},
    {encoding: '1', values: ['legacy-code'], columnType: 'double', serialized: 'legacy-code'},
  ])('assembles planned $columnType outputs and retains formal query and native selection values', async ({encoding, values, columnType, serialized}) => {
    runtimeQuery.mockResolvedValue(context('_Base_DictType', [sourceRows.dict.row]))
    loadDictionaryDefinition.mockImplementation(() => dictionaryFixture({...dictionaryDefinition, dictionaryType: encoding}))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const source = (await reader.query({type: 'dict'}, metadata)).rows[0]!
    const prepared = await reader.prepare(source, metadata)
    const http = new DictionaryHttp()
    http.records = {Priority: values.map((val, index) => ({rowid: `E${index}`, val, txt: `名称${index}`,
      exVal_1: '颜色', exVal_2: '分组', exVal_3: '范围', exVal_4: '说明', ordIdx: index}))}
    const model = {id: 'DICT-MODEL', name: 'Priority', metaName: 'Priority', sourceType: '字典', sourceId: 'D1',
      sourceName: 'Priority', primaryKey: '', businessMain: false, raw: {}, fields: prepared.fields.map(item => ({
        id: item.Name, modelId: 'DICT-MODEL', name: item.Name, canonicalName: item.Name,
        description: item.description, type: item.FieldType, primaryKey: false, output: true, computed: false,
        order: item.Order, orderType: item.OrderType, raw: {},
      }))}
    const config = new ScenarioViewConfig('CONSUMER', JSON.stringify({scenarioId: 'CONSUMER', tables: {Priority: {
      modelBinding: {modelId: 'DICT-MODEL', modelName: 'Priority'}, views: {default: {
        valueField: 'val', labelField: 'txt', selectionDelimiter: ',', autoLoad: false,
        sortExpression: [{field: 'ordIdx', direction: 'asc'}], queryConfig: {allPages: true},
      }},
    }}}))
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope-a', headers: {'X-AppId': 'app-a'}})})
    const {dataSet} = new LowcodeDataSpaceAssembler(runtime, http).assemble({config,
      space: {dataSpaceId: 'CONSUMER', name: '字典消费者'}, models: [model], relations: []})
    try {
      const view = dataSet.getView('Priority', 'default')!
      expect((await view.loadFromServer()).success).toBe(true)
      expect(view.getColumn('val')?.type).toBe(columnType)
      expect(view.rows.map(row => row['val'])).toEqual(values)
      expect(view.rows[0]).toMatchObject({txt: '名称0', exVal_1: '颜色', exVal_2: '分组', exVal_3: '范围', exVal_4: '说明'})
      view.setSelectedRows(view.rows)
      expect(resolveDataViewMember({dataViewKey: 'CONSUMER@Priority@default', dataMember: 'value'}, dataSet)).toEqual(values)
      expect(view.value).toBe(serialized)
      expect(view.addActionState()).toBe('hidden')
      expect(http.reads).toHaveLength(1)
      expect(http.reads[0]!.data).toMatchObject({Table: [{Name: 'Priority', OutputType: 'Table'}]})
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })

  it.each([
    {row: {...dictionaryDefinition, dictionaryType: undefined}, message: /dictionaryType.*缺失/},
    {row: {...dictionaryDefinition, lingma_sys_params: {m: ['dictionaryType']}}, message: /dictionaryType.*不可读/},
    {row: {...dictionaryDefinition, lingma_sys_params: {h: ['dictionaryType']}}, message: /dictionaryType.*不可读/},
    {row: {...dictionaryDefinition, lingma_sys_params: {m: ['secondValue']}}, message: /secondValue.*不可读/},
    {row: {...dictionaryDefinition, fiveValue: undefined}, message: /fiveValue.*缺失/},
    {row: {...dictionaryDefinition, rowid: 'OTHER'}, message: /身份.*变化/},
    {row: {...dictionaryDefinition, TypeName: 'Other'}, message: /身份.*变化/},
  ])('refuses unreadable or changed dictionary definitions and always releases the temporary space: $message', async ({row, message}) => {
    runtimeQuery.mockResolvedValue(context('_Base_DictType', [sourceRows.dict.row]))
    loadDictionaryDefinition.mockImplementation(() => dictionaryFixture(row))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const source = (await reader.query({type: 'dict'}, metadata)).rows[0]!
    await expect(reader.prepare(source, metadata)).rejects.toThrow(message)
    expect(dictionaryDataSets[0]?.destroyed).toBe(true)
  })

  it('preserves table field type and key marker from fully readable source rows', async () => {
    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(identity.metaName === 'Base_TblField'
      ? context('Base_TblField', [{rowid: 'F1', tblid: 'T1', enname: 'order_id', cnname: '订单 ID', DataType: 'varchar', IsPKey: true}])
      : context('View_TblList', [sourceRows.table.row])))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const source = (await reader.query({type: 'table'}, metadata)).rows[0]!
    const result = await reader.prepare(source, metadata)
    expect(result.model).toMatchObject({Type: '数据库表', DbId: 'DB1', DbName: 'main'})
    expect(result.fields).toEqual([expect.objectContaining({Name: 'order_id', FieldType: 'varchar', IsPKey: 1, IsOutput: 1})])
  })

  it.each(['table', 'databaseView'] as const)('lists %s with mixed empty database identities and rejects only the selected empty source', async type => {
    const fixture = sourceRows[type]
    const empty = {...fixture.row, rowid: 'EMPTY', dbid: null, DbName: null}
    runtimeQuery.mockImplementation((identity: QueryIdentity, options: QueryOptions) => {
      if (identity.metaName === 'Base_TblField') return Promise.resolve(context('Base_TblField', []))
      const selected = options.filter?.toJSON().value
      return Promise.resolve(context(fixture.metaName, selected === 'EMPTY' ? [empty]
        : selected === fixture.row.rowid ? [fixture.row] : [empty, fixture.row]))
    })
    const reader = new LowcodeDataSpaceModelSourceReader()
    const listed = await reader.query({type}, metadata)
    expect(listed.total).toBe(2)
    expect(listed.rows).toHaveLength(2)
    expect(listed.rows[0]).toMatchObject({id: 'EMPTY', dbid: '', databaseName: ''})
    await expect(reader.prepare(listed.rows[0]!, metadata)).rejects.toThrow(/数据库来源缺少.*数据库身份/)
    expect(runtimeQuery.mock.calls.filter(call => call[0].metaName === 'Base_TblField')).toHaveLength(0)
    const prepared = await reader.prepare(listed.rows[1]!, metadata)
    expect(prepared.model).toMatchObject({DbId: 'DB1', DbName: 'main'})
    expect(runtimeQuery.mock.calls.filter(call => call[0].metaName === 'Base_TblField')).toHaveLength(1)

    runtimeQuery.mockResolvedValue(context(fixture.metaName, [{...empty, lingma_sys_params: {m: ['dbid']}}]))
    await expect(reader.query({type}, metadata)).rejects.toThrow(/dbid.*不可读/)
  })

  it('allows zero output fields and maps parid/pid parameters with the explicit varchar default', async () => {
    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(identity.metaName === '_Base_ParamList'
      ? context('_Base_ParamList', [{parid: 'PAR1', pid: 'I1', parname: 'keyword', pardesc: '关键词'}])
      : identity.metaName === 'Base_TblField' ? context('Base_TblField', [])
        : context('Base_DataServiceInterface', [sourceRows.interface.row])))
    const reader = new LowcodeDataSpaceModelSourceReader()
    const source = (await reader.query({type: 'interface'}, metadata)).rows[0]!
    const result = await reader.prepare(source, metadata)
    expect(result.fields).toEqual([expect.objectContaining({type: 'inputParams', Name: 'keyword', FieldType: 'varchar', IsOutput: 0})])
    expect(result.model.DbId).toBe('P1')
  })

  it('rejects masked identity, source changes, incomplete field pages, and a changed execution scope', async () => {
    const reader = new LowcodeDataSpaceModelSourceReader()
    runtimeQuery.mockResolvedValue(context('View_TblList', [{...sourceRows.table.row,
      lingma_sys_params: {m: ['rowid']}}]))
    await expect(reader.query({type: 'table'}, metadata)).rejects.toThrow(/rowid.*不可读/)

    runtimeQuery.mockResolvedValue(context('View_TblList', [sourceRows.table.row]))
    const source = (await reader.query({type: 'table'}, metadata)).rows[0]!
    runtimeQuery.mockResolvedValue(context('View_TblList', [{...sourceRows.table.row, tbldesc: '已变化'}]))
    await expect(reader.prepare(source, metadata)).rejects.toThrow(/已变化/)

    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(identity.metaName === 'Base_TblField'
      ? context('Base_TblField', [], 2) : context('View_TblList', [sourceRows.table.row])))
    await expect(reader.prepare(source, metadata)).rejects.toThrow(/完整/)

    readRequestScope.mockReturnValue({token: 'scope-b', headers: {'X-AppId': 'app-a'}})
    await expect(reader.query({type: 'table'}, metadata)).rejects.toThrow(/读取身份已失效/)
  })

  it('does not turn a masked ProviderID or returned masked parzdtype into a fallback', async () => {
    runtimeQuery.mockResolvedValue(context('Base_DataServiceInterface', [{...sourceRows.interface.row,
      lingma_sys_params: {m: ['ProviderID']}}]))
    const reader = new LowcodeDataSpaceModelSourceReader()
    await expect(reader.query({type: 'interface'}, metadata)).rejects.toThrow(/ProviderID.*不可读/)

    runtimeQuery.mockImplementation((identity: QueryIdentity) => Promise.resolve(identity.metaName === '_Base_ParamList'
      ? context('_Base_ParamList', [{parid: 'PAR1', pid: 'I1', parname: 'keyword', parzdtype: 'secret',
        lingma_sys_params: {m: ['parzdtype']}}])
      : identity.metaName === 'Base_TblField' ? context('Base_TblField', [])
        : context('Base_DataServiceInterface', [sourceRows.interface.row])))
    const source = (await reader.query({type: 'interface'}, metadata)).rows[0]!
    await expect(reader.prepare(source, metadata)).rejects.toThrow(/parzdtype.*不可读/)
  })
})
