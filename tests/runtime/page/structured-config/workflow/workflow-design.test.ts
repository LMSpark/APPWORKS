import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount,config,type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {FieldText,RendererGraph,Spark,registerAllRenderers} from '@spark-appworks/spark-component'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import WorkflowDesign from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page.vue'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from './workflow-native-design.fixture'
const state=vi.hoisted(()=>({http:undefined as unknown as ApiBackend,runtime:undefined as unknown as DataSpaceRuntimeApi,dirty:[] as Array<{isDirty:boolean}>}))
vi.mock('@spark-appworks/spark-app',()=>({useSystemPageDirtySource:(source:{isDirty:boolean})=>state.dirty.push(source)}))
vi.mock('@/lowcode/lowcode-runtime',()=>({get lowcodeHttp(){return state.http},lowcodeDesignFileUpload:async()=>{throw new Error('unexpected upload')},createLowcodeProjectGateways:()=>({scenarioViews:{readText:async(id:string)=>id===WORKFLOW_DESIGN?workflowDesignText:null}}),lowcodeApi:{readRequestScope:()=>({token:'scope',headers:{'X-AppId':'APP'}}),dataSpace:{get runtime(){return state.runtime},design:{readSpaceDefinition:async({dataSpaceId}:{dataSpaceId:string})=>({dataSpaceId,name:'工作流设计'}),readModelBatch:async()=>workflowDesignModels(),readRelations:async()=>[]}}}}))
const wrappers:VueWrapper[]=[],original={...config.global.stubs}
beforeEach(()=>{
 state.dirty=[];state.http=new ApiBackend();state.http.records={Base_WorkflowDefinition:[{rowid:'W1',name:'当前流程'}],Base_WorkflowNodeDefinition:[{rowid:'N1',workflow_id:'W1',name:'查询订单',node_type:'query'},{rowid:'N2',workflow_id:'W2',name:'其他节点'}],Base_WorkflowConnectors:[{rowid:'E1',workflow_id:'W1',sourceID:'N1',targetID:'N1',name:'原连线'}]}
 state.runtime=new DataSpaceRuntimeApi({http:state.http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})});registerAllRenderers();config.global.stubs={...original,RendererGraph:true}
})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());config.global.stubs=original})
async function open(workflowId='W1'){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/design',component:WorkflowDesign,meta:{blueprintScenarioId:'5E9676B1E38860B023921F48FB4370DE'}},{path:'/other',component:{template:'<div>other</div>'}}]})
 await router.push({path:'/design',query:{workflowId}});await router.isReady()
 const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper);await flushPromises()
 const click=async(label:string)=>{const b=wrapper.findAll('button').find(b=>b.text()===label);expect(b,label).toBeDefined();await b!.trigger('click');await flushPromises()}
 return {wrapper,router,click}
}
describe('workflow formal design page',()=>{
 it('binds graph nodes and connectors to the independent formal scene and saves only node edits',async()=>{
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  const graph=f.wrapper.getComponent(RendererGraph)
  expect(graph.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_WorkflowNodeDefinition@default`)
  expect(graph.props('edgeDataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_WorkflowConnectors@default`)
  graph.props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const name=f.wrapper.findAllComponents(FieldText).find(field=>field.props('dataViewKey')?.includes('@Base_WorkflowNodeDefinition@')&&field.props('field')==='name')!
  await name.get('input').setValue('查询正式订单');await flushPromises();expect(state.dirty[0]?.isDirty).toBe(true)
  await f.click('保存节点');expect(state.http.saves.map(s=>s.table)).toEqual(['Base_WorkflowNodeDefinition'])
  expect(state.http.records['Base_WorkflowNodeDefinition']?.find(r=>r['rowid']==='N1')?.['name']).toBe('查询正式订单')
  expect(state.http.records['Base_WorkflowNodeDefinition']?.find(r=>r['rowid']==='N2')?.['name']).toBe('其他节点')
 })
 it('blocks target replacement with node edits and restores the native baseline on cancel',async()=>{
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const name=f.wrapper.findAllComponents(FieldText).find(field=>field.props('dataViewKey')?.includes('@Base_WorkflowNodeDefinition@')&&field.props('field')==='name')!
  await name.get('input').setValue('待取消');await flushPromises()
  await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/design')
  const event={kind:'edge' as const,id:'E1',open:true,control:{cancel:false}}
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.(event);expect(event.control.cancel).toBe(true)
  await f.click('取消节点修改');expect(name.get('input').element.value).toBe('查询订单');expect(state.http.saves).toEqual([])
  await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/other')
 })
 it('recovers an unknown node save without replaying the write',async()=>{
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const name=f.wrapper.findAllComponents(FieldText).find(field=>field.props('dataViewKey')?.includes('@Base_WorkflowNodeDefinition@')&&field.props('field')==='name')!
  await name.get('input').setValue('已提交待回读');await flushPromises();state.http.failAfterWrite=true;await f.click('保存节点')
  expect(state.http.saves).toHaveLength(1)
  expect(f.wrapper.findAll('button').find(b=>b.text()==='取消节点修改')?.attributes('disabled')).toBeDefined()
  await f.click('核验节点保存结果');expect(state.http.saves).toHaveLength(1);expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it('does not load node or connector views for a missing target',async()=>{
  const f=await open('MISSING');await vi.waitFor(()=>expect(f.wrapper.text()).toContain('当前工作流不存在'))
  expect(state.http.reads.map(r=>r.table)).toEqual(['Base_WorkflowDefinition']);expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(false)
 })
})
