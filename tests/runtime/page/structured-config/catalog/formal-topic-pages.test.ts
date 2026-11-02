import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {RendererTable, RendererDialog, RendererButton, RendererForm, FieldText, FieldSelect, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import Workflow from '@/views/features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page.vue'
vi.mock('@/views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page.vue',()=>({default:{name:'WorkflowEditorStub',props:['rowid'],data:()=>({hasPending:false,busy:false,unconfirmed:false}),methods:{discardChanges(this:{hasPending:boolean}){this.hasPending=false;return true}},template:'<div>workflow-editor</div>'}}))
import Excel from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page.vue'
import Pdf from '@/views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page.vue'
import {WORKFLOW, EXCEL, PDF, topicModels, topicTexts} from './formal-topic.fixture'
vi.mock('@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page.vue', () => ({default: {name:'ExcelEditorStub',props:['schemeRowid'],template:'<div data-excel-editor>{{schemeRowid}}</div>'}}))
vi.mock('@spark-appworks/spark-app', () => ({useSystemPageDirtySource: () => {}}))
const state = vi.hoisted(() => ({http: undefined as unknown as ApiBackend, runtime: undefined as unknown as DataSpaceRuntimeApi,appId:'D99A1DCE9894698799101EFD70F8FC76'}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return state.http}, lowcodeDesignFileUpload: async () => {throw new Error('unexpected upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => topicTexts[id] ?? null}}),
  lowcodeApi: {readRequestScope: () => ({token: `scope:${state.appId}`, headers: {'X-AppId': state.appId}}), dataSpace: {
    get runtime() {return state.runtime}, design: {
      readSpaceDefinition: async ({dataSpaceId}: {dataSpaceId: string}) => ({dataSpaceId, name: 'formal topic'}),
      readModelBatch: async ({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) => topicModels(dataSpaceId).filter(model => metaNames.includes(model.metaName)),
      readRelations: async () => [],
    },
  }},
}))
const original = {...config.global.stubs}, wrappers: VueWrapper[] = []
beforeEach(() => {
  state.appId='D99A1DCE9894698799101EFD70F8FC76'
  state.http = new ApiBackend(); state.http.primaryKeys['Base_FileInspectConfig'] = 'id'
  state.http.records = {
    Base_WorkflowDefinition: [{rowid: 'W1', name: '入库流程', workflow_key: 'INBOUND', description: '正式流程', status: '1'}],
    workflowStatus: [{rowid: 'STATUS1', val: '1', txt: '已启用', ordIdx: 1}],
    Base_Import_solution: [{rowid: 'E1', coding: 'EXCEL1', solutionName: '订单导入', description: '正式方案', dataSetId: 'S1', createuser: 'U1'}],
    Base_DataSet: [{rowid: 'S1', Name: '订单空间'}], Base_UserInfo: [{ID: 'USER1', ROWID: 'U1', UserName: '张三'}],
    Base_FileInspectConfig: [{id: 'P1', name: '发票规则', description: '正式PDF规则', enabled: 1}],
  }
  state.runtime = new DataSpaceRuntimeApi({http: state.http, readScope: () => ({token: `scope:${state.appId}`, headers: {'X-AppId': state.appId}})})
  registerAllRenderers()
  const stubs = {...original}; for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[key]
  config.global.stubs = stubs
})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); config.global.stubs = original})
describe('formal topic catalog pages', () => {
  it.each(['confirmed','lost-receipt','invalid-name','scope-changed','catalog-refresh-failed','status-selection'])('edits and cancels an existing definition with %s without touching other definitions',async outcome=>{
    state.http.records['Base_WorkflowDefinition']![0]!['version']='1'
    state.http.records['Base_WorkflowDefinition']![0]!['status']=2
    state.http.records['workflowStatus']=[{rowid:'STATUS1',val:1,txt:'已启用',ordIdx:1},{rowid:'STATUS2',val:2,txt:'停用',ordIdx:2}]
    state.http.records['Base_WorkflowDefinition']!.push({rowid:'W2',name:'另一个流程',workflow_key:'KEEP',status:'1',version:'1'})
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Workflow,meta:{blueprintScenarioId:WORKFLOW}},{path:'/other',component:{template:'<div>other</div>'}}]})
    await router.push('/catalog');await router.isReady()
    const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.text()).toContain('入库流程'))
    const click=async(label:string)=>{const button=wrapper.findAllComponents(RendererButton).find(button=>button.props('label')===label);expect(button,label).toBeDefined();expect(button!.props('disabled')).not.toBe(true);button!.vm.$emit('click');await flushPromises()}
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click');await flushPromises();await click('编辑定义')
    await vi.waitFor(()=>expect(wrapper.getComponent(RendererDialog).props('title')).toBe('映射信息设置'))
    await vi.waitFor(()=>expect(wrapper.findComponent(RendererForm).exists()).toBe(true))
    const field=()=>wrapper.getComponent(RendererForm).findAllComponents(FieldText).find(item=>item.props('field')==='name')!
    await field().get('input').setValue('待取消');await flushPromises()
    await router.push('/other');expect(router.currentRoute.value.path).toBe('/catalog')
    await click('取消定义修改')
    expect(field().get('input').element.value).toBe('入库流程');expect(state.http.saves).toEqual([])
    await field().get('input').setValue(outcome==='invalid-name'?'   ':'正式修改');await flushPromises()
    if(outcome==='status-selection'){
      const status=wrapper.getComponent(RendererForm).getComponent(FieldSelect)
      await status.get('.el-select__wrapper').trigger('click');await flushPromises()
      const option=status.findAllComponents({name:'ElOption'}).find(item=>item.props('label')==='已启用')!
      expect(option).toBeDefined();await option.trigger('click');await flushPromises()
    }
    if(outcome==='lost-receipt')state.http.failAfterWrite=true
    if(outcome==='scope-changed')state.appId='OTHER_APP'
    if(outcome==='catalog-refresh-failed')state.http.beforeSave=async()=>{vi.spyOn(state.runtime,'executeQuery').mockRejectedValueOnce(Error('目录读取失败'))}
    await click('保存定义')
    if(outcome==='scope-changed'){expect(state.http.saves).toEqual([]);return}
    if(outcome==='invalid-name'){
      expect(state.http.saves).toEqual([]);await click('取消定义修改');expect(field().get('input').element.value).toBe('入库流程');return
    }
    if(outcome==='catalog-refresh-failed'){
      expect(wrapper.text()).toContain('定义保存已确认，目录刷新失败')
      expect(state.http.saves).toHaveLength(1);await click('保存定义');expect(state.http.saves).toHaveLength(1)
    }
    if(outcome==='lost-receipt'){
      expect(wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(true)
      expect(wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='取消定义修改')!.props('disabled')).toBe(true)
      await router.push('/other');expect(router.currentRoute.value.path).toBe('/catalog')
      await click('核验定义保存结果')
    }
    expect(state.http.saves).toHaveLength(1)
    expect(state.http.saves[0]?.changed).toEqual([expect.objectContaining({rowid:'W1',name:'正式修改'})])
    expect(state.http.records['Base_WorkflowDefinition']!.find(row=>row['rowid']==='W2')?.['name']).toBe('另一个流程')
    expect(state.http.records['Base_WorkflowDefinition']!.find(row=>row['rowid']==='W1')?.['status']).toBe(outcome==='status-selection'?'1':2)
    expect(wrapper.getComponent(RendererTable).text()).toContain('正式修改')
  })
  it('does not open a nonexistent workflow or allocate a random identity for unsupported creation',async()=>{
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Workflow,meta:{blueprintScenarioId:WORKFLOW}}]})
    await router.push('/catalog');await router.isReady()
    const wrapper=mount(Workflow,{global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.text()).toContain('入库流程'))
    await wrapper.findAll('button').find(button=>button.text()==='新增工作流')!.trigger('click');await flushPromises()
    expect(wrapper.findComponent({name:'WorkflowEditorStub'}).exists()).toBe(false)
    expect(wrapper.text()).toContain('业务编码生成能力尚未确认')
    expect(state.http.saves).toEqual([])
  })
  it.each(['dirty','busy','unknown'])('guards the workflow dialog while %s and permits only a safe explicit discard',async kind=>{
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Workflow,meta:{blueprintScenarioId:WORKFLOW}}]})
    await router.push('/catalog');await router.isReady()
    const wrapper=mount(Workflow,{global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.text()).toContain('入库流程'))
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click');await flushPromises()
    await wrapper.findAll('button').find(button=>button.text()==='打开设计')!.trigger('click');await flushPromises()
    const editor=wrapper.getComponent({name:'WorkflowEditorStub'})
    await editor.setData({hasPending:kind!=='busy',busy:kind==='busy',unconfirmed:kind==='unknown'})
    expect(wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(true)
    wrapper.getComponent(RendererDialog).vm.$emit('update:modelValue',false);await flushPromises()
    expect(wrapper.findComponent({name:'WorkflowEditorStub'}).exists()).toBe(true)
    const discard=wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='放弃修改并关闭')
    if(kind==='dirty'){
      expect(discard?.props('disabled')).toBe(false);discard!.vm.$emit('click');await flushPromises()
      expect(wrapper.findComponent({name:'WorkflowEditorStub'}).exists()).toBe(false)
    }else if(kind==='unknown')expect(discard?.props('disabled')).toBe(true)
    expect(state.http.saves).toEqual([])
  })
  it.each([
    [Workflow, WORKFLOW, '入库流程', 'workflowId', 'W1', 'Base_WorkflowDefinition'],
    [Excel, EXCEL, '订单导入', 'importConfigId', 'E1', 'Base_Import_solution'],
    [Pdf, PDF, '发票规则', 'ruleId', 'P1', 'Base_FileInspectConfig'],
  ] as const)('renders formal records and passes the original identity downstream for %s', async (page, scenarioId, title, parameter, identity, metaName) => {
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/catalog', component: page, meta: {blueprintScenarioId: scenarioId}}]})
    await router.push('/catalog'); await router.isReady()
    const push = vi.spyOn(router, 'push')
    const wrapper = mount(page, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}}); wrappers.push(wrapper)
    await vi.waitFor(() => expect(wrapper.text()).toContain(title))
    if (scenarioId === EXCEL) await vi.waitFor(() => expect(wrapper.text()).toContain('订单空间'))
    if (scenarioId === WORKFLOW) await vi.waitFor(() => expect(wrapper.text()).toContain('已启用'))
    const open = () => wrapper.findAll('button').find(button => button.text() === '打开设计')!
    expect(open().attributes('disabled')).toBeDefined()
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click'); await flushPromises()
    await open().trigger('click'); await flushPromises()
    if (scenarioId === EXCEL || scenarioId === WORKFLOW) {
      expect(push).not.toHaveBeenCalled()
      if(scenarioId===EXCEL)expect(wrapper.getComponent({name:'ExcelEditorStub'}).props('schemeRowid')).toBe(identity)
      else expect(wrapper.getComponent({name:'WorkflowEditorStub'}).props('rowid')).toBe(identity)
      expect(router.currentRoute.value.path).toBe('/catalog')
    } else expect(push).toHaveBeenCalledWith(expect.objectContaining({query: {[parameter]: identity}}))
    expect(state.http.reads.some(read => read.table === metaName)).toBe(true)
    if (scenarioId !== EXCEL) expect(state.http.reads.some(read => read.table === 'Base_UserInfo')).toBe(false)
    expect(state.http.saves).toEqual([])
  })
})
