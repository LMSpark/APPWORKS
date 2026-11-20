/**
 * @module app:lowcode/resources/structured-config/workflow-definition/execution/runtime-bindings
 * 职责：在正式工作流场景首次装配时绑定原执行命令，并保留首轮定义及来源合同。
 * 边界：命令输入和回执只有原DataView一份；此处只持校验证据，不创建表或面板owner。
 */
import {RequestState,type DataSet,type DataView} from '@spark-appworks/spark-data'
import {WorkflowExecutionResource} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord,type HttpClientBase} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '../../../../data-space/lowcode-data-space-assembler'
import {WorkflowExecutionContract} from './execution-contract'
import {WorkflowExecutionContext} from './execution-context'
import {workflowExecutionInputs,type WorkflowTestInputGroup} from './execution-inputs'

const scene='0DD8D28D462F51C5790AA6FBFAE39366',tableName='WorkflowExecution'
type Mode='node'|'workflow'
type Capture={workflowId:string;mode:Mode;nodeId:string;commandId:string|undefined;contract:WorkflowExecutionContract;declaration:string;commandScope:string;blockedReason:string|undefined}
type State={view:DataView;dataSet:DataSet;scope:()=>void;preparing:boolean;inputPermit:boolean;capture:Capture|undefined}
type Input=Readonly<{config:ScenarioViewConfig;http:HttpClientBase;readScope:ConstructorParameters<typeof WorkflowExecutionResource>[0]['readScope'];assertCurrent:()=>void}>
type OpenInput=Readonly<{workflowId:string;mode:Mode;nodeId?:string}>
/** 原命令的结构化输入呈现，不携带可编辑输入副本。 */
export type WorkflowExecutionPresentation=Readonly<{groups:readonly WorkflowTestInputGroup[];blockedReason:string|undefined}>
const states=new WeakMap<DataView,State>()
function stateFor(view:DataView):State{const state=states.get(view);if(!state)throw Error('工作流执行命令尚未正式绑定');state.scope();return state}
function commandScope(view:DataView):string{return JSON.stringify([view.queryContext,view.queryConfig,view.filterExpression])}
function definitionGuard(state:State,workflowId:string):void{
 state.scope()
 if(state.view.queryContext['workflowId']!==workflowId)throw Error('工作流测试目标已变化')
 const {dataSet:ds}=state,definition=ds.getView('Base_WorkflowDefinition'),nodes=ds.getView('Base_WorkflowNodeDefinition'),edges=ds.getView('Base_WorkflowConnectors')
 if(!definition||!nodes||!edges||[definition,nodes,edges].some(view=>view.requestState!==RequestState.Loaded||view.loadingError!==null||view.queryContext['workflowId']!==workflowId)
  ||definition.rows.length!==1||!definition.rows[0]||definition.getPkKey(definition.rows[0])!==workflowId)throw Error('工作流正式定义尚未读取或身份不符')
 for(const name of ['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors','Base_DataSet','Base_DataModel','Base_DataModel_Field','Base_DataModel_Relation']){
  for(const view of ds.getTable(name)?.viewList??[])if(view.mutating||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('请先保存或取消正式定义修改，再测试已保存版本')
 }
}
function assertCapture(state:State,capture:Capture):void{
 state.scope()
 if(state.capture!==capture)throw Error('测试命令身份与首轮输入不符，请取消本次输入并重新打开')
 if(commandScope(state.view)!==capture.commandScope)throw Error('测试参数查询上下文已变化，请取消本次输入并重新打开')
 definitionGuard(state,capture.workflowId)
 const current=workflowExecutionInputs({dataSet:state.dataSet,workflowId:capture.workflowId,mode:capture.mode,...capture.mode==='node'?{nodeId:capture.nodeId}:{}})
 if(current.signature!==capture.declaration)throw Error('测试参数声明已变化，请取消本次输入并重新打开')
 capture.contract.assertCurrent()
}
/** 首次装配只核场景和原命令资源，不要求此时已注入workflowId或加载定义。 */
export function createWorkflowScenarioBindings(input:Input):Pick<LowcodeDataSpaceAssemblerInput,'commandBindings'>{
 if(input.config.scenarioId!==scene)return{}
 input.assertCurrent()
 const tables=input.config.toJSON()['tables'],declared=isRecord(tables)?tables[tableName]:undefined
 if(!isRecord(declared)||declared['resourceType']!=='command'||declared['resourceId']!==WorkflowExecutionResource.resourceId)throw Error('WORKFLOW_EXECUTION_BINDING: 正式场景未声明执行命令')
 return{commandBindings:{[tableName]:view=>{
  const ds=view.dataSet
  if(ds?.scenarioId !== scene||view.tableName!==tableName||view.viewId!=='default'||states.has(view))throw Error('WORKFLOW_EXECUTION_BINDING: 命令实例身份不符或重复绑定')
  const scope=()=>{input.assertCurrent();if(ds.destroyed||view.destroyed||ds.getView(tableName,'default')!==view)throw Error('工作流执行实例已失效')}
  const state:State={view,dataSet:ds,scope,preparing:false,inputPermit:false,capture:undefined};states.set(view,state)
  return new WorkflowExecutionResource({http:input.http,readScope:input.readScope,guard:scope,
   onPrepareInput:row=>{
    const capture=state.capture,id=row['commandId']
    if(!state.inputPermit||!capture||capture.commandId!==undefined||typeof id!=='string'||!id||row['mode']!==capture.mode||row['nodeId']!==capture.nodeId
     ||view.mutating||view.hasUnconfirmedSave||view.dirtyTracking.pendingCreateIds.size>0)throw Error('测试命令身份与首轮输入不符，请先明确打开本次测试')
    assertCapture(state,capture);state.inputPermit=false;capture.commandId=id
   },
   prepare:async command=>{
    const capture=state.capture
    if(capture?.commandId !== command.commandId||capture.mode!==command.mode||capture.nodeId!==command.nodeId)throw Error('测试命令身份与首轮输入不符，请取消本次输入并重新打开')
    assertCapture(state,capture)
    if(capture.blockedReason)throw Error(capture.blockedReason)
    await capture.contract.refresh();assertCapture(state,capture)
    const pass=capture.contract.begin('verify'),context=new WorkflowExecutionContext(ds,capture.workflowId,()=>assertCapture(state,capture),pass)
    try{
     await(command.mode==='workflow'?context.load(command.input):context.validateNode(command.nodeId,command.input));assertCapture(state,capture)
     const graph=command.mode==='workflow'?context.capture():undefined
     pass.finish();assertCapture(state,capture)
     return{workflowId:capture.workflowId,...graph===undefined?{}:{graph},assertCurrent:()=>assertCapture(state,capture)}
    }finally{context.dispose()}
   },
  }).binding(view)
 }}}
}
/** 显式开始一次新输入：只读准备首轮合同后，向原命令视图新增一行；打开本身不执行服务命令。 */
export async function prepareWorkflowExecutionInput(view:DataView,input:OpenInput):Promise<WorkflowExecutionPresentation>{
 const state=stateFor(view),{dataSet:ds}=state,nodeId=input.mode==='node'?input.nodeId??'':''
 if(state.preparing||view.mutating||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('请先处理原工作流测试输入或未知执行')
 if(!input.workflowId.trim()||input.mode==='node'&&!nodeId.trim())throw Error('工作流测试目标缺失')
 state.preparing=true
 let capture:Capture|undefined
 try{
  definitionGuard(state,input.workflowId)
  if(input.mode==='workflow'){
   const params=ds.getView('Base_DataSet');if(!params)throw Error('开始参数视图缺失')
   if(params.requestState!==RequestState.Loaded){await params.refresh();definitionGuard(state,input.workflowId);if(params.loadingError)throw params.loadingError}
  }
  const presentation=workflowExecutionInputs({dataSet:ds,workflowId:input.workflowId,mode:input.mode,...input.mode==='node'?{nodeId}:{}})
  const names=['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors',...input.mode==='workflow'?['Base_DataSet']:[]]
  const views=names.map(name=>{const source=ds.getView(name);if(!source)throw Error('工作流测试声明视图缺失');return source})
  const contract=new WorkflowExecutionContract({dataSet:ds,workflowId:input.workflowId,guard:()=>definitionGuard(state,input.workflowId),views})
  capture={workflowId:input.workflowId,mode:input.mode,nodeId,commandId:undefined,contract,declaration:presentation.signature,commandScope:commandScope(view),blockedReason:undefined}
  state.capture=capture
  const currentCapture=capture,pass=contract.begin('capture'),context=new WorkflowExecutionContext(ds,input.workflowId,()=>assertCapture(state,currentCapture),pass)
  try{await(input.mode==='workflow'?context.load():context.validateNode(capture.nodeId));pass.finish()}
  catch(cause){assertCapture(state,capture);capture.blockedReason=cause instanceof Error?cause.message:String(cause)}
  finally{context.dispose()}
  assertCapture(state,capture)
  await view.refresh();assertCapture(state,capture)
  state.inputPermit=true
  let created
  try{created=await view.addRow({mode:capture.mode,nodeId:capture.nodeId,input:JSON.stringify(presentation.seed)})}
  finally{state.inputPermit=false}
  if(!('commandId'in created)||created['commandId']!==capture.commandId)throw Error('测试输入未进入原命令视图')
  view.setCurrentRow(created)
  return{groups:presentation.groups,blockedReason:capture.blockedReason}
 }catch(cause){
  const id=capture?.commandId
  if(state.capture===capture&&(id===undefined||!view.rows.some(row=>view.getPkKey(row)===id)))state.capture=undefined
  throw cause
 }finally{state.preparing=false}
}
/** 重挂只读取原捕获；不刷新、重建输入或以当前声明替换首轮合同。 */
export function readWorkflowExecutionPresentation(view:DataView,commandId:string):WorkflowExecutionPresentation{
 const state=stateFor(view),capture=state.capture
 if(capture?.commandId !== commandId)throw Error('测试输入缺少原首轮合同，只能查看原文或取消')
 assertCapture(state,capture)
 const presentation=workflowExecutionInputs({dataSet:state.dataSet,workflowId:capture.workflowId,mode:capture.mode,...capture.mode==='node'?{nodeId:capture.nodeId}:{}})
 return{groups:presentation.groups,blockedReason:capture.blockedReason}
}
