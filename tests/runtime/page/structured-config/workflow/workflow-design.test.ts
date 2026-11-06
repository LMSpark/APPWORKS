import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount,config,type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {FieldText,FieldSelect,FieldJson,FieldNumber,FieldCheckbox,FieldValueFunction,FilterValueFunctionDialog,FilterExpressionEditor,SparkJsonEditor,RendererButton,RendererDialog,RendererTable,RendererGraph,RendererTabs,RendererTabPane,RendererFilterExpression,Spark,registerAllRenderers} from '@spark-appworks/spark-component'
import type {HttpResponse,RequestConfig} from '@spark-appworks/spark-utils'
import {DataViewFilter,DataViewFilterCodec,getSparkNodeChildren,type DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {WorkflowExecutionContext} from '@/lowcode/resources/structured-config/workflow-definition/execution-context'
import {WorkflowConnectorCondition} from '@/lowcode/resources/structured-config/workflow-definition/connector-condition'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import WorkflowDesign from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page.vue'
import WorkflowQueryConfiguration from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-query-configuration.vue'
import WorkflowExecutionPanel from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-execution-panel.vue'
import WorkflowDesignNodePanel from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/node-panel/workflow-design-node-panel.vue'
import WorkflowDesignEdgePanel from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/edge-panel/workflow-design-edge-panel.vue'
import WorkflowSourceEdit from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-query-source-edit.vue'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from './workflow-native-design.fixture'
const state=vi.hoisted(()=>({http:undefined as unknown as ApiBackend,runtime:undefined as unknown as DataSpaceRuntimeApi,dirty:[] as Array<{isDirty:boolean}>,layoutText:null as string|null,uploads:[] as string[],denyLayout:false,loseLayoutReceipt:false}))
vi.mock('@spark-appworks/spark-app',()=>({useSystemPageDirtySource:(source:{isDirty:boolean})=>state.dirty.push(source)}))
vi.mock('@/lowcode/lowcode-runtime',()=>({get lowcodeHttp(){return state.http},lowcodeDesignFileUpload:{uploadWorkingText:async(input:{text:string})=>{state.uploads.push(input.text);state.layoutText=input.text;if(state.loseLayoutReceipt){state.loseLayoutReceipt=false;throw new Error("layout response lost")}return {}}},createLowcodeProjectGateways:()=>({scenarioViews:{readText:async(id:string)=>id===WORKFLOW_DESIGN?workflowDesignText:null}}),lowcodeApi:{design:{readTextFile:async()=>{if(state.denyLayout)throw new LowcodeApiError(403,'布局读取被拒绝');if(state.layoutText===null)throw new LowcodeApiError(404,'missing');return state.layoutText}},readRequestScope:()=>({token:'scope',headers:{'X-AppId':'APP'}}),dataSpace:{get runtime(){return state.runtime},design:{readSpaceDefinition:async({dataSpaceId}:{dataSpaceId:string})=>({dataSpaceId,name:'工作流设计'}),readModelBatch:async()=>workflowDesignModels(),readRelations:async()=>[]}}}}))
const wrappers:VueWrapper[]=[],original={...config.global.stubs}
beforeEach(()=>{
 state.dirty=[];state.layoutText=null;state.uploads=[];state.denyLayout=false;state.loseLayoutReceipt=false;state.http=new ApiBackend();state.http.records={Base_WorkflowDefinition:[{rowid:'W1',name:'当前流程'}],Base_WorkflowNodeDefinition:[{rowid:'N1',workflow_id:'W1',name:'查询订单',position_type:1,node_type:'query',node_config:'M1',dataOperateModId:''},{rowid:'N2',workflow_id:'W2',name:'其他节点'}],Base_WorkflowConnectors:[{rowid:'E1',workflow_id:'W1',sourceID:'N1',targetID:'N1',name:'原连线'}],Base_DataModel:[{rowid:'M1',dataSetId:'W1',Name:'订单模型',MetaName:'Orders'},{rowid:'M2',dataSetId:'W1',Name:'目标模型',MetaName:'Targets'},{rowid:'M3',dataSetId:'W2',Name:'其他流程模型'}],Base_DataModel_Field:[{rowid:'F1',dataSetId:'W1',dataModelId:'M1',Name:'code',description:'原字段说明'},{rowid:'F2',dataSetId:'W1',dataModelId:'M2',Name:'target'}],Base_DataModel_Relation:[{rowid:'R1',dataSetId:'W1',parentModId:'M1',childModId:'M2',description:'模型关系'}]}
 state.runtime=new DataSpaceRuntimeApi({http:state.http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})});registerAllRenderers();const stubs={...original};for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])Reflect.deleteProperty(stubs,key);config.global.stubs={...stubs,RendererGraph:true,JsonTreeEditor:true}
})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());config.global.stubs=original})
async function open(workflowId='W1'){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/design',component:WorkflowDesign,meta:{blueprintScenarioId:'5E9676B1E38860B023921F48FB4370DE'}},{path:'/other',component:{template:'<div>other</div>'}}]})
 await router.push({path:'/design',query:{workflowId}});await router.isReady()
 const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper);await flushPromises()
 const click=async(label:string)=>{const b=wrapper.findAll('button').find(b=>b.text()===label)??wrapper.findAllComponents(RendererButton).find(b=>b.props('label')===label)?.find('button');expect(b,label).toBeDefined();await b!.trigger('click');await flushPromises()}
 const createNode=async(kind:string,name='新节点')=>{
  await click('新增节点')
  const type=wrapper.findAllComponents(FieldSelect).find(field=>field.props('field')==='node_type')!
  expect(type).toBeDefined();type.getComponent({name:'ElSelect'}).vm.$emit('update:modelValue',kind);await flushPromises()
  const title=wrapper.findAllComponents(FieldText).find(field=>field.props('label')==='节点名称')!
  await title.get('input').setValue(name);await flushPromises()
 }
  const text=()=>[wrapper.text(),...wrapper.findAllComponents(WorkflowDesignNodePanel).map(panel=>panel.text()),...wrapper.findAllComponents(WorkflowDesignEdgePanel).map(panel=>panel.text())].join('')
 const inputs=()=>[...wrapper.findAll('input'),...wrapper.findAllComponents(WorkflowDesignNodePanel).flatMap(panel=>panel.findAll('input')),...wrapper.findAllComponents(WorkflowDesignEdgePanel).flatMap(panel=>panel.findAll('input'))]
 const buttons=()=>[...wrapper.findAll('button'),...wrapper.findAllComponents(WorkflowDesignNodePanel).flatMap(panel=>panel.findAll('button')),...wrapper.findAllComponents(WorkflowDesignEdgePanel).flatMap(panel=>panel.findAll('button'))]
 return {wrapper,router,click,createNode,text,inputs,buttons}
}
class ExecutionBackend extends ApiBackend{
 readonly executions:RequestConfig[]=[]
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  if(request.url!=='/api/Workflow/runSingleNodeTest'&&request.url!=='/api/Workflow/runWorkflowTest')return super.executeRequest(request)
  this.executions.push(request)
  return {data:{Code:200,Result:{workflowId:'W1',nodeId:'N1',status:'SUCCESS',count:1,output:[{value:0}]}},status:200,statusText:'OK',headers:{}}
 }
}
describe('workflow formal design page',()=>{
 it.each(['button','dataSet'] as const)('rejects changed ancestor declarations after asynchronous execution preflight before dispatch through %s',async entry=>{
  const backend=new ExecutionBackend();backend.records=state.http.records;state.http=backend;state.runtime=new DataSpaceRuntimeApi({http:backend,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
  backend.records['Base_WorkflowNodeDefinition']!.push({rowid:'START',workflow_id:'W1',position_type:0,node_type:'API_CALL',output_mapping:JSON.stringify([{rowid:'P',pid:null,Name:'oldValue',FieldType:'string',isParent:false}])});backend.records['Base_WorkflowConnectors']=[{rowid:'SN',workflow_id:'W1',sourceID:'START',targetID:'N1',params:'[]'}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises();await f.click('测试当前节点')
  const ds=f.wrapper.getComponent(WorkflowExecutionPanel).props('dataSet'),original=WorkflowExecutionContext.prototype.validateNode;let release!:()=>void,arrived!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve}),entered=new Promise<void>(resolve=>{arrived=resolve})
  const validationSpy=vi.spyOn(WorkflowExecutionContext.prototype,'validateNode').mockImplementation(async function(this:WorkflowExecutionContext,...args){await original.apply(this,args);arrived();await gate})
  const saving=entry==='dataSet'?ds.saveChanges({views:[{tableName:'WorkflowExecution',viewId:'default'}]}).catch(cause=>cause as Error):undefined
  if(entry==='button')await f.click('执行测试');await entered;backend.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='START')!['output_mapping']=JSON.stringify([{rowid:'P',pid:null,Name:'newValue',FieldType:'string',isParent:false}]);await ds.getView('Base_WorkflowNodeDefinition')!.refresh();release();if(saving)expect(await saving).toBeInstanceOf(Error);await flushPromises();validationSpy.mockRestore()
  expect(backend.executions).toHaveLength(0);if(entry==='button')expect(document.body.textContent).toContain('测试参数声明已变化');await f.click('取消测试输入')
 })
 it('rejects changed parameter query context while retaining the original field declaration',async()=>{
  const backend=new ExecutionBackend();backend.records=state.http.records;state.http=backend;state.runtime=new DataSpaceRuntimeApi({http:backend,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
  backend.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:JSON.stringify([{rowid:'P',Name:'title',FieldType:'string',Value:'original'}])}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));await f.click('测试')
  const ds=f.wrapper.getComponent(WorkflowExecutionPanel).props('dataSet'),params=ds.getView('Base_DataSet')!;params.queryContext={...params.queryContext,contractVersion:'changed'}
  await f.click('执行测试');expect(backend.executions).toHaveLength(0);expect(document.body.textContent).toContain('测试参数查询上下文已变化');await f.click('取消测试输入')
 })
 it('rejects replacing the captured command target through direct DataSet saving',async()=>{
  const backend=new ExecutionBackend();backend.records=state.http.records;state.http=backend;state.runtime=new DataSpaceRuntimeApi({http:backend,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
  backend.records['Base_WorkflowConnectors']=[];backend.records['Base_WorkflowNodeDefinition']!.push({rowid:'N2_VALID',workflow_id:'W1',position_type:1,node_type:'query',name:'另一个查询',node_config:'M1',dataOperateModId:''})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises();await f.click('测试当前节点')
  const ds=f.wrapper.getComponent(WorkflowExecutionPanel).props('dataSet'),view=ds.getView('WorkflowExecution')!,id=String(view.getPkKey(view.currentRow!));view.updateEditingValue(id,'nodeId','N2_VALID')
  await expect(ds.saveChanges({views:[{tableName:'WorkflowExecution',viewId:'default'}]})).rejects.toThrow('测试命令身份与首轮输入不符');expect(backend.executions).toHaveLength(0);await f.click('取消测试输入')
 })
 it('rejects directly saving an execution request without an opened input contract',async()=>{
  const backend=new ExecutionBackend();backend.records=state.http.records;state.http=backend;state.runtime=new DataSpaceRuntimeApi({http:backend,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));const ds=f.wrapper.getComponent(WorkflowExecutionPanel).props('dataSet'),view=ds.getView('WorkflowExecution')!;await view.refresh();await view.addRow({mode:'node',nodeId:'N1',input:'{}'})
  await expect(ds.saveChanges({views:[{tableName:'WorkflowExecution',viewId:'default'}]})).rejects.toThrow('测试命令身份与首轮输入不符');expect(backend.executions).toHaveLength(0);view.discardPendingChanges()
 })
 it('isolates current node saves from unfinished merge input drafts outside its id scope',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']!.push({rowid:'FOREIGN',workflow_id:'W1',position_type:1,node_type:'merge',name:'其他合并',node_config:'',dataOperateModId:'',input_mapping:'[]',output_mapping:'[]',config:''})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const ds=f.wrapper.getComponent(WorkflowSourceEdit).props('dataSet'),nodes=ds.getView('Base_WorkflowNodeDefinition')!;nodes.updateEditingValue('FOREIGN','input_mapping','{')
  const name=f.wrapper.findAllComponents(FieldText).find(item=>item.props('label')==='节点名称')!;await name.get('input').setValue('仅本节点更新');await flushPromises();await f.click('保存节点')
  expect(state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='N1')?.['name']).toBe('仅本节点更新');expect(nodes.getEditingRow('FOREIGN')?.['input_mapping']).toBe('{');expect(state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='FOREIGN')?.['input_mapping']).toBe('[]');expect(f.wrapper.findComponent(WorkflowDesign).vm.discardChanges()).toBe(true)
 })
 it('edits structured test values as native arrays and objects through standard JSON child fields',async()=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:JSON.stringify([{rowid:'A',Name:'tags',FieldType:'Array',Value:[1,2]},{rowid:'O',Name:'options',FieldType:'object',Value:{x:1}}])}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));await f.click('测试');const input=f.wrapper.findAllComponents(FieldJson).find(item=>item.props('field')==='input')!
  expect(getSparkNodeChildren(input.props('children')).map(child=>[child.type,child.props?.['valueFormat']])).toEqual([['r-json','native'],['r-json','native']])
  await input.get('tbody tr').trigger('click');await input.get('[data-json-edit]').trigger('click');await flushPromises()
  input.findAllComponents(FieldJson).find(item=>item.props('label')==='tags')!.getComponent(SparkJsonEditor).vm.$emit('update:modelValue','[3,4]');input.findAllComponents(FieldJson).find(item=>item.props('label')==='options')!.getComponent(SparkJsonEditor).vm.$emit('update:modelValue','{"x":2}');await flushPromises();await input.get('[data-json-save-row]').trigger('click');await flushPromises()
  const view=f.wrapper.getComponent(WorkflowExecutionPanel).props('dataSet').getView('WorkflowExecution')!,id=String(view.getPkKey(view.currentRow!));expect(JSON.parse(String(view.getEditingRow(id)?.['input']))).toEqual([{tags:[3,4],options:{x:2}}]);await f.click('取消测试输入')
 })
 it('can enter explicit null in per-field JSON value mode without a whole-request raw editor',async()=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:JSON.stringify([{rowid:'P',Name:'title',FieldType:'string',Value:'original'}])}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));await f.click('测试');await f.click('按JSON值编辑');const input=f.wrapper.findAllComponents(FieldJson).find(item=>item.props('field')==='input')!
  await input.get('tbody tr').trigger('click');await input.get('[data-json-edit]').trigger('click');await flushPromises();input.findAllComponents(FieldJson).find(item=>item.props('label')==='title')!.getComponent(SparkJsonEditor).vm.$emit('update:modelValue','null');await flushPromises();await input.get('[data-json-save-row]').trigger('click');await flushPromises()
  const view=f.wrapper.getComponent(WorkflowExecutionPanel).props('dataSet').getView('WorkflowExecution')!,id=String(view.getPkKey(view.currentRow!));expect(JSON.parse(String(view.getEditingRow(id)?.['input']))).toEqual([{title:null}]);await f.click('取消测试输入')
 })
 it('retains one query-input instance, source command and original node draft across configuration tabs',async()=>{
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const configuration=f.wrapper.getComponent(WorkflowQueryConfiguration),source=f.wrapper.getComponent(WorkflowSourceEdit),ds=configuration.props('dataSet'),nodes=ds.getView('Base_WorkflowNodeDefinition')!,tabs=f.wrapper.getComponent(RendererTabs)
  const name=f.wrapper.findAllComponents(FieldText).find(item=>item.props('label')==='节点名称')!;await name.get('input').setValue('跨页签草稿');await flushPromises();const reads=state.http.reads.length
  tabs.vm.$emit('update:modelValue','conditions');await flushPromises();tabs.vm.$emit('update:modelValue','output');await flushPromises();tabs.vm.$emit('update:modelValue','model');await flushPromises()
  expect(f.wrapper.getComponent(WorkflowQueryConfiguration).vm.$.uid).toBe(configuration.vm.$.uid);expect(f.wrapper.getComponent(WorkflowSourceEdit).vm.$.uid).toBe(source.vm.$.uid);expect(ds.getView('Base_WorkflowNodeDefinition')).toBe(nodes);expect(nodes.getEditingRow('N1')?.['name']).toBe('跨页签草稿');expect(state.http.reads).toHaveLength(reads);expect(state.http.saves).toHaveLength(0);await f.click('取消节点修改')
 })
 it('saves only the current node id and preserves a foreign draft in the same view',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']!.push({rowid:'FOREIGN',workflow_id:'W1',position_type:1,node_type:'query',name:'其他节点',node_config:'',dataOperateModId:''})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const ds=f.wrapper.getComponent(WorkflowSourceEdit).props('dataSet'),nodes=ds.getView('Base_WorkflowNodeDefinition')!;nodes.updateEditingValue('FOREIGN','name','范围外草稿')
  const name=f.wrapper.findAllComponents(FieldText).find(item=>item.props('label')==='节点名称')!;await name.get('input').setValue('本节点修改');await flushPromises();await f.click('保存节点')
  expect(state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='N1')?.['name']).toBe('本节点修改');expect(state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='FOREIGN')?.['name']).toBe('其他节点');expect(nodes.getEditingRow('FOREIGN')?.['name']).toBe('范围外草稿');expect(state.dirty[0]?.isDirty).toBe(true);expect(f.wrapper.findComponent(WorkflowDesign).vm.discardChanges()).toBe(true)
 })
 it('preserves zero and false defaults in one workflow business row',async()=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:JSON.stringify([{rowid:'P1',Name:'quantity',FieldType:'int',Value:0},{rowid:'P2',Name:'enabled',FieldType:'boolean',Value:false}])}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));await f.click('测试');const ds=f.wrapper.getComponent(WorkflowExecutionPanel).props('dataSet'),view=ds.getView('WorkflowExecution')!,row=view.currentRow!
  expect(JSON.parse(String(view.getEditingRow(String(view.getPkKey(row)))?.['input']))).toEqual([{quantity:0,enabled:false}]);const input=f.wrapper.findAllComponents(FieldJson).find(item=>item.props('field')==='input')!;expect(getSparkNodeChildren(input.props('children')).map(child=>child.type)).toEqual(['r-number','r-checkbox']);await f.click('取消测试输入')
 })
 it('does not reset the initial test declaration contract when formal parameters refresh',async()=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:JSON.stringify([{rowid:'P',Name:'name',FieldType:'string',Value:'FIRST'}])}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));await f.click('测试');const ds=f.wrapper.getComponent(WorkflowExecutionPanel).props('dataSet'),view=ds.getView('WorkflowExecution')!,row=view.currentRow!,id=String(view.getPkKey(row))
  state.http.records['Base_DataSet']![0]!['inputParams']=JSON.stringify([{rowid:'P',Name:'renamed',FieldType:'string',Value:'SECOND'}]);await ds.getView('Base_DataSet')!.refresh();await flushPromises();await f.click('执行测试')
  expect(document.body.textContent).toContain('测试参数声明已变化');expect(JSON.parse(String(view.getEditingRow(id)?.['input']))).toEqual([{name:'FIRST'}]);expect(state.http.saves).toHaveLength(0);await f.click('取消测试输入')
 })
 it('edits two workflow declarations in one original request business row and cancels without execution',async()=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:JSON.stringify([{rowid:'P1',Name:'rowid',FieldType:'string',Value:'ROW_1'},{rowid:'P2',Name:'name',FieldType:'string',Value:'DEFAULT'}])}]
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'START',workflow_id:'W1',position_type:0,node_type:'API_CALL',output_mapping:'[]'}];state.http.records['Base_WorkflowConnectors']=[]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));await f.click('测试')
  const dialog=f.wrapper.findAllComponents(RendererDialog).find(item=>item.props('title')==='工作流运行测试');expect(dialog?.props('modelValue')).toBe(true)
  const json=f.wrapper.findAllComponents(FieldJson).find(item=>item.props('field')==='input'&&item.props('mode')==='rows')!;expect(json).toBeDefined()
  expect(getSparkNodeChildren(json.props('children')).map(child=>child.props?.['field'])).toEqual(['rowid','name']);expect(f.wrapper.findAllComponents(FieldJson).some(item=>item.props('field')==='input'&&item.props('mode')==='text')).toBe(false)
  const ds=f.wrapper.getComponent(WorkflowExecutionPanel).props('dataSet'),key=String(json.props('dataViewKey')).split('@'),view=ds.getView(key[1]!,key[2]!)!,row=view.currentRow!,id=String(view.getPkKey(row))
  expect(JSON.parse(String(view.getEditingRow(id)?.['input']))).toEqual([{rowid:'ROW_1',name:'DEFAULT'}])
  await json.get('tbody tr').trigger('click');await json.get('[data-json-edit]').trigger('click');await flushPromises()
  const identity=json.findAllComponents(FieldText).find(field=>field.props('label')==='rowid'&&field.find('input').exists())!;expect(identity.get('input').attributes('disabled')).toBeUndefined();expect(identity.get('input').attributes('readonly')).toBeUndefined();await identity.get('input').setValue('ROW_2');await flushPromises();await json.get('[data-json-save-row]').trigger('click');await flushPromises()
  expect(JSON.parse(String(view.getEditingRow(id)?.['input']))).toEqual([{rowid:'ROW_2',name:'DEFAULT'}]);expect(dialog?.props('closeDisabled')).toBe(true)
  await f.click('取消测试输入');expect(view.dirtyTracking.pendingCreateIds.size).toBe(0);expect(state.http.saves).toHaveLength(0)
 })
 it('binds ancestor row arrays to the same node-test input field using original node ids and output aliases',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'START',workflow_id:'W1',name:'开始',position_type:0,node_type:'API_CALL',output_mapping:JSON.stringify([{rowid:'P',pid:null,Name:'enabled',FieldType:'boolean',isParent:false}])},{rowid:'A',workflow_id:'W1',name:'祖先查询',position_type:1,node_type:'query',node_config:'M2',output_mapping:JSON.stringify([{rowid:'ITEMS',pid:null,Name:'items',FieldType:'Array',isParent:true},{rowid:'COUNT',pid:null,Name:'Count',FieldType:'int',isParent:false},{rowid:'F',pid:'ITEMS',Name:'quantityAlias',FieldType:'int',isParent:false}])},{rowid:'N1',workflow_id:'W1',name:'当前查询',position_type:1,node_type:'query',node_config:'M1',dataOperateModId:''}]
  state.http.records['Base_WorkflowConnectors']=[{rowid:'SA',workflow_id:'W1',sourceID:'START',targetID:'A',params:'[]'},{rowid:'AN',workflow_id:'W1',sourceID:'A',targetID:'N1',params:'[]'}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  f.wrapper.getComponent(WorkflowDesignNodePanel).vm.$emit('test');await flushPromises()
  const inputs=f.wrapper.findAllComponents(FieldJson).filter(item=>item.props('field')==='input'&&item.props('mode')==='rows');expect(inputs).toHaveLength(2)
  expect(inputs.map(item=>item.props('valuePath'))).toEqual([['START'],['A']]);expect(inputs.map(item=>item.props('dataViewKey'))).toEqual([`${WORKFLOW_DESIGN}@WorkflowExecution@default`,`${WORKFLOW_DESIGN}@WorkflowExecution@default`])
  expect(inputs.map(item=>getSparkNodeChildren(item.props('children')).map(child=>child.props?.['field']))).toEqual([['enabled'],['quantityAlias']]);inputs[0]!.props('onEditingChange')?.(true);inputs[1]!.props('onEditingChange')?.(true);inputs[0]!.props('onEditingChange')?.(false);await flushPromises();expect(f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='执行测试')?.props('disabled')).toBe(true);inputs[1]!.props('onEditingChange')?.(false);await flushPromises();expect(f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='执行测试')?.props('disabled')).toBe(false);await f.click('取消测试输入');expect(state.http.saves).toHaveLength(0)
 })
 it('selects on one click and opens the reference node dialog only on double click with the original view',async()=>{
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));const graph=f.wrapper.getComponent(RendererGraph)
  const readCount=state.http.reads.filter(read=>read.table==='Base_DataModel').length
  graph.props('onSelect')?.({kind:'node',id:'N1',open:false,control:{cancel:false}});await flushPromises()
  const dialog=()=>f.wrapper.findAllComponents(RendererDialog).find(item=>item.props('title')==='节点设置')
  expect(dialog()?.props('modelValue')).toBe(false);expect(state.http.reads.filter(read=>read.table==='Base_DataModel')).toHaveLength(readCount)
  graph.props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  expect(dialog()?.props('modelValue')).toBe(true);expect(dialog()?.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_WorkflowNodeDefinition@default`)
  expect(f.wrapper.findAllComponents(RendererTabPane).map(pane=>pane.props('label'))).toEqual(expect.arrayContaining(['模型参数','条件参数','节点输出模型']))
  expect(f.wrapper.find('aside').exists()).toBe(false)
 })
 it('opens the relation dialog through the same graph identity and protects its original drafts',async()=>{
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'edge',id:'E1',open:true,control:{cancel:false}});await flushPromises()
  const dialog=f.wrapper.findAllComponents(RendererDialog).find(item=>item.props('title')==='节点关系设置')
  expect(dialog?.props('modelValue')).toBe(true);expect(dialog?.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_WorkflowConnectors@default`)
  const name=f.wrapper.findAllComponents(FieldText).find(field=>field.props('label')==='连线名称')!;await name.get('input').setValue('原边草稿');await flushPromises()
  expect(dialog?.props('closeDisabled')).toBe(true);expect(state.http.saves).toHaveLength(0)
  await f.click('取消连线修改');expect(dialog?.props('closeDisabled')).toBe(false)
 })
 it('keeps the acknowledged boundary readback handle dirty and blocks closing until read-only verification',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']=[];state.http.records['Base_WorkflowConnectors']=[]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));await f.click('补齐缺失边界')
  const request=state.http.request.bind(state.http);let offline=true
  vi.spyOn(state.http,'request').mockImplementation(async config=>{if(offline&&state.http.saves.length&&config.url==='/api/DataOperation/GetData')throw Error('readback offline');return request(config)})
  await f.click('保存边界节点');await vi.waitFor(()=>expect(f.text()).toContain('核验边界保存结果'))
  expect(state.dirty.some(source=>source.isDirty)).toBe(true);expect(f.wrapper.findComponent(WorkflowDesign).vm.discardChanges()).toBe(false)
  await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/design');const count=state.http.saves.length
  offline=false;await f.click('核验边界保存结果');await vi.waitFor(()=>expect(state.dirty.some(source=>source.isDirty)).toBe(false));expect(state.http.saves).toHaveLength(count)
 })
 it('stages missing boundaries through the normal page without writes, cancels, saves and reopens without duplication',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']=[];state.http.records['Base_WorkflowConnectors']=[];state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:'[]'}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));expect(state.http.saves).toHaveLength(0)
  await f.click('补齐缺失边界');expect(state.http.saves).toHaveLength(0);await f.click('取消边界补齐');expect(state.http.records['Base_WorkflowNodeDefinition']).toEqual([])
  await f.click('补齐缺失边界');await f.click('保存边界节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(1))
  expect(state.http.records['Base_WorkflowNodeDefinition']!.map(row=>[row['name'],row['node_type'],row['position_type']])).toEqual([['开始','API_CALL',0],['结束','API_CALL',2]])
  const reopened=await open();await vi.waitFor(()=>expect(reopened.wrapper.findComponent(RendererGraph).exists()).toBe(true));expect(state.http.saves).toHaveLength(1)
  expect(reopened.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='补齐缺失边界')).toBe(false)
 })
 it('rechecks formal connectors before saving a previously selected node type',async()=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:'[]'}];state.http.records['Base_WorkflowConnectors']=[]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  await f.createNode('query','空节点');await f.click('保存节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(1))
  const node=state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['name']==='空节点')!
  const type=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('field')==='node_type')!
  type.getComponent({name:'ElSelect'}).vm.$emit('update:modelValue','merge');await flushPromises()
  state.http.records['Base_WorkflowConnectors']!.push({rowid:'LATE',workflow_id:'W1',sourceID:'N1',targetID:node['rowid'],params:'[]'})
  await f.click('保存节点');expect(f.text()).toContain('已有正式连线');expect(state.http.saves).toHaveLength(1)
  expect(node['node_type']).toBe('query')
 })
 it.each(['query','copy','add','edit','delete','merge'])('saves, reopens, cancels deletion and removes one unbound %s node through the normal page',async kind=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:'[]'}];state.http.records['Base_WorkflowConnectors']=[]
  const models=structuredClone(state.http.records['Base_DataModel']),fields=structuredClone(state.http.records['Base_DataModel_Field'])
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  await f.createNode(kind,'生命周期节点');await f.click('保存节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(1))
  const node=state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['name']==='生命周期节点')!
  expect(node['node_type']).toBe(kind)
  const reopened=await open();await vi.waitFor(()=>expect(reopened.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  reopened.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:String(node['rowid']),open:true,control:{cancel:false}});await flushPromises()
  const label=kind==='merge'?'删除合并节点':kind==='copy'?'删除迁移节点':['add','edit','delete'].includes(kind)?'删除操作节点':'删除查询节点'
  await reopened.click(label);await reopened.click('暂存删除');await reopened.click('取消删除');expect(state.http.saves).toHaveLength(1)
  await reopened.click(label);await reopened.click('暂存删除');await reopened.click('保存删除');await vi.waitFor(()=>expect(state.http.records['Base_WorkflowNodeDefinition']!.some(row=>row['rowid']===node['rowid'])).toBe(false))
  expect(state.http.records['Base_DataModel']).toEqual(models);expect(state.http.records['Base_DataModel_Field']).toEqual(fields)
 })
 it('reports mixed model bindings instead of treating either identity as an empty node',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']![0]!['dataOperateModId']='M2'
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  expect(f.text()).toContain('混合模型绑定');expect(f.text()).not.toContain('模型配置');expect(state.http.saves).toHaveLength(0)
  expect(f.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='选择模型')).toBe(false)
 })
 it.each(['query','copy','add','edit','delete','merge'])('creates one %s node through the sole standard action and cancels without writes',async kind=>{
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  expect(f.wrapper.findAllComponents(RendererButton).filter(button=>/^新增.+节点$/.test(String(button.props('label'))))).toHaveLength(0)
  await f.createNode(kind)
  expect(state.http.saves).toHaveLength(0);expect(state.dirty[0]?.isDirty).toBe(true)
  expect(f.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')===(kind==='merge'?'添加合并根输入':['query','copy'].includes(kind)?'选择模型':'选择目标表'))).toBe(true)
  await f.click('取消节点修改');expect(state.dirty[0]?.isDirty).toBe(false);expect(state.http.saves).toHaveLength(0)
 })
 it('generates merge outputs on the bound node, cancels, saves, and independently reopens the directory',async()=>{
  const output=JSON.stringify([{rowid:'AR',pid:null,Name:'items',FieldType:'Array',isParent:true},{rowid:'AC',pid:null,Name:'Count',FieldType:'int',isParent:false},{rowid:'AF',pid:'AR',Name:'code',FieldType:'varchar',isParent:false}])
  const input=JSON.stringify([{rowid:'A',Name:'源',Fields:[{rowid:'AF',Name:'code',AsName:'result',FieldType:'varchar',Description:'结果',IsOutput:1}]}])
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'合并',node_type:'merge',position_type:1,input_mapping:input,output_mapping:'[]'},
   {rowid:'A',workflow_id:'W1',name:'源',node_type:'query',position_type:1,node_config:'M1',output_mapping:output}]
  state.http.records['Base_WorkflowConnectors']=[{rowid:'AN',workflow_id:'W1',sourceID:'A',targetID:'N1'}];state.http.records['Base_DataModel_Relation']=[]
  const select=async(f:Awaited<ReturnType<typeof open>>)=>{await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()}
  const f=await open();await select(f)
  expect(f.wrapper.findAllComponents(FieldJson).filter(field=>field.props('mode')==='text'&&['input_mapping','output_mapping'].includes(String(field.props('field'))))).toHaveLength(0)
  await f.click('生成输出模型');expect(state.http.saves).toHaveLength(0);expect(state.dirty[0]?.isDirty).toBe(true)
  expect(f.wrapper.findAllComponents(FieldJson).some(field=>field.props('label')==='合并输出模型'&&field.props('readonly')===true)).toBe(true)
  await f.click('取消节点修改');expect(state.dirty[0]?.isDirty).toBe(false)
  await f.click('生成输出模型');await f.click('保存节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(1))
  const expected=[{rowid:'A:AF',pid:null,Name:'result',Description:'结果',FieldType:'varchar',isParent:false}]
  expect(JSON.parse(String(state.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']))).toEqual(expected)
  const reopened=await open();await select(reopened)
  expect(reopened.text()).toContain('result');expect(state.http.saves.every(save=>save.table==='Base_WorkflowNodeDefinition')).toBe(true)
 })
 it('adds root and child merge sources from a bound catalog, cancels, saves, reopens and removes only their input subtree',async()=>{
  const output=(id:string)=>JSON.stringify([{rowid:`${id}ROOT`,pid:null,Name:'items',FieldType:'Array',isParent:true},{rowid:`${id}COUNT`,pid:null,Name:'Count',FieldType:'int',isParent:false},{rowid:`${id}F`,pid:`${id}ROOT`,Name:id==='A'?'publishedAlias':'code',FieldType:'varchar',Description:'已发布字段',isParent:false}])
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'合并',node_type:'merge',position_type:1,input_mapping:'[]',output_mapping:'[]'},
   {rowid:'A',workflow_id:'W1',name:'源A',node_type:'query',position_type:1,node_config:'M1',output_mapping:output('A')},
   {rowid:'B',workflow_id:'W1',name:'源B',node_type:'copy',position_type:1,node_config:'M2',output_mapping:output('B')}]
  state.http.records['Base_WorkflowConnectors']=[{rowid:'AB',workflow_id:'W1',sourceID:'A',targetID:'B'},{rowid:'BN',workflow_id:'W1',sourceID:'B',targetID:'N1'}];state.http.records['Base_DataModel_Relation']=[]
  const selectNode=async(f:Awaited<ReturnType<typeof open>>)=>{await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true));f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()}
  const f=await open();await selectNode(f)
  const add=async(label:string,name:string)=>{
   await f.click(label)
   const table=f.wrapper.findAllComponents(RendererTable).find(table=>String(table.props('dataViewKey')).includes('@optionCatalog_'))!
   expect(table).toBeDefined();const row=table.findAll('tbody tr').find(row=>row.text().includes(name))!;await row.trigger('click');await f.click('确认合并来源')
  }
  await f.click('添加合并根输入');expect(state.dirty[0]?.isDirty).toBe(true)
  const stale=f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确认合并来源')!.vm.$.vnode.props?.['onClick']
  if(typeof stale!=='function')throw Error('missing captured source confirmation')
  await f.click('取消合并来源选择');expect(state.dirty[0]?.isDirty).toBe(false)
  await f.click('添加合并根输入')
  const candidates=f.wrapper.findAllComponents(RendererTable).find(table=>String(table.props('dataViewKey')).includes('@optionCatalog_'))!
  await candidates.findAll('tbody tr').find(row=>row.text().includes('源A'))!.trigger('click');await flushPromises()
  stale();await flushPromises()
  expect(f.wrapper.findAllComponents(RendererDialog).some(dialog=>dialog.props('title')==='选择合并来源'&&dialog.props('modelValue'))).toBe(true)
  await f.click('取消合并来源选择');expect(state.dirty[0]?.isDirty).toBe(false);expect(state.http.saves).toEqual([])
  await add('添加合并根输入','源A');expect(state.dirty[0]?.isDirty).toBe(true);expect(state.http.saves).toEqual([])
  await f.click('取消节点修改');expect(state.dirty[0]?.isDirty).toBe(false)
  await add('添加合并根输入','源A');await add('添加合并子输入','源B');await f.click('保存节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(1))
  const saved=JSON.parse(String(state.http.records['Base_WorkflowNodeDefinition']![0]?.['input_mapping']))
  expect(saved).toHaveLength(2);expect(saved[0]).toMatchObject({rowid:'A',Fields:[{rowid:'AF',Name:'publishedAlias',AsName:'publishedAlias'}]});expect(saved[1]).toMatchObject({rowid:'B',pid:'A'})
  const reopened=await open();await selectNode(reopened)
  const tree=()=>reopened.wrapper.findAllComponents(FieldJson).find(field=>field.props('mode')==='outline')!
  await vi.waitFor(()=>expect(tree().findAll('tbody tr')).toHaveLength(2));await tree().findAll('tbody tr')[0]!.trigger('click');await flushPromises()
  await reopened.click('移除合并输入及子项');await reopened.click('取消移除合并输入');expect(state.http.saves).toHaveLength(1)
  await reopened.click('移除合并输入及子项');await reopened.click('确认移除合并输入');expect(state.http.saves).toHaveLength(1)
  await reopened.click('取消节点修改');await vi.waitFor(()=>expect(tree().findAll('tbody tr')).toHaveLength(2));await tree().findAll('tbody tr')[0]!.trigger('click');await flushPromises()
  await reopened.click('移除合并输入及子项');await reopened.click('确认移除合并输入');await reopened.click('保存节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(2))
  expect(state.http.records['Base_WorkflowNodeDefinition']![0]?.['input_mapping']).toBe('[]');expect(state.http.records['Base_WorkflowNodeDefinition']).toHaveLength(3)
  expect(state.http.saves.every(save=>save.table==='Base_WorkflowNodeDefinition'&&save.deleted.length===0&&save.added.length===0)).toBe(true)
 })
 it('edits merge join settings on the original JSON text, keeps roots free of join controls, and cancels or saves through the node',async()=>{
  const field={rowid:'F1',Name:'code',AsName:'code',FieldType:'string',IsOutput:1},mapping=JSON.stringify([{rowid:'P',Name:'父输入',Fields:[field],unknown:0},{rowid:'C',pid:'P',Name:'子输入',JoinType:'INNER',JoinFilter:null,Fields:[field],unknown:{keep:true}}])
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'合并',node_type:'merge',position_type:1,input_mapping:mapping,output_mapping:'[]'},
   {rowid:'P',workflow_id:'W1',name:'父来源',node_type:'query',position_type:1,node_config:'M1'},
   {rowid:'C',workflow_id:'W1',name:'子来源',node_type:'query',position_type:1,node_config:'M2'}]
  state.http.records['Base_WorkflowConnectors']=[{rowid:'PC',workflow_id:'W1',sourceID:'P',targetID:'C'},{rowid:'CN',workflow_id:'W1',sourceID:'C',targetID:'N1'}];state.http.records['Base_DataModel_Relation']=[]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const tree=()=>f.wrapper.findAllComponents(FieldJson).find(field=>field.props('mode')==='outline')!
  await tree().findAll('tbody tr')[0]!.trigger('click');await flushPromises()
  expect(f.wrapper.findAllComponents(FieldJson).some(field=>field.props('label')==='合并连接类型')).toBe(false)
  const change=async()=>{
   await tree().findAll('tbody tr')[1]!.trigger('click');await flushPromises()
   const join=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('label')==='合并连接类型')!
   expect(join).toBeDefined();await join.get('input[value="LEFT"]').setValue(true);await flushPromises()
   const filter=f.wrapper.findAllComponents(RendererFilterExpression).find(field=>field.props('field')==='input_mapping')!
   expect(filter.props('valuePath')).toEqual([1,'JoinFilter']);expect(filter.props('format')).toBe('spark-object');expect(filter.props('valueFormat')).toBe('text')
   expect(filter.props('columns')).toEqual([{name:'C.code',label:'code',type:'string'}])
   filter.getComponent(FilterExpressionEditor).vm.$emit('update:modelValue',{field:'C.code',operator:'eq',value:{Type:'GetTableField',Field:'P.code'}});await flushPromises()
  }
  await change();expect(state.http.saves).toEqual([]);await f.click('取消节点修改');expect(state.http.records['Base_WorkflowNodeDefinition']![0]?.['input_mapping']).toBe(mapping)
  await change();await f.click('保存节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(1))
  const saved=JSON.parse(String(state.http.records['Base_WorkflowNodeDefinition']![0]?.['input_mapping']))
  expect(saved[0]).toEqual(JSON.parse(mapping)[0]);expect(saved[1]).toEqual({...JSON.parse(mapping)[1],JoinType:'LEFT',JoinFilter:{Type:'cond',Field:'C.code',Operator:'equal',Value:null,ValueFun:{Type:'GetTableField',Field:'P.code'}}})
 })
 it('edits selected merge source fields through the original JSON path, cancels, saves and reopens without changing source identities',async()=>{
  const mapping=JSON.stringify([{rowid:'PARENT',Name:'根输入',Fields:[],unknown:0},{rowid:'CHILD',pid:'PARENT',Name:'子输入',JoinType:'INNER',Fields:[{rowid:'F1',Name:'name',AsName:'before',FieldType:'string',IsOutput:1,Description:'保留',unknown:{keep:true}}],unknown:{keep:true}}])
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'合并',position_type:1,node_type:'merge',input_mapping:mapping,output_mapping:'[]'},
   {rowid:'PARENT',workflow_id:'W1',name:'根来源',node_type:'query',position_type:1,node_config:'M1'},
   {rowid:'CHILD',workflow_id:'W1',name:'子来源',node_type:'query',position_type:1,node_config:'M2'}]
  state.http.records['Base_WorkflowConnectors']=[{rowid:'PC',workflow_id:'W1',sourceID:'PARENT',targetID:'CHILD'},{rowid:'CN',workflow_id:'W1',sourceID:'CHILD',targetID:'N1'}];state.http.records['Base_DataModel_Relation']=[]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const select=async()=>{
   const tree=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('mode')==='outline')!
   await vi.waitFor(()=>expect(tree.findAll('tbody tr')).toHaveLength(2));await tree.findAll('tbody tr')[1]!.trigger('click');await flushPromises()
   const fields=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('label')==='合并来源字段')!
   expect(fields).toBeDefined();expect(fields.props('valuePath')).toEqual([1,'Fields']);expect(fields.props('rowOperations')).toEqual(['edit'])
   return fields
  }
  const change=async(value:string)=>{
   const fields=await select();await fields.get('tbody tr').trigger('click');await fields.get('[data-json-edit]').trigger('click');await flushPromises()
   expect(fields.get('[data-json-add]').attributes('disabled')).toBeDefined();expect(fields.get('[data-json-delete]').attributes('disabled')).toBeDefined()
   expect(fields.get('tbody td:first-child input').attributes('disabled')).toBeDefined()
   const tree=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('mode')==='outline')!
   await tree.findAll('tbody tr')[0]!.trigger('click');await flushPromises()
   expect(fields.props('valuePath')).toEqual([1,'Fields'])
   expect(f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='返回输入列表')?.props('disabled')).toBe(true)
   await fields.get('tbody td:nth-child(3) input').setValue(value)
   await fields.get('tbody input[type="checkbox"]').setValue(false)
   await fields.get('tbody td:nth-child(5) input').setValue(`${value}说明`)
   await flushPromises();await fields.get('[data-json-save-row]').trigger('click');await flushPromises()
  }
  await change('cancelled');expect(state.dirty[0]?.isDirty).toBe(true);expect(state.http.saves).toEqual([])
  await f.click('取消节点修改');expect(state.dirty[0]?.isDirty).toBe(false);expect(state.http.records['Base_WorkflowNodeDefinition']![0]?.['input_mapping']).toBe(mapping)
  await change('after');await f.click('保存节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(1))
  const saved=JSON.parse(String(state.http.records['Base_WorkflowNodeDefinition']![0]?.['input_mapping']))
  expect(saved[0]).toEqual(JSON.parse(mapping)[0]);expect(saved[1]).toEqual({...JSON.parse(mapping)[1],Fields:[{...JSON.parse(mapping)[1].Fields[0],AsName:'after',IsOutput:0,Description:'after说明'}]})
  const reopened=await open();await vi.waitFor(()=>expect(reopened.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  reopened.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const tree=reopened.wrapper.findAllComponents(FieldJson).find(field=>field.props('mode')==='outline')!;await tree.findAll('tbody tr')[1]!.trigger('click');await flushPromises()
  expect(reopened.wrapper.findAllComponents(FieldJson).find(field=>field.props('label')==='合并来源字段')!.text()).toContain('after')
 })
 it('renders merge input hierarchy from the original bound node JSON without creating edits',async()=>{
  const mapping=JSON.stringify([{rowid:'CHILD',pid:'PARENT',Name:'子输入',JoinType:'INNER',Fields:[],unknown:{keep:true}},{rowid:'PARENT',Name:'根输入',Fields:[]}])
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'合并',position_type:1,node_type:'merge',node_config:'',input_mapping:mapping,output_mapping:'[]'},
   {rowid:'PARENT',workflow_id:'W1',name:'源A',position_type:1,node_type:'query',node_config:'M1'},
   {rowid:'CHILD',workflow_id:'W1',name:'源B',position_type:1,node_type:'query',node_config:'M2'}]
  state.http.records['Base_WorkflowConnectors']=[{rowid:'PC',workflow_id:'W1',sourceID:'PARENT',targetID:'CHILD'},{rowid:'CM',workflow_id:'W1',sourceID:'CHILD',targetID:'N1'}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const outline=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='input_mapping'&&field.props('mode')==='outline')
  expect(outline).toBeDefined();expect(outline!.props('outlineIdField')).toBe('rowid');expect(outline!.props('outlineParentField')).toBe('pid')
  await vi.waitFor(()=>expect(outline!.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(2))
  const rows=outline!.findAll('.el-table__body-wrapper tbody tr');expect(rows[0]!.text()).toContain('根输入');expect(rows[1]!.text()).toContain('子输入')
  expect(outline!.find('input').exists()).toBe(false)
  expect(state.http.records['Base_WorkflowNodeDefinition']![0]?.['input_mapping']).toBe(mapping)
  expect(state.http.saves).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it('selects a copy target through bound source views, cancels its original config, then saves and reopens it',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'迁移',node_type:'copy',position_type:1,node_config:'M1',config:'',output_mapping:'[]'}]
  state.http.records['Base_WorkflowConnectors']=[];state.http.records['Base_DataModel_Relation']=[]
  Object.assign(state.http.records['Base_DataModel']![0]!,{requestType:'copy'})
  state.http.records['View_TblList']=[{rowid:'T1',tblname:'Target',tbldesc:'迁移目标',dbid:'DB1',DbName:'main'}]
  state.http.records['Base_TblField']=[{rowid:'SF1',tblid:'T1',enname:'rowid',DataType:'varchar',IsPKey:1}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const choose=async()=>{
   await f.click('选择迁移目标')
   const table=f.wrapper.findAllComponents(RendererTable).find(table=>String(table.props('dataViewKey')).includes('@View_TblList@'))!
   expect(table).toBeDefined();await vi.waitFor(()=>expect(table.find('tbody tr').exists()).toBe(true))
   await table.get('tbody tr').trigger('click');await flushPromises();await f.click('确认迁移目标')
  }
  await choose();expect(state.http.saves).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(true)
  await f.click('取消节点修改');expect(state.http.saves).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(false)
  await choose();await f.click('保存节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(1))
  const saved=state.http.records['Base_WorkflowNodeDefinition']![0]!
  expect(JSON.parse(String(saved['config']))).toMatchObject({targetDbName:'main',targetTableName:'Target',size:500})
  expect(saved['node_config']).toBe('M1')
  const reopened=await open();await vi.waitFor(()=>expect(reopened.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  reopened.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const config=reopened.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='config')!
  expect(config).toBeDefined();await vi.waitFor(()=>expect(config.findComponent({name:'JsonTreeEditor'}).props('modelValue')).toContain('Target'))
  expect(state.http.saves).toHaveLength(1)
 })
 it('selects an operation target through bound tables, explicitly clears its condition, cancels without writes, then saves and reopens the confirmed target',async()=>{
  let captured:DataSet|undefined
  const load=LowcodeWorkflowDefinition.loadEditor.bind(LowcodeWorkflowDefinition)
  const loadSpy=vi.spyOn(LowcodeWorkflowDefinition,'loadEditor').mockImplementation(async(...args)=>{captured=await load(...args);return captured})
  const filter=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'code',operator:'eq',value:0}))
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'编辑',node_type:'edit',position_type:1,node_config:'',dataOperateModId:'M1',output_mapping:'[]'}]
  state.http.records['Base_WorkflowConnectors']=[];state.http.records['Base_DataModel_Relation']=[]
  Object.assign(state.http.records['Base_DataModel']![0]!,{Type:'数据库表',requestType:'edit',MetaName:'OldTarget',DbId:'DB0',DbName:'old-db',Filter:filter})
  Object.assign(state.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',FieldType:'varchar',IsPKey:1,IsOutput:0,ValueFun:JSON.stringify({Type:'GetConstValue',Value:0})})
  state.http.records['View_TblList']=[{rowid:'T1',tblname:'NextTarget',tbldesc:'新目标',dbid:'DB1',DbName:'main'}]
  state.http.records['Base_TblField']=[{rowid:'SF1',tblid:'T1',enname:'code',cnname:'编码',DataType:'varchar',IsPKey:1},{rowid:'SF2',tblid:'T1',enname:'note',cnname:'说明',DataType:'varchar',IsPKey:0}]
  let f:Awaited<ReturnType<typeof open>>
  try{f=await open()}finally{loadSpy.mockRestore()}
  await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const choose=async()=>{
   await f.click('更换操作目标');await f.click('选择模型来源')
   await vi.waitFor(()=>expect(f.wrapper.findAllComponents(RendererTable).some(table=>String(table.props('dataViewKey')).includes('@View_TblList@'))).toBe(true))
   const table=f.wrapper.findAllComponents(RendererTable).find(table=>String(table.props('dataViewKey')).includes('@View_TblList@'))!
   const search=f.wrapper.findAllComponents(FieldText).find(field=>field.props('field')==='keyword')!
   expect(search).toBeDefined();await search.get('input').setValue('NextTarget');await flushPromises()
   await vi.waitFor(()=>expect(state.http.reads.some(read=>read.table==='View_TblList'&&JSON.stringify(read.data).includes('NextTarget'))).toBe(true))
   await vi.waitFor(()=>expect(table.find('tbody tr').exists()).toBe(true));await table.get('tbody tr').trigger('click');await flushPromises();await f.click('确定')
   await vi.waitFor(()=>expect(document.body.textContent).toContain('随目标切换清空原条件'))
   expect(document.body.textContent).not.toContain('引入为输出字段')
   await f.click('随目标切换清空原条件');await vi.waitFor(()=>expect(document.body.textContent).toContain('保留并迁移原条件'))
  }
  await choose();await f.click('取消选择');await f.click('取消来源选择')
  const remaining=Object.values(captured!.tables).flatMap(table=>table.viewList)
  expect(remaining.filter(view=>view.destroyed||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()).map(view=>`${view.tableName}@${view.viewId}`)).toEqual([])
  expect(state.dirty[0]?.isDirty).toBe(false)
  expect(f.buttons().find(button=>button.text()==='更换操作目标')?.attributes('disabled')).toBeUndefined()
  expect(f.buttons().find(button=>button.text()==='关闭配置')?.attributes('disabled')).toBeUndefined()
  expect(state.http.saves).toHaveLength(0);expect(state.http.records['Base_DataModel']![0]?.['Filter']).toBe(filter)
  await choose();await f.click('确认更换目标')
  await vi.waitFor(()=>expect(state.http.records['Base_DataModel']![0]).toMatchObject({MetaName:'NextTarget',DbName:'main',Filter:'',requestType:'edit'}))
  await vi.waitFor(()=>expect(state.dirty[0]?.isDirty).toBe(false))
  expect(state.http.records['Base_DataModel_Field']!.find(row=>row['dataModelId']==='M1'&&row['Name']==='note')).toMatchObject({type:'inputParams',ValueFun:'',IsOutput:0})
  expect(state.http.records['Base_WorkflowNodeDefinition']![0]).toMatchObject({dataOperateModId:'M1',node_config:'',output_mapping:expect.stringContaining('"pid":null')})
  await f.click('更换操作目标');await vi.waitFor(()=>expect(document.body.textContent).toContain('选择操作目标来源'));await f.click('取消来源选择')
 })
 it('generates existing operation output with the standard bound button and uses original cancel/save/reopen',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'操作',node_type:'edit',position_type:1,node_config:'',dataOperateModId:'M1',output_mapping:'[]'}]
  state.http.records['Base_WorkflowConnectors']=[];state.http.records['Base_DataModel_Relation']=[]
  Object.assign(state.http.records['Base_DataModel']![0]!,{Type:'数据库表',requestType:'edit',MetaName:'Target',DbId:'DB1',DbName:'main',Filter:''})
  Object.assign(state.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',FieldType:'varchar',IsPKey:1,IsOutput:0,ValueFun:''})
  state.http.records['View_TblList']=[{rowid:'T1',tblname:'Target',tbldesc:'',dbid:'DB1',DbName:'main'}]
  state.http.records['Base_TblField']=[{rowid:'SF1',tblid:'T1',enname:'code',cnname:'编码',DataType:'varchar',IsPKey:1}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  f.wrapper.getComponent(RendererTabs).vm.$emit('update:modelValue','output');await flushPromises()
  const button=f.wrapper.findAllComponents(RendererButton).find(item=>item.props('label')==='生成输出模型')!
  expect(button.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_WorkflowNodeDefinition@default`)
  const nodes=f.wrapper.getComponent(WorkflowQueryConfiguration).props('dataSet').getView('Base_WorkflowNodeDefinition')!
  await f.click('生成输出模型');expect(state.http.saves).toHaveLength(0)
  expect(JSON.parse(String(nodes.getEditingRow('N1')?.['output_mapping']))).toMatchObject([{rowid:'F1',pid:null,Name:'code'}])
  await f.click('取消节点修改');expect(nodes.getEditingRow('N1')?.['output_mapping']).toBe('[]');expect(state.http.saves).toHaveLength(0)
  await f.click('生成输出模型');await f.click('保存节点');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(1))
  expect(state.http.saves[0]?.changed).toEqual([{rowid:'N1',output_mapping:expect.any(String)}])
  const reopened=await open();await vi.waitFor(()=>expect(reopened.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  reopened.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const fresh=reopened.wrapper.getComponent(WorkflowQueryConfiguration).props('dataSet').getView('Base_WorkflowNodeDefinition')!
  expect(JSON.parse(String(fresh.rows[0]?.['output_mapping']))).toMatchObject([{rowid:'F1',Name:'code'}]);expect(state.http.saves).toHaveLength(1)
 })
 it.each(['add','edit','delete'] as const)('opens the %s target editor with the same bound source controls and cancels without writes',async operation=>{
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'操作',node_type:operation,position_type:1,node_config:'',dataOperateModId:'M1',output_mapping:'[]'}]
  state.http.records['Base_WorkflowConnectors']=[];state.http.records['Base_DataModel_Relation']=[]
  Object.assign(state.http.records['Base_DataModel']![0]!,{Type:'数据库表',requestType:'query',DbName:'TestDB'})
  Object.assign(state.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',FieldType:'varchar',ValueFun:'',IsPKey:1,IsOutput:0})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await f.click('更换操作目标');await vi.waitFor(()=>expect(document.body.textContent).toContain('选择操作目标来源'))
  expect(document.body.textContent).not.toContain('从来源更新字段')
  await f.click('取消来源选择');expect(state.http.saves).toHaveLength(0);expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it('does not offer a filter that the add-node executor ignores',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'新增',node_type:'add',position_type:1,node_config:'',dataOperateModId:'M1',output_mapping:'[]'}]
  state.http.records['Base_WorkflowConnectors']=[];state.http.records['Base_DataModel_Relation']=[]
  Object.assign(state.http.records['Base_DataModel']![0]!,{Type:'数据库表',requestType:'add',DbName:'TestDB'})
  Object.assign(state.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',FieldType:'varchar'})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.text()).toContain('新增操作不使用过滤条件'))
  expect(f.wrapper.findComponent(RendererFilterExpression).exists()).toBe(false)
 })
 it('keeps the source command mounted when old model views are invalidated, and cancels before creating any records',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',name:'查询订单',position_type:1,node_type:'query',node_config:'M1',output_mapping:'[]'},{rowid:'N2',workflow_id:'W1',name:'共享订单',node_type:'query',position_type:1,node_config:'M1',output_mapping:'[]'}]
  state.http.records['Base_WorkflowConnectors']=[];state.http.records['Base_DataModel_Relation']=[]
  Object.assign(state.http.records['Base_DataModel']![0]!,{Type:'数据库表',requestType:'query',DbId:'DB',DbName:'database'})
  Object.assign(state.http.records['Base_DataModel_Field']![0]!,{type:'dataModel',FieldType:'varchar',IsPKey:1,IsOutput:1})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await f.click('选择模型');await vi.waitFor(()=>expect(document.body.textContent).toContain('共享模型'))
  const source=f.wrapper.getComponent(WorkflowSourceEdit),ds=source.props('dataSet');ds.getView('Base_DataModel')!.clearAll();await flushPromises()
  expect(f.wrapper.getComponent(WorkflowSourceEdit).vm.$.uid).toBe(source.vm.$.uid);expect(document.body.textContent).toContain('隔离模型名称')
  await f.click('取消来源选择');expect(state.http.saves).toHaveLength(0);expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it('previews, cancels and saves shared query node deletion without unmounting the original command when selection disappears',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M1',name:'查询',output_mapping:'[]'},{rowid:'N3',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M1',name:'共享查询',output_mapping:'[]'}]
  state.http.records['Base_WorkflowConnectors']=[];state.http.records['Base_DataModel_Relation']=[]
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:'[]'}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await f.click('删除查询节点');await vi.waitFor(()=>expect(document.body.textContent).toContain('保留模型及字段'))
  await f.click('暂存删除');expect(state.http.saves).toHaveLength(0);expect(state.dirty[0]?.isDirty).toBe(true)
  await f.click('取消删除');expect(state.dirty[0]?.isDirty).toBe(false)
  await f.click('删除查询节点');await f.click('暂存删除');await f.click('保存删除')
  await vi.waitFor(()=>expect(f.wrapper.findAllComponents(RendererDialog).some(dialog=>dialog.props('title')==='删除查询节点')).toBe(false))
  expect(state.http.records['Base_WorkflowNodeDefinition']!.map(row=>row['rowid'])).toEqual(['N3'])
  expect(state.http.records['Base_DataModel']!.some(row=>row['rowid']==='M1')).toBe(true)
  expect(state.http.records['Base_DataModel_Field']!.some(row=>row['rowid']==='F1')).toBe(true)
  expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it('binds the computed field dialog to the original row, cancels an unfinished addition without writes, and saves only after confirming the dialog',async()=>{
  config.global.stubs={...config.global.stubs,JsonTreeEditor:true}
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M1',name:'查询',output_mapping:'[]'}]
  state.http.records['Base_WorkflowConnectors']=[];state.http.records['Base_DataModel_Field']=[]
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:'[]'}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await f.click('新增计算字段')
  const dialog=()=>f.wrapper.findAllComponents(RendererDialog).find(item=>item.props('title')==='新增计算字段')!
  expect(dialog().props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_DataModel_Field@default`)
  expect(state.http.saves).toHaveLength(0)
  await f.click('取消字段编辑');expect(state.dirty[0]?.isDirty).toBe(false)
  await f.click('新增计算字段')
  await dialog().findAllComponents(FieldText).find(field=>field.props('field')==='Name')!.get('input').setValue('computedZero')
  await f.click('确认字段编辑');expect(state.http.saves).toHaveLength(0)
  await f.click('保存查询配置')
  expect(state.http.records['Base_DataModel_Field']).toEqual([expect.objectContaining({Name:'computedZero',FieldType:'计算字段',IsOutput:0,IsPKey:0,dataSetId:'W1',dataModelId:'M1'})])
  expect(state.dirty[0]?.isDirty).toBe(false)
  const id=state.http.records['Base_DataModel_Field']![0]?.['rowid'],writes=state.http.saves.length
  await f.click('编辑计算字段')
  const editing=()=>f.wrapper.findAllComponents(RendererDialog).find(item=>item.props('title')==='编辑计算字段')!
  await editing().findAllComponents(FieldText).find(field=>field.props('field')==='description')!.get('input').setValue('取消说明')
  await f.click('取消字段编辑');expect(state.dirty[0]?.isDirty).toBe(false);expect(state.http.saves).toHaveLength(writes)
  await f.click('编辑计算字段')
  await editing().findAllComponents(FieldText).find(field=>field.props('field')==='description')!.get('input').setValue('已修改')
  await editing().getComponent(FieldValueFunction).get('[data-function-open]').trigger('click');await flushPromises()
  editing().getComponent(FilterValueFunctionDialog).vm.$emit('confirm',{Type:'GetConstValue',Value:0});await flushPromises()
  await f.click('确认字段编辑');expect(state.http.saves).toHaveLength(writes)
  await f.click('保存查询配置')
  expect(state.http.records['Base_DataModel_Field']![0]).toMatchObject({rowid:id,description:'已修改',ValueFun:JSON.stringify({Type:'GetConstValue',Value:0})})
  await f.click('编辑计算字段')
  await editing().findAllComponents(FieldText).find(field=>field.props('field')==='Name')!.get('input').setValue('computedRenamed')
  await f.click('确认字段编辑');await f.click('保存查询配置')
  expect(state.http.records['Base_DataModel_Field']![0]).toMatchObject({rowid:id,Name:'computedRenamed'})
  expect(state.dirty[0]?.isDirty).toBe(false)
  const beforeDelete=state.http.saves.length
  await f.click('删除计算字段');expect(state.http.saves).toHaveLength(beforeDelete);expect(state.dirty[0]?.isDirty).toBe(true)
  await f.click('取消查询配置修改');expect(state.dirty[0]?.isDirty).toBe(false)
  const fieldsTable=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_DataModel_Field@'))!
  await fieldsTable.get('tbody tr').trigger('click');await flushPromises()
  await f.click('删除计算字段');await f.click('保存查询配置')
  expect(state.http.records['Base_DataModel_Field']).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it('edits node test input through its command view, cancels without execution and shows the accepted result',async()=>{
  const backend=new ExecutionBackend();backend.records=state.http.records;state.http=backend
  state.http.records['Base_WorkflowNodeDefinition']!.push({rowid:'START',workflow_id:'W1',position_type:0,node_type:'API_CALL',name:'开始',output_mapping:JSON.stringify([{rowid:'P_VALUE',pid:null,Name:'value',FieldType:'int',isParent:false},{rowid:'P_ENABLED',pid:null,Name:'enabled',FieldType:'boolean',isParent:false}])})
  state.http.records['Base_WorkflowConnectors']=[{rowid:'SN',workflow_id:'W1',sourceID:'START',targetID:'N1',params:'[]'}]
  state.runtime=new DataSpaceRuntimeApi({http:backend,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  const edit=async()=>{
   const input=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='input')!;expect(input.props('valuePath')).toEqual(['START'])
   await input.get('tbody tr').trigger('click');await input.get('[data-json-edit]').trigger('click');await flushPromises()
   input.getComponent(FieldNumber).getComponent({name:'ElInputNumber'}).vm.$emit('update:modelValue',0)
   input.getComponent(FieldCheckbox).getComponent({name:'ElCheckbox'}).vm.$emit('update:modelValue',false)
   await flushPromises();await input.get('[data-json-save-row]').trigger('click');await flushPromises()
  }
  await f.click('测试当前节点');expect(backend.executions).toEqual([]);await edit()
  await f.click('取消测试输入');expect(backend.executions).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(false)
  await f.click('测试当前节点');await edit();await f.click('执行测试')
  expect(backend.executions).toHaveLength(1);expect(backend.executions[0]?.data).toEqual({workflowId:'W1',nodeId:'N1',inputParams:{START:[{value:0,enabled:false}]}})
  const result=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='result')!
  expect(result.props('readonly')).toBe(true);expect(result.props('mode')).toBe('tree');expect(result.getComponent({name:'JsonTreeEditor'}).props('modelValue')).toContain('SUCCESS');expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it('connects original graph nodes through a cancellable formal edge and saves its exact endpoints',async()=>{
  state.http.records['Base_WorkflowNodeDefinition']=[{rowid:'START',workflow_id:'W1',position_type:0,node_type:'query',name:'开始',output_mapping:'[]'},
   {rowid:'A',workflow_id:'W1',position_type:1,node_type:'query',name:'查询A',output_mapping:'[]'}]
  state.http.records['Base_WorkflowConnectors']=[]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  const graph=f.wrapper.getComponent(RendererGraph)
  expect(new Set(graph.props('connectableKeys'))).toEqual(new Set(['START','A']))
  graph.props('onConnect')?.({source:'START',target:'A'});await flushPromises()
  expect(state.http.saves).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(true)
  expect(f.text()).toContain('请先保存新连线')
  await f.click('取消连线修改');expect(state.dirty[0]?.isDirty).toBe(false)
  graph.props('onConnect')?.({source:'START',target:'A'});await flushPromises()
  await f.click('保存连线')
  expect(state.http.saves.map(save=>save.table)).toEqual(['Base_WorkflowConnectors'])
  expect(state.http.records['Base_WorkflowConnectors']).toEqual([expect.objectContaining({workflow_id:'W1',sourceID:'START',targetID:'A',params:'[]'})])
 })
 it('binds query conditions and source value functions to the original views with a shared input catalog',async()=>{
  config.global.stubs={...config.global.stubs,JsonTreeEditor:true}
  state.http.records['Base_WorkflowConnectors']=[]
  Object.assign(state.http.records['Base_DataModel']![0]!,{Type:'数据库',Filter:DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'code',operator:'eq',value:0}))})
  Object.assign(state.http.records['Base_DataModel_Field']![0]!,{type:'dataModel',FieldType:'int',IsOutput:0,AsName:'',ValueFun:''})
  state.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']=JSON.stringify([
   {rowid:'ITEMS',pid:null,Name:'items',FieldType:'Array',isParent:true},
   {rowid:'COUNT',pid:null,Name:'Count',FieldType:'int',isParent:false},
  ])
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererFilterExpression).exists()).toBe(true))
  const filter=f.wrapper.getComponent(RendererFilterExpression),value=f.wrapper.findAllComponents(FieldValueFunction)[0]!
  expect(filter.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_DataModel@default`)
  expect(filter.props('field')).toBe('Filter');expect(filter.props('format')).toBe('spark-json')
  expect(filter.props('inputParameterDataViewKey')).toMatch(new RegExp(`^${WORKFLOW_DESIGN}@optionCatalog_`))
  expect(value.props('inputParameterDataViewKey')).toBe(filter.props('inputParameterDataViewKey'))
  expect(f.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='保存查询配置')).toBe(true)
  expect(f.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='保存模型说明')).toBe(false)
  expect(state.http.saves).toEqual([])
  const fieldTable=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_DataModel_Field@'))!
  await fieldTable.get('tbody tr').trigger('click');await flushPromises()
  await fieldTable.get('[data-function-open]').trigger('click');await flushPromises()
  expect(f.wrapper.findAllComponents(FilterValueFunctionDialog).some(dialog=>dialog.props('modelValue'))).toBe(true)
  await f.click('取消查询配置修改')
  expect(f.wrapper.findAllComponents(FilterValueFunctionDialog).some(dialog=>dialog.props('modelValue'))).toBe(false)
  expect(state.dirty[0]?.isDirty).toBe(false)
  await filter.get('input[aria-label="数字常量"]').setValue('3');await flushPromises()
  expect(state.dirty[0]?.isDirty).toBe(true)
  await f.click('取消查询配置修改')
  expect(filter.get('input[aria-label="数字常量"]').element).toHaveProperty('value','0')
  expect(state.dirty[0]?.isDirty).toBe(false);expect(state.http.saves).toEqual([])
 })
 it.each([{operation:'add',label:'新增'},{operation:'edit',label:'编辑'},{operation:'delete',label:'删除'}])('creates and cancels a $operation operation from the original source dialog',async({operation})=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:'[]'}]
  state.http.records['View_TblList']=[{rowid:'T1',tblname:'Disposable',tbldesc:'烟测目标',dbid:'DB1',DbName:'main'}]
  state.http.records['Base_TblField']=[{rowid:'SF1',tblid:'T1',enname:'code',cnname:'编码',DataType:'varchar',IsPKey:1}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  const choose=async()=>{
   await f.click('选择目标表')
   await vi.waitFor(()=>expect(f.wrapper.findAllComponents(RendererTable).some(table=>String(table.props('dataViewKey')).includes('@View_TblList@'))).toBe(true))
   const table=f.wrapper.findAllComponents(RendererTable).find(table=>String(table.props('dataViewKey')).includes('@View_TblList@'))!
   await vi.waitFor(()=>expect(table.find('tbody tr').exists()).toBe(true));await table.get('tbody tr').trigger('click');await flushPromises()
   await f.click('确认来源');await vi.waitFor(()=>expect(document.body.textContent).toContain('操作目标与字段预览'))
  }
  await f.createNode(operation,'Disposable');await choose();await f.click('取消模型选择');expect(state.http.saves).toEqual([])
  await choose();await f.click('确认模型绑定');await vi.waitFor(()=>expect(state.http.saves).toHaveLength(3))
  const node=state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['name']==='Disposable')!
  expect(node).toMatchObject({workflow_id:'W1',position_type:1,node_type:operation,node_config:''})
  const outputField=state.http.records['Base_DataModel_Field']!.find(row=>row['dataModelId']===node['dataOperateModId'])!
  expect(JSON.parse(String(node['output_mapping']))).toEqual([{rowid:outputField['rowid'],pid:null,Name:'code',Description:'编码',FieldType:'varchar',isParent:false}])
  expect(state.http.records['Base_DataModel']!.find(row=>row['rowid']===node['dataOperateModId'])).toMatchObject({requestType:operation,MetaName:'Disposable'})
  expect(state.http.records['Base_DataModel_Field']!.filter(row=>row['dataModelId']===node['dataOperateModId'])).toEqual([expect.objectContaining({type:'inputParams',Name:'code',ValueFun:''})])
 })
 it.each([{kind:'query',label:'查询'},{kind:'copy',label:'迁移'}])('selects, cancels and creates a $kind source through the same runtime',async({kind})=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:'[]'}]
  state.http.records['View_TblList']=[{rowid:'T1',tblname:'Orders',tbldesc:'订单',dbid:'DB1',DbName:'main'}]
  state.http.records['Base_TblField']=[{rowid:'SF1',tblid:'T1',enname:'code',cnname:'编码',DataType:'varchar',IsPKey:1}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  const choose=async()=>{
   await f.click('选择模型')
   await vi.waitFor(()=>expect(f.wrapper.findAllComponents(RendererTable).some(table=>String(table.props('dataViewKey')).includes('@View_TblList@'))).toBe(true))
   const table=f.wrapper.findAllComponents(RendererTable).find(table=>String(table.props('dataViewKey')).includes('@View_TblList@'))!
   await vi.waitFor(()=>expect(table.find('tbody tr').exists()).toBe(true))
   await table.get('tbody tr').trigger('click');await flushPromises()
   await f.click('确认来源')
   await vi.waitFor(()=>expect(document.body.textContent).toContain('查询模型与字段预览'))
  }
  await f.createNode(kind,'Orders');await choose();expect(state.dirty[0]?.isDirty).toBe(true)
  await f.click('取消模型选择');expect(state.http.saves).toEqual([])
  expect(state.dirty[0]?.isDirty).toBe(true)
  await choose();await f.click('确认模型绑定')
  await vi.waitFor(()=>expect(state.http.saves).toHaveLength(3))
  expect(state.http.saves.map(save=>save.table)).toEqual(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'])
  const node=state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['name']==='Orders')!
  const model=state.http.records['Base_DataModel']!.find(row=>row['rowid']===node['node_config'])!
  expect(node).toMatchObject({workflow_id:'W1',node_type:kind,position_type:1})
  expect(model).toMatchObject({dataSetId:'W1',requestType:kind,MetaName:'Orders',DbId:'DB1'})
  await vi.waitFor(()=>expect(state.dirty[0]?.isDirty).toBe(false))
  expect(state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='N2')?.['name']).toBe('其他节点')
  await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/other')
 })
 it.each([{id:'W1',name:'当前流程',code:'WF_CURRENT'},{id:'W2',name:'其他流程',code:'WF_OTHER'}])('binds only the queried $id definition as the form current row',async target=>{
  state.http.records['Base_WorkflowDefinition']=[{rowid:'W1',name:'当前流程',workflow_key:'WF_CURRENT'},{rowid:'W2',name:'其他流程',workflow_key:'WF_OTHER'}]
  const f=await open(target.id);await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  const name=f.wrapper.findAllComponents(FieldText).find(field=>field.props('field')==='name')!
  await vi.waitFor(()=>expect(name.find('input').exists()).toBe(true))
  expect(name.get('input').element.value).toBe(target.name)
  const code=f.wrapper.findAllComponents(FieldText).find(field=>field.props('field')==='workflow_key')!
  expect(code.get('input').element.value).toBe(target.code)
  expect(state.http.saves).toEqual([])
 })
 it('binds EDIT connector leaves to the standard inline editor without a page data path',async()=>{
  const original=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'flowstate',operator:'eq',value:0}))
  Object.assign(state.http.records['Base_WorkflowNodeDefinition']![0]!,{position_type:1,node_type:'edit',output_mapping:JSON.stringify([{rowid:'OD',Name:'description',Description:'说明',FieldType:'varchar',pid:null,isParent:false},{rowid:'OZ',Name:'flowstate',Description:'流程状态',FieldType:'int',pid:null,isParent:false}])})
  state.http.records['Base_DataModel_Relation']!.push({rowid:'RC',dataSetId:'W1',parentModId:'N1',childModId:'N1',filter:original})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'edge',id:'E1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererFilterExpression).exists()).toBe(true))
  const editor=f.wrapper.getComponent(RendererFilterExpression)
  expect(editor.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_DataModel_Relation@connector`)
  expect(editor.props('columns')).toEqual([{name:'description',label:'说明',type:'varchar'},{name:'flowstate',label:'流程状态',type:'int'}])
  await editor.get('input[aria-label="数字常量"]').setValue('1');await flushPromises();expect(state.http.saves).toEqual([])
  await f.click('取消条件修改');expect(editor.get('input[aria-label="数字常量"]').element).toHaveProperty('value','0')
  await editor.get('input[aria-label="数字常量"]').setValue('1');await flushPromises();await f.click('保存条件')
  expect(state.http.saves.map(save=>save.table)).toEqual(['Base_DataModel_Relation'])
  expect(DataViewFilterCodec.parseStored(String(state.http.records['Base_DataModel_Relation']!.find(row=>row['rowid']==='RC')!['filter']))!.toJSON()).toEqual({field:'flowstate',operator:'eq',value:1})
 })
 it('binds inline connector edits to the original view, cancels before saving and clears only the condition record',async()=>{
  const originalFilter=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'Count',operator:'eq',value:0}))
  state.http.records['Base_WorkflowNodeDefinition']![0]!['position_type']=0
  state.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']=JSON.stringify([{rowid:'OUT',Name:'Count',Description:'数量',FieldType:'int'}])
  state.http.records['Base_DataModel_Relation']!.push({rowid:'RC',dataSetId:'W1',parentModId:'N1',childModId:'N1',filter:originalFilter})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  expect(state.http.reads.some(read=>read.table==='Base_DataModel_Relation')).toBe(false)
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'edge',id:'E1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererFilterExpression).exists()).toBe(true))
  const editor=f.wrapper.getComponent(RendererFilterExpression)
  expect(editor.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_DataModel_Relation@connector`)
  expect(editor.props('format')).toBe('spark-json');expect(editor.props('columns')).toEqual([{name:'Count',label:'数量',type:'int'}])
  expect(editor.props('allowedOperators')).toEqual(['eq','ne','gt','lt'])
  await editor.get('input[aria-label="数字常量"]').setValue('3');await flushPromises()
  expect(f.buttons().find(button=>button.text()==='保存条件')?.attributes('disabled')).toBeUndefined()
  expect(state.http.saves).toEqual([])
  await f.click('取消条件修改');expect(state.dirty[0]?.isDirty).toBe(false)
  expect(editor.get('input[aria-label="数字常量"]').element).toHaveProperty('value','0')
  await editor.get('input[aria-label="数字常量"]').setValue('3');await flushPromises()
  await f.click('保存条件')
  expect(state.http.saves.map(save=>save.table)).toEqual(['Base_DataModel_Relation'])
  expect(DataViewFilterCodec.parseStored(String(state.http.records['Base_DataModel_Relation']!.find(row=>row['rowid']==='RC')!['filter']))!.toJSON()).toEqual({field:'Count',operator:'eq',value:3})
  await editor.get('[data-action="clear"]').trigger('click');await flushPromises()
  const save=WorkflowConnectorCondition.save.bind(WorkflowConnectorCondition)
  vi.spyOn(WorkflowConnectorCondition,'save').mockImplementationOnce(async(ds,...args)=>{
   vi.spyOn(ds,'saveChanges').mockResolvedValueOnce({success:false,message:'明确拒绝删除'});return save(ds,...args)
  })
  await f.click('保存条件')
  expect(f.text()).toContain('重试条件删除');expect(f.text()).not.toContain('新增条件')
  expect(state.http.saves).toHaveLength(1)
  await f.click('重试条件删除')
  expect(state.http.records['Base_DataModel_Relation']).toEqual([{rowid:'R1',dataSetId:'W1',parentModId:'M1',childModId:'M2',description:'模型关系'}])
  expect(state.http.records['Base_WorkflowConnectors']).toHaveLength(1);expect(state.http.saves[1]?.deleted).toEqual([expect.objectContaining({rowid:'RC'})])
 })
 it('lazily binds start parameters, preserves metadata and saves their derived output through original views',async()=>{
  const param={rowid:'P1',Name:'code',Value:'old',FieldType:'string',Description:'原说明',ValueFun:{value:false},extra:0}
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:JSON.stringify([param])},{rowid:'W2',Type:'workflow',inputParams:'[]'}]
  Object.assign(state.http.records['Base_WorkflowNodeDefinition']![0]!,{position_type:'0',output_mapping:'[]'})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  expect(state.http.reads.some(read=>read.table==='Base_DataSet')).toBe(false)
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.text()).toContain('开始输入参数'))
  const json=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='inputParams')!
  expect(json.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_DataSet@default`);expect(json.props('mode')).toBe('rows')
  await json.get('tbody tr').trigger('click');await json.get('[data-json-edit]').trigger('click');await flushPromises()
  await json.findAll('tbody input')[2]!.setValue('changed');await flushPromises()
  expect(f.buttons().find(button=>button.text()==='保存开始参数')?.attributes('disabled')).toBeDefined()
  await json.get('[data-json-save-row]').trigger('click');await flushPromises();await f.click('保存开始参数')
  expect(state.http.saves.map(save=>save.table)).toEqual(['Base_DataSet','Base_WorkflowNodeDefinition'])
  expect(JSON.parse(String(state.http.records['Base_DataSet']![0]!['inputParams']))).toEqual([{...param,Value:'changed'}])
  expect(JSON.parse(String(state.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']))).toEqual([expect.objectContaining({rowid:'P1',Name:'code',Description:'原说明'})])
  expect(state.http.records['Base_DataSet']![1]!['inputParams']).toBe('[]')
  expect(state.dirty[0]?.isDirty).toBe(false)
  const editing=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='inputParams')!
  await editing.get('tbody tr').trigger('click');await editing.get('[data-json-edit]').trigger('click');await flushPromises()
  await editing.findAll('tbody input')[2]!.setValue('未确认输入');await flushPromises()
  await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/design')
  await f.click('取消开始参数修改')
  expect(state.dirty[0]?.isDirty).toBe(false);expect(state.http.saves).toHaveLength(2)
  expect(editing.text()).toContain('changed');expect(editing.text()).not.toContain('未确认输入')
 })
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
  expect(f.buttons().find(b=>b.text()==='取消节点修改')?.attributes('disabled')).toBeDefined()
  await f.click('核验节点保存结果');expect(state.http.saves).toHaveLength(1);expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it('projects layout from the bound file view and saves a drag without saving business nodes',async()=>{
  state.layoutText='{"nodes":[{"id":"N1","x":10,"y":20,"custom":false}],"edges":[],"keep":0}'
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  const graph=f.wrapper.getComponent(RendererGraph)
  expect(graph.props('nodePositions')).toEqual({N1:{x:10,y:20}})
  graph.props('onNodeMove')?.({id:'N1',x:80,y:90,edges:[]});await flushPromises()
  expect(state.dirty[0]?.isDirty).toBe(true);await f.click('保存布局')
  expect(state.uploads).toHaveLength(1);expect(JSON.parse(state.uploads[0]!)).toMatchObject({nodes:[{id:'N1',x:80,y:90,custom:false}],keep:0})
  expect(state.http.saves).toEqual([])
 })
 it('creates a missing layout explicitly and never treats denied reads as missing',async()=>{
  const f=await open();await vi.waitFor(()=>expect(f.text()).toContain('布局文件不存在'))
  expect(state.uploads).toEqual([]);await f.click('创建布局');expect(state.dirty[0]?.isDirty).toBe(true)
  await f.click('保存布局');expect(state.uploads).toHaveLength(1)
  state.denyLayout=true;const denied=await open();await vi.waitFor(()=>expect(denied.wrapper.text()).toContain('布局读取被拒绝'))
  expect(denied.wrapper.findAll('button').some(b=>b.text()==='创建布局')).toBe(false)
 })
 it('cancels a layout drag back to file baseline and blocks navigation until cancellation',async()=>{
  state.layoutText='{"nodes":[{"id":"N1","x":10,"y":20}],"edges":[]}'
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onNodeMove')?.({id:'N1',x:80,y:90,edges:[]});await flushPromises()
  await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/design')
  await f.click('取消布局修改');expect(f.wrapper.getComponent(RendererGraph).props('nodePositions')).toEqual({N1:{x:10,y:20}})
  expect(state.uploads).toEqual([]);await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/other')
 })
 it('recovers a possibly applied layout upload without a second upload',async()=>{
  state.layoutText='{"nodes":[{"id":"N1","x":10,"y":20}],"edges":[]}'
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onNodeMove')?.({id:'N1',x:80,y:90,edges:[]});await flushPromises();state.loseLayoutReceipt=true
  await f.click('保存布局');expect(state.uploads).toHaveLength(1)
  expect(f.wrapper.getComponent(RendererGraph).props('draggableKeys')).toEqual([])
  await f.click('核验布局保存结果');expect(state.uploads).toHaveLength(1);expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it.each([{type:'query',expected:'订单模型'},{type:'copy',expected:'订单模型'},{type:'add',expected:'目标模型'},{type:'edit',expected:'目标模型'},{type:'delete',expected:'目标模型'}])('resolves $type node model ownership before loading fields',async({type,expected})=>{
  Object.assign(state.http.records['Base_WorkflowNodeDefinition']![0]!,{node_type:type,...['add','edit','delete'].includes(type)?{node_config:'',dataOperateModId:'M2'}:{node_config:'M1',dataOperateModId:''}})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  expect(state.http.reads.some(r=>r.table==='Base_DataModel')).toBe(false)
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.inputs().map(input=>input.element.value)).toContain(expected))
  expect(f.wrapper.findAllComponents(FieldJson).some(field=>field.props('field')==='node_config')).toBe(false)
  expect(state.http.reads.some(r=>r.table==='Base_DataModel_Field')).toBe(true)
  expect(state.http.saves).toEqual([])
 })
 it.each([{type:'query',position:0},{type:'query',position:2},{type:'merge',position:1},{type:'api_call',position:1},{type:'future_type',position:1}])('does not treat $type at position $position as an owned data model',async({type,position})=>{
  Object.assign(state.http.records['Base_WorkflowNodeDefinition']![0]!,{node_type:type,position_type:position})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  expect(state.http.reads.some(read=>['Base_DataModel','Base_DataModel_Field','Base_DataModel_Relation'].includes(read.table))).toBe(false)
  expect(f.text()).not.toContain('模型配置')
  expect(state.http.records['Base_WorkflowNodeDefinition']![0]).toMatchObject({node_type:type,position_type:position,node_config:'M1',dataOperateModId:''})
  expect(state.http.saves).toEqual([])
 })
 it('persists non-output field descriptions independently of pending node edits and leaves other models unchanged',async()=>{
  Object.assign(state.http.records['Base_DataModel_Field']![0]!,{type:'dataModel',IsOutput:0,FieldType:'varchar',AsName:''})
  state.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']=JSON.stringify([
   {rowid:'ITEMS',pid:null,Name:'items',Description:'数据项',FieldType:'Array',isParent:true},
   {rowid:'COUNT',pid:null,Name:'Count',Description:'数据总数',FieldType:'int',isParent:false},
  ])
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.wrapper.findAllComponents(RendererTable).some(t=>t.props('dataViewKey')?.includes('@Base_DataModel_Field@'))).toBe(true))
  const fields=f.wrapper.findAllComponents(RendererTable).find(t=>t.props('dataViewKey')?.includes('@Base_DataModel_Field@'))!
  await fields.get('tbody tr').trigger('click');await flushPromises()
  const nodeName=f.wrapper.findAllComponents(FieldText).find(field=>field.props('dataViewKey')?.includes('@Base_WorkflowNodeDefinition@')&&field.props('field')==='name')!
  await nodeName.get('input').setValue('未保存节点名称');await flushPromises()
  const description=fields.findAllComponents(FieldText).find(field=>field.props('field')==='description'&&field.find('input').exists())!
  await description.get('input').setValue('正式字段说明');await flushPromises();await f.click('保存查询配置')
  expect(state.http.saves.map(s=>s.table)).toEqual(['Base_DataModel_Field'])
  expect(state.http.records['Base_DataModel_Field']?.find(row=>row['rowid']==='F2')?.['Name']).toBe('target')
  expect(state.http.records['Base_WorkflowNodeDefinition']?.find(row=>row['rowid']==='N1')?.['name']).toBe('查询订单')
  expect(state.dirty[0]?.isDirty).toBe(true);await f.click('取消节点修改')
 })
 it.each(['MISSING','M3'])('reports an unavailable model reference %s without substituting another model',async modelId=>{
  state.http.records['Base_WorkflowNodeDefinition']![0]!['node_config']=modelId
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.text()).toContain('当前节点引用的模型不存在'))
  expect(state.http.saves).toEqual([])
 })
 it('does not load node or connector views for a missing target',async()=>{
  const f=await open('MISSING');await vi.waitFor(()=>expect(f.text()).toContain('当前工作流不存在'))
  expect(state.http.reads.map(r=>r.table)).toEqual(['Base_WorkflowDefinition']);expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(false)
 })
})
