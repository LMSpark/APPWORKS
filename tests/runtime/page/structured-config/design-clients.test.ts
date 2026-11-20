import {DataSet, type DataRow} from '@spark-appworks/spark-data'
import {createStagedDesignExecutor, parseJsonObject} from '@/lowcode/resources/repository/staged-design-file-view'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {LogicViewDesignClient} from '@spark-appworks/spark-lowcode-api'
import {createLogicViewDesignExecutor, LOGIC_VIEW_DESIGN_RESOURCE_ID, LOGIC_VIEW_DESIGN_VIEW} from '@/lowcode/resources/structured-config/logic-view/design-ops'
import logicCatalog from '../../../../config/pages/structured-config/logic-view-catalog/pagedata.json'
import type {RequestConfig} from '@spark-appworks/spark-utils'
import {StructuredCatalogHttp} from './catalog/structured-config-catalog.fixture'
import {DataSpaceDefinitionSave, verifyDataSpaceDefinitionCapture, verifyAndDiscardDataSpaceDefinitionCapture,
  type DataSpaceDefinitionCaptureBatch} from '@/lowcode/data-space/model-source/data-space-definition-save'

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

it('requires a formal scenario before creating design storage', () => {
  expect(() => createLogicViewDesignExecutor({scenarioId: '', http, guard: () => {}, readScope})).toThrow('场景')
  expect(http.posts).toEqual([])
})

/** 按逻辑视图目录正式 pagedata 声明的设计表装配，再绑定装配层同一执行器并注入本次 viewId。 */
function bindLogicDesign(dataSet: DataSet, viewId = 'V1') {
  const view = dataSet.getView(LOGIC_VIEW_DESIGN_VIEW)!
  view.bindQueryExecutor(createLogicViewDesignExecutor({scenarioId: 'SPACE', http, guard: () => {}, readScope}),
    {resource: {resourceType: 'file', resourceId: LOGIC_VIEW_DESIGN_RESOURCE_ID}})
  view.queryContext = {...view.queryContext, viewId}
  return view
}
const declaredLogicDesign = () => logicCatalog.tables.LogicViewDesignEdit

it('edits, cancels and saves a real design array through the existing DataSet owner without losing nested fields', async () => {
  const dataSet = DataSet.fromJson({scenarioId:'SPACE',tables:{Base_DataViewList:{resourceType:'static-data',
    columns:[{name:'rowid',type:'string',isPrimaryKey:true}],views:{default:{},editorTarget:{rows:[{rowid:'V1'}]}}},
    [LOGIC_VIEW_DESIGN_VIEW]:declaredLogicDesign()}})
  sets.push(dataSet)
  vi.spyOn(dataSet.getView('Base_DataViewList','editorTarget')!,'editActionState').mockReturnValue('enabled')
  let stored = [{Name: 'Orders', Fields: [{Name: 'id', IsOutput: 0}], ChildTables: [{Name: 'Lines', Fields: []}], custom: {keep: false}}]
  const writes: unknown[] = []
  http.post = async <T>(url: string, data?: unknown): Promise<T> => {
    if (url.endsWith('GetView')) return {Code: 200, Result: structuredClone(stored)} as T
    writes.push(data)
    stored = structuredClone((data as {data: typeof stored}).data)
    return {Code: 200, Result: '保存成功'} as T
  }
  const view = bindLogicDesign(dataSet)
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

it('does not grant design editing or dispatch a file write without the original directory permission',async()=>{
  const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{[LOGIC_VIEW_DESIGN_VIEW]:declaredLogicDesign()}});sets.push(dataSet)
  const writes:unknown[]=[]
  http.post=async<T>(url:string,data?:unknown):Promise<T>=>{if(url.endsWith('GetView'))return {Code:200,Result:[]} as T;writes.push(data);return {Code:200,Result:'保存成功'} as T}
  const view=bindLogicDesign(dataSet);await view.refresh()
  expect(view.fieldAccess(view.rows[0]!,'designJson').write).toBe('denied')
  view.updateEditingValue('V1','designJson','[{"Name":"blocked"}]')
  await expect(dataSet.saveChanges({views:[{tableName:LOGIC_VIEW_DESIGN_VIEW,viewId:'default'}]})).rejects.toThrow('DESIGN_EDIT_DENIED')
  expect(writes).toEqual([])
})

const sets: DataSet[] = []
afterEach(() => {sets.splice(0).forEach(set => set.destroy())})

async function open(options: {content?: string; json?: boolean} = {}) {
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', tables: {Design: {resourceType: 'file', resourceId: 'test-design',
    columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'targetId', type: 'string'}, {name: 'content', type: 'string'}],
    views: {default: {commitMode: 'staged', queryContext: {targetId: ''}}}}}})
  sets.push(dataSet)
  let stored: DataRow = {rowid: 'A', targetId: 'A', content: options.content ?? 'original'}
  const guard = vi.fn()
  const load = vi.fn(async () => ({...stored}))
  const persist = vi.fn(async (row: Readonly<DataRow>) => {stored = {...row}})
  const view = dataSet.getView('Design')!
  view.bindQueryExecutor(createStagedDesignExecutor({scopeField: 'targetId', resourceId: 'test-design',
    columns: [{name: 'rowid', primary: true}, {name: 'targetId'}, {name: 'content'}],
    ...(options.json ? {jsonFields:['content']} : {}),
    loadRow: load, persistRow: persist}, guard), {resource: {resourceType: 'file', resourceId: 'test-design'}})
  const scope = (scopeId: string) => {view.queryContext = {...view.queryContext, targetId: scopeId}}
  scope('A'); await view.refresh()
  const save = () => dataSet.saveChanges({views: [{tableName: 'Design', viewId: 'default'}]})
  return {dataSet, view, persist, load, scope, save, guard}
}

describe('staged design storage confirmation', () => {
  it('resolves the original definition capture as not applied before explicitly discarding its draft', async () => {
    const {dataSet,view,persist} = await open()
    persist.mockResolvedValue(undefined)
    await view.editRowById('A',{content:'not stored'})
    let capture:DataSpaceDefinitionCaptureBatch|undefined
    await expect(DataSpaceDefinitionSave.run([{dataSet,targetId:'A',modelId:'A',
      prepare:async()=>{},apply:async()=>{},check:()=>{},
      targets:()=>[{tableName:'Design',viewId:'default',ids:['A']}],
      dispatched:value=>{capture=value},confirm:async()=>{},failed:()=>{},
    }])).rejects.toThrow('DESIGN_SAVE_UNCONFIRMED')
    expect(capture).toBeDefined()
    await expect(verifyDataSpaceDefinitionCapture(dataSet,capture!)).resolves.toBe('not-applied')
    expect(view.dirtyTracking.hasPendingChanges('A')).toBe(true)
    expect(view.hasUnconfirmedSave).toBe(false)
    await expect(verifyAndDiscardDataSpaceDefinitionCapture(dataSet,capture!,{acceptCurrentOnInvalidReceipt:false})).resolves.toBe('not-applied')
    expect(view.dirtyTracking.hasPendingChanges('A')).toBe(false)
    expect(view.rows[0]?.['content']).toBe('original')
    expect(persist).toHaveBeenCalledTimes(1)
  })
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
    expect(view.hasUnconfirmedSave).toBe(true)
    await expect(save()).rejects.toThrow('SPARK_SAVE_NOT_APPLIED:')
    expect(persist).toHaveBeenCalledTimes(1)
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
  })

  it('retains the original unknown when a different result replaces the baseline', async () => {
    const {view, persist, load, save} = await open()
    persist.mockResolvedValue(undefined)
    await view.editRowById('A', {content: 'not stored'})
    await expect(save()).rejects.toThrow('DESIGN_SAVE_UNCONFIRMED')
    load.mockResolvedValue({rowid:'A',targetId:'A',content:'another writer'})
    await expect(save()).rejects.toThrow('DESIGN_SAVE_UNCONFIRMED')
    expect(view.hasUnconfirmedSave).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('keeps later local edits when the original write is verified not applied', async () => {
    const {view, persist, save} = await open()
    persist.mockResolvedValue(undefined)
    await view.editRowById('A', {content:'first intent'})
    await expect(save()).rejects.toThrow('DESIGN_SAVE_UNCONFIRMED')
    view.updateEditingValue('A','content','later draft')
    await expect(save()).rejects.toThrow('SPARK_SAVE_NOT_APPLIED:')
    expect(view.getEditingRow('A')?.['content']).toBe('later draft')
    expect(view.dirtyTracking.hasPendingChanges('A')).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('does not classify a failed verification read as the original baseline', async () => {
    const {view, persist, load, save} = await open()
    persist.mockResolvedValue(undefined)
    await view.editRowById('A', {content:'not stored'})
    await expect(save()).rejects.toThrow('DESIGN_SAVE_UNCONFIRMED')
    load.mockRejectedValueOnce(new Error('read failed'))
    await expect(save()).rejects.toThrow('read failed')
    expect(view.hasUnconfirmedSave).toBe(true)
    await expect(save()).rejects.toThrow('SPARK_SAVE_NOT_APPLIED:')
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('compares the original JSON baseline structurally without accepting a different document', async () => {
    const {view, persist, load, save} = await open({content:'{"a":1,"b":false}',json:true})
    persist.mockResolvedValue(undefined)
    await view.editRowById('A', {content:'{"a":2,"b":false}'})
    await expect(save()).rejects.toThrow('DESIGN_SAVE_UNCONFIRMED')
    load.mockResolvedValue({rowid:'A',targetId:'A',content:'{"b":false,"a":1}'})
    await expect(save()).rejects.toThrow('SPARK_SAVE_NOT_APPLIED:')
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('preserves the unknown capture when the original execution scope becomes invalid', async () => {
    const {view, persist, guard, save} = await open()
    persist.mockResolvedValue(undefined)
    await view.editRowById('A', {content:'not stored'})
    await expect(save()).rejects.toThrow('DESIGN_SAVE_UNCONFIRMED')
    guard.mockImplementation(()=>{throw new Error('execution scope changed')})
    await expect(save()).rejects.toThrow('execution scope changed')
    expect(view.hasUnconfirmedSave).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
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
