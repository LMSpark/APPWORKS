import {afterEach, describe, expect, it} from 'vitest'
import {DataSet, DataViewFilter} from '@spark-appworks/spark-data'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceDesignApi} from '../../design/data-space-design-api'
import {DataSpaceRuntimeApi} from '../data-space-runtime-api'

const datasets: DataSet[] = []
afterEach(() => {for (const dataset of datasets.splice(0)) dataset.destroy()})
const sourceModel = {rowid: 'MODEL', dataSetId: 'TARGET', Name: 'CustomerApi',
  MetaName: 'GetCustomer', Type: '接口', DbId: 'PROVIDER', PrimaryKeyFields: 'id'}
const output = {rowid: 'FIELD', dataSetId: 'TARGET', dataModelId: 'MODEL', type: 'dataModel',
  Name: 'id', FieldType: 'varchar', IsOutput: 1, IsPKey: 1}
function mapping(name = 'customer_id', value: unknown = {Type: 'GetInputParam', ParamName: 'customer'}, id = 'PARAM') {
  return {rowid: id, dataSetId: 'TARGET', dataModelId: 'MODEL', type: 'inputParams',
    Name: name, ValueFun: typeof value === 'string' ? value : JSON.stringify(value)}
}
function matches(row: Record<string, unknown>, filter: unknown): boolean {
  if (filter === null || filter === undefined) return true
  if (!isRecord(filter)) throw new Error('invalid filter')
  if (filter['Type'] === 'and') {
    if (!Array.isArray(filter['Filters'])) throw new Error('missing filter children')
    return filter['Filters'].every(child => matches(row, child))
  }
  if (filter['Operator'] !== 'equal' || typeof filter['Field'] !== 'string' || !isRecord(filter['ValueFun'])) {
    throw new Error('unexpected filter')
  }
  return row[filter['Field']] === filter['ValueFun']['Value']
}
function tableOf(request: RequestConfig): Record<string, unknown> {
  const data = request.data
  if (!isRecord(data) || !Array.isArray(data['Table']) || !isRecord(data['Table'][0])) throw new Error('invalid query')
  return data['Table'][0]
}
class SourceHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  mappings: Record<string, unknown>[] = [mapping()]
  model: Record<string, unknown> = {...sourceModel}
  inputResponse: Record<string, unknown>[] | undefined
  inputPermissions: Record<string, unknown> = {r: [], e: []}
  inputTotal: number | undefined
  onInput: (() => void) | undefined
  protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(request)
    if (request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      const groups = request.data
      if (!Array.isArray(groups) || !isRecord(groups[0]) || groups[0]['TableName'] !== 'Base_DataModel_Field'
        || !isRecord(groups[0]['CrudModel']) || !Array.isArray(groups[0]['CrudModel']['Changed'])) throw new Error('invalid save')
      const change = groups[0]['CrudModel']['Changed'][0]
      if (!isRecord(change) || change['lingma_sys_key'] !== 'INPUT-KEY') throw new Error('missing row signature')
      const row = this.mappings.find(item => item['rowid'] === change['rowid'])
      if (!row || typeof change['ValueFun'] !== 'string') throw new Error('invalid target')
      row['ValueFun'] = change['ValueFun']
      return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200,
        Result: {maplistedit: [{physical: [{...row}]}]}}}
    }
    if (request.url !== '/api/DataOperation/GetData') throw new Error('unexpected endpoint')
    const table = tableOf(request)
    const name = table['Name']
    const isInput = name === 'Base_DataModel_Field' && matches(mapping(), table['Filter'])
    const rows = name === 'Base_DataModel' ? [this.model].filter(row => matches(row, table['Filter']))
      : name === 'Base_DataModel_Field' ? (isInput && this.inputResponse !== undefined ? this.inputResponse
        : [output, ...this.mappings].filter(row => matches(row, table['Filter'])))
        : name === 'CustomerApi' ? [{id: 'RESULT'}] : []
    if (isInput) this.onInput?.()
    const body = request.data
    const page = isRecord(body) && isRecord(body['PageParam']) ? body['PageParam'] : undefined
    const index = typeof page?.['index'] === 'number' ? page['index'] : 1
    const size = typeof page?.['size'] === 'number' ? page['size'] : 500
    const returned = rows.slice((index - 1) * size, index * size)
    return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {
      primaryKeyField: name === 'CustomerApi' ? 'id' : 'rowid', allowAdd: false,
      data: {Count: isInput ? this.inputTotal ?? rows.length : rows.length, Items: returned.map(row => ({...row,
        ...(isInput ? {lingma_sys_key: 'INPUT-KEY'} : {}),
        lingma_sys_params: isInput ? this.inputPermissions : {r: [], e: []}}))},
    }}}
  }
  businessInputs() {return this.requests.filter(request => request.url === '/api/DataOperation/GetData'
    && tableOf(request)['Name'] === 'CustomerApi')
    .map(request => tableOf(request)['inputParams'])}
}
async function fixture(http = new SourceHttp(), readScope = () => ({token: 'SCOPE', headers: {'X-AppId': 'APP'}})) {
  const runtime = new DataSpaceRuntimeApi({http, readScope})
  const design = new DataSpaceDesignApi({http, runtime, readScope})
  const model = await design.readModel({designScenarioId: 'META', dataSpaceId: 'TARGET', metaName: 'CustomerApi'})
  const dataset = DataSet.fromJson({scenarioId: 'TARGET', dataSetName: 'TARGET', tables: {Api: {
    tableName: 'Api', modelBinding: {modelId: 'MODEL', modelName: 'CustomerApi'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, first: {}, second: {}},
  }}})
  datasets.push(dataset)
  const first = dataset.getView('Api', 'first')
  const second = dataset.getView('Api', 'second')
  if (!first || !second) throw new Error('missing views')
  for (const view of [first, second]) runtime.bindModelView(view, model)
  return {http, runtime, design, model, dataset, first, second}
}

describe('formal model source input mappings', () => {
  it('requires a confirmed interface or logical-view model for direct input interpretation', async () => {
    const {dataset, model, http} = await fixture()
    for (const formal of [true, false]) {
      const isolated = DataSet.fromJson(dataset.toJson()); datasets.push(isolated)
      const first = isolated.getView('Api', 'first')
      if (!first) throw new Error('missing isolated view')
      const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
      if (formal) runtime.bindModelView(first, {...model, sourceType: '数据库表'})
      else first.bindQueryExecutor(runtime)
      first.queryConfig = {sourceInputMode: 'direct'}
      await expect(first.loadFromServer({context: {customer_id: 'A'}})).rejects.toThrow(formal ? /接口或逻辑视图/ : /正式模型绑定/)
    }
    expect(http.businessInputs()).toEqual([])
  })
  it('keeps explicitly direct source values across refresh, sort and pagination without changing persisted mappings', async () => {
    const http = new SourceHttp()
    http.mappings = [mapping('customer_id', {Type: 'GetInputParam', ParamName: 'customer'}),
      mapping('flag', {Type: 'GetConstValue', Value: true}, 'FLAG')]
    const {first, second} = await fixture(http)
    const original = structuredClone(http.mappings)
    first.queryConfig = {sourceInputMode: 'direct'}
    first.queryContext = {customer_id: ['A', 'B'], flag: false, retained: 0}
    await first.refresh()
    await first.setSort([{field: 'id', direction: 'desc'}])
    await first.setPage(2)
    expect(first.loadingError).toBeNull()
    expect(http.businessInputs()).toHaveLength(3)
    for (const inputs of http.businessInputs()) expect(inputs).toEqual([
      {Name: 'customer_id', Value: ['A', 'B']}, {Name: 'flag', Value: false}, {Name: 'retained', Value: 0},
    ])
    for (const request of http.requests.filter(request => tableOf(request)['Name'] === 'CustomerApi')) {
      expect(JSON.stringify(request.data)).not.toContain('sourceInputMode')
    }
    expect(http.mappings).toEqual(original)
    await second.loadFromServer({context: {customer: 'MAPPED', flag: false}})
    expect(http.businessInputs().at(-1)).toContainEqual({Name: 'customer_id', Value: 'MAPPED'})
    expect(http.businessInputs().at(-1)).toContainEqual({Name: 'flag', Value: true})
    expect(second.fieldAccess(second.rows[0]!, 'id').write).toBe('denied')
  })

  it.each([0, false, '', null, ['A'], {nested: [false]}].map(value => ({value})))('uses direct JSON values without executing saved value functions: $value', async ({value}) => {
    const http = new SourceHttp(); http.mappings = [mapping('customer_id', {Type: 'SystemData', Value: 'UserID'})]
    const {first} = await fixture(http)
    first.queryConfig = {sourceInputMode: 'direct'}
    await first.loadFromServer({context: {customer_id: value}})
    expect(http.businessInputs()).toEqual([[{Name: 'customer_id', Value: value}]])
  })

  it('rejects incomplete direct source inputs before dispatch and resumes mapped execution after clearing the mode', async () => {
    const {first, http} = await fixture()
    first.queryConfig = {sourceInputMode: 'direct'}
    await expect(first.loadFromServer({context: {customer: 'not-a-source-name'}})).rejects.toThrow(/来源.*缺失/)
    expect(http.businessInputs()).toEqual([])
    first.queryConfig = {}
    await first.loadFromServer({context: {customer: 'MAPPED'}})
    expect(http.businessInputs()[0]).toContainEqual({Name: 'customer_id', Value: 'MAPPED'})
  })

  it('reads persisted source input separately from columns and maps the actual outgoing source name', async () => {
    const {http, first, model} = await fixture()
    first.queryContext = {customer: 'C-42'}
    await first.loadFromServer()
    expect(http.businessInputs()).toEqual([[{Name: 'customer', Value: 'C-42'}, {Name: 'customer_id', Value: 'C-42'}]])
    expect(model.fields.map(field => field.name)).toEqual(['id'])
    expect(first.rows.map(row => row['id'])).toEqual(['RESULT'])
    expect(first.fieldAccess(first.rows[0]!, 'id').write).toBe('denied')
    expect(http.mappings[0]?.['ValueFun']).toBe(JSON.stringify({Type: 'GetInputParam', ParamName: 'customer'}))
  })

  it.each([0, false, '', null, ['A', 'B'], {nested: [1, false]}].map(value => ({value})))(
    'preserves JSON input $value through the wire', async ({value}) => {
      const {http, first} = await fixture()
      first.queryContext = {customer: value}
      await first.loadFromServer()
      expect(http.businessInputs()[0]).toContainEqual({Name: 'customer_id', Value: value})
    })

  it('resolves every binding from the original captured context, keeping other business inputs', async () => {
    const http = new SourceHttp()
    http.mappings = [mapping('a', {Type: 'GetInputParam', ParamName: 'b'}, 'A'),
      mapping('b', {Type: 'GetInputParam', ParamName: 'a'}, 'B'), mapping('flag', {Type: 'GetConstValue', Value: false}, 'C')]
    const {first} = await fixture(http)
    first.queryContext = {a: 'old-A', b: 'old-B', retained: 0, flag: true}
    await first.loadFromServer({context: {a: 'A', b: 'B', retained: 0, flag: true}})
    expect(http.businessInputs()[0]).toEqual([{Name: 'a', Value: 'B'}, {Name: 'b', Value: 'A'},
      {Name: 'retained', Value: 0}, {Name: 'flag', Value: false}])
    expect(first.queryContext).toEqual({a: 'old-A', b: 'old-B', retained: 0, flag: true})
  })

  it('isolates two views and a fresh owner which re-reads the persisted definition', async () => {
    const http = new SourceHttp()
    const {first, second} = await fixture(http)
    await first.loadFromServer({context: {customer: 'A'}})
    await second.loadFromServer({context: {customer: 'B'}})
    http.inputPermissions = {r: [], e: ['ValueFun']}
    const identity = {scenarioId: 'META', metaName: 'Base_DataModel_Field'}
    const nextValue = JSON.stringify({Type: 'GetInputParam', ParamName: 'next'})
    const writer = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {'X-AppId': 'APP'}})})
    const context = await writer.query(identity, {filter: DataViewFilter.condition({field: 'type', operator: 'eq', value: 'inputParams'})})
    await writer.save({changes: [{identity, context, changes: {changed: [{rowid: 'PARAM', ValueFun: nextValue}]}}]})
    const fresh = await fixture(http)
    await fresh.first.loadFromServer({context: {next: 'C'}})
    expect(http.requests.find(request => request.url.includes('BatchTableOperate'))?.data).toMatchObject([
      {TableName: 'Base_DataModel_Field', CrudModel: {Changed: [{rowid: 'PARAM', ValueFun: nextValue, lingma_sys_key: 'INPUT-KEY'}]}},
    ])
    expect(http.businessInputs().map(items => Array.isArray(items) ? items.at(-1) : undefined)).toEqual([
      {Name: 'customer_id', Value: 'A'}, {Name: 'customer_id', Value: 'B'}, {Name: 'customer_id', Value: 'C'},
    ])
  })

  it('executes a legacy SystemData mapping only after explicit signed migration and a fresh formal read', async () => {
    const original = ' { "Type": "SystemData", "ParamName": "UserID" } '
    const http = new SourceHttp()
    http.mappings = [mapping('customer_id', original)]
    const old = await fixture(http)
    await expect(old.first.loadFromServer({context: {UserID: 'business-user'}})).rejects.toThrow(/SPARK_SOURCE_INPUT/)
    expect(http.businessInputs()).toEqual([])
    expect(http.mappings[0]?.['ValueFun']).toBe(original)
    http.inputPermissions = {r: [], e: ['ValueFun']}
    const identity = {scenarioId: 'META', metaName: 'Base_DataModel_Field'}
    const context = await old.runtime.query(identity, {filter: DataViewFilter.condition({field: 'type', operator: 'eq', value: 'inputParams'})})
    const replacement = JSON.stringify({Type: 'GetInputParam', ParamName: 'UserID'})
    await old.runtime.save({changes: [{identity, context, changes: {changed: [{rowid: 'PARAM', ValueFun: replacement}]}}]})
    expect(http.mappings[0]?.['ValueFun']).toBe(replacement)
    const fresh = await fixture(http)
    expect(fresh.model.sourceInputBindings?.[0]?.valueFunction).toEqual({Type: 'GetInputParam', ParamName: 'UserID'})
    await fresh.first.loadFromServer({context: {UserID: 'business-user'}})
    expect(http.businessInputs()).toEqual([[{Name: 'UserID', Value: 'business-user'}, {Name: 'customer_id', Value: 'business-user'}]])
    await expect(old.first.loadFromServer({context: {UserID: 'business-user'}})).rejects.toThrow(/SPARK_SOURCE_INPUT/)
    expect(http.businessInputs()).toHaveLength(1)
  })

  it.each([
    {label: 'missing input', value: {Type: 'GetInputParam', ParamName: 'absent'}},
    {label: 'empty mapping', value: ''},
    {label: 'system value', value: {Type: 'SystemData', ParamName: 'UserID'}},
    {label: 'legacy business SystemData', value: {Type: 'SystemData', ParamName: 'customer'}},
    {label: 'other server function', value: {Type: 'GetApiPublicParam', ParamName: 'public'}},
  ])('diagnoses $label before dispatch without interpreting caller input as a system identity', async ({value}) => {
    const http = new SourceHttp()
    http.mappings = [mapping('customer_id', value)]
    const {first} = await fixture(http)
    await expect(first.loadFromServer({context: {customer: 'A', UserID: 'caller-spoof'}})).rejects.toThrow(/SPARK_SOURCE_INPUT/)
    expect(http.businessInputs()).toEqual([])
  })

  it.each([
    {label: 'wrong model', change: {dataModelId: 'OTHER'}},
    {label: 'wrong space', change: {dataSetId: 'OTHER'}},
    {label: 'wrong kind', change: {type: 'dataModel'}},
    {label: 'empty name', change: {Name: ''}},
    {label: 'broken JSON', change: {ValueFun: '{'}},
    {label: 'missing constant', change: {ValueFun: JSON.stringify({Type: 'GetConstValue'})}},
  ])('rejects $label metadata instead of silently dropping it', async ({change}) => {
    const http = new SourceHttp()
    http.inputResponse = [{...mapping(), ...change}]
    await expect(fixture(http)).rejects.toThrow()
    expect(http.businessInputs()).toEqual([])
  })

  it('rejects duplicate names and unreadable metadata and ignores a late scoped response', async () => {
    const duplicate = new SourceHttp()
    duplicate.mappings = [mapping(), mapping('customer_id', {Type: 'GetConstValue', Value: 'B'}, 'OTHER')]
    await expect(fixture(duplicate)).rejects.toThrow(/重复/)
    const hidden = new SourceHttp()
    hidden.inputPermissions = {r: [], e: [], h: ['ValueFun']}
    await expect(fixture(hidden)).rejects.toThrow(/可读/)
    const stale = new SourceHttp()
    let token = 'FIRST'
    stale.onInput = () => {token = 'SECOND'}
    await expect(fixture(stale, () => ({token, headers: {'X-AppId': 'APP'}}))).rejects.toThrow(/SCOPE_STALE/)
  })

  it('preserves pass-through inputs when a model has no configured source mappings', async () => {
    const http = new SourceHttp()
    http.mappings = []
    const {first} = await fixture(http)
    await first.loadFromServer({context: {customer: 'A'}})
    expect(http.businessInputs()).toEqual([[{Name: 'customer', Value: 'A'}]])
  })

  it.each([undefined, Number.NaN, new Date(), new Map(), [undefined]].map(value => ({value})))(
    'rejects a non-JSON mapped input before business dispatch: $value', async ({value}) => {
      const {http, first} = await fixture()
      await expect(first.loadFromServer({context: {customer: value}})).rejects.toThrow(/SPARK_SOURCE_INPUT/)
      expect(http.businessInputs()).toEqual([])
    })

  it('reads mappings over multiple pages and rejects a missing page', async () => {
    const http = new SourceHttp()
    http.mappings = Array.from({length: 501}, (_, index) => mapping(`param${index}`, {Type: 'GetConstValue', Value: index}, `P${index}`))
    const {first} = await fixture(http)
    await first.loadFromServer()
    expect(http.businessInputs()[0]).toHaveLength(501)
    expect(http.businessInputs()[0]).toContainEqual({Name: 'param500', Value: 500})
    const incomplete = new SourceHttp()
    incomplete.inputTotal = 501
    await expect(fixture(incomplete)).rejects.toThrow()
  })

  it('maps logical-view source parameters through the same owner', async () => {
    const http = new SourceHttp()
    http.model['Type'] = '视图'
    const {first} = await fixture(http)
    await first.loadFromServer({context: {customer: 'VIEW'}})
    expect(http.businessInputs()[0]).toContainEqual({Name: 'customer_id', Value: 'VIEW'})
  })
})
