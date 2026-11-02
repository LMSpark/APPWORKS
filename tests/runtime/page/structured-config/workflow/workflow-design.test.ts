import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount,config,type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {FieldText,FieldJson,FieldValueFunction,FilterValueFunctionDialog,RendererButton,RendererTable,RendererGraph,RendererFilterExpression,Spark,registerAllRenderers} from '@spark-appworks/spark-component'
import {DataViewFilter,DataViewFilterCodec} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {WorkflowConnectorCondition} from '@/lowcode/resources/structured-config/workflow-definition/connector-condition'
import WorkflowDesign from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page.vue'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from './workflow-native-design.fixture'
const state=vi.hoisted(()=>({http:undefined as unknown as ApiBackend,runtime:undefined as unknown as DataSpaceRuntimeApi,dirty:[] as Array<{isDirty:boolean}>,layoutText:null as string|null,uploads:[] as string[],denyLayout:false,loseLayoutReceipt:false}))
vi.mock('@spark-appworks/spark-app',()=>({useSystemPageDirtySource:(source:{isDirty:boolean})=>state.dirty.push(source)}))
vi.mock('@/lowcode/lowcode-runtime',()=>({get lowcodeHttp(){return state.http},lowcodeDesignFileUpload:{uploadWorkingText:async(input:{text:string})=>{state.uploads.push(input.text);state.layoutText=input.text;if(state.loseLayoutReceipt){state.loseLayoutReceipt=false;throw new Error("layout response lost")}return {}}},createLowcodeProjectGateways:()=>({scenarioViews:{readText:async(id:string)=>id===WORKFLOW_DESIGN?workflowDesignText:null}}),lowcodeApi:{design:{readTextFile:async()=>{if(state.denyLayout)throw new LowcodeApiError(403,'布局读取被拒绝');if(state.layoutText===null)throw new LowcodeApiError(404,'missing');return state.layoutText}},readRequestScope:()=>({token:'scope',headers:{'X-AppId':'APP'}}),dataSpace:{get runtime(){return state.runtime},design:{readSpaceDefinition:async({dataSpaceId}:{dataSpaceId:string})=>({dataSpaceId,name:'工作流设计'}),readModelBatch:async()=>workflowDesignModels(),readRelations:async()=>[]}}}}))
const wrappers:VueWrapper[]=[],original={...config.global.stubs}
beforeEach(()=>{
 state.dirty=[];state.layoutText=null;state.uploads=[];state.denyLayout=false;state.loseLayoutReceipt=false;state.http=new ApiBackend();state.http.records={Base_WorkflowDefinition:[{rowid:'W1',name:'当前流程'}],Base_WorkflowNodeDefinition:[{rowid:'N1',workflow_id:'W1',name:'查询订单',node_type:'query',node_config:'M1',dataOperateModId:'M2'},{rowid:'N2',workflow_id:'W2',name:'其他节点'}],Base_WorkflowConnectors:[{rowid:'E1',workflow_id:'W1',sourceID:'N1',targetID:'N1',name:'原连线'}],Base_DataModel:[{rowid:'M1',dataSetId:'W1',Name:'订单模型',MetaName:'Orders'},{rowid:'M2',dataSetId:'W1',Name:'目标模型',MetaName:'Targets'},{rowid:'M3',dataSetId:'W2',Name:'其他流程模型'}],Base_DataModel_Field:[{rowid:'F1',dataSetId:'W1',dataModelId:'M1',Name:'code',description:'原字段说明'},{rowid:'F2',dataSetId:'W1',dataModelId:'M2',Name:'target'}],Base_DataModel_Relation:[{rowid:'R1',dataSetId:'W1',parentModId:'M1',childModId:'M2',description:'模型关系'}]}
 state.runtime=new DataSpaceRuntimeApi({http:state.http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})});registerAllRenderers();const stubs={...original};for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])Reflect.deleteProperty(stubs,key);config.global.stubs={...stubs,RendererGraph:true}
})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());config.global.stubs=original})
async function open(workflowId='W1'){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/design',component:WorkflowDesign,meta:{blueprintScenarioId:'5E9676B1E38860B023921F48FB4370DE'}},{path:'/other',component:{template:'<div>other</div>'}}]})
 await router.push({path:'/design',query:{workflowId}});await router.isReady()
 const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper);await flushPromises()
 const click=async(label:string)=>{const b=wrapper.findAll('button').find(b=>b.text()===label)??wrapper.findAllComponents(RendererButton).find(b=>b.props('label')===label)?.find('button');expect(b,label).toBeDefined();await b!.trigger('click');await flushPromises()}
 return {wrapper,router,click}
}
describe('workflow formal design page',()=>{
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
 it('selects a native source, cancels its preview and creates the query model, fields and node through the same runtime',async()=>{
  state.http.records['Base_DataSet']=[{rowid:'W1',Type:'workflow',inputParams:'[]'}]
  state.http.records['View_TblList']=[{rowid:'T1',tblname:'Orders',tbldesc:'订单',dbid:'DB1',DbName:'main'}]
  state.http.records['Base_TblField']=[{rowid:'SF1',tblid:'T1',enname:'code',cnname:'编码',DataType:'varchar',IsPKey:1}]
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  const choose=async()=>{
   await f.click('新增查询节点')
   await vi.waitFor(()=>expect(f.wrapper.findAllComponents(RendererTable).some(table=>String(table.props('dataViewKey')).includes('@View_TblList@'))).toBe(true))
   const table=f.wrapper.findAllComponents(RendererTable).find(table=>String(table.props('dataViewKey')).includes('@View_TblList@'))!
   await vi.waitFor(()=>expect(table.find('tbody tr').exists()).toBe(true))
   await table.get('tbody tr').trigger('click');await flushPromises()
   await f.click('确认来源')
   await vi.waitFor(()=>expect(document.body.textContent).toContain('查询模型与字段预览'))
  }
  await choose();expect(state.dirty[0]?.isDirty).toBe(true)
  await f.click('取消新增节点');expect(state.http.saves).toEqual([])
  expect(state.dirty[0]?.isDirty).toBe(false)
  await choose();await f.click('创建查询节点')
  await vi.waitFor(()=>expect(state.http.saves).toHaveLength(3))
  expect(state.http.saves.map(save=>save.table)).toEqual(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'])
  const node=state.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['name']==='Orders')!
  const model=state.http.records['Base_DataModel']!.find(row=>row['rowid']===node['node_config'])!
  expect(node).toMatchObject({workflow_id:'W1',node_type:'query',position_type:1})
  expect(model).toMatchObject({dataSetId:'W1',requestType:'query',MetaName:'Orders',DbId:'DB1'})
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
 it('binds connector conditions to node endpoints, cancels unapplied input and clears only the condition record',async()=>{
  const originalFilter=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'Count',operator:'eq',value:0}))
  state.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']=JSON.stringify([{rowid:'OUT',Name:'Count',Description:'数量',FieldType:'int'}])
  state.http.records['Base_DataModel_Relation']!.push({rowid:'RC',dataSetId:'W1',parentModId:'N1',childModId:'N1',filter:originalFilter})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  expect(state.http.reads.some(read=>read.table==='Base_DataModel_Relation')).toBe(false)
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'edge',id:'E1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererFilterExpression).exists()).toBe(true))
  const editor=f.wrapper.getComponent(RendererFilterExpression)
  expect(editor.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_DataModel_Relation@connector`)
  expect(editor.props('format')).toBe('spark-json');expect(editor.props('columns')).toEqual([{name:'Count',label:'数量',type:'int'}])
  await editor.get('input[aria-label="数字常量"]').setValue('3');await flushPromises()
  expect(f.wrapper.findAll('button').find(button=>button.text()==='保存条件')?.attributes('disabled')).toBeDefined()
  await f.click('取消条件修改');expect(state.dirty[0]?.isDirty).toBe(false)
  expect(editor.get('input[aria-label="数字常量"]').element).toHaveProperty('value','0')
  await editor.get('input[aria-label="数字常量"]').setValue('3');await flushPromises();await editor.get('[data-action="apply"]').trigger('click');await flushPromises()
  await f.click('保存条件')
  expect(state.http.saves.map(save=>save.table)).toEqual(['Base_DataModel_Relation'])
  expect(DataViewFilterCodec.parseStored(String(state.http.records['Base_DataModel_Relation']!.find(row=>row['rowid']==='RC')!['filter']))!.toJSON()).toEqual({field:'Count',operator:'eq',value:3})
  await editor.get('[data-action="clear"]').trigger('click');await flushPromises()
  const save=WorkflowConnectorCondition.save.bind(WorkflowConnectorCondition)
  vi.spyOn(WorkflowConnectorCondition,'save').mockImplementationOnce(async(ds,...args)=>{
   vi.spyOn(ds,'saveChanges').mockResolvedValueOnce({success:false,message:'明确拒绝删除'});return save(ds,...args)
  })
  await f.click('保存条件')
  expect(f.wrapper.text()).toContain('重试条件删除');expect(f.wrapper.text()).not.toContain('新增条件')
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
  await vi.waitFor(()=>expect(f.wrapper.text()).toContain('开始输入参数'))
  const json=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='inputParams')!
  expect(json.props('dataViewKey')).toBe(`${WORKFLOW_DESIGN}@Base_DataSet@default`);expect(json.props('mode')).toBe('rows')
  await json.get('tbody tr').trigger('click');await json.get('[data-json-edit]').trigger('click');await flushPromises()
  await json.findAll('tbody input')[2]!.setValue('changed');await flushPromises()
  expect(f.wrapper.findAll('button').find(button=>button.text()==='保存开始参数')?.attributes('disabled')).toBeDefined()
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
  expect(f.wrapper.findAll('button').find(b=>b.text()==='取消节点修改')?.attributes('disabled')).toBeDefined()
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
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.text()).toContain('布局文件不存在'))
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
  state.http.records['Base_WorkflowNodeDefinition']![0]!['node_type']=type
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  expect(state.http.reads.some(r=>r.table==='Base_DataModel')).toBe(false)
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  await vi.waitFor(()=>expect(f.wrapper.findAll('input').map(input=>input.element.value)).toContain(expected))
  expect(f.wrapper.findAllComponents(FieldJson).some(field=>field.props('field')==='node_config')).toBe(false)
  expect(state.http.reads.some(r=>r.table==='Base_DataModel_Field')).toBe(true)
  expect(state.http.saves).toEqual([])
 })
 it.each([{type:'query',position:0},{type:'query',position:2},{type:'merge',position:1},{type:'api_call',position:1},{type:'future_type',position:1}])('does not treat $type at position $position as an owned data model',async({type,position})=>{
  Object.assign(state.http.records['Base_WorkflowNodeDefinition']![0]!,{node_type:type,position_type:position})
  const f=await open();await vi.waitFor(()=>expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(true))
  f.wrapper.getComponent(RendererGraph).props('onSelect')?.({kind:'node',id:'N1',open:true,control:{cancel:false}});await flushPromises()
  expect(state.http.reads.some(read=>['Base_DataModel','Base_DataModel_Field','Base_DataModel_Relation'].includes(read.table))).toBe(false)
  expect(f.wrapper.text()).not.toContain('模型配置')
  expect(state.http.records['Base_WorkflowNodeDefinition']![0]).toMatchObject({node_type:type,position_type:position,node_config:'M1',dataOperateModId:'M2'})
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
  await vi.waitFor(()=>expect(f.wrapper.text()).toContain('当前节点引用的模型不存在'))
  expect(state.http.saves).toEqual([])
 })
 it('does not load node or connector views for a missing target',async()=>{
  const f=await open('MISSING');await vi.waitFor(()=>expect(f.wrapper.text()).toContain('当前工作流不存在'))
  expect(state.http.reads.map(r=>r.table)).toEqual(['Base_WorkflowDefinition']);expect(f.wrapper.findComponent(RendererGraph).exists()).toBe(false)
 })
})
