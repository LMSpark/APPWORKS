/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/smart-bid-page-call
 * 职责：按正式发布工具 ID 选择 SmartBid 页面宿主，所有身份仍由导航和本次 PageRuntime 校验。
 * 边界：只接已具备正式宿主的页面；未登记工具继续走普通四文件页面。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {ClassModelRuntime,createDtsBundleClassModelKnowledgeProvider} from '@spark-appworks/spark-ai/class-model'
import {getDtsClassModelManifestUrl} from '@/services/class-model-artifacts/artifact-urls'
import {resolveExecutionProjectId} from '@/services/application-scope'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {captureContentAuthoringSession} from '../../../model/content-authoring-host'
import type {ContentAuthoringRoute} from '../content-authoring-target'
import {createContentSubmissionScriptHost} from '../content-submission-script-host'
import {createBidFindingsScriptHost} from '../../../../collaboration/tasks/bid-findings-script-host'
import {preparePublishedContentOperationCall} from '../content-operation-target'
import {preparePublishedBidClassModelCatalogCall,preparePublishedConfigurationReleaseCall,
 preparePublishedContentDeadlineCall,
 preparePublishedKnowledgeDirectoryCall} from '../content-review-target'
import {createSmartBidPageActionSubmit} from './smart-bid-action-source'
import {createSmartBidCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-command'
import {bindPublishedPageRuntime,matchesPublishedPageBinding} from './published-page-binding'
import {createSmartBidAgentDispatcher} from '@/services/smart-bid/operation/agent-module/smart-bid-agent-dispatch'

const applicationId='D8490EC99436A8B9AFDE205BE3153802'
const productionPageId='smart-bid-authoring-page12'
const findingsPageId='smart-bid-collaboration-page15'
const submissionPageId='smart-bid-authoring-page13'
const deadlinePageId='smart-bid-authoring-page14'
const knowledgePageId='smart-bid-knowledge-page16'
const catalogPageId='smart-bid-knowledge-page17'
const operationPageId='smart-bid-authoring-page18'
const configurationPageId='smart-bid-configuration-page19'
const operationRegistrationId='SmartBidOperationModule'
const standardActionPages=new Set([productionPageId,submissionPageId,findingsPageId])
const registeredPageIds=new Set([
 ...standardActionPages,deadlinePageId,knowledgePageId,catalogPageId,operationPageId,configurationPageId,
])

/** 把已闭合的业务页固定到本次 PageRuntime、ClassModel 和正式命令 owner。 */
export function preparePublishedSmartBidPageCall(route:ContentAuthoringRoute){
 if(resolveExecutionProjectId(route.path)!==applicationId)return undefined
 const nodeId=route.meta['nodeId'],pageId=route.meta['pageId'],scenarioId=route.meta['blueprintScenarioId']
 const normalizedPageId=typeof pageId==='string'?pageId:''
 const tool=route.meta['tool']
 const toolPageId=isRecord(tool)?tool['pageId']:undefined
 if(typeof toolPageId==='string'&&registeredPageIds.has(toolPageId)&&toolPageId!==normalizedPageId)
  throw Error(normalizedPageId?'SMART_BID_PUBLICATION_IDENTITY_CONFLICT':'SMART_BID_PUBLICATION_IDENTITY_REQUIRED')
 if(!registeredPageIds.has(normalizedPageId))return undefined
 if(standardActionPages.has(normalizedPageId))return preparePublishedSmartBidActionCall(route)
 const entry={applicationId,nodeId:typeof nodeId==='string'?nodeId:'',
  pageId:normalizedPageId,scenarioId:typeof scenarioId==='string'?scenarioId:''}
 if(!matchesPublishedPageBinding(route,entry,{
  identityError:'SMART_BID_PUBLICATION_IDENTITY_REQUIRED',
  conflictError:'SMART_BID_PUBLICATION_IDENTITY_CONFLICT',
  forbiddenQuery:['actorUserId','currentUserId','userId','scenarioInputs','additionalScenarioIds','rootKind'],
  requireScenarioQuery:true,
 }))return undefined
 if(normalizedPageId===deadlinePageId)
  return preparePublishedContentDeadlineCall(route,entry,()=>({}))
 if(normalizedPageId===knowledgePageId)
  return preparePublishedKnowledgeDirectoryCall(route,entry,(runtime,scope)=>bindModelRoot(runtime,scope.scenarioId))
 if(normalizedPageId===catalogPageId)
  return preparePublishedBidClassModelCatalogCall(route,entry,(runtime,scope)=>bindModelRoot(runtime,scope.scenarioId))
 if(normalizedPageId===configurationPageId)
  return preparePublishedConfigurationReleaseCall(route,entry,(runtime,scope)=>{
   const assertCurrent=scope.assertCurrent
   const submitAction=createSmartBidPageActionSubmit(runtime,scope.projectId,assertCurrent)
   return {
    scopeId:scope.projectId,configurationScope:'PROJECT',assertCurrent,
    submitEnable:async (prepared,signal)=>submitAction({operationId:'60',requestKey:prepared.record.requestKey,
     prompt:'启用已编审配置版本',inputs:prepared.record},signal),
    submitDisable:async (prepared,signal)=>submitAction({operationId:'61',requestKey:prepared.record.requestKey,
     prompt:'停用已编审配置版本',inputs:prepared.record},signal),
   }

  })
 if(normalizedPageId===operationPageId)
  return preparePublishedContentOperationCall(route,entry,bindOperationRoot)
 return undefined
}

function preparePublishedSmartBidActionCall(route:ContentAuthoringRoute){
 const requestedProjectId=route.query['projectId'],scenarioId=route.meta['blueprintScenarioId']
 if(requestedProjectId!==undefined&&!identity(requestedProjectId)||!identity(scenarioId)
  ||!identity(route.meta['nodeId'])||!identity(route.meta['pageId']))
  throw Error('SMART_BID_PAGE_ACTION_PUBLICATION_REQUIRED')
 const entry={applicationId,nodeId:route.meta['nodeId'],pageId:route.meta['pageId'],scenarioId}
 if(!matchesPublishedPageBinding(route,entry,{
  identityError:'SMART_BID_PAGE_ACTION_PUBLICATION_REQUIRED',
  conflictError:'SMART_BID_PAGE_ACTION_PUBLICATION_REQUIRED',
  forbiddenQuery:['actorUserId','currentUserId','userId','scenarioInputs','rootKind'],
  requireScenarioQuery:requestedProjectId!==undefined,
 }))return undefined
 if(requestedProjectId===undefined&&entry.pageId!==submissionPageId)return undefined
 const projectId=requestedProjectId??applicationId
 const session=captureContentAuthoringSession({applicationId,scenarioId,projectId})
 return bindPublishedPageRuntime({entry,session,
  runtimeConflictError:'SMART_BID_PAGE_ACTION_RUNTIME_CONFLICT',
  validateRuntime(runtime){
   const inputs=runtime.call.scenarioInputs?.[scenarioId]
   if(runtime.call.mainScenarioId!==scenarioId||inputs?.['projectId']!==projectId
    ||inputs['currentUserId']!==session.actorUserId)throw Error('SMART_BID_PAGE_ACTION_RUNTIME_CONFLICT')
  },
  createHost(runtime:PageRuntime){
   session.assertCurrent()
   const submit=requestedProjectId===undefined?undefined:createSmartBidPageActionSubmit(runtime,requestedProjectId,session.assertCurrent)
   const submission=entry.pageId===submissionPageId
    ?createContentSubmissionScriptHost(runtime,{projectId,scenarioId,assertCurrent:session.assertCurrent})
    :undefined
   const findings=entry.pageId===findingsPageId
    ?createBidFindingsScriptHost(runtime,{projectId,scenarioId,assertCurrent:session.assertCurrent},{})
    :undefined
   return Object.freeze({runtime,assertCurrent:session.assertCurrent,async invoke(name:string,input:unknown,signal:AbortSignal){
    if(findings&&(name==='bid.tasks.readFindingRegistration'||name==='bid.tasks.readRecheckResult'))
     return findings.invoke(name,input,signal)
    if(name==='content.submission.readOriginal'&&submission)return submission.invoke(name,input,signal)
    if(name!=='smart-bid.dispatch')throw Error('SMART_BID_PAGE_ACTION_COMMAND_REQUIRED')
    if(!submit)throw Error('SMART_BID_PAGE_ACTION_PROJECT_REQUIRED')
    const command=createSmartBidCommand(input,{
     registrationId:operationRegistrationId,businessInstanceId:projectId,runtimeInstanceId:runtime.call.instanceId,
     inputError:'SMART_BID_PAGE_ACTION_COMMAND_REQUIRED',scopeError:'SMART_BID_PAGE_ACTION_COMMAND_REQUIRED',
     requireIdentity:true,
    })
    if(signal.aborted)throw Error('SMART_BID_PAGE_ACTION_STALE')
    const result=await submit({operationId:command.operationId,requestKey:command.requestKey,
     prompt:command.prompt,inputs:command.inputs},signal)
    session.assertCurrent()
    if(!isRecord(result)||result['state']!=='ACTION_APPLIED'||result['dispatched']!==true||!isRecord(result['actionReceipt'])){
     const interrupted=isRecord(result)&&result['state']==='SSE_UNKNOWN'
     throw Error(interrupted?'工具回传中断，原业务结果待核验':'当前没有原业务回执，请核验原请求')
    }
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
 return Object.freeze({classModel,rootKind:'SmartBidOperationModule',assertCurrent:()=>{
  if(runtime.destroyed||!runtime.isLoaded||!runtime.call.scenarioIds.includes(scenarioId))
   throw Error('SMART_BID_OPERATION_RUNTIME_STALE')
 }})
}

function bindOperationRoot(runtime:PageRuntime,target:Readonly<{scenarioId:string;projectId:string}>){
 const agent=createSmartBidAgentDispatcher({runtime,scenarioId:target.scenarioId,projectId:target.projectId,
  assertCurrent:()=>{if(runtime.destroyed||!runtime.isLoaded)throw Error('SMART_BID_AGENT_RUNTIME_STALE')}})
 return Object.freeze({...agent,dispatchOperation:({input,signal}:Readonly<{input:Parameters<typeof agent.dispatch>[0];signal:AbortSignal}>)=>
  agent.dispatch(input,signal)})
}
