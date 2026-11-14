import {afterEach,expect,it,vi} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataViewFilter,DataViewFilterCodec} from '@spark-appworks/spark-data'
import {workflowExecutionFixture} from './workflow-execution.fixture'
import {readWorkflowExecutionPresentation} from '@/lowcode/resources/structured-config/workflow-definition/execution/runtime-bindings'
import {WorkflowExecutionContext} from '@/lowcode/resources/structured-config/workflow-definition/execution/execution-context'
const pages:PageRuntime[]=[]
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
it('binds before workflow input injection and executes a staged native command exactly once',async()=>{
 const f=await workflowExecutionFixture(pages),{id,presentation}=await f.stage()
 expect(presentation.blockedReason).toBeUndefined();expect(f.http.executions).toHaveLength(0)
 expect((await f.save(id)).success).toBe(true)
 expect(f.http.executions).toHaveLength(1);expect(f.http.executions[0]).toMatchObject({retry:0,data:{workflowId:'W1',nodeId:'N1',inputParams:{}}})
 expect(f.view.rows[0]).toMatchObject({commandId:id,outcome:'success'})
})
it.each(['target','input','node','edge','filter'] as const)('rejects a changed first %s contract before any execution POST',async change=>{
 const f=await workflowExecutionFixture(pages,'delete',true),{id,presentation}=await f.stage()
 expect(presentation.blockedReason).toBeUndefined()
 if(change==='target')f.http.records['Base_DataModel']![0]!['MetaName']='OtherTarget'
 if(change==='input')f.http.records['Base_DataModel_Field']![1]!['ValueFun']=JSON.stringify({Type:'GetConstValue',Value:'changed'})
 if(change==='node'){f.http.records['Base_WorkflowNodeDefinition']![1]!['dataOperateModId']='OTHER';await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()}
 if(change==='edge')f.http.records['Base_WorkflowConnectors']![0]!['targetID']='END'
 if(change==='filter')f.http.records['Base_DataModel']![0]!['Filter']=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'rowid',operator:'eq',value:'OTHER'}))
 await expect(f.save(id)).rejects.toThrow(/已变化|执行来源/)
 expect(f.http.executions).toHaveLength(0);expect(f.view.hasUnconfirmedSave).toBe(false)
 f.view.discardPendingChanges([id]);expect(f.view.rows).toEqual([])
})
it('accepts identical refreshed definition rows without resetting the captured request',async()=>{
 const f=await workflowExecutionFixture(pages),{id,presentation}=await f.stage(),original=f.ds.getView('Base_WorkflowNodeDefinition')!.rows[0]
 expect(presentation.blockedReason).toBeUndefined();await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()
 expect(f.ds.getView('Base_WorkflowNodeDefinition')!.rows[0]).not.toBe(original)
 expect((await f.save(id)).success).toBe(true);expect(f.http.executions).toHaveLength(1)
})
it('keeps the original unknown capture through abandonment and independent declaration changes',async()=>{
 const f=await workflowExecutionFixture(pages),{id,presentation}=await f.stage();expect(presentation.blockedReason).toBeUndefined();f.http.loseReceipt=true
 await expect(f.save(id)).rejects.toThrow('未知')
 expect(f.view.abandonUnconfirmedSave()).toBe(false);await expect(f.view.discardAndReload()).rejects.toThrow('DATA_VIEW_DISCARD_UNCONFIRMED')
 f.http.records['Base_WorkflowNodeDefinition']![1]!['dataOperateModId']='OTHER';await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()
 await expect(f.save(id)).rejects.toThrow('服务未提供');expect(f.http.executions).toHaveLength(1)
 expect(f.view.hasUnconfirmedSaveFor([id])).toBe(true)
})
it('keeps accepted input intact and readonly presentation fails after a declaration changes',async()=>{
 const f=await workflowExecutionFixture(pages),{id}=await f.stage()
 f.view.updateEditingValue(id,'input','{}');const original=String(f.view.getEditingRow(id)?.['input'])
 f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']=JSON.stringify([{rowid:'NEW',pid:null,Name:'value',FieldType:'string',isParent:false}]);await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()
 expect(()=>readWorkflowExecutionPresentation(f.view,id)).toThrow(/声明已变化|正式执行定义/)
 expect(f.view.getEditingRow(id)?.['input']).toBe(original);expect(f.http.executions).toHaveLength(0)
})
it('rejects a change during asynchronous preparation without adopting a new first contract',async()=>{
 const f=await workflowExecutionFixture(pages),{id,presentation}=await f.stage();expect(presentation.blockedReason).toBeUndefined()
 const original=WorkflowExecutionContext.prototype.validateNode
 vi.spyOn(WorkflowExecutionContext.prototype,'validateNode').mockImplementation(async function(this:WorkflowExecutionContext,...args){await original.apply(this,args);f.http.records['Base_WorkflowNodeDefinition']![1]!['dataOperateModId']='OTHER';await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()})
 await expect(f.save(id)).rejects.toThrow('正式执行定义已变化');expect(f.http.executions).toHaveLength(0)
})

it('accepts the same physical field set returned in another order',async()=>{
 const f=await workflowExecutionFixture(pages),{id,presentation}=await f.stage();expect(presentation.blockedReason).toBeUndefined()
 f.http.records['Base_TblField']!.reverse()
 expect((await f.save(id)).success).toBe(true);expect(f.http.executions).toHaveLength(1)
})
it('does not reset the first sources after an interrupted preparation and allows an unchanged retry',async()=>{
 const f=await workflowExecutionFixture(pages),{id,presentation}=await f.stage();expect(presentation.blockedReason).toBeUndefined()
 const original=WorkflowExecutionContext.prototype.validateNode,spy=vi.spyOn(WorkflowExecutionContext.prototype,'validateNode').mockImplementationOnce(async function(this:WorkflowExecutionContext,...args){await original.apply(this,args);throw Error('preflight interrupted')})
 await expect(f.save(id)).rejects.toThrow('preflight interrupted');expect(f.http.executions).toHaveLength(0);spy.mockRestore()
 f.http.records['Base_DataModel']![0]!['MetaName']='OtherTarget';await expect(f.save(id)).rejects.toThrow('执行来源')
 f.http.records['Base_DataModel']![0]!['MetaName']='Disposable';expect((await f.save(id)).success).toBe(true);expect(f.http.executions).toHaveLength(1)
})
it('rejects a preparation pass that skips its captured source reads',async()=>{
 const f=await workflowExecutionFixture(pages),{id,presentation}=await f.stage();expect(presentation.blockedReason).toBeUndefined()
 vi.spyOn(WorkflowExecutionContext.prototype,'validateNode').mockResolvedValueOnce(undefined)
 await expect(f.save(id)).rejects.toThrow('执行来源核对不完整');expect(f.http.executions).toHaveLength(0)
})
it('preserves a blocked initial definition until the original input is cancelled and explicitly opened again',async()=>{
 const f=await workflowExecutionFixture(pages),fields=f.http.records['Base_DataModel_Field']!
 f.http.records['Base_DataModel_Field']=[];const {id,presentation}=await f.stage();expect(presentation.blockedReason).toContain('值函数')
 f.http.records['Base_DataModel_Field']=fields
 await expect(f.save(id)).rejects.toThrow('值函数');expect(f.http.executions).toHaveLength(0)
 f.view.discardPendingChanges([id]);const next=await f.stage();expect(next.presentation.blockedReason).toBeUndefined();expect(next.id).not.toBe(id)
 expect((await f.save(next.id)).success).toBe(true);expect(f.http.executions).toHaveLength(1)
})
it('rejects a changed condition constant instead of only comparing its conditional flag',async()=>{
 const f=await workflowExecutionFixture(pages)
 const filter=(value:string)=>DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'name',operator:'eq',value}))
 f.http.records['Base_DataModel_Relation']=[{rowid:'COND',dataSetId:'W1',parentModId:'START',childModId:'N1',filter:filter('first')}]
 const {id,presentation}=await f.stage('workflow');expect(presentation.blockedReason).toBeUndefined()
 f.http.records['Base_DataModel_Relation']![0]!['filter']=filter('changed')
 await expect(f.save(id)).rejects.toThrow('执行来源');expect(f.http.executions).toHaveLength(0)
})
it('keeps a post-dispatch identity change unknown without replaying the original command',async()=>{
 const f=await workflowExecutionFixture(pages),{id,presentation}=await f.stage();expect(presentation.blockedReason).toBeUndefined()
 let release:()=>void=()=>undefined;f.http.hold=new Promise<void>(resolve=>{release=resolve})
 const saving=f.save(id).catch(cause=>cause)
 try{await vi.waitFor(()=>expect(f.http.executions).toHaveLength(1));f.http.records['Base_WorkflowNodeDefinition']![1]!['dataOperateModId']='OTHER';await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()}finally{release()}
 expect(await saving).toBeInstanceOf(Error);expect(f.view.hasUnconfirmedSaveFor([id])).toBe(true)
 await expect(f.save(id)).rejects.toThrow('服务未提供');expect(f.http.executions).toHaveLength(1)
})
it.each(['workflow-parameters','ancestor-output','incoming-edge'] as const)('rejects backend-only changes to the first %s contract without refreshing the host',async change=>{
 const f=await workflowExecutionFixture(pages)
 if(change!=='workflow-parameters'){
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']![1]!,{node_type:'query',node_config:'M1',dataOperateModId:''})
  await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()
 }
 const {id,presentation}=await f.stage(change==='workflow-parameters'?'workflow':'node')
 expect(presentation.blockedReason).toBeUndefined()
 if(change==='workflow-parameters')f.http.records['Base_DataSet']![0]!['inputParams']=JSON.stringify([{rowid:'P',Name:'quantity',FieldType:'int',Value:0}])
 if(change==='ancestor-output')f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']=JSON.stringify([{rowid:'P',Name:'quantity',FieldType:'int',isParent:false,pid:null}])
 if(change==='incoming-edge')f.http.records['Base_WorkflowConnectors']![0]!['sourceID']='END'
 await expect(f.save(id)).rejects.toThrow('正式执行定义已变化')
 expect(f.http.executions).toHaveLength(0);expect(f.view.hasUnconfirmedSave).toBe(false)
})
it('does not let another addRow claim the command while opening is preparing',async()=>{
 const f=await workflowExecutionFixture(pages);await f.view.refresh()
 let release:()=>void=()=>undefined,entered:()=>void=()=>undefined
 const held=new Promise<void>(resolve=>{release=resolve}),ready=new Promise<void>(resolve=>{entered=resolve}),original=WorkflowExecutionContext.prototype.validateNode
 vi.spyOn(WorkflowExecutionContext.prototype,'validateNode').mockImplementationOnce(async function(this:WorkflowExecutionContext,...args){entered();await held;return original.apply(this,args)})
 const opening=f.stage().catch(cause=>cause)
 try{await ready;await expect(f.view.addRow({mode:'node',nodeId:'N1',input:'{}'})).rejects.toThrow('明确打开');expect(f.view.rows).toHaveLength(0)}
 finally{release()}
 const {id}=await opening
 expect(f.view.rows).toHaveLength(1);expect(f.view.getPkKey(f.view.rows[0]!)).toBe(id);expect(f.http.executions).toHaveLength(0)
})
it('rejects a node identity added to the original whole-workflow command before dispatch',async()=>{
 const f=await workflowExecutionFixture(pages),{id,presentation}=await f.stage('workflow');expect(presentation.blockedReason).toBeUndefined()
 f.view.updateEditingValue(id,'nodeId','N1')
 await expect(f.save(id)).rejects.toThrow('整流测试不能指定节点')
 expect(f.http.executions).toHaveLength(0)
})
