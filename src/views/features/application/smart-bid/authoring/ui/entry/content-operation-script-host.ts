/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-operation-script-host
 * 职责：把本次页18工作区的目录查询与同版指南交给四文件脚本。
 * 边界：把本次 PageRuntime 的工艺能力交给脚本，读写仍由原绑定负责。
 * AI用途：核对页18脚本能够调用哪些当前实例能力。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {openContentOperationWorkspace} from './content-operation-workspace'
import type {SmartBidOperationModule,SmartBidOperationCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-operation-module'
import {createSmartBidCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-command'
import type {SmartBidAgentDispatchResult} from '@/services/smart-bid/operation/agent-module/smart-bid-agent-dispatch'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {prepareOperationReworkParameter,readOperationDispatchParameter} from '../../model/operation/content-operation-parameter-reader'

/** 工艺页面连接命令的输入形状。 */
type Open=Parameters<typeof openContentOperationWorkspace>
/** 当前可信宿主把已注册 Agent SSE 派发器注入同一 PageRuntime；四文件只提交精确输入。 */
export type ContentOperationDispatch=Readonly<{
 workspace?:ReturnType<typeof openContentOperationWorkspace>;input:SmartBidOperationCommand;signal:AbortSignal
}>
type Scope=Omit<Open[2],'signal'>&Readonly<{
 dispatchOperation?:(command:ContentOperationDispatch)=>Promise<SmartBidAgentDispatchResult>
 operationModule?:SmartBidOperationModule
 registrationId?:string
 runtimeInstanceId?:string
}>

export function createContentOperationScriptHost<Runtime extends Open[0]>(runtime:Runtime,classModel:Open[1],
 scope:Scope){
 const issued=new Set<string>()
 let issuedGeneration=runtime.generation
 return {runtime,assertCurrent:scope.assertCurrent,
  async invoke(name:string,input:unknown,signal:AbortSignal){
   if(!isRecord(input))throw Error('OPERATION_PAGE_COMMAND_REQUIRED')
   const workspace=openContentOperationWorkspace(runtime,classModel,{...scope,signal})
   const generation=runtime.generation
   if(issuedGeneration!==generation){issued.clear();issuedGeneration=generation}
   const assertCurrent=()=>{
    scope.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
     throw Error('OPERATION_WORKSPACE_STALE')
   }
   const parameterScope={projectId:scope.projectId,assertCurrent,
    verifyOriginal:async(dispatch:SmartBidAgentDispatchResult)=>
     issued.has(await hashCanonicalSnapshotText(canonicalSnapshotValue(dispatch))),
   }
   if(name==='content.operation.dispatch'){
    const withCurrent=<T extends object>(result:T)=>Object.freeze({...result,assertCurrent})
    const command=createSmartBidCommand(input,{
     businessInstanceId:scope.projectId,
     ...(scope.registrationId===undefined?{}:{registrationId:scope.registrationId}),
     ...(scope.runtimeInstanceId===undefined?{}:{runtimeInstanceId:scope.runtimeInstanceId}),
     inputError:'OPERATION_PAGE_DISPATCH_INPUT_REQUIRED',
     scopeError:'OPERATION_PAGE_DISPATCH_SCOPE_REQUIRED',
    })
    if(scope.dispatchOperation){
     const result=await scope.dispatchOperation({workspace,input:command,signal})
     const digest=await hashCanonicalSnapshotText(canonicalSnapshotValue(result))
     assertCurrent()
     issued.add(digest)
     return withCurrent(result)
    }else if(scope.operationModule){
     return withCurrent(await scope.operationModule.dispatchOperation(command))
    }else throw Error('OPERATION_PAGE_AGENT_DISPATCH_UNAVAILABLE')
   }
   if(name==='content.operation.prepareRework'){
    if(typeof input['reason']!=='string'||!input['reason'].trim())throw Error('OPERATION_PAGE_REWORK_REQUIRED')
    const prepared=await prepareOperationReworkParameter(parameterScope,input['dispatch'],input['reason'])
    prepared.assertCurrent()
    return prepared
   }
   if(name==='content.operation.readDispatch'){
    const readback=await readOperationDispatchParameter(parameterScope,input['dispatch'])
    readback.assertCurrent()
    return readback
   }
   if(name!=='content.operation.discover'||!identity(input['directoryRef']))throw Error('OPERATION_PAGE_COMMAND_REQUIRED')
   const discovery=await workspace.discover(input['directoryRef'])
   discovery.assertCurrent()
   return Object.freeze({
    count:discovery.items.length,reachable:discovery.items.filter(item=>item.state==='REACHABLE').length,
    assertCurrent:discovery.assertCurrent,
    async readGuide(selection:unknown){
     discovery.assertCurrent()
     const entry=discovery.items.find(item=>isRecord(selection)&&selection['guideRef']===item.guideRef&&
      selection['versionRef']===item.versionRef&&selection['kind']===item.kind&&selection['actionName']===item.actionName)
     if(!entry||!isRecord(selection)||selection['guideDigest']!==entry.guideDigest)
      throw Error('OPERATION_PAGE_GUIDE_ROW_REQUIRED')
     const guide=await workspace.readGuide(discovery,entry)
     guide.assertCurrent()
     return Object.freeze({...guide,origin:Object.freeze({source:'CLASSMODEL'})})
    },
   })
  },
 }
}
