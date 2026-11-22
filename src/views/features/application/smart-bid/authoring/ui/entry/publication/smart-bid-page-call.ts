/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/smart-bid-page-call
 * 职责：按发布导航标题和正式元信息选择 SmartBid 页面宿主，所有身份仍由导航和本次 PageRuntime 校验。
 * 边界：只接已具备正式宿主的页面；未映射标题继续走普通四文件页面，不猜工具身份。
 */
import {ClassModelRuntime,createDtsBundleClassModelKnowledgeProvider} from '@spark-appworks/spark-ai/class-model'
import {ClassModelAgentAdapter,createAiAgentHost,createSimpleInputContract} from '@spark-appworks/spark-ai/agent'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {getDtsClassModelManifestUrl} from '@/services/class-model-artifacts/artifact-urls'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {captureContentAuthoringSession} from '../../../model/content-authoring-host'
import type {ContentAuthoringRoute} from '../content-authoring-target'
import {preparePublishedContentOperationCall} from '../content-operation-target'
import {preparePublishedBidClassModelCatalogCall,preparePublishedConfigurationReleaseCall,
 preparePublishedContentDeadlineCall,preparePublishedContentSubmissionCall,
 preparePublishedKnowledgeDirectoryCall} from '../content-review-target'
import type {ContentOperationDispatch} from '../content-operation-script-host'
import {createAiAgentTurnCallbacks} from '@/services/ai/ai-turn-bridge'
import {SmartBidOperationModule} from '@/services/smart-bid/operation/agent-module/smart-bid-operation-module'
import {
 createSmartBidRuntimeActionExecutor,createSmartBidRuntimeClaimOwner,
} from '@/services/smart-bid/operation/agent-module/smart-bid-runtime-action-owner'
import {createSmartBidPageActionSubmit} from './smart-bid-action-source'
import type {JsonValue} from '@spark-appworks/spark-json-document'
import type {SmartBidOperationCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-operation-module'
import {createSmartBidCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-command'
import {bindPublishedPageRuntime,matchesPublishedPageBinding} from './published-page-binding'

const applicationId='D8490EC99436A8B9AFDE205BE3153802'
const operationTitle='AI 作业与核验'
const knowledgeTitle='知识目录与指南'
const catalogTitle='ClassModel 登记'
const submissionTitle='签署与递交'
const deadlineTitle='回执与截止核对'
const configurationTitle='配置编审与启用'
const submissionPageId='smart-bid-authoring-page13'
const deadlinePageId='smart-bid-authoring-page14'
const knowledgePageId='smart-bid-knowledge-page16'
const catalogPageId='smart-bid-knowledge-page17'
const operationPageId='smart-bid-authoring-page18'
const configurationPageId='smart-bid-configuration-page19'
const operationRegistrationId='SmartBidOperationModule'
const standardActionPages=new Set(['制件与审定','签署与递交','任务与问题'])

/** 把已闭合的业务页固定到本次 PageRuntime、ClassModel 和正式命令 owner。 */
export function preparePublishedSmartBidPageCall(route:ContentAuthoringRoute){
 const nodeId=route.meta['nodeId'],pageId=route.meta['pageId'],scenarioId=route.meta['blueprintScenarioId']
 const normalizedPageId=typeof pageId==='string'?pageId:''
 const title=String(route.meta['title'])
 const recognizedPageIds=new Set([
  submissionPageId,deadlinePageId,knowledgePageId,catalogPageId,operationPageId,configurationPageId,
 ])
 if(standardActionPages.has(title))return preparePublishedSmartBidActionCall(route)
 if(!recognizedPageIds.has(normalizedPageId)&&![knowledgeTitle,catalogTitle,operationTitle,configurationTitle,submissionTitle,deadlineTitle]
  .includes(title))return undefined
 const entry={applicationId,nodeId:typeof nodeId==='string'?nodeId:'',
  pageId:normalizedPageId,scenarioId:typeof scenarioId==='string'?scenarioId:''}
 if(!matchesPublishedPageBinding(route,entry,{
  identityError:'SMART_BID_PUBLICATION_IDENTITY_REQUIRED',
  conflictError:'SMART_BID_PUBLICATION_IDENTITY_CONFLICT',
  forbiddenQuery:['actorUserId','currentUserId','userId','scenarioInputs','additionalScenarioIds','rootKind'],
  requireScenarioQuery:true,
 }))return undefined
 if(normalizedPageId===submissionPageId||title===submissionTitle)
  return preparePublishedContentSubmissionCall(route,entry,()=>({}))
 if(normalizedPageId===deadlinePageId||title===deadlineTitle)
  return preparePublishedContentDeadlineCall(route,entry,()=>({}))
 if(normalizedPageId===knowledgePageId||title===knowledgeTitle)
  return preparePublishedKnowledgeDirectoryCall(route,entry,(runtime,scope)=>bindModelRoot(runtime,scope.scenarioId))
 if(normalizedPageId===catalogPageId||title===catalogTitle)
  return preparePublishedBidClassModelCatalogCall(route,entry,(runtime,scope)=>bindModelRoot(runtime,scope.scenarioId))
 if(normalizedPageId===configurationPageId||title===configurationTitle)
  return preparePublishedConfigurationReleaseCall(route,entry,(runtime,scope)=>{
   const assertCurrent=scope.assertCurrent
   const submitAction=createSmartBidPageActionSubmit(runtime,scope.projectId,assertCurrent)
   return {
    scopeId:scope.projectId,configurationScope:'PROJECT',assertCurrent,
    submitEnable:async prepared=>submitAction({operationId:'60',requestKey:prepared.record.requestKey,
     prompt:'启用已编审配置版本',inputs:prepared.record}),
    submitDisable:async prepared=>submitAction({operationId:'61',requestKey:prepared.record.requestKey,
     prompt:'停用已编审配置版本',inputs:prepared.record}),
   }

  })
 if(normalizedPageId===operationPageId||title===operationTitle)
  return preparePublishedContentOperationCall(route,entry,bindOperationRoot)
 return undefined
}

function preparePublishedSmartBidActionCall(route:ContentAuthoringRoute){
 const projectId=route.query['projectId'],scenarioId=route.meta['blueprintScenarioId']
 if(!identity(projectId)||!identity(scenarioId)||!identity(route.meta['nodeId'])||!identity(route.meta['pageId']))
  throw Error('SMART_BID_PAGE_ACTION_PUBLICATION_REQUIRED')
 const entry={applicationId,nodeId:route.meta['nodeId'],pageId:route.meta['pageId'],scenarioId}
 if(!matchesPublishedPageBinding(route,entry,{
  identityError:'SMART_BID_PAGE_ACTION_PUBLICATION_REQUIRED',
  conflictError:'SMART_BID_PAGE_ACTION_PUBLICATION_REQUIRED',
  forbiddenQuery:['actorUserId','currentUserId','userId','scenarioInputs','rootKind'],
  requireScenarioQuery:true,
 }))return undefined
 const session=captureContentAuthoringSession({applicationId,scenarioId,projectId})
 return bindPublishedPageRuntime({entry,session,
  runtimeConflictError:'SMART_BID_PAGE_ACTION_RUNTIME_CONFLICT',
  createHost(runtime:PageRuntime){
   session.assertCurrent()
   const execute=createSmartBidRuntimeActionExecutor({runtime,scenarioId,assertCurrent:session.assertCurrent})
   return Object.freeze({runtime,assertCurrent:session.assertCurrent,async invoke(name:string,input:unknown,signal:AbortSignal){
    if(name!=='smart-bid.dispatch')throw Error('SMART_BID_PAGE_ACTION_COMMAND_REQUIRED')
    const command=createSmartBidCommand(input,{
     registrationId:operationRegistrationId,businessInstanceId:projectId,runtimeInstanceId:runtime.call.instanceId,
     inputError:'SMART_BID_PAGE_ACTION_COMMAND_REQUIRED',scopeError:'SMART_BID_PAGE_ACTION_COMMAND_REQUIRED',
     requireIdentity:true,
    })
    if(signal.aborted)throw Error('SMART_BID_PAGE_ACTION_STALE')
    const result=await execute(command)
    session.assertCurrent()
    return Object.freeze({operationId:command.operationId,requestKey:command.requestKey,outcome:result,
     assertCurrent:session.assertCurrent})
   }})
  },
 })
}

function bindModelRoot(runtime:PageRuntime,scenarioId:string){
 const knowledge=createDtsBundleClassModelKnowledgeProvider({
  dtsClassModelManifestUrl:getDtsClassModelManifestUrl(),rootClassName:operationRegistrationId,
 })
 const classModel=new ClassModelRuntime({knowledge,scriptExecutor:()=>{
  throw Error('SMART_BID_OPERATION_SCRIPT_OWNER_REQUIRED')
 }})
 return Object.freeze({
  classModel,rootKind:'SmartBidOperationModule',
  assertCurrent:()=>{
   if(runtime.destroyed||!runtime.isLoaded||!runtime.call.scenarioIds.includes(scenarioId))
    throw Error('SMART_BID_OPERATION_RUNTIME_STALE')
  },
 })
}

function bindOperationRoot(runtime:PageRuntime,target:Readonly<{scenarioId:string;projectId:string}>){
 const model=bindModelRoot(runtime,target.scenarioId)
 const executeOwner=createSmartBidRuntimeActionExecutor({...model,scenarioId:target.scenarioId,runtime})
 const claim=createSmartBidRuntimeClaimOwner({...model,scenarioId:target.scenarioId,runtime})
 let activeDispatch:Readonly<{command:SmartBidOperationCommand}> & {receipt?:JsonValue}|undefined
 const execute=async(input:Parameters<typeof executeOwner>[0])=>{
  const active=activeDispatch
  if(active&&(['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey'] as const)
   .some(field=>active.command[field]!==input[field]))throw Error('SMART_BID_ACTION_DISPATCH_SCOPE')
  const receipt=await executeOwner(input)
  if(active)active.receipt=receipt
  return receipt
 }
 const operationModule=new SmartBidOperationModule(execute)
 const host=ClassModelAgentAdapter.register({
  host:createAiAgentHost({turnCallbacks:createAiAgentTurnCallbacks(),maxToolRounds:16}),
  alias:operationRegistrationId,moduleClass:SmartBidOperationModule,options:{
    moduleId:operationRegistrationId,instance:operationModule,rootClassName:operationRegistrationId,
    dtsClassModelManifestUrl:getDtsClassModelManifestUrl(),
    inputContract:createSimpleInputContract({
     businessId:operationRegistrationId,identityField:'businessInstanceId',messageField:'prompt',
     paramsSchema:{type:'object',additionalProperties:false,required:[
      'operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs',
     ],properties:{
      operationId:{type:'string',minLength:1},registrationId:{const:operationRegistrationId},
      businessInstanceId:{type:'string',minLength:1},runtimeInstanceId:{type:'string',minLength:1},
      requestKey:{type:'string',minLength:1},prompt:{type:'string',minLength:1},inputs:{type:'object'},
     }},
     systemPrompt:'必须先查询当前动作指南，再通过 model_script 执行 SmartBidOperationModule.dispatchAction；只有原 owner 回执允许完成。',
    }),
  },
 })
 return Object.freeze({...model,operationModule,dispatchOperation:async({input,signal}:ContentOperationDispatch)=>{
  model.assertCurrent()
  signal.throwIfAborted()
  const now=new Date().toISOString(),turnId=crypto.randomUUID()
  const claimResult=await claim({...input,turnId})
  claimResult.assertCurrent()
  if(claimResult.state!=='CLAIMED')return Object.freeze({operationId:input.operationId,requestKey:input.requestKey,
   outcome:{turnId,claimState:claimResult.state,dispatched:false}})
  signal.throwIfAborted()
  if(activeDispatch)throw Error('SMART_BID_ACTION_DISPATCH_BUSY')
  const dispatch:{command:SmartBidOperationCommand;receipt?:JsonValue}={command:input}
  activeDispatch=dispatch
  try{
    const run=await host.run(operationRegistrationId,input,{turn:{
     turnId,seq:1,baseRevision:-1,queuedAt:now,startedAt:now,maxParallelTurns:1,
    }})
    model.assertCurrent()
    claimResult.assertCurrent()
    const applied=dispatch.receipt
    return Object.freeze({operationId:input.operationId,requestKey:input.requestKey,
     outcome:applied===undefined?{
      sessionId:run.session.sessionId,turnId,claimState:claimResult.state,state:'NO_ACTION_RECEIPT',dispatched:false,
     }:{
      sessionId:run.session.sessionId,turnId,claimState:claimResult.state,state:'ACTION_APPLIED',dispatched:true,
      actionReceipt:applied,...(claimResult.receiptRef===undefined?{}:{receiptRef:claimResult.receiptRef}),
     }})
  }finally{if(activeDispatch===dispatch)activeDispatch=undefined}
 }})
}
