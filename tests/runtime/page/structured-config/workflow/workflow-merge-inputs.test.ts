import {afterEach,describe,expect,it,vi} from 'vitest'
import {SparkData,RequestState,type DataSet} from '@spark-appworks/spark-data'
import {workflowMergeInputPresentation} from '@/lowcode/resources/structured-config/workflow-definition/merge-inputs'

const sets:DataSet[]=[]
afterEach(()=>{sets.splice(0).forEach(ds=>ds.destroy());vi.restoreAllMocks()})
const field={rowid:'F',Name:'code',FieldType:'string',Description:'编码',IsOutput:1}
const mapping=()=>[{rowid:'A',Name:'父输入',Fields:[field],unknown:0},{rowid:'B',pid:'A',Name:'子输入',Fields:[field],JoinType:'INNER',JoinFilter:null,unknown:{keep:true}}]
function fixture(value:unknown=mapping()){
 const records={Base_WorkflowNodeDefinition:[
  {rowid:'A',workflow_id:'W',position_type:1,node_type:'query',output_mapping:'[]'},
  {rowid:'B',workflow_id:'W',position_type:1,node_type:'copy',output_mapping:'[]'},
  {rowid:'MERGE',workflow_id:'W',position_type:1,node_type:'merge',input_mapping:typeof value==='string'?value:JSON.stringify(value)},
 ],Base_WorkflowConnectors:[{rowid:'AB',workflow_id:'W',sourceID:'A',targetID:'B'},{rowid:'BM',workflow_id:'W',sourceID:'B',targetID:'MERGE'}]}
 const ds=SparkData.fromJson({scenarioId:'DESIGN',tables:Object.fromEntries(Object.entries(records).map(([name,rows])=>[name,{resourceType:'static-data',columns:[...new Set(rows.flatMap(row=>Object.keys(row)))].map(name=>({name,type:'string',isPrimaryKey:name==='rowid'})),views:{default:{commitMode:'staged',rows,queryContext:{workflowId:'W'}}}}]))})
 sets.push(ds);for(const table of Object.values(ds.tables)){const view=table.getOrCreateView('default');view.requestState=RequestState.Loaded;view.total=view.rows.length}
 return ds
}
const presentation=(dataSet:DataSet,path=[1])=>workflowMergeInputPresentation({dataSet,workflowId:'W',nodeId:'MERGE',path})
describe('merge configuration input identity and join metadata',()=>{
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
