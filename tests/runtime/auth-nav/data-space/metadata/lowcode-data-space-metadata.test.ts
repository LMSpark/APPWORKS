import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATA_SPACE_DESIGN_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { DataMember, DataSet, RequestState, resolveDataViewMember } from '@spark-appworks/spark-data'
import type { RequestConfig } from '@spark-appworks/spark-utils'

const mocks = vi.hoisted(() => ({
  scope: vi.fn(), readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRelations: vi.fn(), request: vi.fn(),
}))

vi.mock('@/lowcode/lowcode-runtime', async () => {
  const { DataSpaceRuntimeApi } = await import('@spark-appworks/spark-lowcode-api')
  const { HttpClientBase } = await import('@spark-appworks/spark-utils')
  class FixtureHttp extends HttpClientBase {
    protected override async executeRequest(config: RequestConfig) {
      return { data: await mocks.request(config), status: 200, statusText: 'OK', headers: {} }
    }
  }
  const http = new FixtureHttp()
  return { lowcodeHttp: http, lowcodeApi: {
    readRequestScope: mocks.scope,
    dataSpace: {design: {readSpaceDefinition: mocks.readSpaceDefinition, readModel: mocks.readModel, readRelations: mocks.readRelations},
      runtime: new DataSpaceRuntimeApi({http, readScope: mocks.scope})},
  }, createLowcodeProjectGateways: () => { throw new Error('target pagedata must not be read') } }
})

import { loadLowcodeDataSpaceMetadata } from '@/lowcode/data-space/lowcode-data-space-runtime'

const tables = ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'] as const
const configuration: unknown = JSON.parse(readFileSync(resolve('config/pages/data-platform/data-space-design/pagedata.json'), 'utf8'))

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected record')
  return Object.fromEntries(Object.entries(value))
}

function configTables(): Record<string, unknown> { return record(record(configuration)['tables']) }

function formalModel(metaName: string) {
  const modelId = record(record(configTables()[metaName])['modelBinding'])['modelId']
  if (typeof modelId !== 'string') throw new Error('missing formal model ID')
  const fields = ['rowid', ...(metaName === 'Base_DataSet' ? ['inputParams'] : ['dataSetId']),
    ...(metaName === 'Base_DataModel' ? ['Name'] : []),
    ...(metaName === 'Base_DataModel_Field' ? ['Name', 'dataModelId'] : [])]
  return {id: modelId, name: metaName, metaName, sourceName: metaName,
    sourceId: '', sourceType: 'table', primaryKey: 'rowid', businessMain: false, raw: {},
    fields: fields.map((name, order) => ({id: `${metaName}-${name}`, modelId, name,
      canonicalName: name, type: 'string', primaryKey: name === 'rowid', description: '', output: true,
      computed: false, order, orderType: '', raw: {}}))}
}

function rowsFor(target = 'SPACE') {
  const row = (rowid: string, extra: Record<string, unknown>) => ({rowid, ...extra,
    lingma_sys_key: `key-${rowid}`, lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}})
  return new Map<string, Array<Record<string, unknown>>>([
    ['Base_DataSet', [row(target, {inputParams: '[]'})]],
    ['Base_DataModel', Array.from({length: 25}, (_, index) => row(`MODEL-${index}`, {dataSetId: target, Name: `Model ${index}`}))],
    ['Base_DataModel_Field', [row('FIELD-1', {dataSetId: target, dataModelId: 'MODEL-0', Name: 'name'})]],
    ['Base_DataModel_Relation', [row('REL-1', {dataSetId: target})]],
  ])
}

function wireConditions(input: unknown): Array<Record<string, unknown>> {
  if (input === undefined) return []
  const filter = record(input)
  return Array.isArray(filter['Filters']) ? filter['Filters'].flatMap(wireConditions) : [filter]
}

function installRows(rows: Map<string, Array<Record<string, unknown>>>) {
  mocks.request.mockImplementation(async (config: {data?: unknown}) => {
    const request = record(config.data)
    const entries = request['Table']
    if (!Array.isArray(entries)) throw new Error('missing formal model')
    const table = record(entries[0])
    const name = table['Name']
    if (typeof name !== 'string') throw new Error('missing formal model name')
    const page = request['PageParam'] === undefined ? {} : record(request['PageParam'])
    const modelFilter = wireConditions(table['Filter']).find(condition => condition['Field'] === 'dataModelId')
    const ids = modelFilter === undefined ? undefined : record(modelFilter['ValueFun'])['Value']
    const all = (rows.get(name) ?? []).filter(row => ids === undefined || (Array.isArray(ids) && ids.includes(row['dataModelId'])))
    const index = typeof page['index'] === 'number' ? page['index'] : 1
    const size = typeof page['size'] === 'number' ? page['size'] : all.length
    return {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false,
      data: {Items: all.slice((index - 1) * size, index * size), Count: all.length}}}
  })
}

describe('data-space metadata DataSet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.scope.mockReturnValue({token: 'SCOPE-1', headers: {'X-AppId': 'APP-1'}})
    mocks.readModel.mockImplementation(async ({metaName}: {metaName: string}) => formalModel(metaName))
    mocks.readSpaceDefinition.mockImplementation(async ({dataSpaceId}: {dataSpaceId: string}) =>
      ({dataSpaceId, name: '元数据正式空间'}))
    mocks.readRelations.mockResolvedValue([])
    installRows(rowsFor())
  })
  afterEach(() => vi.restoreAllMocks())

  it('cascades selected model values into scoped field options without narrowing complete metadata', async () => {
    const rows = rowsFor()
    const original = rows.get('Base_DataModel_Field')?.[0]
    if (!original) throw new Error('Missing field fixture')
    const allFields = [original, {...original, rowid: 'FIELD-2', dataModelId: 'MODEL-1', lingma_sys_key: 'key-FIELD-2'},
      {...original, rowid: 'FIELD-3', dataModelId: 'MODEL-1', lingma_sys_key: 'key-FIELD-3'}]
    rows.set('Base_DataModel_Field', allFields)
    installRows(rows)
    const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
    const other = await loadLowcodeDataSpaceMetadata('SPACE')
    try {
      const models = dataSet.getView('Base_DataModel', 'modelOptions')
      const fields = dataSet.getView('Base_DataModel_Field', 'modelFieldOptions')
      expect(models).toBeDefined()
      expect(fields).toBeDefined()
      if (!models || !fields) throw new Error('Missing metadata option views')
      expect(models.requestState).toBe(RequestState.Idle)
      expect(fields.requestState).toBe(RequestState.Idle)
      expect(models.autoLoad).toBe(false)
      expect(fields.autoLoad).toBe(false)
      const wholeFields = dataSet.getView('Base_DataModel_Field', 'default')?.rows
      const wholeModels = dataSet.getView('Base_DataModel', 'default')?.rows
      const calls = mocks.request.mock.calls.length
      dataSet.triggerAutoLoad()
      expect(mocks.request.mock.calls.length).toBe(calls)
      models.valueField = 'Name'
      models.selectionDelimiter = '|'
      expect((await models.loadFromServer({allPages: true})).success).toBe(true)
      await vi.waitFor(() => expect(fields.requestState).toBe(RequestState.Loaded))
      expect(models.selectedRows).toEqual([])
      const first = models.rows[0]
      const second = models.rows[1]
      if (!first || !second) throw new Error('Missing model records')
      for (const selection of [[first], [first, second], [second], []]) {
        models.setSelectedRows(selection)
        const ids = selection.map(row => models.getPkKey(row))
        expect(resolveDataViewMember({dataViewKey: 'Base_DataModel@modelOptions', dataMember: DataMember.Value}, dataSet)).toEqual(ids)
        expect(models.value).toBe(selection.map(row => row['Name']).join('|'))
        await vi.waitFor(() => {
          expect(fields.requestState).toBe(RequestState.Loaded)
          expect(fields.rows.map(row => row['rowid'])).toEqual(allFields.filter(row => ids.some(id => id === row['dataModelId'])).map(row => row['rowid']))
          const last = mocks.request.mock.calls.at(-1)?.[0]
          const entries = record(record(last)['data'])['Table']
          if (!Array.isArray(entries)) throw new Error('Missing child wire request')
          expect(wireConditions(record(entries[0])['Filter'])).toEqual(expect.arrayContaining([
            expect.objectContaining({Field: 'dataSetId', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'SPACE'}}),
            expect.objectContaining({Field: 'dataModelId', Operator: 'in', ValueFun: {Type: 'GetConstValue', Value: ids}}),
          ]))
        })
        expect(dataSet.getView('Base_DataModel_Field', 'default')?.rows).toBe(wholeFields)
        expect(dataSet.getView('Base_DataModel', 'default')?.rows).toBe(wholeModels)
        expect(other.getView('Base_DataModel_Field', 'modelFieldOptions')?.requestState).toBe(RequestState.Idle)
        const afterQuery = mocks.request.mock.calls.length
        models.setCurrentRowById(models.getPkKey(first)!)
        models.setCurrentRowById(models.getPkKey(second)!)
        await Promise.resolve()
        expect(mocks.request.mock.calls.length).toBe(afterQuery)
      }
    } finally {dataSet.destroy(); other.destroy()}
  })

  it('declares the formid filter on every existing view without persisting columns or rows', () => {
    expect(record(configuration)['scenarioId']).toBe(DATA_SPACE_DESIGN_FORM_KEY)
    for (const [tableName, input] of Object.entries(configTables())) {
      const table = record(input)
      const ownerField = tableName === 'Base_DataSet' ? 'rowid' : 'dataSetId'
      expect(table).not.toHaveProperty('columns')
      for (const view of Object.values(record(table['views']))) {
        expect(view).toMatchObject({filterExpression: {field: ownerField, operator: 'eq',
          value: {Type: 'GetInputParam', ParamName: 'formid'}}})
        expect(view).not.toHaveProperty('rows')
      }
    }
  })

  it('returns a native isolated DataSet with formal columns, scoped wire input and complete pages', async () => {
    const originalConfig = JSON.stringify(configuration)
    const first = await loadLowcodeDataSpaceMetadata('SPACE')
    const second = await loadLowcodeDataSpaceMetadata('SPACE')
    expect(first).toBeInstanceOf(DataSet)
    expect(second).not.toBe(first)
    expect(first.scenarioId).toBe(DATA_SPACE_DESIGN_FORM_KEY)
    expect(first.dataSetName).toBe('元数据正式空间')
    expect(mocks.readSpaceDefinition).toHaveBeenCalledWith(expect.objectContaining({
      designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: DATA_SPACE_DESIGN_FORM_KEY}))
    for (const tableName of tables) {
      const table = first.getTable(tableName)
      expect(table?.columns.some(column => column.name === 'rowid')).toBe(true)
      expect(first.getView(tableName, 'default')?.queryContext).toMatchObject({formid: 'SPACE'})
      expect(first.getView(tableName, 'default')?.rows.length).toBe(tableName === 'Base_DataModel' ? 25 : 1)
    }
    expect(first.getView('Base_DataModel', 'designModels')?.queryContext).toMatchObject({formid: 'SPACE'})
    const sent = mocks.request.mock.calls.map(([config]) => {
      const entries = record(record(config)['data'])['Table']
      if (!Array.isArray(entries)) throw new Error('missing wire tables')
      return record(entries[0])
    })
    expect(sent.every(table => table['inputParams'] && JSON.stringify(table['inputParams'])
      === JSON.stringify([{Name: 'formid', Value: 'SPACE'}]))).toBe(true)
    for (const table of sent) {
      expect(table['Filter']).toMatchObject({Type: 'cond', Field: table['Name'] === 'Base_DataSet' ? 'rowid' : 'dataSetId',
        ValueFun: {Type: 'GetConstValue', Value: 'SPACE'}})
    }
    expect(sent.filter(table => table['Name'] === 'Base_DataModel').length).toBeGreaterThan(2)
    expect(JSON.stringify(configuration)).toBe(originalConfig)
    first.destroy()
    second.destroy()
  })

  it('rejects invalid input before I/O and destroys candidates after an out-of-scope row', async () => {
    await expect(loadLowcodeDataSpaceMetadata('')).rejects.toThrow()
    await expect(loadLowcodeDataSpaceMetadata('../OTHER')).rejects.toThrow()
    expect(mocks.readModel).not.toHaveBeenCalled()
    installRows(rowsFor('OTHER'))
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    await expect(loadLowcodeDataSpaceMetadata('SPACE')).rejects.toThrow()
    expect(destroy).toHaveBeenCalled()
  })
})
