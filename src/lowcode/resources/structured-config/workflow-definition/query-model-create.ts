/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-model-create
 * 职责：在当前工作流元数据实例内复用原模型新增命令，明确查询模型的归属和requestType。
 * 边界：不复制来源、字段、权限或保存逻辑；不创建节点、不执行流程。
 */
import {RequestState,type DataSet,type DataView} from '@spark-appworks/spark-data'
import type {PageDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
import {createModelCreateHandle,createModelCreateHost,type ModelCreateHandle} from '@/lowcode/data-space/model-source/model/lowcode-data-space-model-create-session'

/** 当前工作流的查询模型新增输入；来源读取器已绑定同一实例及执行应用。 */
type WorkflowQueryModelCreateInput=Readonly<{
 dataSet:DataSet
 workflowId:string
 sources:PageDataSpaceModelSourceReader
 assertCurrent():void
}>
/** 已核定数据库表目标的行写操作类型；输入由所属模型的inputParams字段承接。 */
export type WorkflowDataOperation = 'add' | 'edit' | 'delete'

/** 查询模型入口不暴露绕过来源准备的数组创建命令。 */
type WorkflowQueryModelCreateHandle=Omit<ModelCreateHandle,'createArray'|'fork'>
function clean(view:DataView):void{
 if(view.destroyed||view.mutating||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()
  ||view.requestState===RequestState.Loading||view.requestState===RequestState.Preparing)throw Error('请先处理当前查询模型目录或字段的修改')
}
/** 按需读取完整核名目录和同ID参数定义，返回原模型新增owner；保存范围仍由原owner捕获。 */
async function openWorkflowModelCreate(input:WorkflowQueryModelCreateInput,operation:'query'|WorkflowDataOperation):Promise<WorkflowQueryModelCreateHandle>{
 const {dataSet,workflowId,sources}=input
 const definition=dataSet.getView('Base_WorkflowDefinition'),parameters=dataSet.getView('Base_DataSet')
 const models=dataSet.getView('Base_DataModel','modelCatalog'),fields=dataSet.getView('Base_DataModel_Field','modelInputFields')
 if(!workflowId.trim()||!definition||!parameters||!models||!fields)throw Error('工作流查询模型正式视图缺失')
 let parametersValidated=false
 const parameterOwner=()=>{
  const parameter=parameters.rows[0]
  if(parameters.loadingError||parameters.requestState!==RequestState.Loaded||parameters.rows.length!==1||!parameter
   ||parameters.fieldAccess(parameter,'rowid').read!=='visible'||parameters.fieldAccess(parameter,'Type').read!=='visible'
   ||parameters.getPkKey(parameter)!==workflowId||parameter['Type']!=='workflow')throw Error('工作流同ID参数定义缺失或归属不符')
 }
 const guard=()=>{
  input.assertCurrent()
  if(dataSet.destroyed||dataSet.getView('Base_WorkflowDefinition')!==definition||dataSet.getView('Base_DataSet')!==parameters
   ||dataSet.getView('Base_DataModel','modelCatalog')!==models||dataSet.getView('Base_DataModel_Field','modelInputFields')!==fields
   ||definition.queryContext['workflowId']!==workflowId||parameters.queryContext['workflowId']!==workflowId)throw Error('工作流查询目标已变化')
  const row=definition.rows[0]
  if(definition.requestState!==RequestState.Loaded||definition.loadingError||definition.rows.length!==1||!row
   ||definition.fieldAccess(row,'rowid').read!=='visible'||definition.getPkKey(row)!==workflowId)throw Error('工作流定义不存在或身份不可读')
  if(parametersValidated)parameterOwner()
 }
 guard();clean(models);clean(fields);clean(parameters)
 await parameters.refresh();guard()
 parameterOwner();parametersValidated=true
 clean(models);clean(fields)
 models.queryContext={...models.queryContext,dataSpaceId:workflowId}
 fields.queryContext={...fields.queryContext,dataSpaceId:workflowId}
 await models.refresh();guard()
 if(models.loadingError||models.requestState!==RequestState.Loaded)throw models.loadingError??Error('工作流模型目录读取失败')
 const boundSources:PageDataSpaceModelSourceReader={
  query:(query,metadata)=>sources.query(query,metadata),
  async prepare(source,metadata,options){
   guard()
   if(operation!=='query'&&source.type!=='table')throw Error('操作节点当前只承接正式数据库表目标；其他来源执行合同尚未核定')
   const prepared=await sources.prepare(source,metadata,{...options,missingInputType:'preserve',...operation==='query'?{}:{purpose:'operation-target' as const}})
   guard()
   return{...prepared,model:{...prepared.model,requestType:operation},
    ...(operation==='query'?{}:{fields:prepared.fields.map(field=>({...field,type:'inputParams' as const,IsOutput:0,ValueFun:''}))})}
  },
 }
 const handle=createModelCreateHandle(createModelCreateHost({dataSet,targetId:workflowId,sources:boundSources,
  views:{models:'modelCatalog',fields:'modelInputFields'},lifecycle:{assertCurrent:guard,onDispatch(){}}}))
 return{getState:handle.getState,setName:handle.setName,preview:handle.preview,discard:handle.discard,save:handle.save,
  verify:handle.verify,abandonNotApplied:handle.abandonNotApplied,discardLocalChanges:handle.discardLocalChanges}
}

/** 复用原模型owner创建查询来源；查询字段与来源语义保持原合同。 */
export function openWorkflowQueryModelCreate(input:WorkflowQueryModelCreateInput):Promise<WorkflowQueryModelCreateHandle>{
 return openWorkflowModelCreate(input,'query')
}
/** 创建操作目标模型；字段作为待显式配置的输入，不继承来源值函数，也不执行业务操作。 */
export function openWorkflowOperationModelCreate(input:WorkflowQueryModelCreateInput,operation:WorkflowDataOperation):Promise<WorkflowQueryModelCreateHandle>{
 if(!['add','edit','delete'].includes(operation))throw Error('操作节点类型无效')
 return openWorkflowModelCreate(input,operation)
}
