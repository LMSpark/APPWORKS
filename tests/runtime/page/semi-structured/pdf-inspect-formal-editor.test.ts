import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {FieldJson, FieldText, RendererButton, RendererTable, Spark} from '@spark-appworks/spark-component'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import type {HttpResponse, RequestConfig} from '@spark-appworks/spark-utils'
import SparkJsonEditor from '../../../../packages/spark-component/src/components/editors/SparkJsonEditor.vue'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import PdfList from '@/views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page.vue'
import {LowcodePdfInspect} from '@/lowcode/resources/semi-structured/pdf-inspect/resource'
import {provideTestPageService} from '../../../support/helpers/page-service-host'
import PdfEditor from '@/views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page.vue'
import {ApiBackend} from '../api-provider/api-provider.fixture'
import {PDF, topicModels, topicTexts} from '../structured-config/catalog/formal-topic.fixture'
const state = vi.hoisted(() => ({http: undefined as unknown as ApiBackend, runtime: undefined as unknown as DataSpaceRuntimeApi}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return state.http}, lowcodeDesignFileUpload: async () => {throw new Error('unexpected upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => topicTexts[id] ?? null}}),
  lowcodeApi: {readRequestScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}}), dataSpace: {
    get runtime() {return state.runtime}, design: {
      readSpaceDefinition: async ({dataSpaceId}: {dataSpaceId: string}) => ({dataSpaceId, name: 'PDF'}),
      readModelBatch: async ({dataSpaceId}: {dataSpaceId: string}) => topicModels(dataSpaceId), readRelations: async () => [],
    },
  }},
}))
const ruleText=(value:string)=>JSON.stringify({version:'1.0',rules:[{id:'title',type:'TEXT_COMPARE',source:{locator:{type:'KEYWORD',keywords:['名称'],relativePosition:'RIGHT'}},target:{type:'CONSTANT',value},compare:{operator:'EQUAL'}}]})
const wrappers: VueWrapper[] = []
beforeEach(() => {
  state.http = new ApiBackend(); state.http.primaryKeys['Base_FileInspectConfig'] = 'id'
  state.http.records = {Base_FileInspectConfig: [
    {id: 'P1', name: '发票规则', enabled: 1, rule_config: '{"pattern":"old","keep":false}'},
    {id: 'P2', name: '其他规则', rule_config: '{"other":true}'},
  ]}
  state.runtime = new DataSpaceRuntimeApi({http: state.http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}})})
})
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
async function open(ruleId = 'P1',catalog=false,recoveryRequestId?:string|string[]) {
  const router = createRouter({history: createMemoryHistory(), routes: [{path: '/editor', component: PdfEditor, meta: {blueprintScenarioId: PDF}}, {path: '/other', component: {template: '<div>other</div>'}}]})
  if(catalog){
    const dynamic=createDynamicRouter({router,pageComponent:PdfList,loadNavigation:async()=>({id:'root',title:'Root',childPlacement:'header',items:[{id:PDF,title:'PDF',path:'/catalog',itemKind:'system-page',blueprintScenarioId:PDF}]}),componentMap:{'/catalog':PdfList}})
    await dynamic.registerRoutes()
    const record=router.getRoutes().find(item=>item.path==='/catalog')
    if(record)record.meta['blueprintScenarioId']=PDF
  }
  await router.push({path:catalog?'/catalog':'/editor',query:catalog?{pdfInspectionRequestId:recoveryRequestId}:{ruleId}}); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => {provideTestPageService(router);return () => h(RouterView)}}), {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}}); wrappers.push(wrapper)
  await flushPromises()
  const click = async (label: string) => {await wrapper.findAll('button').find(button => button.text() === label)!.trigger('click'); await flushPromises()}
  return {wrapper, click, router}
}
describe('formal PDF rule editor', () => {
  it('retries only the original request when cold recovery initially returns no task', async () => {
    const backend = new class extends ApiBackend {
      calls: string[] = []
      protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
        if (!request.url.startsWith('/api/File/inspect/')) return super.executeRequest(request)
        this.calls.push(request.url)
        expect(request.url).toBe('/api/File/inspect/recover')
        expect(request.data).toEqual({requestId: 'REQ'})
        const data = this.calls.length === 1 ? {Code: 404, Message: 'missing'} : {Code: 200, Result: {
          protocolVersion: '2.0', inspectJobId: 'JOB', requestId: 'REQ', status: 'COMPLETED', progress: {total: 0, finished: 0}, files: [],
        }}
        return {data, status: 200, statusText: 'OK', headers: {}}
      }
    }()
    backend.primaryKeys = state.http.primaryKeys
    backend.records = state.http.records
    state.http = backend
    state.runtime = new DataSpaceRuntimeApi({http: backend, readScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}})})
    const f = await open('P1', true, 'REQ')
    await vi.waitFor(() => expect(f.wrapper.text()).toContain('原请求结果尚未核定'))
    expect(backend.calls).toEqual(['/api/File/inspect/recover'])
    expect(f.wrapper.text()).not.toContain('文件与规则核验明细')
    await f.click('重新核验原请求')
    expect(f.wrapper.text()).toContain('文件与规则核验明细')
    expect(backend.calls).toEqual(['/api/File/inspect/recover', '/api/File/inspect/recover'])
    expect(backend.saves).toHaveLength(0)
  })
  it('rejects ambiguous original request links without querying the recovery resource', async () => {
    const f = await open('P1', true, ['REQ', 'OTHER'])
    expect(f.wrapper.text()).toContain('恢复链接缺少唯一有效的原请求编号')
    expect(state.http.saves).toHaveLength(0)
  })
  it.each(['REQ', 'OTHER'])('checks history request identity before rendering the original task (%s)', async requestId => {
    const files = [{fileId: 'FILE', rules: [{ruleId: 'RULE', matched: false}]}]
    const backend = new class extends ApiBackend {
      historyCalls = 0
      resultCalls = 0
      protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
        let result: unknown
        if (request.url.endsWith('/api/File/inspect/history')) {
          this.historyCalls++
          result = {page: 1, pageSize: 20, total: 1, items: [{inspectJobId: 'JOB', requestId: 'REQ', configId: 'P1', status: 'COMPLETED'}]}
        } else if (request.url.endsWith('/api/File/inspect/result')) {
          this.resultCalls++
          expect(request.data).toEqual({inspectJobId: 'JOB'})
          result = {protocolVersion: '2.0', inspectJobId: 'JOB', requestId, status: 'COMPLETED', progress: {total: 1, finished: 1}, files}
        } else {
          return super.executeRequest(request)
        }
        return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
      }
    }()
    backend.primaryKeys = state.http.primaryKeys
    backend.records = state.http.records
    state.http = backend
    state.runtime = new DataSpaceRuntimeApi({http: backend, readScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}})})
    const load = vi.spyOn(LowcodePdfInspect, 'loadCatalog')
    const f = await open('P1', true)
    const dataSet = await load.mock.results[0]!.value
    load.mockRestore()
    expect(backend.historyCalls).toBe(0)
    await f.click('核验历史')
    expect(backend.historyCalls, f.wrapper.text()).toBe(1)
    const row = dataSet.getView('PdfInspectionHistory')?.rows[0]
    const table = f.wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey')?.includes('@PdfInspectionHistory@'))
    expect(row?.['inspectJobId']).toBe('JOB')
    expect(table?.props('onRowClick')).toBeTypeOf('function')
    await table!.props('onRowClick')!(row!, undefined, undefined, {cancel: false})
    await flushPromises()
    expect(backend.resultCalls).toBe(1)
    if (requestId === 'REQ') {
      expect(f.wrapper.text()).toContain('文件与规则核验明细')
    } else {
      expect(f.wrapper.text()).toContain('服务返回的原任务与历史记录不一致')
      expect(f.wrapper.text()).not.toContain('文件与规则核验明细')
    }
    expect(backend.saves).toHaveLength(0)
  })
  it('saves a new enabled rule under its native ID and reopens it',async()=>{
    const load=vi.spyOn(LowcodePdfInspect,'loadCatalog')
    const f=await open('P1',true)
    await vi.waitFor(()=>expect(f.wrapper.text()).toContain('新增规则'))
    await f.click('新增规则')
    await vi.waitFor(()=>expect(f.wrapper.findComponent(FeatureRecordDialog).exists()).toBe(true))
    const ds=await load.mock.results[0]!.value,view=ds.getView('Base_FileInspectConfig','creation')!
    const id=[...view.dirtyTracking.pendingCreateIds][0]!
    expect(typeof id).toBe('string')
    view.updateEditingValue(id,'name','新核验规则')
    view.updateEditingValue(id,'rule_config',ruleText('new'))
    view.updateEditingValue(id,'enabled',1)
    f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确定')!.vm.$emit('click')
    await flushPromises()
    await vi.waitFor(()=>expect(state.http.records['Base_FileInspectConfig']?.some(row=>row['id']===id&&row['enabled']===1)).toBe(true))
    expect(state.http.saves).toHaveLength(1)
    await f.router.push({path:'/editor',query:{ruleId:String(id)}})
    await flushPromises()
    await vi.waitFor(()=>expect(f.wrapper.getComponent(SparkJsonEditor).props('modelValue')).toBe(ruleText('new')))
    load.mockRestore()
  })
  it('creates a native rule draft and cancels without a write',async()=>{
    const f=await open('P1',true)
    await vi.waitFor(()=>expect(f.wrapper.text()).toContain('新增规则'))
    await f.click('新增规则')
    await vi.waitFor(()=>expect(f.wrapper.findComponent(FeatureRecordDialog).exists()).toBe(true))
    expect(state.http.saves).toHaveLength(0)
    f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='取消')!.vm.$emit('click');await flushPromises()
    expect(state.http.saves).toHaveLength(0)
  })
  it('hosts the PDF design runtime through the shared native session', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page.vue'), 'utf8')
    expect(source).toContain('new NativePageRuntimeSession')
    expect(source).toContain('session.isCurrent(current)')
    expect(source).toContain('scenarioInputs: {[scene]: {ruleId: id}}')
    expect(source).not.toContain('new PageRuntime')
  })
  it('preserves a malformed existing rule when only the name is changed', async () => {
    state.http.records['Base_FileInspectConfig']![0]!['rule_config'] = '{legacy-invalid'
    const f = await open()
    await vi.waitFor(() => expect(f.wrapper.findComponent(SparkJsonEditor).exists()).toBe(true))
    expect(f.wrapper.getComponent(SparkJsonEditor).props('modelValue')).toBe('{legacy-invalid')
    const name = f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'name')!
    await name.get('input').setValue('重命名'); await flushPromises(); await f.click('保存规则')
    expect(state.http.saves[0]!.changed[0]).not.toHaveProperty('rule_config')
    expect(state.http.records['Base_FileInspectConfig']![0]!['rule_config']).toBe('{legacy-invalid')
  })
  it('blocks target changes with unsaved edits and loads the new identity only after cancellation', async () => {
    const f = await open()
    await vi.waitFor(() => expect(f.wrapper.findComponent(SparkJsonEditor).exists()).toBe(true))
    f.wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', '{"pending":true}'); await flushPromises()
    await f.router.push({path: '/editor', query: {ruleId: 'P2'}})
    expect(f.router.currentRoute.value.query['ruleId']).toBe('P1')
    await f.click('取消修改')
    await f.router.push({path: '/editor', query: {ruleId: 'P2'}}); await flushPromises()
    await vi.waitFor(() => expect(f.wrapper.getComponent(SparkJsonEditor).props('modelValue')).toContain('other'))
    expect(state.http.saves).toEqual([])
  })
  it('edits the bound rule_config and saves only the selected formal primary key', async () => {
    const f = await open()
    await vi.waitFor(() => expect(f.wrapper.findComponent(FieldJson).exists()).toBe(true))
    expect(f.wrapper.getComponent(FieldJson).props('field')).toBe('rule_config')
    expect(f.wrapper.getComponent(SparkJsonEditor).props('modelValue')).toContain('old')
    f.wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', ruleText('new')); await flushPromises()
    await f.click('保存规则')
    expect(state.http.saves.map(save => save.table)).toEqual(['Base_FileInspectConfig'])
    expect(state.http.saves[0]!.changed).toEqual([expect.objectContaining({id: 'P1', rule_config: ruleText('new')})])
    expect(state.http.records['Base_FileInspectConfig']![1]!['rule_config']).toBe('{"other":true}')
  })
  it('cancels invalid editor input without clearing the stored rule', async () => {
    const f = await open()
    await vi.waitFor(() => expect(f.wrapper.findComponent(SparkJsonEditor).exists()).toBe(true))
    f.wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', '{'); await flushPromises()
    expect(f.wrapper.findAll('button').find(button => button.text() === '保存规则')!.attributes('disabled')).toBeDefined()
    await f.click('取消修改')
    expect(f.wrapper.getComponent(SparkJsonEditor).props('modelValue')).toContain('old')
    expect(state.http.saves).toEqual([])
  })
  it('does not expose an editable form for a missing formal target', async () => {
    const f = await open('MISSING')
    await vi.waitFor(() => expect(f.wrapper.text()).toContain('当前规则不存在'))
    expect(f.wrapper.findComponent(FieldJson).exists()).toBe(false)
    expect(state.http.saves).toEqual([])
  })
  it('confirms an unknown save through the same owner without replaying writes', async () => {
    const f = await open()
    await vi.waitFor(() => expect(f.wrapper.findComponent(SparkJsonEditor).exists()).toBe(true))
    f.wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', ruleText('committed')); await flushPromises()
    state.http.failAfterWrite = true; await f.click('保存规则')
    expect(state.http.saves).toHaveLength(1)
    await f.click('核验保存结果')
    expect(state.http.saves).toHaveLength(1)
    expect(f.wrapper.text()).not.toContain('保存结果尚未确认')
  })
})
