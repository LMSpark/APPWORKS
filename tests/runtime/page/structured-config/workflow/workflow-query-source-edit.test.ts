import {afterEach,describe,expect,it,vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataView} from '@spark-appworks/spark-data'
import {openWorkflowQuerySourceEdit} from '@/lowcode/resources/structured-config/workflow-definition/query-source-edit'
import {workflowSourceEditFixture} from './workflow-source-edit.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
const source={type:'table' as const,id:'NEXT',name:'NextSource',description:'新来源',dbid:'DB2',databaseName:'next-db',providerId:''}
async function fixture(shared=true,legacyModelFlagTypes=false,legacyRelationFlagTypes=false){
 const f=await workflowSourceEditFixture(pages,{legacyModelFlagTypes,legacyRelationFlagTypes})
 Object.assign(f.http.records['Base_DataModel']![0]!,{MetaName:'OldSource',DbId:'DB',DbName:'old-db',PrimaryKeyFields:'code'})
 f.http.records['Base_DataModel_Field']![0]!['IsPKey']=1
 if(!shared)f.http.records['Base_WorkflowNodeDefinition']=f.http.records['Base_WorkflowNodeDefinition']!.filter(row=>row['rowid']!=='SECOND')
 await Promise.all(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'].map(name=>f.ds.getView(name)!.refresh()))
 const reader={query:vi.fn(async()=>({rows:[source],total:1})),prepare:vi.fn(async()=>({source,model:{Type:'数据库表',MetaName:source.name,description:source.description,DbId:source.dbid,DbName:source.databaseName,JoinType:'',ForeignKeyFields:'',JoinFilter:'',PId:''},
  fields:[{type:'dataModel' as const,Name:'code',description:'编码',FieldType:'varchar',IsPKey:1,IsOutput:1,AsName:'',ValueFun:'',Expression:'',allowAIAdd:0,OrderType:'',Order:0,Group:0}]}))}
 const owner=await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',sources:reader,assertCurrent(){}})
 return{...f,reader,owner}
}
async function componentFixture(legacyRelationFlagTypes=false){
 const f=await fixture(true,false,legacyRelationFlagTypes);f.owner.cancel()
 f.http.records['Base_DataModel_Relation']=[{rowid:'SELF',dataSetId:'W',parentModId:'MODEL',childModId:'MODEL',parentTable:'ParentAlias',childTable:'ChildAlias',depType:'join',cascadeDel:0,filter:JSON.stringify({Type:'cond',Field:'ChildAlias.code',Operator:'equal',ValueFun:{Type:'GetTableField',Field:'ParentAlias.code'}})}]
 return{...f,owner:await openWorkflowQuerySourceEdit({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',sources:f.reader,assertCurrent(){}})}
}
describe('workflow query source edit composition',()=>{
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
