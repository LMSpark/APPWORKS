import {afterEach,describe,expect,it,vi} from 'vitest'
import {SparkData,RequestState,type DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout/layout-resource'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from '../workflow-native-design.fixture'
import {workflowMergeInputPresentation,WorkflowMergeSourceOptions,removeWorkflowMergeInput,generateWorkflowMergeOutput,validateWorkflowMergeNodeChanges} from '@/lowcode/resources/structured-config/workflow-definition/fields/merge-inputs'

const sets:DataSet[]=[],pages:PageRuntime[]=[]
const backends=new WeakMap<DataSet,ApiBackend>()
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());sets.splice(0).forEach(ds=>ds.destroy());vi.restoreAllMocks()})
const field={rowid:'F',Name:'code',FieldType:'string',Description:'编码',IsOutput:1}
const mapping=()=>[{rowid:'A',Name:'父输入',Fields:[field],unknown:0},{rowid:'B',pid:'A',Name:'子输入',Fields:[field],JoinType:'INNER',JoinFilter:null,unknown:{keep:true}}]
function fixture(value:unknown=mapping()){
 const output=(key:string)=>JSON.stringify([{rowid:`${key}ROOT`,pid:null,Name:'items',FieldType:'Array',isParent:true},{rowid:`${key}COUNT`,pid:null,Name:'Count',FieldType:'int',isParent:false},{rowid:`${key}F`,pid:`${key}ROOT`,Name:key==='A'?'publishedAlias':'code',FieldType:'varchar',Description:'已发布字段',isParent:false}])
 const records={Base_WorkflowNodeDefinition:[
  {rowid:'A',workflow_id:'W',position_type:1,name:'源A',node_type:'query',output_mapping:output('A')},
  {rowid:'B',workflow_id:'W',position_type:1,name:'源B',node_type:'copy',output_mapping:output('B')},
  {rowid:'C',workflow_id:'W',position_type:1,name:'源C',node_type:'query',output_mapping:output('C')},
  {rowid:'MERGE',workflow_id:'W',position_type:1,node_type:'merge',input_mapping:typeof value==='string'?value:JSON.stringify(value)},
 ],Base_WorkflowConnectors:[{rowid:'AB',workflow_id:'W',sourceID:'A',targetID:'B'},{rowid:'BC',workflow_id:'W',sourceID:'B',targetID:'C'},{rowid:'CM',workflow_id:'W',sourceID:'C',targetID:'MERGE'}]}
 const ds=SparkData.fromJson({scenarioId:'DESIGN',tables:Object.fromEntries(Object.entries(records).map(([name,rows])=>[name,{resourceType:'static-data',columns:[...new Set(rows.flatMap(row=>Object.keys(row)))].map(name=>({name,type:'string',isPrimaryKey:name==='rowid'})),views:{default:{commitMode:'staged',rows,queryContext:{workflowId:'W'}}}}]))})
 sets.push(ds);for(const table of Object.values(ds.tables)){const view=table.getOrCreateView('default');view.requestState=RequestState.Loaded;view.total=view.rows.length}
 return ds
}
const presentation=(dataSet:DataSet,path=[1])=>workflowMergeInputPresentation({dataSet,workflowId:'W',nodeId:'MERGE',path})
async function formalFixture(value:unknown=mapping(),sharedField=false){
 const sample=fixture(value),http=new ApiBackend()
 http.records={Base_WorkflowDefinition:[{rowid:'W',name:'Current'}],Base_DataSet:[{rowid:'W',Type:'workflow',inputParams:'[]'}],
  Base_WorkflowNodeDefinition:sample.getView('Base_WorkflowNodeDefinition')!.rows.map(row=>({...row})),Base_WorkflowConnectors:sample.getView('Base_WorkflowConnectors')!.rows.map(row=>({...row}))}
 if(sharedField){const source=http.records['Base_WorkflowNodeDefinition']?.find(row=>row['rowid']==='B');if(source)source['output_mapping']=JSON.stringify([{rowid:'BROOT',pid:null,Name:'items',FieldType:'Array',isParent:true},{rowid:'BCOUNT',pid:null,Name:'Count',FieldType:'int',isParent:false},{rowid:'AF',pid:'BROOT',Name:'code',FieldType:'varchar',isParent:false}])}
 const runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(runtime,http).assemble({config:new ScenarioViewConfig(WORKFLOW_DESIGN,workflowDesignText),space:{dataSpaceId:WORKFLOW_DESIGN,name:'Design'},models:workflowDesignModels(),relations:[],
  fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{removeFile:async()=>{throw Error('unexpected layout delete')},readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>{throw Error('unexpected upload')}},assertCurrent(){}})}}).dataSet
 backends.set(ds,http)
 const page=new PageRuntime({pageId:'merge-source-test',scenarioIds:[WORKFLOW_DESIGN],scenarioInputs:{[WORKFLOW_DESIGN]:{workflowId:'W'}},loadScenario:async()=>ds});pages.push(page);await page.load()
 await Promise.all([ds.getView('Base_WorkflowDefinition')!.refresh(),ds.getView('Base_WorkflowNodeDefinition')!.refresh(),ds.getView('Base_WorkflowConnectors')!.refresh()]);return ds
}
describe('merge configuration input identity and join metadata',()=>{
 it('keeps an unnamed formal source selectable by its real identity without inventing a node name',async()=>{
  const ds=await formalFixture([]),nodes=ds.getView('Base_WorkflowNodeDefinition')!,http=backends.get(ds)!
  http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='A')!['name']='';await nodes.refresh()
  const options=new WorkflowMergeSourceOptions({dataSet:ds,workflowId:'W',nodeId:'MERGE'});expect(options.refresh().error).toBe('')
  const row=options.view.rows.find(row=>row['value']==='A')!;expect(row['label']).toBe('A');options.view.setCurrentRow(row);options.add(null)
  const input=JSON.parse(String(nodes.getEditingRow('MERGE')?.['input_mapping']));expect(input[0]).toMatchObject({rowid:'A',Name:''})
  expect(workflowMergeInputPresentation({dataSet:ds,workflowId:'W',nodeId:'MERGE',path:[0]}).functionContext.tables?.[0]?.label).toBe('A')
  expect(nodes.rows.find(row=>row['rowid']==='A')?.['name']).toBe('');options.dispose()
 })
 it.each([false,true])('uses only canonical output identities and removes deselected published fields after reference checks (legacy=%s)',async legacy=>{
  const input=[{rowid:'A',Fields:[{rowid:'AF',Name:'publishedAlias',AsName:'result',FieldType:'varchar',Description:'结果',IsOutput:1}]}]
  const ds=await formalFixture(input),nodes=ds.getView('Base_WorkflowNodeDefinition')!,http=backends.get(ds)!,target={dataSet:ds,workflowId:'W',nodeId:'MERGE'}
  const output=[{rowid:legacy?'AF':'A:AF',pid:null,Name:'result',FieldType:'varchar',Description:'结果',isParent:false,unknown:0}]
  http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='MERGE')!['output_mapping']=JSON.stringify(output)
  await nodes.refresh();input[0]!.Fields[0]!.IsOutput=0;nodes.updateEditingValue('MERGE','input_mapping',JSON.stringify(input))
  if(legacy){
   await expect(generateWorkflowMergeOutput(target)).rejects.toThrow('不兼容旧字段ID');expect(nodes.getEditingRow('MERGE')?.['output_mapping']).toBe(JSON.stringify(output))
   nodes.updateEditingValue('MERGE','output_mapping','[]')
   await expect(generateWorkflowMergeOutput(target)).rejects.toThrow('不兼容旧字段ID')
   expect(nodes.getEditingRow('MERGE')?.['output_mapping']).toBe('[]')
  }
  else{await generateWorkflowMergeOutput(target);expect(nodes.getEditingRow('MERGE')?.['output_mapping']).toBe('[]');await validateWorkflowMergeNodeChanges({...target,nodeIds:[target.nodeId]})}
  expect(http.saves).toHaveLength(0)
 })
 it('rechecks references added after generation before the actual node save',async()=>{
  const input=[{rowid:'A',Fields:[{rowid:'AF',Name:'publishedAlias',AsName:'renamed',FieldType:'varchar',Description:'结果',IsOutput:1}]}]
  const ds=await formalFixture(input),nodes=ds.getView('Base_WorkflowNodeDefinition')!,http=backends.get(ds)!,target={dataSet:ds,workflowId:'W',nodeId:'MERGE'}
  http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='MERGE')!['output_mapping']=JSON.stringify([{rowid:'A:AF',pid:null,Name:'prior',Description:'结果',FieldType:'varchar',isParent:false}])
  await nodes.refresh();await generateWorkflowMergeOutput(target)
  http.records['Base_DataSet']![0]!['inputParams']=JSON.stringify([{Type:'GetInputParam',ParamName:'MERGE.prior'}])
  await expect(validateWorkflowMergeNodeChanges({...target,nodeIds:[target.nodeId]})).rejects.toThrow('节点输出仍被引用')
  expect(http.saves).toHaveLength(0);expect(nodes.getEditingRow('MERGE')?.['output_mapping']).toContain('renamed')
  http.records['Base_DataSet']![0]!['inputParams']='[]'
  await expect(validateWorkflowMergeNodeChanges({...target,nodeIds:[target.nodeId]})).resolves.toBeUndefined()
 })
 it('requires regeneration after input changes and lets the original owner resolve an unknown save without replay',async()=>{
  const input=[{rowid:'A',Fields:[{rowid:'AF',Name:'publishedAlias',AsName:'result',FieldType:'varchar',Description:'结果',IsOutput:1}]}]
  const ds=await formalFixture(input),nodes=ds.getView('Base_WorkflowNodeDefinition')!,http=backends.get(ds)!,target={dataSet:ds,workflowId:'W',nodeId:'MERGE'}
  await generateWorkflowMergeOutput(target);input[0]!.Fields[0]!.AsName='later';nodes.updateEditingValue('MERGE','input_mapping',JSON.stringify(input))
  await expect(validateWorkflowMergeNodeChanges({...target,nodeIds:[target.nodeId]})).rejects.toThrow('重新生成输出模型')
  await generateWorkflowMergeOutput(target);await validateWorkflowMergeNodeChanges({...target,nodeIds:[target.nodeId]})
  http.failAfterWrite=true;const scope={views:[{tableName:nodes.tableName,viewId:nodes.viewId,ids:['MERGE']}]}
  await expect(ds.saveChanges(scope)).rejects.toThrow();expect(nodes.hasUnconfirmedSave).toBe(true)
  const reads=http.reads.length;await validateWorkflowMergeNodeChanges({...target,nodeIds:[target.nodeId]});expect(http.reads).toHaveLength(reads)
  expect((await ds.saveChanges(scope)).success).toBe(true);expect(http.saves).toHaveLength(1)
 })
 it.each([false,true])('checks fresh references before staging an existing output rename (referenced=%s)',async referenced=>{
  const input=[{rowid:'A',Fields:[{rowid:'AF',Name:'publishedAlias',AsName:'renamed',FieldType:'varchar',Description:'新标题',IsOutput:1}]}]
  const ds=await formalFixture(input),nodes=ds.getView('Base_WorkflowNodeDefinition')!,http=backends.get(ds)!
  const original=[{rowid:'A:AF',pid:null,Name:'prior',FieldType:'varchar',isParent:false,unknown:0}]
  http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='MERGE')!['output_mapping']=JSON.stringify(original)
  if(referenced)http.records['Base_DataSet']![0]!['inputParams']=JSON.stringify([{Type:'GetInputParam',ParamName:'MERGE.prior'}])
  await nodes.refresh()
  const command=generateWorkflowMergeOutput({dataSet:ds,workflowId:'W',nodeId:'MERGE'})
  if(referenced){await expect(command).rejects.toThrow('节点输出仍被引用');expect(nodes.hasEditingChanges()).toBe(false)}
  else{await command;expect(JSON.parse(String(nodes.getEditingRow('MERGE')?.['output_mapping']))[0]).toMatchObject({Name:'renamed',unknown:0})}
  expect(nodes.rows.find(row=>row['rowid']==='MERGE')?.['output_mapping']).toBe(JSON.stringify(original))
  expect(http.saves).toHaveLength(0)
 })
 it('keeps separate configuration identities when two source nodes publish the same field identity',async()=>{
  const ds=await formalFixture([],true),nodes=ds.getView('Base_WorkflowNodeDefinition')!,target={dataSet:ds,workflowId:'W',nodeId:'MERGE'}
  for(const id of ['A','B']){const choices=new WorkflowMergeSourceOptions(target);choices.refresh();choices.view.setCurrentRow(choices.view.rows.find(row=>row['value']===id)!);choices.add(null);choices.dispose()}
  await generateWorkflowMergeOutput(target)
  const rows=JSON.parse(String(nodes.getEditingRow('MERGE')?.['output_mapping']))
  expect(rows.map((row:Record<string,unknown>)=>row['rowid'])).toEqual(['A:AF','B:AF'])
  expect(rows.map((row:Record<string,unknown>)=>row['Name'])).toEqual(['publishedAlias','code'])
 })
 it.each(['duplicate-name','stale-field','bad-flag','unmatched-output','published-removal'] as const)('retains the original output draft when generation rejects %s',async fault=>{
  const ds=await formalFixture([]),nodes=ds.getView('Base_WorkflowNodeDefinition')!,target={dataSet:ds,workflowId:'W',nodeId:'MERGE'}
  for(const id of ['A','B']){const options=new WorkflowMergeSourceOptions(target);options.refresh();options.view.setCurrentRow(options.view.rows.find(row=>row['value']===id)!);options.add(null);options.dispose()}
  const input=JSON.parse(String(nodes.getEditingRow('MERGE')?.['input_mapping']))
  input[0].Fields[0].AsName='alpha';input[1].Fields[0].AsName='beta'
  if(fault==='duplicate-name')input[1].Fields[0].AsName='alpha'
  if(fault==='stale-field')input[0].Fields[0].Name='old'
  if(fault==='bad-flag')input[0].Fields[0].IsOutput=true
  const previous=JSON.stringify([{rowid:'unmatched',pid:null,Name:'prior',FieldType:'varchar',isParent:false,unknown:0}])
  if(fault==='unmatched-output')nodes.updateEditingValue('MERGE','output_mapping',previous)
  if(fault==='published-removal'){
   const row=nodes.rows.find(row=>row['rowid']==='MERGE')!
   row['output_mapping']=previous
   nodes.updateEditingValue('MERGE','output_mapping','[]')
  }
  nodes.updateEditingValue('MERGE','input_mapping',JSON.stringify(input))
  const before=nodes.getEditingRow('MERGE')?.['output_mapping']
  await expect(generateWorkflowMergeOutput(target)).rejects.toThrow()
  expect(nodes.getEditingRow('MERGE')?.['output_mapping']).toBe(before)
 })
 it('generates stable source-qualified output identities and preserves existing configuration members without saving',async()=>{
  const ds=await formalFixture([]),nodes=ds.getView('Base_WorkflowNodeDefinition')!,target={dataSet:ds,workflowId:'W',nodeId:'MERGE'}
  for(const [id,path] of [['A',null],['B',[0]]] as const){const choices=new WorkflowMergeSourceOptions(target);choices.refresh();choices.view.setCurrentRow(choices.view.rows.find(row=>row['value']===id)!);choices.add(path===null?null:[...path]);choices.dispose()}
  const input=JSON.parse(String(nodes.getEditingRow('MERGE')?.['input_mapping']));input[0].Fields[0].AsName='alpha';input[1].Fields[0].AsName='beta';nodes.updateEditingValue('MERGE','input_mapping',JSON.stringify(input))
  await generateWorkflowMergeOutput(target)
  const output=JSON.parse(String(nodes.getEditingRow('MERGE')?.['output_mapping']))
  expect(output.map((row:Record<string,unknown>)=>[row['rowid'],row['Name']])).toEqual([['A:AF','alpha'],['B:BF','beta']])
  output[0].unknown={keep:false};nodes.updateEditingValue('MERGE','output_mapping',JSON.stringify(output));await generateWorkflowMergeOutput(target)
  expect(JSON.parse(String(nodes.getEditingRow('MERGE')?.['output_mapping']))).toEqual(output)
  expect(nodes.rows.find(row=>row['rowid']==='MERGE')?.['output_mapping']).toBeUndefined()
  nodes.discardEditingRows(['MERGE']);expect(nodes.hasEditingChanges()).toBe(false)
 })
 it('does not turn a locally editable static field into formal row authorization',()=>{
  const ds=fixture([]),nodes=ds.getView('Base_WorkflowNodeDefinition')!,options=new WorkflowMergeSourceOptions({dataSet:ds,workflowId:'W',nodeId:'MERGE'})
  options.refresh();options.view.setCurrentRow(options.view.rows.find(row=>row['value']==='A')!)
  expect(()=>options.add(null)).toThrow('不允许修改合并输入');expect(nodes.hasEditingChanges()).toBe(false);options.dispose()
 })
 it('omits sources with unreadable published output and releases the candidate context',()=>{
  const ds=fixture([]),nodes=ds.getView('Base_WorkflowNodeDefinition')!,original=nodes.fieldAccess.bind(nodes)
  vi.spyOn(nodes,'fieldAccess').mockImplementation((row,name)=>row?.['rowid']==='A'&&name==='output_mapping'?{...original(row,name),read:'invisible'}:original(row,name))
  const options=new WorkflowMergeSourceOptions({dataSet:ds,workflowId:'W',nodeId:'MERGE'});options.refresh()
  expect(options.view.rows.map(row=>row['value'])).toEqual(['B','C']);options.dispose()
  expect(()=>options.add(null)).toThrow('已释放');expect(nodes.hasEditingChanges()).toBe(false)
 })
 it('stages exact root and child sources from a bound catalog using published output names and original field identities',async()=>{
  const ds=await formalFixture([]),nodes=ds.getView('Base_WorkflowNodeDefinition')!,context={dataSet:ds,workflowId:'W',nodeId:'MERGE'}
  const choose=(id:string)=>{const options=new WorkflowMergeSourceOptions(context);expect(options.refresh().error).toBe('');const row=options.view.rows.find(row=>row['value']===id)!;expect(row).toBeDefined();options.view.setCurrentRow(row);return options}
  const root=choose('A');expect(root.add(null)).toEqual([0]);root.dispose()
  const child=choose('B');expect(child.add([0])).toEqual([1]);child.dispose()
  const value=JSON.parse(String(nodes.getEditingRow('MERGE')?.['input_mapping']))
  expect(value[0]).toMatchObject({rowid:'A',Name:'源A',pid:null,Fields:[{rowid:'AF',Name:'publishedAlias',AsName:'publishedAlias',FieldType:'varchar',IsOutput:1}]})
  expect(value[1]).toMatchObject({rowid:'B',pid:'A',JoinFilter:null,JoinType:null})
  expect(nodes.rows.find(row=>row['rowid']==='MERGE')?.['input_mapping']).toBe('[]');expect(nodes.rows).toHaveLength(4)
  nodes.discardEditingRows(['MERGE']);expect(nodes.getEditingRow('MERGE')?.['input_mapping']).toBe('[]')
 })
 it('invalidates captured source selection after the original input changes and never creates a repeated-source suffix',async()=>{
  const ds=await formalFixture([]),nodes=ds.getView('Base_WorkflowNodeDefinition')!,options=new WorkflowMergeSourceOptions({dataSet:ds,workflowId:'W',nodeId:'MERGE'})
  options.refresh();options.view.setCurrentRow(options.view.rows.find(row=>row['value']==='A')!)
  nodes.updateEditingValue('MERGE','input_mapping',JSON.stringify(mapping()))
  expect(()=>options.add(null)).toThrow('已变化');expect(nodes.getEditingRow('MERGE')?.['input_mapping']).toBe(JSON.stringify(mapping()))
  options.refresh();expect(options.view.rows.map(row=>row['value'])).toEqual(['C']);options.dispose()
 })
 it('does not remove a different input after the selected array position is reordered',async()=>{
  const ds=await formalFixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!,options=new WorkflowMergeSourceOptions({dataSet:ds,workflowId:'W',nodeId:'MERGE'})
  options.refresh();const reordered=JSON.stringify([...mapping()].reverse());nodes.updateEditingValue('MERGE','input_mapping',reordered)
  expect(()=>options.remove([0])).toThrow('已变化');expect(nodes.getEditingRow('MERGE')?.['input_mapping']).toBe(reordered);options.dispose()
 })
 it('removes an input subtree while preserving unrelated input JSON and all original business nodes',async()=>{
  const original=[...mapping(),{rowid:'C',Name:'另一根',Fields:[field],unknown:{keep:false}}],ds=await formalFixture(original),nodes=ds.getView('Base_WorkflowNodeDefinition')!
  expect(removeWorkflowMergeInput({dataSet:ds,workflowId:'W',nodeId:'MERGE',path:[0]})).toEqual(['A','B'])
  expect(JSON.parse(String(nodes.getEditingRow('MERGE')?.['input_mapping']))).toEqual([original[2]])
  expect(nodes.rows).toHaveLength(4);expect(nodes.dirtyTracking.pendingDeleteIds.size).toBe(0)
 })
 it('refuses source removal when a preserved join condition still references it',async()=>{
  const original=[mapping()[0],{...mapping()[1],pid:null},{rowid:'C',pid:'B',Name:'保留子项',Fields:[field],JoinFilter:{Type:'cond',Field:'C.code',Operator:'equal',ValueFun:{Type:'GetTableField',Field:'A.code'}}}],ds=await formalFixture(original),nodes=ds.getView('Base_WorkflowNodeDefinition')!
  expect(()=>removeWorkflowMergeInput({dataSet:ds,workflowId:'W',nodeId:'MERGE',path:[0]})).toThrow('仍被引用')
  expect(nodes.hasEditingChanges()).toBe(false)
 })
 it('projects exact source and parent-chain fields without editing or creating another owner',()=>{
  const ds=fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!,before=JSON.stringify(nodes.rows)
  expect(presentation(ds)).toEqual({root:false,columns:[{name:'B.code',label:'编码',type:'string'}],functionContext:{tables:[
   {name:'B',label:'子输入',fields:[{name:'code',label:'编码'}]},
   {name:'A',label:'父输入',fields:[{name:'code',label:'编码'}]},
  ]}})
  expect(presentation(ds,[0]).root).toBe(true);expect(JSON.stringify(nodes.rows)).toBe(before);expect(nodes.hasEditingChanges()).toBe(false)
 })
 it.each([
  {name:'orphan',value:[mapping()[0],{...mapping()[1],pid:'missing'}],message:'父节点不存在'},
  {name:'cycle',value:[{...mapping()[0],pid:'B'},mapping()[1]],message:'父链存在循环'},
  {name:'suffix',value:[{...mapping()[0],rowid:'A_1'},mapping()[1]],message:'正式查询祖先'},
  {name:'duplicate',value:[mapping()[0],{...mapping()[1],rowid:'A'}],message:'身份缺失或重复'},
  {name:'malformed fields',value:[mapping()[0],{...mapping()[1],Fields:[field,field]}],message:'字段身份'},
  {name:'malformed JSON',value:'{broken',message:'JSON'},
 ])('rejects $name and preserves the original data',({value,message})=>{
  const ds=fixture(value),nodes=ds.getView('Base_WorkflowNodeDefinition')!,before=JSON.stringify(nodes.rows)
  expect(()=>presentation(ds)).toThrow(message);expect(JSON.stringify(nodes.rows)).toBe(before);expect(nodes.hasEditingChanges()).toBe(false)
 })
 it('rejects changed query identity, unconfirmed source edits and stale array selection',()=>{
  const ds=fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!
  expect(()=>presentation(ds,[2])).toThrow('选择路径')
  nodes.updateEditingValue('A','output_mapping','changed');expect(()=>presentation(ds)).toThrow('来源节点修改')
  nodes.discardEditingRows(['A']);nodes.queryContext={workflowId:'OTHER'};expect(()=>presentation(ds)).toThrow('目标已变化')
 })
 it('does not expose join metadata when the original JSON field is hidden',()=>{
  const ds=fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!,original=nodes.fieldAccess.bind(nodes)
  vi.spyOn(nodes,'fieldAccess').mockImplementation((row,name)=>name==='input_mapping'?{...original(row,name),read:'invisible'}:original(row,name))
  expect(()=>presentation(ds)).toThrow('字段不可读');expect(nodes.hasEditingChanges()).toBe(false)
 })
})
