import {afterEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter} from 'vue-router'
import {DataSet, buildDataViewKey, resolveDataViewKey, resolveDataViewMember, diagnoseDataViewKey, DataMember} from '@spark-appworks/spark-data'
import {createProjectBlueprintRecord, PageRuntime, PageTool, ProjectWorkspace, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import { LowcodeApiError, type DataSpaceDesignApi } from '@/platform-adapters/api'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {Spark, SparkPageRenderer} from '@spark-appworks/spark-component'
import {PageRuntimePool} from '../../../../packages/spark-app/src/router/page-runtime-pool'
import DisplayText from '../../../../packages/spark-component/src/components/display/data-components/value/DisplayText/DisplayText.vue'
import {LowcodeDataSpaceAssembler} from '../../../../src/platform-adapters/data-space/lowcode-data-space-assembler'
import {assembleLowcodeRuntimeNavigation, lowcodeApi, readLowcodePageFiles} from '../../../../src/platform-adapters/lowcode-runtime'
import * as scenarioRuntime from '../../../../src/platform-adapters/data-space/lowcode-data-space-runtime'
import {createPageToolFileResourceExecutor} from '../../../../src/services/project/page-tool-file-dataview'
import blueprintConfig from '../../../../config/pages/application/project-blueprint/pagedata.json'

const calls: PageRuntime[] = []
afterEach(() => {
  for (const call of calls.splice(0)) call.dispose()
  vi.restoreAllMocks()
})

function tool(): PageTool {
  const result = new PageTool({pageId: 'orders-tool'})
  result.markLoaded()
  return result
}

async function callWithModels(bindings: Record<string, string | null>): Promise<PageRuntime> {
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'Models', tables:
    Object.fromEntries(Object.entries(bindings).map(([tableName, modelName]) => [tableName, {
      tableName, ...(modelName === null ? {} : {modelBinding: {modelId: `ID-${tableName}`, modelName}}),
      columns: [{name: 'id', type: 'string'}], views: {default: {}, detail: {}},
    }]))})
  const call = new PageRuntime({tool: tool(), scenarioIds: ['SPACE'], mainScenarioId: 'SPACE', loadScenario: async () => dataSet})
  calls.push(call)
  await call.load()
  return call
}

describe('page binding uses scenario, model name and view identity', () => {
  it('uses the complete unprefixed identity through runtime and data-view member consumers', async () => {
    const call = await callWithModels({InternalOrders: 'Orders', Orders: 'OtherModel'})
    const dataSet = call.getDataSet('SPACE')!, view = dataSet.getView('InternalOrders', 'detail')!
    const binding = buildDataViewKey('Orders', 'detail', 'SPACE')
    expect(binding).toBe('SPACE@Orders@detail')
    expect(call.resolveView(binding)).toBe(view)
    expect(resolveDataViewKey(binding, dataSet)).toBe(view)
    expect(resolveDataViewMember({dataViewKey: binding, dataMember: DataMember.Rows}, dataSet)).toBe(view.rows)
    expect(diagnoseDataViewKey(binding, dataSet).ok).toBe(true)
    expect(resolveDataViewKey('SPACE@InternalOrders@detail', dataSet)).toBeUndefined()
    expect(resolveDataViewKey('#OTHER@InternalOrders@detail', dataSet)).toBeUndefined()
    expect(diagnoseDataViewKey('#OTHER@InternalOrders@detail', dataSet).ok).toBe(false)
  })

  it('materializes complete and local model bindings without mutating the tool definition', async () => {
    const call = await callWithModels({InternalOrders: 'Orders'})
    call.tool.hydrateFileText('rule.json', JSON.stringify([
      {type: 'r-form', props: {dataViewKey: 'SPACE@Orders@detail'}},
      {type: 'r-form', props: {dataViewKey: 'Orders@default'}},
    ]))
    expect(call.materialize().rule.map(node => node.props?.['dataViewKey'])).toEqual(['SPACE@Orders@detail', 'SPACE@Orders@default'])
    expect(call.tool.getFileText('rule.json')).toContain('Orders@default')
  })

  it('rejects an ambiguous formal model in local full-key helpers too', async () => {
    const call = await callWithModels({First: 'Orders', Second: 'Orders'})
    expect(() => resolveDataViewKey('SPACE@Orders@detail', call.getDataSet('SPACE'))).toThrow(/不唯一/)
  })

  it('resolves the formal model even when another table key has the same spelling', async () => {
    const call = await callWithModels({InternalOrders: 'Orders', Orders: 'OtherModel'})
    const orders = call.getDataSet('SPACE')!.getView('InternalOrders', 'detail')
    expect(call.resolveView('#SPACE@Orders@detail')).toBe(orders)
    expect(call.resolveView('Orders@detail')).toBe(orders)
    expect(call.resolveView('#SPACE@OtherModel@detail')).toBe(call.getDataSet('SPACE')!.getView('Orders', 'detail'))
    expect(call.resolveView('#SPACE@InternalOrders@detail')).toBeUndefined()
  })

  it('rejects ambiguous model names instead of choosing a table by insertion order', async () => {
    const call = await callWithModels({First: 'Orders', Second: 'Orders'})
    expect(() => call.resolveView('#SPACE@Orders@detail')).toThrow(/模型.*不唯一/)
  })

  it('keeps native local model names and rejects collisions with formally bound names', async () => {
    const call = await callWithModels({LocalDefinition: null, InternalOrders: 'Orders'})
    expect(call.resolveView('LocalDefinition@detail')).toBe(call.getDataSet('SPACE')!.getView('LocalDefinition', 'detail'))
    expect(call.resolveView('Orders@missing')).toBeUndefined()
    expect(() => call.resolveView('#OTHER@Orders@detail')).toThrow(/未声明/)
    const collision = await callWithModels({Orders: null, InternalOrders: 'Orders'})
    expect(() => collision.resolveView('Orders@detail')).toThrow(/模型.*不唯一/)
  })
})

describe('native system page runtime', () => {
  it('binds the same metadata data set without inventing a three-file tool and releases it on close', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'META', dataSetName: 'Metadata', tables: {
      InternalModels: {modelBinding: {modelId: 'MODEL', modelName: 'Models'}, columns: [{name: 'id', type: 'string'}], views: {default: {}}},
    }})
    const call = new PageRuntime({pageId: '/data-space-design', scenarioIds: ['META'], loadScenario: async () => dataSet})
    calls.push(call)
    await call.load()
    expect(call.pageId).toBe('/data-space-design')
    expect(call.resolveView('META@Models@default')).toBe(dataSet.getView('InternalModels', 'default'))
    expect(() => call.resolveView('TARGET@Models@default')).toThrow(/未声明/)
    expect(() => call.resolveView('Models@default')).toThrow(/主场景/)
    expect(() => call.materialize()).toThrow(/系统页.*三文件/)
    expect(() => call.tool).toThrow(/系统页.*三文件/)
    await expect(call.reload()).rejects.toThrow(/系统页.*宿主重新打开/)
    expect(dataSet.destroyed).toBe(false)
    expect(call.resolveView('META@Models@default')).toBe(dataSet.getView('InternalModels', 'default'))
    call.dispose()
    expect(dataSet.destroyed).toBe(true)
    expect(() => call.resolveView('META@Models@default')).toThrow(/DESTROYED/)
  })

  it('rejects conflicting native and tool identities before any load', () => {
    expect(() => new PageRuntime({pageId: '/data-space-design', tool: tool(), scenarioIds: [],
      loadScenario: async () => {throw new Error('should not load')}})).toThrow(/二选一/)
  })
})

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const model: FormalModel = {id: 'MODEL', name: 'Orders', metaName: 'Orders', sourceName: 'PhysicalOrders',
  sourceId: 'DB', sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {},
  fields: ['id', 'title'].map(name => ({id: `FIELD-${name}`, modelId: 'MODEL', name, canonicalName: name,
    type: 'string', primaryKey: name === 'id', description: name, output: true, computed: false,
    order: 0, orderType: '', raw: {}}))}

class ModelHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly hiddenTitles = new Set<string>()
  readonly titles = new Map([['A', 'A original'], ['B', 'B original'], ['LOOKUP', 'Lookup original']])
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const scenarioId = config.headers?.['x-FormKey']
    if (typeof scenarioId !== 'string' || !this.titles.has(scenarioId)) throw new Error('unexpected scenario')
    const body = config.data
    let result: unknown
    if (config.url === '/api/DataOperation/GetData') {
      if (!isRecord(body) || !Array.isArray(body['Table']) || !isRecord(body['Table'][0])
        || body['Table'][0]['Name'] !== 'Orders') throw new Error('unexpected query identity')
      result = {primaryKeyField: 'id', allowAdd: false, data: {Items: [{id: 'ROW', title: this.titles.get(scenarioId),
        lingma_sys_key: `SIGNED-${scenarioId}`, lingma_sys_params: {r: ['id', 'title'],
          h: this.hiddenTitles.has(scenarioId) ? ['title'] : [], e: scenarioId === 'LOOKUP' ? [] : ['title']}}], Count: 1}}
    } else if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      if (!Array.isArray(body) || body.length !== 1 || !isRecord(body[0]) || body[0]['TableName'] !== 'Orders'
        || !isRecord(body[0]['CrudModel']) || !Array.isArray(body[0]['CrudModel']['Changed'])) throw new Error('unexpected save')
      const row = body[0]['CrudModel']['Changed'][0]
      if (!isRecord(row) || row['id'] !== 'ROW' || row['lingma_sys_key'] !== `SIGNED-${scenarioId}`
        || scenarioId === 'LOOKUP') throw new Error('wrong row permission')
      const title = `${scenarioId} accepted`
      this.titles.set(scenarioId, title)
      result = {maplistedit: [{PhysicalOrders: [{id: 'ROW', title}]}]}
    } else throw new Error('unexpected endpoint')
    return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: result}}
  }
}

it.each([true, false])('reuses one tool through URL spaces, rendering, queries and signed saves (internal names differ: %s)', async differentNames => {
  const http = new ModelHttp()
  const queryOwner = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {'X-AppId': 'APP'}})})
  const assembler = new LowcodeDataSpaceAssembler(queryOwner, http)
  const rule = JSON.stringify([
    {type: 'r-text-display', props: {dataViewKey: 'Orders@detail', dataMember: 'currentRow', dataField: 'title', textClass: 'main-title'}},
    {type: 'r-text-display', props: {dataViewKey: '#LOOKUP@Orders@detail', dataMember: 'currentRow', dataField: 'title', textClass: 'lookup-title'}},
    {type: 'button', props: {onClick: 'saveTitle'}, children: ['Save']},
  ])
  const script = `async function __init__() {
    await Promise.all([$page.resolveView('Orders@detail').loadFromServer(), $page.resolveView('#LOOKUP@Orders@detail').loadFromServer()]);
  }
  async function saveTitle() {
    const view = $page.resolveView('Orders@detail');
    await view.editRowById('ROW', {title: 'Submitted'});
    return view.saveChanges();
  }`
  const target = 'cfg:orders-tool?additionalScenarioIds=LOOKUP'
  const versionId = 'rule=2;script=3;style=4'
  const records = ['A', 'B'].map(scenarioId => createProjectBlueprintRecord({
    nodeId: scenarioId, projectId:'APP', parentNodeId:'ROOT', kind:'page', capability:{name:scenarioId},
    navigation:{title:scenarioId, target, order:0, publishInMenu:true, showChildren:false, beginGroup:false},
    dataSpace:{scenarioId, models:[]}, source:{VersionId:` ${versionId} `},
  }))
  const navTree = assembleLowcodeRuntimeNavigation({applicationName:'Orders', projectId:'APP', navigationRootId:'ROOT', records,
    authorization:{items:records.map(record=>({id:record.nodeId, target, targetKind:'route', formKey:record.nodeId, children:[]})), contexts:[]}})
  expect(records.map(record => navTree.items.find(node => node.id === record.nodeId)?.tool)).toEqual([
    {projectId:'APP',pageId:'orders-tool'}, {projectId:'APP',pageId:'orders-tool'},
  ])
  const router = createRouter({history:createMemoryHistory(), routes:navTree.items.map(node=>({
    path:`/apps/:projectId/__page/${node.id}`, component:defineComponent({render:()=>h('div')}),
    meta:{type:'config-page', nodeId:node.id, tool:node.tool, blueprintScenarioId:node.blueprintScenarioId},
  }))})
  const openMenu = (nodeId:string) => router.push(`/apps/APP${navTree.items.find(node=>node.id===nodeId)!.path}`)
  const style = '.main-title { font-weight: bold; }'
  const workingFiles = new Map([['rule.json', rule], ['script.js', script], ['style.css', style]])
  vi.spyOn(lowcodeApi, 'readRequestScope').mockReturnValue({token: 'SCOPE', headers: {'X-AppId': 'APP'}})
  vi.spyOn(scenarioRuntime, 'loadLowcodeRuntimeScenario').mockImplementation(async ({projectId, scenarioId}) => {
    expect([projectId, scenarioId]).toEqual(['APP', blueprintConfig.scenarioId])
    const workspace = new ProjectWorkspace({projectId, blueprint: {}})
    return assembler.assemble({
      config: new ScenarioViewConfig(scenarioId, JSON.stringify({scenarioId, tables: {ProjectToolFile: blueprintConfig.tables.ProjectToolFile}})),
      space: {dataSpaceId: scenarioId, name: 'Blueprint'}, models: [], relations: [],
      fileExecutors: {ProjectToolFile: createPageToolFileResourceExecutor({appId: projectId, workspace, assertCurrent: () => {}})},
    }).dataSet
  })
  const workingRead = vi.spyOn(lowcodeApi.design, 'readTextFile').mockImplementation(async locator => {
    expect(locator).toMatchObject({appType: 'designfile', customPath: 'APP/orders-tool'})
    const text = workingFiles.get(locator.fileName)
    if (text === undefined) throw new LowcodeApiError(404, 'file missing')
    return text
  })
  const pool = new PageRuntimePool({pageComponent: SparkPageRenderer, readNavTree: () => navTree,
    refreshRoutes: async () => undefined,
    readPageFile: async () => {throw new Error('Expected the atomic page file reader')},
    readPageFiles: readLowcodePageFiles,
    loadScenario: async ({scenarioId}) => assembler.assemble({
      config: new ScenarioViewConfig(scenarioId, JSON.stringify({scenarioId, tables: {
        [differentNames ? `Internal${scenarioId}` : 'Orders']: {modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
          views: {default: {autoLoad: false}, detail: {commitMode: 'staged', autoLoad: false, autoCurrentFirst: true},
            receipt: {autoLoad: false, autoCurrentFirst: true}}},
      }})), space: {dataSpaceId: scenarioId, name: `Space ${scenarioId}`}, models: [model], relations: [],
    }).dataSet,
  })
  await openMenu('A')
  const first = pool.getPageRuntime(router.currentRoute.value)!
  calls.push(first)
  await first.load()
  expect(workingRead.mock.calls.map(([locator]) => locator.fileName).sort()).toEqual([...workingFiles.keys()].sort())
  expect(first.tool.getFileText('style.css')).toBe(style)
  expect(first.resolveView('Orders@detail')).toBe(first.getDataSet('A')!.getView(differentNames ? 'InternalA' : 'Orders', 'detail'))
  const errors: unknown[] = []
  const registry = Spark.createRegistry()
  registry.register('r-text-display', DisplayText)
  const wrapper = mount(SparkPageRenderer, {props: {pageRuntime: first,
    routeSnapshot: {...router.currentRoute.value, name: router.currentRoute.value.name ?? null},
    onRuntimeError: error => {errors.push(error)}}, global: {plugins: [Spark.createPlugin({registry}), router],
      stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false}}})
  try {
    await flushPromises()
    expect(errors).toEqual([])
    await vi.waitFor(() => expect(first.resolveView('Orders@detail')!.currentRow?.['title']).toBe('A original'))
    await vi.waitFor(() => expect(wrapper.get('.main-title').text()).toBe('A original'))
    expect(wrapper.get('.lookup-title').text()).toBe('Lookup original')
    const lookup = first.resolveView('#LOOKUP@Orders@detail')!
    expect(lookup.fieldAccess(lookup.rows[0]!, 'title').write).toBe('denied')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.main-title').text()).toBe('A accepted')
    expect(http.requests.at(-1)).toMatchObject({headers: {'x-FormKey': 'A'},
      data: [{TableName: 'Orders', CrudModel: {Changed: [{id: 'ROW', title: 'Submitted', lingma_sys_key: 'SIGNED-A'}]}}]})

    await openMenu('B')
    const second = pool.getPageRuntime(router.currentRoute.value)!
    calls.push(second)
    await wrapper.setProps({pageRuntime: second,
      routeSnapshot: {...router.currentRoute.value, name: router.currentRoute.value.name ?? null}})
    await flushPromises()
    expect(errors).toEqual([])
    expect(wrapper.get('.main-title').text()).toBe('B original')
    expect(wrapper.get('.lookup-title').text()).toBe('Lookup original')
    expect(second.tool.getFileText('rule.json')).toBe(first.tool.getFileText('rule.json'))
    expect(second.getDataSet('LOOKUP')).not.toBe(first.getDataSet('LOOKUP'))
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.main-title').text()).toBe('B accepted')
    expect(http.requests.at(-1)).toMatchObject({headers: {'x-FormKey': 'B'},
      data: [{TableName: 'Orders', CrudModel: {Changed: [{lingma_sys_key: 'SIGNED-B'}]}}]})
    expect(first.resolveView('Orders@detail')!.rows[0]?.['title']).toBe('A accepted')
    expect(second.resolveView('#LOOKUP@Orders@detail')!.rows[0]?.['title']).toBe('Lookup original')
    first.dispose()
    await openMenu('A')
    const reopened = pool.getPageRuntime(router.currentRoute.value)!
    calls.push(reopened)
    expect(reopened).not.toBe(first)
    await reopened.load()
    await reopened.resolveView('Orders@detail')!.loadFromServer()
    expect(reopened.resolveView('Orders@detail')!.currentRow?.['title']).toBe('A accepted')
    const receipt = reopened.resolveView('A@Orders@receipt')!
    expect(receipt).not.toBe(reopened.resolveView('Orders@detail'))
    await receipt.loadFromServer()
    expect(receipt.currentRow).toMatchObject({id: 'ROW', title: 'A accepted'})
    await second.resolveView('Orders@detail')!.loadFromServer()
    await flushPromises()
    expect(second.resolveView('Orders@detail')!.rows[0]?.['title']).toBe('B accepted')
    expect(wrapper.get('.main-title').text()).toBe('B accepted')
    http.titles.set('A', 'A changed in another call')
    await reopened.resolveView('Orders@detail')!.loadFromServer()
    await flushPromises()
    expect(wrapper.get('.main-title').text()).toBe('B accepted')
    http.hiddenTitles.add('B')
    await second.resolveView('Orders@detail')!.loadFromServer()
    await flushPromises()
    expect(wrapper.get('.main-title').text()).toBe('-')
    expect(wrapper.get('.lookup-title').text()).toBe('Lookup original')
    expect(() => first.resolveView('Orders@detail')).toThrow(/DESTROYED/)
    expect(second.resolveView('Orders@detail')!.dataSet?.destroyed).toBe(false)
    reopened.dispose()
    workingFiles.delete('script.js')
    const incomplete = pool.getPageRuntime(router.currentRoute.value)!
    calls.push(incomplete)
    await expect(incomplete.load()).rejects.toThrow(/PAGE_TOOL_FILE_MISSING/)
    expect(workingRead).toHaveBeenCalled()
    expect(http.requests.filter(request => request.url.endsWith('/BatchTableOperateRequestByCRUD'))).toHaveLength(2)
  } finally { wrapper.unmount(); pool.disposePageRuntimes() }
})
