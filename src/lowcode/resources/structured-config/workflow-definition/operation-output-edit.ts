/**
 * @module app:lowcode/resources/structured-config/workflow-definition/operation-output-edit
 * 职责：显式生成操作输出到原节点编辑域，保存前重核首轮目标及真实来源。
 * 边界：不保存、不持有可编辑副本；不可变签名只防止刷新或换源后覆盖旧生成意图。
 */
import {RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import {definitionTargetDraftSignature} from '@/lowcode/data-space/model-source/data-space-definition-save'
import {loadWorkflowOperationOutput} from './operation-output-source'
import {workflowOperationOutputFields} from './operation-output'
import {assertWorkflowNodeOutputChanges} from './node-output-references'
import {workflowFieldChanges} from './query-field-context'

type Target=Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;assertCurrent?:()=>void}>
type Capture=Readonly<{formal:string;output:string;target:string}>
const captures=new WeakMap<DataView,Map<string,Capture>>()
const keys=['rowid','workflow_id','position_type','node_type','dataOperateModId','output_mapping']
function read(view:DataView,row:DataRow,key:string):unknown{if(view.fieldAccess(row,key).read!=='visible'||!Object.hasOwn(row,key))throw Error('操作输出节点定义不可读或缺失');return row[key]}
function proof(view:DataView,row:DataRow):string{return JSON.stringify(keys.map(key=>[key,read(view,row,key)]))}
function scope(input:Target){
 input.assertCurrent?.();const {dataSet,workflowId,nodeId}=input,nodes=dataSet.getView('Base_WorkflowNodeDefinition'),root=dataSet.getView('Base_WorkflowDefinition'),row=nodes?.rows.find(item=>nodes.getPkKey(item)===nodeId)
 if(dataSet.destroyed||!nodes||nodes.destroyed||nodes.queryContext['workflowId']!==workflowId||nodes.requestState!==RequestState.Loaded||nodes.loadingError||!row||read(nodes,row,'workflow_id')!==workflowId||String(read(nodes,row,'position_type'))!=='1'||root?.rows.length!==1||root.rows[0]?.['rowid']!==workflowId)throw Error('操作输出节点或工作流身份已变化')
 const operation=read(nodes,row,'node_type'),modelId=read(nodes,row,'dataOperateModId'),effective=nodes.getEditingRow(nodeId)??row
 if(operation!=='add'&&operation!=='edit'&&operation!=='delete'||typeof modelId!=='string'||!modelId||effective['node_type']!==operation||effective['dataOperateModId']!==modelId||nodes.dirtyTracking.isPendingCreate(nodeId)||nodes.dirtyTracking.isPendingDelete(nodeId))throw Error('请先完成操作节点正式绑定')
 return{nodes,row,operation,modelId} as const
}
async function formal(input:Target,expected:string,check:()=>void):Promise<void>{
 const {nodes}=scope(input),view=nodes.createQueryView(`operationOutputNode_${crypto.randomUUID().replaceAll('-','')}`)
 try{view.queryConfig={...view.queryConfig,fields:keys,allPages:true};view.filterExpression={logic:'and',filters:[{field:'workflow_id',operator:'eq',value:input.workflowId},{field:'rowid',operator:'eq',value:input.nodeId}]};await view.refresh();check()
  const row=view.rows[0];if(view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==1||view.total!==1||!row||proof(view,row)!==expected)throw Error('操作输出原正式节点已变化，请取消旧生成后重开')
 }finally{if(!view.destroyed)view.dataTable?.destroyView(view.viewId)}
}
/** 点击只改原节点output_mapping；取消、保存和未知核验由宿主原DataSet负责。 */
export async function generateWorkflowOperationOutput(input:Target):Promise<void>{
 const current=scope(input),{nodes,row,operation,modelId}=current,baseline=proof(nodes,row),draft=definitionTargetDraftSignature(nodes,[input.nodeId])
 if(nodes.hasUnconfirmedSave||Object.hasOwn(workflowFieldChanges(nodes,row,input.nodeId),'output_mapping'))throw Error('请先保存或取消原输出修改')
 const check=()=>{const state=scope(input);if(state.nodes!==nodes||state.row!==row||proof(nodes,state.row)!==baseline||definitionTargetDraftSignature(nodes,[input.nodeId])!==draft)throw Error('操作输出生成期间原目标或草稿已变化')}
 await formal(input,baseline,check)
 const contract=await loadWorkflowOperationOutput({...input,modelId,operation,original:read(nodes,row,'output_mapping'),assertCurrent:check}),{output}=contract;check()
 await assertWorkflowNodeOutputChanges({...input,before:workflowOperationOutputFields(read(nodes,row,'output_mapping')),after:output,assertCurrent:check});check()
 if(nodes.commitMode!=='staged'||nodes.editActionState(row)!=='enabled'||nodes.fieldAccess(row,'output_mapping').write!=='allowed')throw Error('当前查询不允许生成操作输出')
 const text=JSON.stringify(output),records=captures.get(nodes)??new Map<string,Capture>();records.set(input.nodeId,{formal:baseline,output:text,target:JSON.stringify(contract.target)});captures.set(nodes,records)
 nodes.updateEditingValue(input.nodeId,'output_mapping',text)
}
/** 只检查本次节点输出变更；未知保存只交原DataSet核验，不再派发生成。 */
export async function validateWorkflowOperationOutputChanges(input:Readonly<{dataSet:DataSet;workflowId:string;nodeIds:readonly string[]}>):Promise<void>{
 const nodes=input.dataSet.getView('Base_WorkflowNodeDefinition');if(!nodes)throw Error('操作输出保存缺少节点视图');if(nodes.hasUnconfirmedSave)return
 for(const nodeId of input.nodeIds){const row=nodes.rows.find(item=>nodes.getPkKey(item)===nodeId);if(!row||!['add','edit','delete'].includes(String(read(nodes,row,'node_type')))||!Object.hasOwn(workflowFieldChanges(nodes,row,nodeId),'output_mapping'))continue
  const target={...input,nodeId},state=scope(target),capture=captures.get(nodes)?.get(nodeId),draft=definitionTargetDraftSignature(nodes,[nodeId])
  if(!capture)throw Error('操作输出缺少首轮生成合同，请取消后重新生成')
  const check=()=>{const current=scope(target);if(current.nodes!==nodes||proof(nodes,current.row)!==capture.formal||definitionTargetDraftSignature(nodes,[nodeId])!==draft||(nodes.getEditingRow(nodeId)??current.row)['output_mapping']!==capture.output)throw Error('操作输出与首轮生成合同不一致，请取消后重新生成')}
  check();await formal(target,capture.formal,check)
  const contract=await loadWorkflowOperationOutput({...target,operation:state.operation,modelId:state.modelId,original:read(nodes,row,'output_mapping'),assertCurrent:check}),{output}=contract;check()
  if(JSON.stringify(output)!==capture.output||JSON.stringify(contract.target)!==capture.target)throw Error('操作输出来源已变化，请取消后重新生成')
  await assertWorkflowNodeOutputChanges({...target,before:workflowOperationOutputFields(read(nodes,row,'output_mapping')),after:output,assertCurrent:check});check()
 }
}
