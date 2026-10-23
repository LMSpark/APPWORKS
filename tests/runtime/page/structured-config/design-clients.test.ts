import {DataSet, type DataRow} from '@spark-appworks/spark-data'
import {attachStagedDesignView, parseJsonObject, setDesignScopeValue} from '@/lowcode/resources/shared/staged-design-file-view'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataCodeDesignClient, LogicViewDesignClient, WorkflowDesignClient, JsonDataContentClient, ExcelImportDesignClient, PdfInspectDesignClient} from '@spark-appworks/spark-lowcode-api'
import {StructuredCatalogHttp} from './structured-config-catalog.fixture'

let http: StructuredCatalogHttp
beforeEach(() => {http = new StructuredCatalogHttp({})})

it('rejects a legacy Ajax business failure for every design write', async () => {
  vi.spyOn(http, 'post').mockResolvedValue({Code: 500, Message: '明确拒绝保存', Result: null})
  const writes = [
    () => new DataCodeDesignClient(http).saveDetail('C1', {CodeName: 'X'}),
    () => new LogicViewDesignClient(http).write({viewId: 'V1', data: {}}),
    () => new WorkflowDesignClient(http).write({workflowId: 'W1', nodes: [], connectors: []}),
    () => new JsonDataContentClient(http).save('J1', {}),
    () => new ExcelImportDesignClient(http).write({importConfigId: 'E1', layout: [], rules: []}),
    () => new PdfInspectDesignClient(http).write({ruleId: 'P1', rule: {}}),
  ]
  for (const write of writes) await expect(write()).rejects.toThrow('明确拒绝保存')
})

describe('DataCodeDesignClient', () => {
  const client = () => new DataCodeDesignClient(http)
  it('readDetail unwraps POST body', async () => {
    const detail = await client().readDetail('C1')
    expect(detail['CodeName']).toBe('测试编码')
  })
  it('saveDetail posts SaveCodeDesign', async () => {
    await client().saveDetail('C1', {CodeName: 'X'})
    expect(http.posts.some(p => p.url.includes('SaveCodeDesign'))).toBe(true)
  })
  it('rejects invalid read payload', async () => {
    const broken = new StructuredCatalogHttp({})
    broken.post = async () => null as never
    await expect(new DataCodeDesignClient(broken).readDetail('C1')).rejects.toThrow(/无效/)
  })
})

describe('LogicViewDesignClient', () => {
  const client = () => new LogicViewDesignClient(http)
  it('read returns viewId and data', async () => {
    const payload = await client().read('V1')
    expect(payload.viewId).toBe('V1')
    expect(payload.data).toEqual({tables: []})
  })
  it('write posts SaveView', async () => {
    await client().write({viewId: 'V1', data: {tables: []}})
    expect(http.posts.some(p => p.url.includes('SaveView'))).toBe(true)
  })
  it('rejects invalid read payload', async () => {
    const broken = new StructuredCatalogHttp({})
    broken.post = async () => 0 as never
    await expect(new LogicViewDesignClient(broken).read('V1')).rejects.toThrow(/无效/)
  })
})

describe('WorkflowDesignClient', () => {
  const client = () => new WorkflowDesignClient(http)
  it('read returns nodes and connectors', async () => {
    const doc = await client().read('W1')
    expect(doc.workflowId).toBe('W1')
    expect(doc.nodes).toEqual([])
  })
  it('write posts workflow write URL', async () => {
    await client().write({workflowId: 'W1', nodes: [], connectors: []})
    expect(http.posts.some(p => p.url.includes('DataWorkFlowDesign/write'))).toBe(true)
  })
  it('defaults missing arrays on read', async () => {
    const custom = new StructuredCatalogHttp({})
    custom.post = async url => (url.includes('read') ? {Code: 200, Result: {}} : {Code: 200, Result: {}}) as never
    const doc = await new WorkflowDesignClient(custom).read('W1')
    expect(doc.nodes).toEqual([])
    expect(doc.connectors).toEqual([])
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
