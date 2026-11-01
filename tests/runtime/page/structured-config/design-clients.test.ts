import {DataSet, type DataRow} from '@spark-appworks/spark-data'
import {attachStagedDesignView, parseJsonObject, setDesignScopeValue} from '@/lowcode/resources/repository/staged-design-file-view'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {LogicViewDesignClient, JsonDataContentClient} from '@spark-appworks/spark-lowcode-api'
import type {RequestConfig} from '@spark-appworks/spark-utils'
import {StructuredCatalogHttp} from './catalog/structured-config-catalog.fixture'

let http: StructuredCatalogHttp
beforeEach(() => {http = new StructuredCatalogHttp({})})

it('rejects a legacy Ajax business failure for every design write', async () => {
  vi.spyOn(http, 'post').mockResolvedValue({Code: 500, Message: '明确拒绝保存', Result: null})
  const writes = [
    () => new LogicViewDesignClient(http).write({viewId: 'V1', data: {}}),
    () => new JsonDataContentClient(http).save('J1', []),
  ]
  for (const write of writes) await expect(write()).rejects.toThrow('明确拒绝保存')
})

describe('LogicViewDesignClient', () => {
  const client = () => new LogicViewDesignClient(http)
  it('read sends viewId as a query parameter', async () => {
    const calls: Array<{url: string; data: unknown; params: unknown}> = []
    http.post = async (url: string, data?: unknown, config?: Partial<RequestConfig>) => {
      calls.push({url, data, params: config?.params})
      return {Code: 200, Result: {data: {tables: []}}} as never
    }
    const payload = await client().read('V1')
    expect(payload.viewId).toBe('V1')
    expect(payload.data).toEqual({tables: []})
    expect(calls).toEqual([{url: '/api/ViewData/GetView', data: undefined, params: {viewId: 'V1'}}])
  })
  it('rejects an empty viewId before requesting', async () => {
    const post = vi.spyOn(http, 'post')
    await expect(client().read('  ')).rejects.toThrow('逻辑视图 viewId 不能为空')
    expect(post).not.toHaveBeenCalled()
  })
  it('write posts SaveView', async () => {
    await client().write({viewId: 'V1', data: {tables: []}})
    const saved = http.posts.find(post => post.url.includes('SaveView'))
    expect(saved?.data).toEqual({viewId: 'V1', data: {tables: []}})
  })
  it('rejects invalid read payload', async () => {
    const broken = new StructuredCatalogHttp({})
    broken.post = async () => 0 as never
    await expect(new LogicViewDesignClient(broken).read('V1')).rejects.toThrow(/无效/)
  })
  it('treats a missing design file as a blank new design', async () => {
    const broken = new StructuredCatalogHttp({})
    broken.post = async () => ({Code: 500, Message: '[500] [404] 文件不存在', Result: null}) as never
    const payload = await new LogicViewDesignClient(broken).read('V1')
    expect(payload).toEqual({viewId: 'V1', data: {}})
  })
  it('still rejects other business failures from GetView', async () => {
    const broken = new StructuredCatalogHttp({})
    broken.post = async () => ({Code: 500, Message: '[500] 数据库连接失败', Result: null}) as never
    await expect(new LogicViewDesignClient(broken).read('V1')).rejects.toThrow('数据库连接失败')
  })
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
