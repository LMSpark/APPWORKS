/**
 * @module app:lowcode/resources/structured-config/workflow-definition/node-definition
 * 职责：普通空节点的正式身份、首次绑定与类型切换合同。
 * 边界：只读原DataView和精确正式查询，不创建节点、模型或保存入口。
 * AI用途：页面展示、首次绑定与实际保存共用同一空节点合同，异步检查保持首轮草稿。
 */
import {RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {workflowFieldChanges,workflowQueryDraftSignature} from './query-field-context'

/** 本次普通节点的原运行实例及正式身份。 */
type Target=Readonly<{
 /** 宿主元数据实例。 */
 dataSet:DataSet
 /** 正式工作流身份。 */
 workflowId:string
 /** 已由原DataView生成的节点身份。 */
 nodeId:string
}>
/** 首轮正式节点是否存在及原类型；不是可编辑业务副本。 */
export type WorkflowNodeOriginal=Readonly<{
 /** 尚未提交的原生新增行。 */
 pending:boolean
 /** 既有正式节点的原类型。 */
 kind?:string
}>
/** 精确正式读取的首轮合同及调用方守卫。 */
type OriginalInput=Target&Readonly<{
 /** 首轮正式合同；后续读取不重置它。 */
 original?:WorkflowNodeOriginal
 /** 调用方原意图及会话守卫。 */
 assertCurrent:()=>void
 /** 本次明确的结构命令目的。 */
 purpose?:'binding'|'type-change'
 /** 首次绑定期望的编辑类型。 */
 desiredKind?:string
 /** 本地明确修改了类型；待新增行也不假装具有正式原类型。 */
 typeChanged?:boolean
}>
/** 本次实际类型变更提交范围，不承载行值或业务草稿。 */
type TypeChanges=Pick<Target,'dataSet'|'workflowId'>&Readonly<{
 /** 仅核本命令目标；省略时核本次所有类型变更。 */
 nodeIds?:readonly string[]
}>
const kinds=['query','copy','add','edit','delete','merge']
const columns=['rowid','workflow_id','position_type','node_type','node_config','dataOperateModId','input_mapping','output_mapping','config']
function read(view:DataView,row:DataRow,key:string):unknown{if(view.fieldAccess(row,key).read!=='visible')throw Error(`节点定义不可读: ${key}`);return row[key]}
function empty(value:unknown):boolean{return value===undefined||value===null||value===''}
function arrayEmpty(value:unknown):boolean{const parsed=empty(value)?[]:typeof value==='string'?parseJsonDocument(value):value;return Array.isArray(parsed)&&parsed.length===0}
function unbound(view:DataView,row:DataRow):boolean{return ['node_config','dataOperateModId'].every(key=>empty(read(view,row,key)))&&arrayEmpty(read(view,row,'output_mapping'))}
function blank(view:DataView,row:DataRow):boolean{return unbound(view,row)&&arrayEmpty(read(view,row,'input_mapping'))&&empty(read(view,row,'config'))}
function nodes(input:Target):DataView{
 const view=input.dataSet.getView('Base_WorkflowNodeDefinition')
 if(input.dataSet.destroyed||!view||view.destroyed||view.queryContext['workflowId']!==input.workflowId||view.requestState!==RequestState.Loaded||view.loadingError||view.rows.length+view.dirtyTracking.pendingDeleteIds.size-view.dirtyTracking.pendingCreateIds.size!==view.total)throw Error('原节点查询身份未就绪')
 return view
}
function noEdges(view:DataView|undefined,input:Target):boolean{
 if(!view||view.destroyed||view.queryContext['workflowId']!==input.workflowId||view.requestState!==RequestState.Loaded||view.loadingError||view.rows.length!==view.total||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('类型切换的正式连线尚未完整确认')
 return !view.rows.some(row=>{if(read(view,row,'workflow_id')!==input.workflowId)throw Error('类型切换连线归属不符');return read(view,row,'sourceID')===input.nodeId||read(view,row,'targetID')===input.nodeId})
}
async function assertNoFormalEdges(input:OriginalInput):Promise<void>{
 const source=input.dataSet.getView('Base_WorkflowConnectors');if(!source)throw Error('类型切换缺少正式连线视图')
 const fresh=source.createQueryView(`workflowNodeTypeEdges_${crypto.randomUUID().replaceAll('-','')}`)
 try{fresh.filterExpression={logic:'and',filters:[{field:'workflow_id',operator:'eq',value:input.workflowId},{logic:'or',filters:[{field:'sourceID',operator:'eq',value:input.nodeId},{field:'targetID',operator:'eq',value:input.nodeId}]}]};fresh.queryConfig={...fresh.queryConfig,fields:['rowid','workflow_id','sourceID','targetID'],allPages:true};await fresh.refresh();input.assertCurrent();if(!noEdges(fresh,input))throw Error('节点已有正式连线，不能提交旧的类型切换');if(fresh.rows.length)throw Error('正式连线返回范围与目标不符')}
 finally{fresh.dataTable?.destroyView(fresh.viewId)}
}
/** 同一节点的正式记录与编辑覆盖均为空，且不存在已配置连线，才开放类型选择。 */
export function workflowNodeTypeEditable(input:Target):boolean{
 const view=nodes(input),row=view.rows.find(candidate=>view.getPkKey(candidate)===input.nodeId)
 if(!row)return false
 const effective=view.getEditingRow(input.nodeId)??row
 for(const current of [row,effective])if(read(view,current,'workflow_id')!==input.workflowId||String(read(view,current,'position_type'))!=='1'||!kinds.includes(String(read(view,current,'node_type')))||!blank(view,current))return false
 return noEdges(input.dataSet.getView('Base_WorkflowConnectors'),input)
}
/** 独立读取原节点的存在、类型、空绑定及当次权限；不覆盖宿主草稿。 */
export async function assertOriginalWorkflowNodeEmpty(input:OriginalInput):Promise<WorkflowNodeOriginal>{
 input.assertCurrent();const source=nodes(input),pending=input.original?.pending??source.dirtyTracking.isPendingCreate(input.nodeId)
 const view=source.createQueryView(`workflowNodeOriginal_${crypto.randomUUID().replaceAll('-','')}`)
 try{
  view.filterExpression={logic:'and',filters:[{field:'workflow_id',operator:'eq',value:input.workflowId},{field:'rowid',operator:'eq',value:input.nodeId}]};view.queryConfig={...view.queryConfig,fields:columns,allPages:true}
  await view.refresh();input.assertCurrent()
  if(view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total||view.rows.length!==(pending?0:1))throw Error('原空节点已被创建、删除或身份发生变化')
  if(pending){if(view.addActionState()!=='enabled')throw Error('当前正式查询不允许新增节点');if(input.purpose==='type-change'||input.typeChanged)await assertNoFormalEdges(input);return{pending:true}}
  const row=view.rows[0];if(!row||read(view,row,'rowid')!==input.nodeId||read(view,row,'workflow_id')!==input.workflowId||String(read(view,row,'position_type'))!=='1'||!(input.purpose==='type-change'?blank(view,row):unbound(view,row)))throw Error('正式节点已绑定模型或输出，不得从首次绑定入口覆盖')
  const kind=read(view,row,'node_type');if(typeof kind!=='string'||!kinds.includes(kind)||input.original?.kind!==undefined&&input.original.kind!==kind)throw Error('正式节点类型已变化')
  if(input.purpose==='type-change'||input.desiredKind!==undefined&&input.desiredKind!==kind){if(!blank(view,row))throw Error('正式节点已有配置，不能切换原类型');await assertNoFormalEdges(input)}
  if(view.editActionState(row)!=='enabled')throw Error('当前正式查询不允许绑定节点')
  const fields=input.purpose==='type-change'?['node_type']:['add','edit','delete'].includes(input.desiredKind??kind)?['dataOperateModId','output_mapping']:['node_config','output_mapping']
  for(const field of fields)if(view.fieldAccess(row,field).write!=='allowed')throw Error(`当前正式查询不允许节点绑定字段: ${field}`)
  return{pending:false,kind}
 }finally{view.dataTable?.destroyView(view.viewId)}
}
/** 只为实际类型变更重核空节点及精确正式连线，未知提交交原DataSet核验。 */
export async function validateWorkflowNodeTypeChanges(input:TypeChanges):Promise<void>{
 const source=input.dataSet.getView('Base_WorkflowNodeDefinition'),edges=input.dataSet.getView('Base_WorkflowConnectors')
 if(!source||!edges)throw Error('类型切换缺少正式节点或连线视图')
 if(source.hasUnconfirmedSave)return
 const baseline=workflowQueryDraftSignature([source,edges]),context=JSON.stringify([source.queryContext,source.queryConfig,source.filterExpression,edges.queryContext,edges.queryConfig,edges.filterExpression])
 const assertCurrent=()=>{if(input.dataSet.destroyed||workflowQueryDraftSignature([source,edges])!==baseline||JSON.stringify([source.queryContext,source.queryConfig,source.filterExpression,edges.queryContext,edges.queryConfig,edges.filterExpression])!==context)throw Error('节点类型检查期间原目标或草稿已变化')}
 for(const row of source.rows){
  const key=source.getPkKey(row);if(typeof key!=='string')throw Error('节点类型身份缺失')
  if(input.nodeIds&&!input.nodeIds.includes(key))continue
  if(!Object.hasOwn(workflowFieldChanges(source,row,key),'node_type'))continue
  const target={...input,nodeId:key}
  if(!workflowNodeTypeEditable(target))throw Error('仅无模型、无已配置输入输出及连线的普通节点可以切换类型')
  const pending=source.dirtyTracking.isPendingCreate(key),change=source.dirtyTracking.getDiff(key,row)['node_type'],kind=change?change.from:read(source,row,'node_type')
  if(!pending&&typeof kind!=='string')throw Error('节点原类型合同缺失')
  await assertOriginalWorkflowNodeEmpty({...target,assertCurrent,purpose:'type-change',original:{pending,...typeof kind==='string'?{kind}:{}}})
 }
 assertCurrent()
}
