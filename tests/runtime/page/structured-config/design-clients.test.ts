import {DataSet, type DataRow} from '@spark-appworks/spark-data'
import {attachStagedDesignView, parseJsonObject, setDesignScopeValue} from '@/lowcode/resources/repository/staged-design-file-view'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {LogicViewDesignClient} from '@spark-appworks/spark-lowcode-api'
import {attachLogicViewDesignEdit, LOGIC_VIEW_DESIGN_INPUT, LOGIC_VIEW_DESIGN_VIEW} from '@/lowcode/resources/structured-config/logic-view/design-ops'
import type {RequestConfig} from '@spark-appworks/spark-utils'
import {StructuredCatalogHttp} from './catalog/structured-config-catalog.fixture'

let http: StructuredCatalogHttp
const readScope = () => ({token: 'scope', headers: {'X-AppId': 'APP'}})
const logicClient = (transport = http) => new LogicViewDesignClient(transport, {scenarioId: 'SPACE', readScope})
beforeEach(() => {http = new StructuredCatalogHttp({})})

it('rejects a legacy Ajax business failure for every design write', async () => {
  vi.spyOn(http, 'post').mockResolvedValue({Code: 500, Message: '明确拒绝保存', Result: null})
  const writes = [
    () => logicClient().write({viewId: 'V1', data: []}),
  ]
  for (const write of writes) await expect(write()).rejects.toThrow('明确拒绝保存')
})

describe('LogicViewDesignClient', () => {
  it.each(['read', 'write'] as const)('rejects a late %s response after the application changes', async operation => {
    let scope = readScope()
    const target = new LogicViewDesignClient(http, {scenarioId: 'SPACE', readScope: () => scope})
    http.post = async <T>(): Promise<T> => {
      scope = {token: 'next', headers: {'X-AppId': 'OTHER'}}
      return {Code: 200, Result: operation === 'read' ? [] : '保存成功'} as T
    }
    await expect(operation === 'read' ? target.read('V1') : target.write({viewId: 'V1', data: []})).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })
  it('carries the current application and scenario on both read and write', async () => {
    const calls: Array<Partial<RequestConfig> | undefined> = []
    http.post = async <T>(url: string, _data?: unknown, options?: Partial<RequestConfig>): Promise<T> => {
      calls.push(options)
      return {Code: 200, Result: url.endsWith('GetView') ? [] : '保存成功'} as T
    }
    await logicClient().read('V1'); await logicClient().write({viewId: 'V1', data: []})
    expect(calls).toHaveLength(2)
    for (const options of calls) expect(options?.headers).toMatchObject({'X-AppId': 'APP', 'X-FormKey': 'SPACE'})
  })
  it.each([{}, null, [null], [1]])('rejects a non-design-array write before sending: %j', async data => {
    const post = vi.spyOn(http, 'post')
    await expect(client().write({viewId: 'V1', data})).rejects.toThrow('对象数组')
    expect(post).not.toHaveBeenCalled()
  })
  it('rejects an acknowledgement that does not prove SaveView completed', async () => {
    vi.spyOn(http, 'post').mockResolvedValue({Code: 200, Result: false})
    await expect(client().write({viewId: 'V1', data: []})).rejects.toThrow('回执')
  })
  const client = () => logicClient()
  it('read sends viewId as a query parameter', async () => {
    const calls: Array<{url: string; data: unknown; params: unknown}> = []
    http.post = async (url: string, data?: unknown, config?: Partial<RequestConfig>) => {
      calls.push({url, data, params: config?.params})
      return {Code: 200, Result: {data: [{Name: 'Orders', Fields: []}]}} as never
    }
    const payload = await client().read('V1')
    expect(payload.viewId).toBe('V1')
    expect(payload.data).toEqual([{Name: 'Orders', Fields: []}])
    expect(calls).toEqual([{url: '/api/ViewData/GetView', data: undefined, params: {viewId: 'V1'}}])
  })
  it('rejects an empty viewId before requesting', async () => {
    const post = vi.spyOn(http, 'post')
    await expect(client().read('  ')).rejects.toThrow('逻辑视图 viewId 不能为空')
    expect(post).not.toHaveBeenCalled()
  })
  it('write posts SaveView', async () => {
    vi.spyOn(http, 'post').mockImplementation(async (url, data) => {http.posts.push({url, data}); return {Code: 200, Result: '保存成功'}})
    await client().write({viewId: 'V1', data: []})
    const saved = http.posts.find(post => post.url.includes('SaveView'))
    expect(saved?.data).toEqual({viewId: 'V1', data: []})
  })
  it('rejects invalid read payload', async () => {
    const broken = new StructuredCatalogHttp({})
    broken.post = async () => 0 as never
    await expect(logicClient(broken).read('V1')).rejects.toThrow(/无效/)
  })
  it('treats a missing design file as a blank new design', async () => {
    const broken = new StructuredCatalogHttp({})
    broken.post = async () => ({Code: 500, Message: '[500] [404] 文件不存在', Result: null}) as never
    const payload = await logicClient(broken).read('V1')
    expect(payload).toEqual({viewId: 'V1', data: []})
  })
  it('still rejects other business failures from GetView', async () => {
    const broken = new StructuredCatalogHttp({})
    broken.post = async () => ({Code: 500, Message: '[500] 数据库连接失败', Result: null}) as never
    await expect(logicClient(broken).read('V1')).rejects.toThrow('数据库连接失败')
  })
})

it('requires the owning DataSet to carry a formal scenario before attaching design storage', () => {
  const dataSet = DataSet.fromJson({tables: {}}); sets.push(dataSet)
  expect(() => attachLogicViewDesignEdit({dataSet, http, guard: () => {}, readScope})).toThrow('场景')
  expect(http.posts).toEqual([])
})

it('edits, cancels and saves a real design array through the existing DataSet owner without losing nested fields', async () => {
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', tables: {}}); sets.push(dataSet)
  let stored = [{Name: 'Orders', Fields: [{Name: 'id', IsOutput: 0}], ChildTables: [{Name: 'Lines', Fields: []}], custom: {keep: false}}]
  const writes: unknown[] = []
  http.post = async <T>(url: string, data?: unknown): Promise<T> => {
    if (url.endsWith('GetView')) return {Code: 200, Result: structuredClone(stored)} as T
    writes.push(data)
    stored = structuredClone((data as {data: typeof stored}).data)
    return {Code: 200, Result: '保存成功'} as T
  }
  attachLogicViewDesignEdit({dataSet, http, guard: () => {}, readScope})
  setDesignScopeValue({dataSet, tableName: LOGIC_VIEW_DESIGN_INPUT, field: 'viewId', scopeId: 'V1'})
  const view = dataSet.getView(LOGIC_VIEW_DESIGN_VIEW)!
  await view.refresh()
  const changed = structuredClone(stored); changed[0]!.custom.keep = true
  view.updateEditingValue('V1', 'designJson', JSON.stringify(changed))
  view.discardPendingChanges()
  expect(writes).toEqual([])
  expect(JSON.parse(String(view.rows[0]?.['designJson']))).toEqual(stored)
  view.updateEditingValue('V1', 'designJson', JSON.stringify(changed))
  const result = await dataSet.saveChanges({views: [{tableName: LOGIC_VIEW_DESIGN_VIEW, viewId: 'default'}]})
  expect(result.success).toBe(true)
  expect(writes).toEqual([{viewId: 'V1', data: changed}])
  await view.refresh()
  expect(JSON.parse(String(view.rows[0]?.['designJson']))).toEqual(changed)
  expect(view.hasUnconfirmedSave).toBe(false)
})

const sets: DataSet[] = []
afterEach(() => {sets.splice(0).forEach(set => set.destroy())})

async function open() {
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', tables: {}})
  sets.push(dataSet)
  let stored: DataRow = {rowid: 'A', targetId: 'A', content: 'original'}
  const load = vi.fn(async () => ({...stored}))
  const persist = vi.fn(async (row: Readonly<DataRow>) => {stored = {...row}})
  const view = attachStagedDesignView(dataSet, {scopeInputTable: 'Input', scopeField: 'targetId',
    designViewTable: 'Design', resourceId: 'test-design',
    columns: [{name: 'rowid', primary: true}, {name: 'targetId'}, {name: 'content'}],
    loadRow: load, persistRow: persist}, () => {})
  const scope = (scopeId: string) => setDesignScopeValue({dataSet, tableName: 'Input', field: 'targetId', scopeId})
  scope('A'); await view.refresh()
  const save = () => dataSet.saveChanges({views: [{tableName: 'Design', viewId: 'default'}]})
  return {dataSet, view, persist, load, scope, save}
}

describe('staged design storage confirmation', () => {
  it('verifies a possibly applied write without replaying it', async () => {
    const {view, persist, load, save} = await open()
    await view.editRowById('A', {content: 'saved'})
    persist.mockImplementationOnce(async row => {
      load.mockResolvedValue({...row})
      throw new Error('response lost')
    })
    await expect(save()).rejects.toThrow('response lost')
    expect(view.hasUnconfirmedSave).toBe(true)
    await expect(save()).resolves.toMatchObject({success: true})
    expect(persist).toHaveBeenCalledTimes(1)
    expect(view.hasUnconfirmedSave).toBe(false)
  })

  it('does not accept an acknowledgement when the exact reread is unchanged', async () => {
    const {view, persist, save} = await open()
    persist.mockResolvedValue(undefined)
    await view.editRowById('A', {content: 'not stored'})
    await expect(save()).rejects.toThrow('DESIGN_SAVE_UNCONFIRMED')
    await expect(save()).rejects.toThrow('DESIGN_SAVE_UNCONFIRMED')
    expect(persist).toHaveBeenCalledTimes(1)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
  })

  it('rejects saving an old target after a failed scope switch', async () => {
    const {view, persist, scope, save} = await open()
    await view.editRowById('A', {content: 'draft'})
    scope('B')
    await expect(view.refresh()).rejects.toThrow()
    await expect(save()).rejects.toThrow('DESIGN_SCOPE_STALE')
    expect(persist).not.toHaveBeenCalled()
  })

  it('rejects non-object JSON instead of replacing it with an empty design', () => {
    for (const value of ['[]', 'null', '5']) expect(() => parseJsonObject(value)).toThrow()
  })

  it('allows correction after local JSON validation rejects before any write', async () => {
    const {view, persist, load, save} = await open()
    const write = vi.fn()
    persist.mockImplementation(async row => {
      parseJsonObject(String(row['content']))
      write()
      load.mockResolvedValue({...row})
    })
    await view.editRowById('A', {content: '[]'})
    await expect(save()).rejects.toThrow('必须是JSON对象')
    expect(write).not.toHaveBeenCalled()
    expect(view.hasUnconfirmedSave).toBe(false)
    await view.editRowById('A', {content: '{"nodes":[]}'})
    await expect(save()).resolves.toMatchObject({success: true})
    expect(write).toHaveBeenCalledTimes(1)
  })
})
