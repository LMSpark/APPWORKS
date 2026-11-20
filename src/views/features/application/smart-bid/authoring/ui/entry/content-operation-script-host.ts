/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-operation-script-host
 * 职责：把本次页18工作区的目录查询与同版指南交给四文件脚本。
 * 边界：把本次 PageRuntime 的工艺能力交给脚本，读写仍由原绑定负责。
 * AI用途：核对页18脚本能够调用哪些当前实例能力。
 */
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {openContentOperationWorkspace} from './content-operation-workspace'
import type {SmartBidOperationModule,SmartBidOperationCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-operation-module'
import {coerceStrictJsonValue} from '@spark-appworks/spark-json-document'

/** 工艺页面连接命令的输入形状。 */
type Open=Parameters<typeof openContentOperationWorkspace>
/** 按原身份解析已冻结工艺指南的能力。 */
type ResolveGuide=Parameters<ReturnType<typeof openContentOperationWorkspace>['recoverOriginal']>[1]
type DispatchResult=Awaited<ReturnType<ReturnType<typeof openContentOperationWorkspace>['dispatch']>>
type ExecutableDispatchResult=DispatchResult|Awaited<ReturnType<SmartBidOperationModule['dispatchOperation']>>
/** 当前可信宿主把已注册 Agent SSE 派发器注入同一 PageRuntime；四文件只提交精确输入。 */
export type ContentOperationDispatch=Readonly<{
 workspace:ReturnType<typeof openContentOperationWorkspace>;input:SmartBidOperationCommand;signal:AbortSignal
}>
type Scope=Omit<Open[2],'signal'>&Readonly<{
 resolveOriginalGuide?:ResolveGuide
 dispatchOperation?:(command:ContentOperationDispatch)=>Promise<ExecutableDispatchResult>
 operationModule?:SmartBidOperationModule
 registrationId?:string
 runtimeInstanceId?:string
}>

function exposeVerifiedJson(readJson:()=>string,digest:string,{assertCurrent,error='OPERATION_ROUTE_DISPATCH_DIGEST'}:
 Readonly<{assertCurrent:()=>void;error?:string}>){
 return async ()=>{
  assertCurrent()
  const inputJson=readJson()
  if(await hashCanonicalSnapshotText(inputJson)!==digest)throw Error(error)
  assertCurrent()
  return inputJson
 }
}

export function createContentOperationScriptHost<Runtime extends Open[0]>(runtime:Runtime,classModel:Open[1],
 scope:Scope){
 return {runtime,assertCurrent:scope.assertCurrent,
  async invoke(name:string,input:unknown,signal:AbortSignal){
   if(!isRecord(input))throw Error('OPERATION_PAGE_COMMAND_REQUIRED')
   const workspace=openContentOperationWorkspace(runtime,classModel,{...scope,signal})
   if(name==='content.operation.dispatch'){
    const withCurrent=<T extends object>(result:T)=>Object.freeze({...result,assertCurrent:()=>{
     scope.assertCurrent()
     if(signal.aborted||runtime.destroyed||!runtime.isLoaded)throw Error('OPERATION_WORKSPACE_STALE')
    }})
    const command=readOperationCommand(input,{
     projectId:scope.projectId,
     ...(scope.registrationId===undefined?{}:{registrationId:scope.registrationId}),
     ...(scope.runtimeInstanceId===undefined?{}:{runtimeInstanceId:scope.runtimeInstanceId}),
    })
    if(scope.dispatchOperation){
      return withCurrent(await scope.dispatchOperation({workspace,input:command,signal}))
    }else if(scope.operationModule){
     return withCurrent(await scope.operationModule.dispatchOperation(command))
    }else throw Error('OPERATION_PAGE_AGENT_DISPATCH_UNAVAILABLE')
   }
   if(name==='content.operation.prepareRework'){
    const {runId,attemptRef,requestKey,targetDigest,configurationLockHash,reason}=input
    if(!identity(runId)||!identity(attemptRef)||!identity(requestKey)||!identity(targetDigest)||!identity(configurationLockHash)||
     typeof reason!=='string'||!reason.trim())
     throw Error('OPERATION_PAGE_REWORK_REQUIRED')
    const prepared=await workspace.prepareRework({runId,attemptRef,requestKey,targetDigest,configurationLockHash,reason:reason.trim()})
    prepared.assertCurrent()
    return prepared
   }
   if(name==='content.operation.readDispatch'){
    const {runId,attemptRef,requestKey,targetDigest,configurationLockHash}=input
    if(!identity(runId)||!identity(attemptRef)||!identity(requestKey)||!identity(targetDigest)||!identity(configurationLockHash)||
     ![targetDigest,configurationLockHash].every(value=>/^[a-f0-9]{64}$/u.test(value)))throw Error('OPERATION_PAGE_ATTEMPT_REQUIRED')
    const attempt={projectId:scope.projectId,runId,attemptRef,requestKey,targetDigest,configurationLockHash}
    const verified=scope.resolveOriginalGuide?await workspace.recoverOriginal(attempt,scope.resolveOriginalGuide):undefined
    const prerequisite=verified?.state==='FROZEN_CONTEXT_REQUIRED'||verified?.state==='ORIGINAL_GUIDE_REQUIRED'||
     verified?.state==='ORIGINAL_GUIDE_RULES_REQUIRED'?verified:undefined
    if(verified&&!prerequisite){
     verified.assertCurrent()
     const dispatch='dispatch' in verified?verified.dispatch:undefined
     const result='result' in verified?verified.result:undefined
     const assertCurrent=verified.assertCurrent
     const inputJson=dispatch&&'inputJson' in dispatch?dispatch.inputJson:null
     return Object.freeze({
      state:dispatch&&'dispatchRef' in dispatch?'DISPATCH_RECORDED':'UNKNOWN',
      ...(dispatch&&'dispatchRef' in dispatch?{dispatchRef:dispatch.dispatchRef,actualInputDigest:dispatch.actualInputDigest}:{}),
      ...(dispatch&&'dispatchRef' in dispatch&&inputJson!==null?
       {readActualInput:exposeVerifiedJson(()=>inputJson,dispatch.actualInputDigest,{assertCurrent})}:{}),
      verification:Object.freeze({state:verified.state,
       receiptRef:result&&'receiptRef' in result?result.receiptRef:undefined,
       ...(result?.state==='VERIFIED_CANDIDATE'?{candidateDigest:result.candidateDigest,
        readCandidate:exposeVerifiedJson(()=>result.candidateJson,result.candidateDigest,{assertCurrent,error:'OPERATION_ROUTE_CANDIDATE_DIGEST'})}:{}),
       ...('actualRequirementReads' in verified&&verified.actualRequirementReads?
        {actualRequirementReads:verified.actualRequirementReads}:{}),
       assertCurrent}),
      assertCurrent,
     })
    }
    const readback=await workspace.readDispatch(attempt)
    const assertCurrent=()=>{readback.assertCurrent();prerequisite?.assertCurrent()}
    assertCurrent()
    const verification=prerequisite?{verification:Object.freeze({state:prerequisite.state,assertCurrent})}:{}
    return readback.state==='DISPATCH_RECORDED'
     ?Object.freeze({state:readback.state,...verification,dispatchRef:readback.dispatchRef,actualInputDigest:readback.actualInputDigest,
      ...(readback.input===undefined?{}:{readActualInput:exposeVerifiedJson(()=>canonicalSnapshotValue(readback.input),
       readback.actualInputDigest,{assertCurrent:readback.assertCurrent})}),assertCurrent:readback.assertCurrent})
     :Object.freeze({state:readback.state,...verification,assertCurrent})
   }
   if(name!=='content.operation.discover'||!identity(input['directoryRef']))throw Error('OPERATION_PAGE_COMMAND_REQUIRED')
   const discovery=await workspace.discover(input['directoryRef'])
   discovery.assertCurrent()
   const dataViewKey=buildDataViewKey('KnowledgeGuide','effectiveDirectory',scope.scenarioId)
   return Object.freeze({dataViewKey,
    count:discovery.items.length,reachable:discovery.items.filter(item=>item.state==='REACHABLE').length,
    assertCurrent:discovery.assertCurrent,
    async readGuide(rowKey:string|number,selection:unknown){
     discovery.assertCurrent()
     const view=runtime.resolveView(dataViewKey)
     const row=view?.rows.find(item=>view.getPkKey(item)===rowKey)
     const entry=discovery.items.find(item=>row?.['guideRef']===item.guideRef&&row['versionRef']===item.versionRef&&
      row['kind']===item.kind&&row['actionName']===item.actionName)
     const versionFields=['guideRef','versionRef','guideDigest','kind','actionName'] as const
     if(!row||!entry||!isRecord(selection)||versionFields.some(field=>selection[field]!==row[field]))
      throw Error('OPERATION_PAGE_GUIDE_ROW_REQUIRED')
     const {source,publicationRef}=row
     if(source!=='ENTERPRISE'&&(source!=='PUBLIC'||!identity(publicationRef)))
      throw Error('OPERATION_PAGE_GUIDE_ROW_REQUIRED')
     const guide=await workspace.readGuide(discovery,entry)
     guide.assertCurrent()
     return Object.freeze({...guide,origin:source==='PUBLIC'
      ?Object.freeze({source,publicationRef})
      :Object.freeze({source})})
    },
   })
  },
 }
}

function readOperationCommand(value:unknown,scope:Readonly<{
 projectId:string;registrationId?:string;runtimeInstanceId?:string
}>):SmartBidOperationCommand{
 if(!isRecord(value)||typeof value['operationId']!=='string'||typeof value['requestKey']!=='string'||
  typeof value['prompt']!=='string')
  throw Error('OPERATION_PAGE_DISPATCH_INPUT_REQUIRED')
 const registrationId=scope.registrationId??value['registrationId']
 const businessInstanceId=scope.projectId
 const runtimeInstanceId=scope.runtimeInstanceId??value['runtimeInstanceId']
 if(typeof registrationId!=='string'||typeof runtimeInstanceId!=='string'||
  (Object.hasOwn(value,'registrationId')&&value['registrationId']!==registrationId)||
  (Object.hasOwn(value,'businessInstanceId')&&value['businessInstanceId']!==businessInstanceId)||
  (Object.hasOwn(value,'runtimeInstanceId')&&value['runtimeInstanceId']!==runtimeInstanceId))
  throw Error('OPERATION_PAGE_DISPATCH_SCOPE_REQUIRED')
 const inputs=coerceStrictJsonValue(value['inputs'])
 if(inputs===undefined||inputs===null||typeof inputs!=='object'||Array.isArray(inputs))
  throw Error('OPERATION_PAGE_DISPATCH_INPUT_REQUIRED')
 return Object.freeze({operationId:value['operationId'],registrationId,businessInstanceId,runtimeInstanceId,
  requestKey:value['requestKey'],prompt:value['prompt'],inputs})
}
