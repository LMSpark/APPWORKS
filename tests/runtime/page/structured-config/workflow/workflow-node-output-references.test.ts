import {afterEach,describe,expect,it} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataViewFilter,DataViewFilterCodec} from '@spark-appworks/spark-data'
import {assertWorkflowNodeOutputChanges} from '@/lowcode/resources/structured-config/workflow-definition/node-output-references'
import {workflowSourceEditFixture} from './workflow-source-edit.fixture'

const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
describe('formal node output references without a model identity',()=>{
 async function fixture(){
  const f=await workflowSourceEditFixture(pages)
  const before=[{rowid:'P',pid:null,Name:'code',Description:'编码',FieldType:'string',isParent:false}]
  const target={dataSet:f.ds,workflowId:'W',nodeId:'START',before,after:[{...before[0],Name:'renamed'}],assertCurrent(){}}
  return {...f,target}
 }
 it('reads fresh definition dependencies and permits an unreferenced output rename without saving',async()=>{
  const f=await fixture(),reads=f.http.reads.length
  await expect(assertWorkflowNodeOutputChanges(f.target)).resolves.toBeUndefined()
  expect(f.http.reads.length-reads).toBe(6);expect(f.http.saves).toHaveLength(0)
 })
 it.each(['model','field','parameter','connector','node','merge-field','merge-join','relation'] as const)('rejects a fresh %s reference',async kind=>{
  const f=await fixture(),param={Type:'GetInputParam',ParamName:'START.code'}
  if(kind==='model')f.http.records['Base_DataModel']![1]!['JoinFilter']=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'isolated',operator:'eq',value:param}))
  if(kind==='field')f.http.records['Base_DataModel_Field']![1]!['ValueFun']=JSON.stringify(param)
  if(kind==='parameter')f.http.records['Base_DataSet']![0]!['inputParams']=JSON.stringify([param])
  if(kind==='connector')f.http.records['Base_WorkflowConnectors']![0]!['params']=JSON.stringify(param)
  if(kind==='node')f.http.records['Base_WorkflowNodeDefinition']![1]!['input_mapping']=JSON.stringify([param])
  if(kind==='merge-field'||kind==='merge-join'){
   const node=f.http.records['Base_WorkflowNodeDefinition']![1]!
   node['node_type']='merge';node['input_mapping']=JSON.stringify(kind==='merge-field'?[{rowid:'START',Fields:[{rowid:'P',Name:'code'}]}]:[{rowid:'START',Fields:[]},{rowid:'OTHER',pid:'START',Fields:[],JoinFilter:{Type:'cond',Field:'OTHER.x',Operator:'equal',ValueFun:{Type:'GetTableField',Field:'START.code'}}}])
  }
  if(kind==='relation')f.http.records['Base_DataModel_Relation']=[{rowid:'R',dataSetId:'W',parentModId:'START',childModId:'MODEL',filter:DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'code',operator:'eq',value:1}))}]
  await expect(assertWorkflowNodeOutputChanges(f.target)).rejects.toThrow('节点输出仍被引用')
  expect(f.http.saves).toHaveLength(0)
 })
 it('rejects unknown merge join functions instead of proving the output is unreferenced',async()=>{
  const f=await fixture(),node=f.http.records['Base_WorkflowNodeDefinition']![1]!
  node['node_type']='merge';node['input_mapping']=JSON.stringify([{rowid:'START',Fields:[]},{rowid:'OTHER',pid:'START',Fields:[],JoinFilter:{Type:'cond',Field:'OTHER.x',Operator:'equal',ValueFun:{Type:'CustomExpression',Expression:'START.code'}}}])
  await expect(assertWorkflowNodeOutputChanges(f.target)).rejects.toThrow('合并连接值函数协议尚未核定')
  node['input_mapping']=JSON.stringify([{rowid:'START',Fields:[]},{rowid:'OTHER',pid:'START',Fields:[],JoinFilter:{Type:'cond',Field:'OTHER.x',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:{Type:'CustomExpression',Expression:'START.code'}}}}])
  await expect(assertWorkflowNodeOutputChanges(f.target)).resolves.toBeUndefined()
 })
 it('skips constant contents but rejects opaque expressions and changed formal output',async()=>{
  const f=await fixture(),record=f.http.records['Base_DataModel_Field']![0]!
  record['ValueFun']=JSON.stringify({Type:'GetConstValue',Value:{Type:'GetInputParam',ParamName:'START.code'}})
  await expect(assertWorkflowNodeOutputChanges(f.target)).resolves.toBeUndefined()
  record['ValueFun']=JSON.stringify({Type:'GetExpData',Expression:'START.code'})
  await expect(assertWorkflowNodeOutputChanges(f.target)).rejects.toThrow('不透明表达式')
  record['ValueFun']=null;f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']='[]'
  await expect(assertWorkflowNodeOutputChanges(f.target)).rejects.toThrow('正式节点输出已变化')
 })
 it('checks the original guard after asynchronous reads and never resets it',async()=>{
  const f=await fixture();let assertions=0
  await expect(assertWorkflowNodeOutputChanges({...f.target,assertCurrent(){if(++assertions>6)throw Error('first contract changed')}})).rejects.toThrow('first contract changed')
  expect(f.http.saves).toHaveLength(0)
 })
 it('does not query dependencies for additions or an unchanged output structure',async()=>{
  const f=await fixture(),reads=f.http.reads.length
  await assertWorkflowNodeOutputChanges({...f.target,after:f.target.before})
  expect(f.http.reads).toHaveLength(reads)
 })
})
