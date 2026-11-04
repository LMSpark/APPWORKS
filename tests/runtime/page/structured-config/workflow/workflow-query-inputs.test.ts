import {afterEach,describe,expect,it,vi} from 'vitest'
import {SparkData,RequestState,DataViewFilter,DataViewFilterCodec,type DataSet} from '@spark-appworks/spark-data'
import {workflowQueryInputPresentation,workflowQuerySharedInputPresentation,validateWorkflowQueryInputChanges,WorkflowQueryInputs} from '@/lowcode/resources/structured-config/workflow-definition/query-inputs'

const sets:DataSet[]=[]
afterEach(()=>{sets.splice(0).forEach(ds=>ds.destroy());vi.restoreAllMocks()})
function fixture(){
 const records={
  Base_WorkflowDefinition:[{rowid:'W',name:'workflow'}],
  Base_WorkflowNodeDefinition:[{rowid:'START',workflow_id:'W',position_type:0,name:'开始',output_mapping:JSON.stringify([{rowid:'P',pid:null,Name:'code',Description:'编码',FieldType:'string',isParent:false}])},
   {rowid:'QUERY',workflow_id:'W',position_type:1,node_type:'query',node_config:'MODEL',output_mapping:'[]'}],
  Base_WorkflowConnectors:[{rowid:'E',workflow_id:'W',sourceID:'START',targetID:'QUERY'}],
  Base_DataModel:[{rowid:'MODEL',dataSetId:'W',Name:'Orders',Type:'数据库表'}],
  Base_DataModel_Field:[{rowid:'F',dataSetId:'W',dataModelId:'MODEL',type:'dataModel',Name:'code',FieldType:'varchar',description:'编码'}],
 }
 const ds=SparkData.fromJson({scenarioId:'DESIGN',tables:Object.fromEntries(Object.entries(records).map(([name,rows])=>[name,{resourceType:'static-data',columns:[...new Set(rows.flatMap(row=>Object.keys(row)))].map(field=>({name:field,type:'string',isPrimaryKey:field==='rowid'})),views:{default:{rows,queryContext:{workflowId:'W'}}}}]))})
 sets.push(ds);for(const table of Object.values(ds.tables)){const view=table.getOrCreateView('default');view.requestState=RequestState.Loaded;view.total=view.rows.length}
 return ds
}
describe('workflow query input definitions',()=>{
 it.each(['query','copy'])('offers saved %s leaf names without items or synthetic Count roots',kind=>{
  const ds=fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  const output=[{rowid:'ITEMS',pid:null,Name:'items',FieldType:'Array',isParent:true},{rowid:'COUNT',pid:null,Name:'Count',FieldType:'int',isParent:false},
   {rowid:'AF',pid:'ITEMS',Name:'actualAlias',Description:'真实字段',FieldType:'varchar',isParent:false}]
  nodes.appendRow({rowid:'A',workflow_id:'W',position_type:1,node_type:kind,node_config:'OTHER_MODEL',name:'上游查询',output_mapping:JSON.stringify(output)});nodes.total=nodes.rows.length
  edges.appendRow({rowid:'SA',workflow_id:'W',sourceID:'START',targetID:'A'});edges.appendRow({rowid:'AQ',workflow_id:'W',sourceID:'A',targetID:'QUERY'});edges.total=edges.rows.length
  expect(workflowQueryInputPresentation(ds,'W','QUERY').inputs).toEqual([{value:'START.code',label:'开始 · 编码'},{value:'A.actualAlias',label:'上游查询 · 真实字段'}])
  for(const patch of [{pid:'UNKNOWN'},{isParent:true},{Name:'items.actualAlias'},{FieldType:''},{rowid:'ITEMS'}]){
   nodes.updateRowById('A',{output_mapping:JSON.stringify([...output.slice(0,2),{...output[2],...patch}])})
   expect(()=>workflowQueryInputPresentation(ds,'W','QUERY')).toThrow()
  }
  nodes.updateRowById('A',{node_type:'merge',output_mapping:JSON.stringify(output)})
  expect(workflowQueryInputPresentation(ds,'W','QUERY').inputs).toEqual([{value:'START.code',label:'开始 · 编码'}])
  expect(workflowQueryInputPresentation(ds,'W','QUERY').diagnostics).not.toEqual([])
 })
 it('validates changed source functions and filters with the same formal model and ancestor catalog',()=>{
  const ds=fixture()
  expect(()=>validateWorkflowQueryInputChanges(ds,'W','QUERY',{values:[JSON.stringify({Type:'GetConstValue',Value:0}),JSON.stringify({Type:'GetInputParam',ParamName:'START.code'})]})).not.toThrow()
  expect(()=>validateWorkflowQueryInputChanges(ds,'W','QUERY',{values:[JSON.stringify({Type:'GetInputParam',ParamName:'MISSING.code'})]})).toThrow()
  expect(()=>validateWorkflowQueryInputChanges(ds,'W','QUERY',{values:['not json']})).toThrow()
  expect(()=>validateWorkflowQueryInputChanges(ds,'W','QUERY',{filter:DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'code',operator:'eq',value:{Type:'GetInputParam',ParamName:'START.code'}}))})).not.toThrow()
  expect(()=>validateWorkflowQueryInputChanges(ds,'W','QUERY',{filter:DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'missing',operator:'eq',value:false}))})).toThrow()
  const nodes=ds.getView('Base_WorkflowNodeDefinition')!
  nodes.appendRow({rowid:'SECOND',workflow_id:'W',position_type:1,node_type:'query',node_config:'MODEL'});nodes.total=nodes.rows.length
  expect(()=>validateWorkflowQueryInputChanges(ds,'W','QUERY',{values:[JSON.stringify({Type:'GetInputParam',ParamName:'START.code'})]})).toThrow()
 })
 it('limits shared-model references to the intersection of each actual consumer ancestry',()=>{
  const ds=fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  nodes.appendRow({rowid:'SECOND',workflow_id:'W',position_type:1,node_type:'copy',node_config:'MODEL',output_mapping:'[]'});nodes.total=nodes.rows.length
  expect(workflowQuerySharedInputPresentation(ds,'W','QUERY').inputs).toEqual([])
  edges.appendRow({rowid:'E2',workflow_id:'W',sourceID:'START',targetID:'SECOND'});edges.total=edges.rows.length
  expect(workflowQuerySharedInputPresentation(ds,'W','QUERY').inputs).toEqual([{value:'START.code',label:'开始 · 编码'}])
 })
 it('binds the projected catalog to the same DataSet and clears it when original read permission is lost',()=>{
  const ds=fixture(),count=Object.keys(ds.tables).length,owner=new WorkflowQueryInputs(ds,'W','QUERY')
  expect(owner.refresh().error).toBe('')
  expect(owner.view.rows).toContainEqual(expect.objectContaining({value:'START.code',label:'开始 · 编码'}))
  const rows=owner.view.rows;owner.refresh();expect(owner.view.rows).toBe(rows)
  const nodes=ds.getView('Base_WorkflowNodeDefinition')!,access=nodes.fieldAccess.bind(nodes)
  vi.spyOn(nodes,'fieldAccess').mockImplementation((row,field)=>field==='output_mapping'?{...access(row,field),read:'invisible'}:access(row,field))
  expect(owner.refresh().error).toContain('不可读');expect(owner.view.rows).toEqual([])
  owner.dispose();expect(Object.keys(ds.tables)).toHaveLength(count)
  expect(ds.getView('Base_WorkflowNodeDefinition')).toBe(nodes)
 })
 it('offers only confirmed flat ancestor outputs and derives model filter columns from its original field view',()=>{
  const ds=fixture(),state=workflowQueryInputPresentation(ds,'W','QUERY')
  expect(state.inputs).toEqual([{value:'START.code',label:'开始 · 编码'}])
  expect(state.columns).toEqual([{name:'code',label:'编码',type:'varchar'}])
  expect(state.diagnostics).toEqual([])
 })
 it.each(['cycle','missing','foreign'])('rejects an ambiguous or invalid graph: %s',kind=>{
  const ds=fixture(),edges=ds.getView('Base_WorkflowConnectors')!
  if(kind==='cycle')edges.appendRow({rowid:'BACK',workflow_id:'W',sourceID:'QUERY',targetID:'START'})
  else if(kind==='missing')edges.replaceRows([{rowid:'E',workflow_id:'W',sourceID:'MISSING',targetID:'QUERY'}])
  else edges.replaceRows([{rowid:'E',workflow_id:'OTHER',sourceID:'START',targetID:'QUERY'}])
  edges.total=edges.rows.length
  expect(()=>workflowQueryInputPresentation(ds,'W','QUERY')).toThrow(kind==='cycle'?'环':'归属')
 })
 it('never reveals a masked ancestor output or accepts a dotted parameter name as a nested path',()=>{
  const ds=fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!,access=nodes.fieldAccess.bind(nodes)
  vi.spyOn(nodes,'fieldAccess').mockImplementation((row,field)=>field==='output_mapping'?{...access(row,field),read:'masked'}:access(row,field))
  expect(()=>workflowQueryInputPresentation(ds,'W','QUERY')).toThrow('不可读')
  vi.restoreAllMocks();nodes.updateRowById('START',{output_mapping:JSON.stringify([{rowid:'P',pid:null,Name:'items.code',FieldType:'string',isParent:false}])})
  expect(()=>workflowQueryInputPresentation(ds,'W','QUERY')).toThrow('点')
 })
})
