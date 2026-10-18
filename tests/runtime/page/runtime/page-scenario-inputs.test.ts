import {afterEach, describe, expect, it} from 'vitest'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, type LocationQueryRaw} from 'vue-router'
import {PageRuntime, PageTool, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import type {DataSet} from '@spark-appworks/spark-data'
import {PageRuntimePool} from '../../../../packages/spark-app/src/router/page-runtime-pool'
import {LowcodeDataSpaceAssembler} from '../../../../src/lowcode/data-space/lowcode-data-space-assembler'

const calls: PageRuntime[] = []
afterEach(() => {for (const call of calls.splice(0)) call.dispose()})
const filter = {field: 'id', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'formid'}}
const model = {id: 'MODEL', name: 'Records', metaName: 'Records', sourceName: 'PhysicalRecords',
  sourceId: 'DB', sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {},
  fields: [{id: 'FIELD', modelId: 'MODEL', name: 'id', canonicalName: 'id', type: 'string',
    primaryKey: true, description: '', output: true, computed: false, order: 0, orderType: '', raw: {}}]}

function wire(request: RequestConfig | undefined): Record<string, unknown> {
  const body = request?.data
  if (!isRecord(body) || !Array.isArray(body['Table']) || !isRecord(body['Table'][0])) throw new Error('missing formal query')
  return body['Table'][0]
}
class InputHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url !== '/api/DataOperation/GetData') throw new Error('unexpected endpoint')
    const query = wire(config)
    const condition = query['Filter']
    if (!isRecord(condition) || !isRecord(condition['ValueFun'])) throw new Error('missing bound filter')
    const value = condition['ValueFun']['Value']
    return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {
      primaryKeyField: 'id', allowAdd: false, data: {Count: 1, Items: [{id: String(value),
        lingma_sys_key: 'SIGNED', lingma_sys_params: {r: ['id'], e: []}}]},
    }}}
  }
}
function fixture() {
  const http = new InputHttp()
  const owner = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {'X-AppId': 'APP'}})})
  const assembler = new LowcodeDataSpaceAssembler(owner, http)
  const files = new Map<string, string>()
  const load = async (scenarioId: string): Promise<DataSet> => {
    const text = JSON.stringify({scenarioId, tables: {Internal: {modelBinding: {modelId: 'MODEL', modelName: 'Records'},
      views: {default: {autoLoad: false, filterExpression: filter, queryContext: {fixed: 'default'}},
        detail: {autoLoad: false, filterExpression: filter, queryContext: {fixed: 'detail', formid: 'configured'}}},
    }}})
    files.set(scenarioId, text)
    return assembler.assemble({config: new ScenarioViewConfig(scenarioId, text),
      space: {dataSpaceId: scenarioId, name: scenarioId}, models: [model], relations: []}).dataSet
  }
  const page = defineComponent({render: () => h('div')})
  const router = createRouter({history: createMemoryHistory(), routes: [{path: '/t/:projectId/__tool/:pageId',
    component: page, meta: {type: 'config-page', programmaticTool: true}}]})
  const pool = new PageRuntimePool({pageComponent: page, readNavTree: () => null, refreshRoutes: async () => undefined,
    readPageFile: async ({fileName}) => fileName === 'rule.json' ? '[]' : '', loadScenario: ({scenarioId}) => load(scenarioId)})
  const open = async (query: LocationQueryRaw) => {
    await router.push({path: '/t/APP/__tool/shared', query})
    const call = pool.getPageRuntime(router.currentRoute.value)
    if (!call) throw new Error('missing runtime')
    calls.push(call)
    await call.load()
    return call
  }
  return {http, load, files, pool, router, open}
}
function programmatic(load: (id: string) => Promise<DataSet>, inputs: Record<string, Record<string, unknown>>) {
  const tool = new PageTool({pageId: 'shared'})
  tool.markLoaded()
  const call = new PageRuntime({tool, scenarioIds: ['META', 'LOOKUP'], scenarioInputs: inputs, loadScenario: load})
  calls.push(call)
  return call
}

describe('scenario call inputs reach the formal query owner', () => {
  it('binds two URL spaces independently and keeps the target ID separate from the metadata identity', async () => {
    const {open, http, files} = fixture()
    const call = await open({scenarioId: 'META', additionalScenarioIds: 'LOOKUP', returnTo: '/elsewhere',
      scenarioInputs: JSON.stringify({META: {formid: 'TARGET-A', ids: [0, '2'], enabled: false}, LOOKUP: {formid: 'LOOKUP-A'}})})
    const before = [...files]
    for (const space of ['META', 'LOOKUP']) await call.resolveView(`#${space}@Records@detail`)!.loadFromServer()
    expect(http.requests.map(request => request.headers?.['x-FormKey'])).toEqual(['META', 'LOOKUP'])
    expect(wire(http.requests[0])).toMatchObject({Name: 'Records', Filter: {ValueFun: {Type: 'GetConstValue', Value: 'TARGET-A'}},
      inputParams: [{Name: 'fixed', Value: 'detail'}, {Name: 'formid', Value: 'TARGET-A'},
        {Name: 'ids', Value: [0, '2']}, {Name: 'enabled', Value: false}]})
    expect(wire(http.requests[1])['inputParams']).toEqual([{Name: 'fixed', Value: 'detail'}, {Name: 'formid', Value: 'LOOKUP-A'}])
    expect(call.resolveView('#META@Records@detail')!.rows[0]?.['id']).toBe('TARGET-A')
    expect(call.resolveView('#LOOKUP@Records@detail')!.rows[0]?.['id']).toBe('LOOKUP-A')
    expect(call.resolveView('#META@Records@detail')!.fieldAccess(call.resolveView('#META@Records@detail')!.rows[0]!, 'id').write).toBe('denied')
    expect([...files]).toEqual(before)
  })

  it.each([0, false, '', null, [0, '2'], []].map(value => ({value})))('preserves explicit JSON input $value in filter and wire parameters', async ({value}) => {
    const {open, http} = fixture()
    const call = await open({additionalScenarioIds: 'META', scenarioInputs: JSON.stringify({META: {formid: value}})})
    await call.resolveView('#META@Records@default')!.loadFromServer()
    expect(wire(http.requests[0])).toMatchObject({Filter: {ValueFun: {Type: 'GetConstValue', Value: value}},
      inputParams: [{Name: 'fixed', Value: 'default'}, {Name: 'formid', Value: value}]})
  })

  it('keeps ordinary route query out of the input bag and rejects missing filter input before IO', async () => {
    const {open, http} = fixture()
    const call = await open({scenarioId: 'META', formid: 'not-implicitly-an-input'})
    await expect(call.resolveView('Records@default')!.loadFromServer()).rejects.toThrow('GetInputParam')
    expect(http.requests).toHaveLength(0)
    await call.resolveView('Records@detail')!.loadFromServer()
    expect(wire(http.requests[0])['inputParams']).toEqual([{Name: 'fixed', Value: 'detail'}, {Name: 'formid', Value: 'configured'}])
  })

  it('creates another call for changed inputs while reusing an identical URL', async () => {
    const {open, pool, router, http} = fixture()
    const first = await open({scenarioId: 'META', scenarioInputs: JSON.stringify({META: {formid: 'A'}})})
    expect(pool.getPageRuntime(router.currentRoute.value)).toBe(first)
    const second = await open({scenarioId: 'META', scenarioInputs: JSON.stringify({META: {formid: 'B'}})})
    expect(first.instanceId).not.toBe(second.instanceId)
    await second.resolveView('Records@detail')!.loadFromServer()
    await first.resolveView('Records@detail')!.loadFromServer()
    expect(second.resolveView('Records@detail')!.rows[0]?.['id']).toBe('B')
    expect(first.resolveView('Records@detail')!.rows[0]?.['id']).toBe('A')
    first.dispose()
    await second.resolveView('Records@detail')!.loadFromServer()
    expect(wire(http.requests.at(-1))['inputParams']).toContainEqual({Name: 'formid', Value: 'B'})
  })

  it('snapshots programmatic inputs, isolates nested view values and reapplies the original snapshot on reload', async () => {
    const {load, http} = fixture()
    const inputs = {META: {formid: 'A', nested: {ids: [1, 2]}}}
    const call = programmatic(load, inputs)
    inputs.META.formid = 'mutated by caller'
    inputs.META.nested.ids.push(3)
    await call.load()
    const original = call.getDataSet('META')!
    const first = call.resolveView('#META@Records@default')!
    const second = call.resolveView('#META@Records@detail')!
    const nested = first.queryContext['nested']
    if (!isRecord(nested) || !Array.isArray(nested['ids'])) throw new Error('missing nested input')
    nested['ids'].push(4)
    expect(second.queryContext['nested']).toEqual({ids: [1, 2]})
    expect(call.call.scenarioInputs?.['META']).toEqual({formid: 'A', nested: {ids: [1, 2]}})
    expect(Object.isFrozen(call.call.scenarioInputs)).toBe(true)
    expect(Reflect.set(call.call.scenarioInputs!['META']!, 'formid', 'changed')).toBe(false)
    expect(call.call.scenarioInputs?.['META']?.['formid']).toBe('A')
    first.queryContext = {formid: 'local'}
    await call.reload()
    expect(original.destroyed).toBe(true)
    await call.resolveView('#META@Records@default')!.loadFromServer()
    expect(wire(http.requests[0])['inputParams']).toContainEqual({Name: 'formid', Value: 'A'})
    expect(call.resolveView('#META@Records@default')!.queryContext['nested']).toEqual({ids: [1, 2]})
    expect(call.resolveView('#LOOKUP@Records@detail')!.queryContext['formid']).toBe('configured')
  })

  it('rejects a late dataset after disposal before applying this call input', async () => {
    const {load} = fixture()
    let complete: (data: DataSet) => void = () => undefined
    const pending = new Promise<DataSet>(resolve => {complete = resolve})
    const call = programmatic(async id => id === 'META' ? pending : load(id), {META: {formid: 'A'}})
    const loading = call.load()
    const rejected = expect(loading).rejects.toThrow('DESTROYED')
    call.dispose()
    const late = await load('META')
    complete(late)
    await rejected
    expect(late.destroyed).toBe(true)
  })

  it.each([null, ['', '{}'], '', '{broken', 'null', '[]', '{"META":[]}', '{"META":null}',
    '{"UNKNOWN":{"formid":"A"}}', '{" META ":{}}', '{"META":{" ":1}}'].map(scenarioInputs => ({scenarioInputs})))('rejects malformed URL inputs $scenarioInputs before assembly', async ({scenarioInputs}) => {
    const {open, files, http, pool} = fixture()
    await expect(open({scenarioId: 'META', scenarioInputs})).rejects.toThrow(/scenarioInputs/)
    expect(files.size).toBe(0)
    expect(http.requests).toHaveLength(0)
    expect(pool.getPageRuntimeNames()).toEqual([])
  })

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, new Date(), new Map(), 1n, () => 0,
    Symbol('input'), new Array(2)].map(value => ({value})))('rejects non-JSON programmatic value $value before loading', ({value}) => {
    const {load, files} = fixture()
    expect(() => programmatic(load, {META: {formid: value}})).toThrow(/scenarioInputs/)
    expect(files.size).toBe(0)
  })

  it('rejects cycles and accessor inputs without evaluating them', () => {
    const {load} = fixture()
    const cycle: Record<string, unknown> = {}
    cycle['self'] = cycle
    expect(() => programmatic(load, {META: {cycle}})).toThrow(/scenarioInputs/)
    let evaluated = false
    const inputs = {META: {get formid() {evaluated = true; return 'A'}}}
    expect(() => programmatic(load, inputs)).toThrow(/scenarioInputs/)
    expect(evaluated).toBe(false)
  })
})
