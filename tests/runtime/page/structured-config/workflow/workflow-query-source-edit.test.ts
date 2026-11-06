import {afterEach,describe,expect,it,vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataView} from '@spark-appworks/spark-data'
import {openWorkflowQuerySourceEdit} from '@/lowcode/resources/structured-config/workflow-definition/query-source-edit'
import {workflowSourceEditFixture} from './workflow-source-edit.fixture'
import {createModelSourceEditHost,createModelSourceEditHandle} from '@/lowcode/data-space/model-source/source/lowcode-data-space-model-source-edit-session'
import {LowcodeDataSpaceFieldRemoveReferences} from '@/lowcode/data-space/model-source/removal/lowcode-data-space-field-remove-references'
import {LowcodeDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'
const pages:PageRuntime[]=[]
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
const source={type:'table' as const,id:'NEXT',name:'NextSource',description:'新来源',dbid:'DB2',databaseName:'next-db',providerId:''}
async function fixture(shared=true,legacyModelFlagTypes=false,legacyRelationFlagTypes=false,copy=false){
 const f=await workflowSourceEditFixture(pages,{legacyModelFlagTypes,legacyRelationFlagTypes})
 Object.assign(f.http.records['Base_DataModel']![0]!,{MetaName:'OldSource',DbId:'DB',DbName:'old-db',PrimaryKeyFields:'code'})
 f.http.records['Base_DataModel_Field']![0]!['IsPKey']=1
 if(!shared)f.http.records['Base_WorkflowNodeDefinition']=f.http.records['Base_WorkflowNodeDefinition']!.filter(row=>row['rowid']!=='SECOND')
 await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
 const reader={query:vi.fn(async()=>({rows:[source],total:1})),prepare:vi.fn(async()=>({source,model:{Type:'数据库表',MetaName:source.name,description:source.description,DbId:source.dbid,DbName:source.databaseName,JoinType:'',ForeignKeyFields:'',JoinFilter:'',PId:''},
  fields:[{type:'dataModel' as const,Name:'code',description:'编码',FieldType:'varchar',IsPKey:1,IsOutput:1,AsName:'',ValueFun:'',Expression:'',allowAIAdd:0,OrderType:'',Order:0,Group:0}]}))}
 vi.spyOn(LowcodeDataSpaceModelSourceReader,'readTableTarget').mockImplementation(async(_ds,target,check)=>{check();return{source:{...source,name:target.name,dbid:target.dbid,databaseName:target.databaseName},fields:(await reader.prepare()).fields}})
 if(copy){f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!['node_type']='copy';f.http.records['Base_DataModel']!.find(row=>row['rowid']==='MODEL')!['requestType']='copy';await Promise.all(['Base_DataModel','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))}
 const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',sources:reader,assertCurrent(){}})
 return{...f,reader,owner}
}
async function componentFixture(legacyRelationFlagTypes=false){
 const f=await fixture(true,false,legacyRelationFlagTypes);f.owner.cancel()
 f.http.records['Base_DataModel_Relation']=[{rowid:'SELF',dataSetId:'W',parentModId:'MODEL',childModId:'MODEL',parentTable:'ParentAlias',childTable:'ChildAlias',depType:'join',cascadeDel:0,filter:JSON.stringify({Type:'cond',Field:'ChildAlias.code',Operator:'equal',ValueFun:{Type:'GetTableField',Field:'ParentAlias.code'}})}]
 return{...f,owner:await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',sources:f.reader,assertCurrent(){}})}
}
describe('workflow query source edit composition',()=>{
 it.each([false,true])('keeps an existing empty operation directory unpublished on identical-source confirmation, output readonly=%s',async readonly=>{
  const f=await fixture(false);f.owner.cancel()
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!,{node_type:'edit',node_config:'',dataOperateModId:'MODEL',output_mapping:'[]'})
  f.http.records['Base_DataModel']![0]!['requestType']='edit';Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0,ValueFun:''})
  const previous=await f.reader.prepare(),same={...source,name:'OldSource',dbid:'DB',databaseName:'old-db'}
  f.reader.prepare.mockResolvedValue({...previous,source:same,model:{...previous.model,MetaName:same.name,DbId:same.dbid,DbName:same.databaseName,description:''}})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  if(readonly){const access=f.nodes.fieldAccess.bind(f.nodes);vi.spyOn(f.nodes,'fieldAccess').mockImplementation((row,key)=>key==='output_mapping'?{...access(row,key),write:'denied',component:'readonly',writeMode:'readonly'}:access(row,key))}
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  await owner.source.preview(same);await owner.source.save()
  expect(owner.getState().complete).toBe(true);expect(f.http.saves).toHaveLength(0)
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')?.['output_mapping']).toBe('[]');owner.close()
 })
 it('preserves indented published output without requesting write access when only the same-shape SQL target changes',async()=>{
  const f=await fixture(false);f.owner.cancel();const original=JSON.stringify([{Name:'code',rowid:'F',pid:null,Description:'编码',FieldType:'varchar',isParent:false}],null,2)
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!,{node_type:'edit',node_config:'',dataOperateModId:'MODEL',output_mapping:original})
  f.http.records['Base_DataModel']![0]!['requestType']='edit';Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0,ValueFun:''})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const access=f.nodes.fieldAccess.bind(f.nodes);vi.spyOn(f.nodes,'fieldAccess').mockImplementation((row,key)=>key==='output_mapping'?{...access(row,key),write:'denied',component:'readonly',writeMode:'readonly'}:access(row,key))
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  await owner.source.preview(source);await owner.source.save();expect(owner.getState().complete).toBe(true)
  expect(f.http.saves.map(save=>save.table)).toEqual(['Base_DataModel']);expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')?.['output_mapping']).toBe(original);owner.close()
 })
 it.each(['add','edit'])('refuses a %s source column addition before model submission when the changed output field is read-only',async operation=>{
  const f=await fixture(false);f.owner.cancel()
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!,{node_type:operation,node_config:'',dataOperateModId:'MODEL',output_mapping:JSON.stringify([{rowid:'F',pid:null,Name:'code',Description:'编码',FieldType:'varchar',isParent:false}])})
  f.http.records['Base_DataModel']![0]!['requestType']=operation;Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0,ValueFun:''})
  const previous=await f.reader.prepare();f.reader.prepare.mockResolvedValue({...previous,fields:[...previous.fields,{...previous.fields[0]!,Name:'note',IsPKey:0}]})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const access=f.nodes.fieldAccess.bind(f.nodes);vi.spyOn(f.nodes,'fieldAccess').mockImplementation((row,key)=>key==='output_mapping'?{...access(row,key),write:'denied',component:'readonly',writeMode:'readonly'}:access(row,key))
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  await owner.source.preview(source);await expect(owner.source.save()).rejects.toThrow('输出字段');expect(f.http.saves).toHaveLength(0);owner.cancel()
 })
 it('changes a copy source through the original source owner while retaining copy type and target configuration',async()=>{
  const f=await fixture(false,false,false,true)
  const state=f.owner.getState();expect(state.shared).toBe(false)
  const owner=f.owner.source!;await owner.preview(source)
  await owner.save()
  const node=f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!
  expect(node['node_type']).toBe('copy');expect(node['node_config']).toBe('MODEL')
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']==='MODEL')).toMatchObject({requestType:'copy',MetaName:'NextSource'})
 })
 it('does not persist an isolation copy when the selected formal node was rebound after opening',async()=>{
  const f=await fixture(true)
  f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!['node_config']='FORK'
  await expect(f.owner.isolate('Stale Copy')).rejects.toThrow('正式节点已变化')
  expect(f.http.saves).toHaveLength(0);f.owner.cancel()
 })
 it.each(['parent','relation','unrelated'] as const)('checks configured %s model endpoints when replacing an operation source',async dependency=>{
  const f=await fixture(false);f.owner.cancel()
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!,{node_type:'edit',node_config:'',dataOperateModId:'MODEL',output_mapping:'[]'})
  f.http.records['Base_DataModel']![0]!['requestType']='edit'
  Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0})
  Object.assign(f.http.records['Base_DataModel']![1]!,{RequestComplete:'existing-contract',...dependency==='parent'?{PId:'Orders'}:{}})
  if(dependency==='relation')f.http.records['Base_DataModel_Relation']=[{rowid:'R',dataSetId:'W',parentModId:'MODEL',childModId:'FORK',filter:''}]
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  await owner.source.preview(source)
  if(dependency==='unrelated'){
   expect(owner.source.getState().preview?.problems).toEqual([]);await owner.source.save();expect(owner.getState().complete).toBe(true);owner.close()
  }else{
   expect(owner.source.getState().preview?.problems.join(' ')).toContain('Isolated.RequestComplete')
   await expect(owner.source.save()).rejects.toThrow();expect(f.http.saves).toHaveLength(0);owner.cancel()
  }
 })
 it.each(['JoinFilter','PId','ForeignKeyFields','RequestComplete','items','addApi','updateApi','deleteApi'])('does not silently carry %s into a different operation source',async key=>{
  const f=await fixture(false);f.owner.cancel()
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!,{node_type:'edit',node_config:'',dataOperateModId:'MODEL',output_mapping:'[]'})
  Object.assign(f.http.records['Base_DataModel']![0]!,{requestType:'edit',[key]:'existing-contract'})
  Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  await owner.source.preview(source)
  expect(owner.source.getState().preview?.problems.join(' ')).toContain(key)
  await expect(owner.source.save()).rejects.toThrow();expect(f.http.saves).toHaveLength(0);owner.cancel()
 })
 it('reads field references from another model without a model filter before renaming operation inputs',async()=>{
  const f=await fixture(false);f.owner.cancel()
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!,{node_type:'edit',node_config:'',dataOperateModId:'MODEL',output_mapping:'[]'})
  f.http.records['Base_DataModel']![0]!['requestType']='edit'
  Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0,ValueFun:''})
  f.http.records['Base_DataModel_Field']![1]!['ValueFun']=JSON.stringify({Type:'GetTableField',Field:'Orders.code'})
  const prepared=await f.reader.prepare();f.reader.prepare.mockResolvedValue({...prepared,fields:prepared.fields.map(field=>({...field,Name:'nextCode'}))})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  await owner.source.preview(source);await owner.source.mapField({fieldId:'F',sourceName:'nextCode'})
  expect(owner.source.getState().preview?.problems.join(' ')).toContain('其他模型')
  await expect(owner.source.save()).rejects.toThrow();expect(f.http.saves).toHaveLength(0);owner.cancel()
 })
 it('checks published operation GetInputParam references before a source rename can write the model',async()=>{
  const f=await fixture(false);f.owner.cancel()
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!,{node_type:'edit',node_config:'',dataOperateModId:'MODEL',output_mapping:JSON.stringify([{rowid:'F',pid:null,Name:'code',Description:'编码',FieldType:'varchar',isParent:false}])})
  f.http.records['Base_DataModel']![0]!['requestType']='edit';Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0,ValueFun:''})
  f.http.records['Base_DataModel_Field']![1]!['ValueFun']=JSON.stringify({Type:'GetInputParam',ParamName:'QUERY.code'})
  const prepared=await f.reader.prepare();f.reader.prepare.mockResolvedValue({...prepared,fields:prepared.fields.map(field=>({...field,Name:'nextCode'}))})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  await owner.source.preview(source);await owner.source.mapField({fieldId:'F',sourceName:'nextCode'})
  await expect(owner.source.save()).rejects.toThrow();expect(f.http.saves).toHaveLength(0)
  expect(f.http.records['Base_DataModel']![0]?.['MetaName']).toBe('OldSource');owner.cancel()
 })
 it('pins node binding to the source contract already confirmed by the database phase',async()=>{
  const f=await fixture(true),target=await f.owner.isolate('Pinned Source')
  await f.owner.source.preview(source)
  const refresh=DataView.prototype.refresh;let changed=false
  vi.spyOn(DataView.prototype,'refresh').mockImplementation(async function(this:DataView,...args:Parameters<DataView['refresh']>){
   if(!changed&&this.tableName==='Base_DataModel'&&this.viewId.startsWith('workflowSourceCommit_')){
    changed=true;f.http.records['Base_DataModel']!.find(row=>row['rowid']===target)!['MetaName']='ThirdTarget'
   }
   return refresh.apply(this,args)
  })
  await expect(f.owner.source.save()).rejects.toThrow('已确认目标')
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')?.['node_config']).toBe('MODEL')
  const writes=f.http.saves.length
  f.http.records['Base_DataModel']!.find(row=>row['rowid']===target)!['MetaName']='NextSource'
  await f.owner.source.verify();expect(f.owner.getState().complete).toBe(true)
  expect(f.http.saves.slice(writes).map(item=>item.table)).toEqual(['Base_WorkflowNodeDefinition']);f.owner.close()
 })
 it('rejects a new formal consumer added after source preview without refreshing the page',async()=>{
  const f=await fixture(false)
  await f.owner.source.preview(source)
  f.http.records['Base_WorkflowNodeDefinition']!.push({rowid:'LATE',workflow_id:'W',position_type:1,node_type:'query',node_config:'MODEL',dataOperateModId:'',output_mapping:'[]'})
  await expect(f.owner.source.save()).rejects.toThrow('消费者')
  expect(f.http.saves).toHaveLength(0)
  expect(f.http.records['Base_DataModel']![0]?.['MetaName']).toBe('OldSource');f.owner.cancel()
 })
 it('does not create an isolated operation model when the current query denies rebinding',async()=>{
  const f=await fixture(true);f.owner.cancel()
  for(const node of f.http.records['Base_WorkflowNodeDefinition']!)if(['QUERY','SECOND'].includes(String(node['rowid'])))Object.assign(node,{node_type:'edit',node_config:'',dataOperateModId:'MODEL',output_mapping:'[]'})
  f.http.records['Base_DataModel']![0]!['requestType']='edit'
  Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0})
  f.http.interceptors.response.use({onResponse:response=>{
   const body=response.data as {Result?:{data?:{Items?:Array<Record<string,unknown>>}}}
   for(const row of body.Result?.data?.Items??[])if(row['rowid']==='QUERY'&&row['workflow_id']==='W'){
    const permissions=row['lingma_sys_params'] as {e:string[]};permissions.e=permissions.e.filter(key=>key!=='dataOperateModId')
   }
   return response
  }})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  await expect(owner.isolate('Forbidden Copy')).rejects.toThrow('不允许')
  expect(f.http.saves).toHaveLength(0);owner.cancel()
 })
 it.each(['source','node'] as const)('recovers the same operation %s capture without repeating target or node writes',async phase=>{
  const f=await fixture(phase==='node');f.owner.cancel()
  for(const node of f.http.records['Base_WorkflowNodeDefinition']!)if(['QUERY','SECOND'].includes(String(node['rowid'])))Object.assign(node,{node_type:'delete',node_config:'',dataOperateModId:'MODEL',output_mapping:'[]'})
  f.http.records['Base_DataModel']![0]!['requestType']='delete';Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0,ValueFun:JSON.stringify({Type:'GetConstValue',Value:0})})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  const target=phase==='node'?await owner.isolate('Captured Operation'):'MODEL'
  await owner.source.preview(source);const baseline=f.http.saves.length
  if(phase==='source')f.http.failAfterWrite=true
  else f.http.beforeSave=async()=>{if(f.http.saves.length>baseline)f.http.failAfterWrite=true}
  await expect(owner.source.save()).rejects.toThrow();delete f.http.beforeSave;f.http.failAfterWrite=false
  const writes=f.http.saves.length;await owner.source.verify()
  expect(owner.getState().complete).toBe(true);expect(f.http.saves).toHaveLength(writes+(phase==='source'?1:0))
  const confirmedWrites=f.http.saves.length;await owner.source.verify();expect(f.http.saves).toHaveLength(confirmedWrites)
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')).toMatchObject({dataOperateModId:target,node_config:'',output_mapping:expect.stringContaining('"pid":null')})
  owner.close()
 })
 it('isolates a shared operation target through the existing fork and changes only the selected node target',async()=>{
  const f=await fixture(true);f.owner.cancel()
  for(const node of f.http.records['Base_WorkflowNodeDefinition']!)if(['QUERY','SECOND'].includes(String(node['rowid'])))Object.assign(node,{node_type:'edit',node_config:'',dataOperateModId:'MODEL',output_mapping:'[]'})
  f.http.records['Base_DataModel']![0]!['requestType']='edit';Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0,ValueFun:JSON.stringify({Type:'GetConstValue',Value:0})})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const originalModel=structuredClone(f.http.records['Base_DataModel']![0]),originalField=structuredClone(f.http.records['Base_DataModel_Field']![0])
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}})
  expect(()=>owner.source).toThrow('共享模型');const id=await owner.isolate('Operation Copy')
  await owner.source.preview(source);expect(owner.source.getState().preview?.problems).toEqual([]);await owner.source.save()
  expect(owner.getState().complete).toBe(true)
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')).toMatchObject({dataOperateModId:id,node_config:'',output_mapping:expect.stringContaining('"pid":null')})
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='SECOND')?.['dataOperateModId']).toBe('MODEL')
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']==='MODEL')).toEqual(originalModel)
  expect(f.http.records['Base_DataModel_Field']!.find(row=>row['rowid']==='F')).toEqual(originalField)
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']===id)).toMatchObject({requestType:'edit',MetaName:'NextSource',DbName:'next-db'})
  owner.close()
 })
 it.each(['add','edit','delete'] as const)('repairs and changes an independent %s target through common metadata submission and exact node readback',async operation=>{
  const f=await fixture(false);f.owner.cancel()
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!,{node_type:operation,node_config:'',dataOperateModId:'MODEL',output_mapping:'[]'})
  Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0,ValueFun:JSON.stringify({Type:'GetConstValue',Value:0})})
  await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
  const input={dataSet:f.ds,workflowId:'W',nodeId:'QUERY',operation:true,sources:f.reader,assertCurrent(){}}
  const cancelled=await openWorkflowQuerySourceEdit(input);await cancelled.source.preview(source);cancelled.cancel();expect(f.http.saves).toHaveLength(0)
  const owner=await openWorkflowQuerySourceEdit(input);await owner.source.preview(source)
  expect(owner.source.getState().preview?.problems).toEqual([])
  await owner.source.save();expect(owner.getState().complete).toBe(true)
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']==='MODEL')).toMatchObject({requestType:operation,DbId:'DB2',DbName:'next-db',MetaName:'NextSource'})
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')).toMatchObject({node_type:operation,node_config:'',dataOperateModId:'MODEL',output_mapping:expect.stringContaining('"pid":null')})
  expect(f.http.records['Base_DataModel_Field']![0]).toMatchObject({rowid:'F',type:'inputParams',ValueFun:JSON.stringify({Type:'GetConstValue',Value:0}),IsOutput:0})
  expect(f.http.saves.map(save=>save.table)).toEqual(['Base_DataModel','Base_WorkflowNodeDefinition']);owner.close()
 })
 it('checks operation input references in the same stable-ID migration without replaying a separately validated own Filter',async()=>{
  const f=await fixture(false);f.owner.cancel()
  const filter=JSON.stringify({Type:'cond',Field:'code',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'code'}})
  f.http.records['Base_DataModel']![0]!['Filter']=filter;f.http.records['Base_DataModel_Field']![0]!['type']='inputParams'
  f.http.records['Base_DataModel_Relation']=[{rowid:'R',dataSetId:'W',parentModId:'MODEL',childModId:'MODEL',parentTable:'ParentAlias',childTable:'ChildAlias',filter:JSON.stringify({Type:'cond',Field:'ChildAlias.code',Operator:'equal',ValueFun:{Type:'GetTableField',Field:'ParentAlias.code'}})}]
  const models=f.ds.getView('Base_DataModel','modelCatalog')!,fields=f.ds.getView('Base_DataModel_Field')!,relations=f.ds.getView('Base_DataModel_Relation','asParent')!
  models.queryContext={dataSpaceId:'W'};await Promise.all([models.refresh(),fields.refresh(),relations.refresh()])
  const input={views:[models,fields,relations],modelId:'MODEL',mappings:[{id:'F',name:'nextCode'}],primaryReplacement:'nextCode',fieldPurpose:'inputParams' as const,modelFilterChange:{before:filter,after:JSON.stringify({Type:'cond',Field:'nextCode',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'code'}})}}
  const updates=LowcodeDataSpaceFieldRemoveReferences.prepareRenames(input)
  expect(updates).toHaveLength(1);expect(JSON.parse(updates[0]!.after)).toMatchObject({Field:'ChildAlias.nextCode',ValueFun:{Field:'ParentAlias.nextCode'}})
  expect(()=>LowcodeDataSpaceFieldRemoveReferences.prepareRenames({...input,modelFilterChange:{before:'changed baseline',after:''}})).toThrow('基线')
  expect(f.http.saves).toHaveLength(0)
 })
 it('uses the common source submit chain for optional operation inputs without projecting them as query outputs',async()=>{
  const f=await fixture(false);f.owner.cancel()
  f.http.records['Base_DataModel']![0]!['requestType']='add'
  Object.assign(f.http.records['Base_DataModel_Field']![0]!,{type:'inputParams',IsOutput:0,ValueFun:JSON.stringify({Type:'GetConstValue',Value:0})})
  const next=await f.reader.prepare();f.reader.prepare.mockResolvedValue({...next,fields:[...next.fields,{...next.fields[0]!,Name:'description',IsPKey:0,IsOutput:0}]})
  const models=f.ds.getView('Base_DataModel','modelCatalog')!,fields=f.ds.getView('Base_DataModel_Field','modelInputFields')!,relations=f.ds.getView('Base_DataModel_Relation','asParent')!
  for(const view of [models,fields,relations])view.queryContext={dataSpaceId:'W',workflowId:'W',modelId:'MODEL',...view===fields?{modelIds:['MODEL']}: {}}
  await Promise.all([models.refresh(),fields.refresh(),relations.refresh()])
  let contract:unknown
  const owner=createModelSourceEditHandle(createModelSourceEditHost({dataSet:f.ds,targetId:'W',modelId:'MODEL',sources:f.reader,views:{models:models.viewId,fields:fields.viewId,relations:relations.viewId,fieldTemplate:fields.viewId},
   lifecycle:{assertCurrent(){},onDispatch(){},completed(){},validateConfiguration:async()=>()=>{},inputTarget:{requestType:'add',prepareContract:async change=>{contract=change;return{viewChanges:[],check(){},assertCurrent:async()=>{},complete:async()=>{}}},validateRemovals:async()=>()=>{}}}}))
  await owner.preview(source)
  expect(owner.getState().preview?.problems).toEqual([])
  expect(contract).toMatchObject({modelId:'MODEL',sourcePrimaryKey:'code',after:{model:{requestType:'add'},fields:expect.arrayContaining([expect.objectContaining({sourceName:'description',values:expect.objectContaining({type:'inputParams',ValueFun:''})})])}})
  owner.discard();expect(f.http.saves).toHaveLength(0)
  await owner.preview(source);await owner.save()
  expect(f.http.records['Base_DataModel']![0]).toMatchObject({rowid:'MODEL',requestType:'add',DbId:'DB2',DbName:'next-db',MetaName:'NextSource'})
  expect(f.http.records['Base_DataModel_Field']!.filter(row=>row['dataModelId']==='MODEL')).toEqual(expect.arrayContaining([
   expect.objectContaining({rowid:'F',type:'inputParams',ValueFun:JSON.stringify({Type:'GetConstValue',Value:0})}),expect.objectContaining({type:'inputParams',Name:'description',ValueFun:'',IsOutput:0})]))
  expect(f.http.saves.some(save=>save.table==='Base_WorkflowNodeDefinition')).toBe(false)
  const writes=f.http.saves.length,stored=f.http.records['Base_DataModel']!.find(row=>row['rowid']==='MODEL')!
  const filter=JSON.stringify({Type:'cond',Field:'code',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:0}})
  stored['Filter']=filter;await models.refresh()
  const last={...source,id:'LAST',name:'FinalTarget',dbid:'DB3',databaseName:'last-db'}
  f.reader.prepare.mockResolvedValue({source:last,model:{...next.model,MetaName:last.name,DbId:last.dbid,DbName:last.databaseName},fields:[{...next.fields[0]!,Name:'targetCode'},{...next.fields[0]!,Name:'description',IsPKey:0,IsOutput:0}]})
  await owner.preview(last);await owner.removeField({fieldId:'F',removed:true})
  expect(owner.getState().preview?.problems.join(' ')).toContain('清空旧条件')
  if(!owner.setInputTargetFilterReset)throw Error('missing explicit filter reset')
  await owner.setInputTargetFilterReset(true);expect(owner.getState().preview?.problems).toEqual([])
  owner.discard();expect(f.http.saves).toHaveLength(writes);expect(stored['Filter']).toBe(filter)
  await owner.preview(last);expect(owner.getState().preview?.clearFilter).toBe(false)
  await owner.removeField({fieldId:'F',removed:true});await owner.setInputTargetFilterReset(true);await owner.save()
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']==='MODEL')).toMatchObject({MetaName:'FinalTarget',DbName:'last-db',Filter:'',requestType:'add'})
  expect(f.http.records['Base_DataModel_Field']!.some(row=>row['rowid']==='F')).toBe(false)
  expect(f.http.records['Base_DataModel_Field']!.filter(row=>row['dataModelId']==='MODEL').map(row=>row['Name']).sort()).toEqual(['description','targetCode'])
 })
 it('retains the persisted numeric relation flag and can abandon a legacy string declaration rejected before dispatch',async()=>{
  const f=await componentFixture(true),before=structuredClone(f.http.records)
  await expect(f.owner.isolate('Copy')).rejects.toThrow('DATA_VIEW_SAVE_VALIDATION')
  expect(f.owner.getState().isolation?.canAbandonNotApplied).toBe(true);expect(f.http.saves).toHaveLength(0)
  await f.owner.abandonIsolationNotApplied();f.owner.cancel();expect(f.http.records).toEqual(before)
 })
 it('captures a native new field even when a post-add event throws, then cancels only its undispatched creations',async()=>{
  const f=await componentFixture(),original=DataView.prototype.addRow
  vi.spyOn(DataView.prototype,'addRow').mockImplementation(async function(this:DataView,...args){const row=await original.apply(this,args);if(this.tableName==='Base_DataModel_Field'&&this.viewId.startsWith('modelComponentFork_'))throw Error('post-add event failed');return row})
  await expect(f.owner.isolate('Copy')).rejects.toThrow('post-add event failed');expect(f.http.saves).toHaveLength(0)
  await expect(f.owner.verifyIsolation()).rejects.toThrow('未派发')
  expect(Object.values(f.ds.tables).flatMap(table=>table.viewList).every(view=>view.dirtyTracking.pendingCreateIds.size===0)).toBe(true)
  f.owner.cancel()
 })
 it('refuses a copied component when the original selected field view gains a later edit',async()=>{
  const f=await componentFixture(),original=DataView.prototype.addRow
  const sourceView=f.ds.getTable('Base_DataModel_Field')!.viewList.find(view=>view.viewId.startsWith('workflowSource_')&&!view.viewId.endsWith('_template')&&JSON.stringify(view.queryContext['modelIds'])==='["MODEL"]')!
  vi.spyOn(DataView.prototype,'addRow').mockImplementation(async function(this:DataView,...args){const row=await original.apply(this,args);if(this.tableName==='Base_DataModel'&&this.viewId.startsWith('modelComponentFork_'))sourceView.updateEditingValue('F','description','late-original');return row})
  await expect(f.owner.isolate('Copy')).rejects.toThrow('原字段');expect(f.http.saves).toHaveLength(0)
  expect(sourceView.getEditingRow('F')?.['description']).toBe('late-original')
  await expect(f.owner.verifyIsolation()).rejects.toThrow('未派发');f.owner.cancel()
  expect(sourceView.getEditingRow('F')?.['description']).toBe('late-original')
  expect(Object.values(f.ds.tables).flatMap(table=>table.viewList).every(view=>view.dirtyTracking.pendingCreateIds.size===0)).toBe(true)
 })
 it.each(['Base_DataModel','Base_DataModel_Relation'])('preserves a late original %s edit and clears only undispatched component creations',async table=>{
  const f=await componentFixture(),original=DataView.prototype.addRow
  const sourceView=f.ds.getTable(table)!.viewList.find(view=>view.viewId.startsWith('workflowSource_'))!,key=table==='Base_DataModel'?'MODEL':'SELF',field=table==='Base_DataModel'?'description':'filter'
  vi.spyOn(DataView.prototype,'addRow').mockImplementation(async function(this:DataView,...args){const row=await original.apply(this,args);if(this.tableName==='Base_DataModel'&&this.viewId.startsWith('modelComponentFork_'))sourceView.updateEditingValue(key,field,'late-original');return row})
  await expect(f.owner.isolate('Copy')).rejects.toThrow('原来源');expect(f.http.saves).toHaveLength(0)
  await expect(f.owner.verifyIsolation()).rejects.toThrow('未派发');f.owner.cancel()
  expect(sourceView.getEditingRow(key)?.[field]).toBe('late-original')
  expect(Object.values(f.ds.tables).flatMap(t=>t.viewList).every(view=>view.dirtyTracking.pendingCreateIds.size===0)).toBe(true)
 })
 it('keeps all component identities across a lost original batch receipt without creating again',async()=>{
  const f=await componentFixture();f.http.failAfterWrite=true
  await expect(f.owner.isolate('Copy')).rejects.toThrow();const captured=f.owner.getState().isolation?.fork,writes=f.http.saves.length
  expect(writes).toBe(3);expect(captured?.modelId).toBeTruthy()
  await f.owner.verifyIsolation();expect(f.http.saves).toHaveLength(writes)
  expect(f.owner.getState().isolation?.fork).toMatchObject({...captured,confirmed:true});expect(f.owner.getState().source).toBeDefined()
 })
 it('does not abandon a partially applied component when a copied relation is absent after a lost receipt',async()=>{
  const f=await componentFixture();f.http.failAfterWrite=true
  await expect(f.owner.isolate('Copy')).rejects.toThrow();const captured=f.owner.getState().isolation?.fork,writes=f.http.saves.length
  f.http.records['Base_DataModel_Relation']=f.http.records['Base_DataModel_Relation']!.filter(row=>row['rowid']==='SELF')
  await expect(f.owner.verifyIsolation()).rejects.toThrow();expect(f.http.saves).toHaveLength(writes)
  expect(f.owner.getState().isolation?.canAbandonNotApplied).toBe(false)
  expect(f.owner.getState().isolation?.fork?.modelId).toBe(captured?.modelId)
  await expect(f.owner.abandonIsolationNotApplied()).rejects.toThrow();expect(f.http.saves).toHaveLength(writes)
 })
 it('abandons a rejected component batch only after the original verifier proves not applied',async()=>{
  const f=await componentFixture(),before=structuredClone(f.http.records);f.http.beforeSave=async()=>{throw Error('rejected')}
  await expect(f.owner.isolate('Copy')).rejects.toThrow();delete f.http.beforeSave
  await expect(f.owner.verifyIsolation()).rejects.toThrow('尚未完整确认');expect(f.owner.getState().isolation?.canAbandonNotApplied).toBe(true)
  await f.owner.abandonIsolationNotApplied();f.owner.cancel();expect(f.http.records).toEqual(before);expect(f.http.saves).toHaveLength(0)
  expect(Object.values(f.ds.tables).flatMap(table=>table.viewList).some(view=>view.viewId.startsWith('modelComponentFork_'))).toBe(false)
 })
 it('preserves later component edits and explicitly discards only captured targets without repeating creation',async()=>{
  const f=await componentFixture();f.http.beforeSave=async()=>{const key=f.owner.getState().isolation?.fork?.modelId;if(!key)throw Error('missing captured root');const view=f.ds.getTable('Base_DataModel')!.viewList.find(view=>view.rows.some(row=>row['rowid']===key));if(!view)throw Error('missing original component view');view.updateEditingValue(key,'description','late')}
  await expect(f.owner.isolate('Copy')).rejects.toThrow('后续修改');delete f.http.beforeSave
  const state=f.owner.getState().isolation,writes=f.http.saves.length;expect(state?.canDiscardLocalChanges).toBe(true)
  await f.owner.discardIsolationLocalChanges();expect(f.http.saves).toHaveLength(writes);expect(f.owner.getState().modelId).toBe(state?.fork?.modelId);expect(f.owner.getState().source).toBeDefined()
 })
 it('discards only undispatched component creations after a relation-add permission refusal',async()=>{
  const f=await componentFixture(),before=structuredClone(f.http.records);f.http.denyAdd.add('Base_DataModel_Relation')
  await expect(f.owner.isolate('Copy')).rejects.toThrow('不允许创建');expect(f.http.saves).toHaveLength(0)
  await expect(f.owner.verifyIsolation()).rejects.toThrow('未派发');expect(f.http.records).toEqual(before)
  expect(f.ds.getTable('Base_DataModel')!.viewList.every(view=>view.dirtyTracking.pendingCreateIds.size===0)).toBe(true)
  f.owner.cancel()
 })
 it('isolates the whole incident model component and preserves the original graph before switching only the target node',async()=>{
  const f=await fixture();f.owner.cancel()
  const relation={rowid:'REL',dataSetId:'W',parentModId:'FORK',childModId:'MODEL',parentTable:'ParentAlias',childTable:'ChildAlias',depType:'join',cascadeDel:0,filter:JSON.stringify({Type:'cond',Field:'ChildAlias.code',Operator:'equal',ValueFun:{Type:'GetTableField',Field:'ParentAlias.isolated'}})}
  f.http.records['Base_DataModel_Relation']=[relation]
  const before=structuredClone(f.http.records)
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',sources:f.reader,assertCurrent(){}})
  expect(owner.isolationPlan('IsolatedQuery')).toMatchObject({relationCount:1,models:[{from:'MODEL',name:'IsolatedQuery'},{from:'FORK',name:'IsolatedQuery__Isolated'}]});expect(f.http.saves).toHaveLength(0)
  const id=await owner.isolate('IsolatedQuery')
  expect(f.http.records['Base_DataModel']).toHaveLength(4)
  expect(f.http.records['Base_DataModel_Field']).toHaveLength(4)
  expect(f.http.records['Base_DataModel_Relation']).toHaveLength(2)
  const copied=f.http.records['Base_DataModel_Relation']!.find(row=>row['rowid']!=='REL')!
  expect(copied['childModId']).toBe(id);expect(copied['parentModId']).not.toBe('FORK')
  expect(f.http.records['Base_DataModel_Relation']!.find(row=>row['rowid']==='REL')).toEqual(relation)
  expect(f.http.records['Base_WorkflowNodeDefinition']).toEqual(before['Base_WorkflowNodeDefinition'])
  await owner.source.preview(source);expect(owner.source.getState().preview?.problems).toEqual([]);await owner.source.save()
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')?.['node_config']).toBe(id)
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='SECOND')).toEqual(before['Base_WorkflowNodeDefinition']![2])
  expect(f.http.records['Base_DataModel']!.filter(row=>['MODEL','FORK'].includes(String(row['rowid'])))).toEqual(before['Base_DataModel'])
  expect(f.http.records['Base_DataModel_Relation']!.find(row=>row['rowid']==='REL')).toEqual(relation)
  expect(owner.getState().complete).toBe(true)
 })
 it('opens and cancels without creating an isolation model or changing source definitions',async()=>{
  const f=await fixture(),before=structuredClone(f.http.records)
  expect(f.owner.getState().shared).toBe(true);expect(f.owner.getState().modelId).toBe('MODEL')
  f.owner.cancel();expect(f.http.records).toEqual(before);expect(f.http.saves).toHaveLength(0)
 })
 it('replaces an exclusive model through the original source owner and then confirms node output',async()=>{
  const f=await fixture(false)
  await f.owner.source.preview(source);expect(f.http.saves).toHaveLength(0)
  expect(f.owner.source.getState().preview?.problems).toEqual([])
  await f.owner.source.save()
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']==='MODEL')).toMatchObject({MetaName:'NextSource',DbId:'DB2',requestType:'query'})
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')?.['node_config']).toBe('MODEL')
  expect(f.owner.getState().complete).toBe(true)
 })
 it('isolates only on an explicit creation action, then preserves the old shared source and other node',async()=>{
  const f=await fixture(),oldModel=structuredClone(f.http.records['Base_DataModel']![0]),oldField=structuredClone(f.http.records['Base_DataModel_Field']![0]),other=structuredClone(f.http.records['Base_WorkflowNodeDefinition']![2])
  const id=await f.owner.isolate('IsolatedQuery');expect(id).not.toBe('MODEL')
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')?.['node_config']).toBe('MODEL')
  await f.owner.source.preview(source);expect(f.owner.source.getState().preview?.problems).toEqual([]);await f.owner.source.save()
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']==='MODEL')).toEqual(oldModel)
  expect(f.http.records['Base_DataModel_Field']!.find(row=>row['rowid']==='F')).toEqual(oldField)
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='SECOND')).toEqual(other)
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']===id)?.['MetaName']).toBe('NextSource')
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')?.['node_config']).toBe(id)
  expect(f.owner.getState().complete).toBe(true)
 })
 it('retains the same isolation identities across a lost creation receipt',async()=>{
  const f=await fixture();f.http.failAfterWrite=true
  await expect(f.owner.isolate('IsolatedQuery')).rejects.toThrow();const fork=f.owner.getState().isolation?.fork,writes=f.http.saves.length
  expect(fork?.modelId).toBeTruthy();expect(()=>f.owner.source).toThrow('隔离模型')
  await f.owner.verifyIsolation();expect(f.http.saves).toHaveLength(writes);expect(f.owner.getState().modelId).toBe(fork?.modelId)
  expect(()=>f.owner.cancel()).toThrow('须继续核验')
 })
 it('can correct an isolation name rejected before any dispatch',async()=>{
  const f=await fixture();await expect(f.owner.isolate('Orders')).rejects.toThrow();expect(f.http.saves).toHaveLength(0)
  const id=await f.owner.isolate('IsolatedQuery');expect(id).not.toBe('MODEL')
 })
 it('verifies the original source batch and continues the node without replaying the source update',async()=>{
  const f=await fixture(false);await f.owner.source.preview(source);f.http.failAfterWrite=true
  await expect(f.owner.source.save()).rejects.toThrow()
  expect(f.http.saves.filter(save=>save.table==='Base_DataModel')).toHaveLength(1)
  await f.owner.source.verify();expect(f.owner.getState().complete).toBe(true)
  expect(f.http.saves.filter(save=>save.table==='Base_DataModel')).toHaveLength(1)
 })
 it('separates existing node conditions from model relationships and diagnoses orphan endpoints',async()=>{
  const f=await fixture(false);f.owner.cancel()
  f.http.records['Base_DataModel_Relation']=[{rowid:'CONDITION',dataSetId:'W',parentModId:'START',childModId:'QUERY',filter:''}]
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',sources:f.reader,assertCurrent(){}})
  await owner.source.preview(source);expect(owner.source.getState().preview?.problems).toEqual([]);owner.cancel()
  f.http.records['Base_DataModel_Relation']![0]!['childModId']='ORPHAN'
  await expect(openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',sources:f.reader,assertCurrent(){}})).rejects.toThrow('孤立关系')
  expect(f.http.saves).toHaveLength(0)
 })
 it('continues only the original node capture after its receipt is lost',async()=>{
  const f=await fixture(false);await f.owner.source.preview(source)
  f.http.beforeSave=async()=>{if(f.http.saves.some(save=>save.table==='Base_DataModel'))f.http.failAfterWrite=true}
  await expect(f.owner.source.save()).rejects.toThrow();delete f.http.beforeSave
  const writes=f.http.saves.length;expect(f.owner.getState().node?.dispatched).toBe(true)
  await f.owner.source.verify();expect(f.owner.getState().complete).toBe(true);expect(f.http.saves).toHaveLength(writes)
 })
 it('carries explicitly accepted field types through the source save and formal node output',async()=>{
  const f=await fixture(false)
  f.reader.prepare.mockImplementation(async()=>({source,model:{Type:'数据库表',MetaName:source.name,description:source.description,DbId:source.dbid,DbName:source.databaseName,JoinType:'',ForeignKeyFields:'',JoinFilter:'',PId:''},fields:[{type:'dataModel',Name:'code',description:'编码',FieldType:'int',IsPKey:1,IsOutput:1,AsName:'',ValueFun:'',Expression:'',allowAIAdd:0,OrderType:'',Order:0,Group:0}]}))
  await f.owner.source.preview(source);f.owner.source.confirmFieldContract({fieldId:'F',accepted:true})
  await f.owner.source.save();expect(f.http.records['Base_DataModel_Field']!.find(row=>row['rowid']==='F')?.['FieldType']).toBe('int')
  const output=JSON.parse(String(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')?.['output_mapping'])) as Array<Record<string,unknown>>
  expect(output.find(row=>row['rowid']==='F')?.['FieldType']).toBe('int');expect(f.owner.getState().complete).toBe(true)
 })
 it('can explicitly remove an unused old field while keeping dependency proof separate from its own source delta',async()=>{
  const f=await fixture(false);f.owner.cancel()
  f.http.records['Base_DataModel_Field']!.push({rowid:'OLD',dataSetId:'W',dataModelId:'MODEL',type:'dataModel',Name:'obsolete',FieldType:'varchar',IsPKey:0,IsOutput:0})
  await f.ds.getView('Base_DataModel_Field')!.refresh()
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',sources:f.reader,assertCurrent(){}})
  await owner.source.preview(source);await owner.source.removeField({fieldId:'OLD',removed:true});expect(owner.source.getState().preview?.problems).toEqual([])
  await owner.source.save();expect(f.http.records['Base_DataModel_Field']!.some(row=>row['rowid']==='OLD')).toBe(false);expect(owner.getState().complete).toBe(true)
 })
 it('checks invalid old output even when new output fields are explicitly included',async()=>{
  const f=await fixture(false);f.owner.cancel()
  f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!['output_mapping']='[{"rowid":"BAD","pid":null}]';await f.nodes.refresh()
  const prepared=await f.reader.prepare();f.reader.prepare.mockResolvedValue({...prepared,fields:[...prepared.fields,{...prepared.fields[0]!,Name:'extra',IsPKey:0}]})
  const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',sources:f.reader,assertCurrent(){}})
  await owner.source.preview(source);await owner.source.includeField({sourceName:'extra',included:true})
  await expect(owner.source.save()).rejects.toThrow('原查询输出');expect(f.http.saves).toHaveLength(0)
 })
 it('can explicitly abandon an isolation batch independently confirmed not applied without replay',async()=>{
  const f=await fixture();f.http.beforeSave=async()=>{throw Error('rejected')}
  await expect(f.owner.isolate('IsolatedQuery')).rejects.toThrow();delete f.http.beforeSave;await expect(f.owner.verifyIsolation()).rejects.toThrow()
  expect(f.owner.getState().isolation?.canAbandonNotApplied).toBe(true)
  await f.owner.abandonIsolationNotApplied();f.owner.cancel();expect(f.http.saves).toHaveLength(0)
 })
 it('explicitly discards only later isolation edits and verifies the same created model without replay',async()=>{
  const f=await fixture();f.http.beforeSave=async()=>{const id=f.owner.getState().isolation?.fork?.modelId;if(!id)throw Error('missing captured model');const view=f.ds.getTable('Base_DataModel')!.viewList.find(view=>view.rows.some(row=>row['rowid']===id));if(!view)throw Error('missing original view');view.updateEditingValue(id,'description','later-description')}
  await expect(f.owner.isolate('IsolatedQuery')).rejects.toThrow();delete f.http.beforeSave
  const state=f.owner.getState().isolation,writes=f.http.saves.length;expect(state?.canDiscardLocalChanges).toBe(true)
  await f.owner.discardIsolationLocalChanges();expect(f.owner.getState().modelId).toBe(state?.fork?.modelId);expect(f.http.saves).toHaveLength(writes)
  expect(f.owner.getState().source).toBeDefined()
 })
 it('can abandon an original creation rejected by native column validation before any request was dispatched',async()=>{
  const f=await fixture(true,true);f.http.records['Base_DataModel']![0]!['IsBusiness']=0
  await expect(f.owner.isolate('IsolatedQuery')).rejects.toThrow('DATA_VIEW_SAVE_VALIDATION')
  await expect(f.owner.verifyIsolation()).rejects.toThrow('尚未完整确认');expect(f.owner.getState().isolation?.canAbandonNotApplied).toBe(true)
  await f.owner.abandonIsolationNotApplied();f.owner.cancel();expect(f.http.saves).toHaveLength(0)
 })
})
