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

/** 工艺页面连接命令的输入形状。 */
type Open=Parameters<typeof openContentOperationWorkspace>
/** 按原身份解析已冻结工艺指南的能力。 */
type ResolveGuide=Parameters<ReturnType<typeof openContentOperationWorkspace>['recoverOriginal']>[1]

function exposeActualInput(readJson:()=>string,digest:string,assertCurrent:()=>void){
 return async ()=>{
  assertCurrent()
  const inputJson=readJson()
  if(await hashCanonicalSnapshotText(inputJson)!==digest)throw Error('OPERATION_ROUTE_DISPATCH_DIGEST')
  assertCurrent()
  return inputJson
 }
}

export function createContentOperationScriptHost<Runtime extends Open[0]>(runtime:Runtime,classModel:Open[1],
 scope:Omit<Open[2],'signal'>&Readonly<{resolveOriginalGuide?:ResolveGuide}>){
 return {runtime,assertCurrent:scope.assertCurrent,
  async invoke(name:string,input:unknown,signal:AbortSignal){
   if(!isRecord(input))throw Error('OPERATION_PAGE_COMMAND_REQUIRED')
   const workspace=openContentOperationWorkspace(runtime,classModel,{...scope,signal})
   if(name==='content.operation.prepareRework'){
    const {runId,attemptRef,requestKey,reason}=input
    if(!identity(runId)||!identity(attemptRef)||!identity(requestKey)||typeof reason!=='string'||!reason.trim())
     throw Error('OPERATION_PAGE_REWORK_REQUIRED')
    const prepared=await workspace.prepareRework({runId,attemptRef,requestKey,reason:reason.trim()})
    prepared.assertCurrent()
    return Object.freeze({handoffs:prepared.handoffs,originalOperations:prepared.originalOperations,
     reusable:prepared.reusable,assertCurrent:prepared.assertCurrent})
   }
   if(name==='content.operation.readDispatch'){
    const {runId,attemptRef,requestKey,targetDigest,configurationLockHash}=input
    if(!identity(runId)||!identity(attemptRef)||!identity(requestKey)||!identity(targetDigest)||!identity(configurationLockHash)||
     ![targetDigest,configurationLockHash].every(value=>/^[a-f0-9]{64}$/u.test(value)))throw Error('OPERATION_PAGE_ATTEMPT_REQUIRED')
    const attempt={projectId:scope.projectId,runId,attemptRef,requestKey,targetDigest,configurationLockHash}
    const verified=scope.resolveOriginalGuide?await workspace.recoverOriginal(attempt,scope.resolveOriginalGuide):undefined
    if(verified){
     verified.assertCurrent()
     const dispatch='dispatch' in verified?verified.dispatch:undefined
     const result='result' in verified?verified.result:undefined
     const assertCurrent=verified.assertCurrent
     const inputJson=dispatch&&'inputJson' in dispatch?dispatch.inputJson:null
     return Object.freeze({
      state:dispatch&&'dispatchRef' in dispatch?'DISPATCH_RECORDED':'UNKNOWN',
      ...(dispatch&&'dispatchRef' in dispatch?{dispatchRef:dispatch.dispatchRef,actualInputDigest:dispatch.actualInputDigest}:{}),
      ...(dispatch&&'dispatchRef' in dispatch&&inputJson!==null?
       {readActualInput:exposeActualInput(()=>inputJson,dispatch.actualInputDigest,assertCurrent)}:{}),
      verification:Object.freeze({state:verified.state,
       receiptRef:result&&'receiptRef' in result?result.receiptRef:undefined,assertCurrent}),
      assertCurrent,
     })
    }
    const readback=await workspace.readDispatch(attempt)
    readback.assertCurrent()
    return readback.state==='DISPATCH_RECORDED'
     ?Object.freeze({state:readback.state,dispatchRef:readback.dispatchRef,actualInputDigest:readback.actualInputDigest,
      ...(readback.input===undefined?{}:{readActualInput:exposeActualInput(()=>canonicalSnapshotValue(readback.input),
       readback.actualInputDigest,readback.assertCurrent)}),assertCurrent:readback.assertCurrent})
     :Object.freeze({state:readback.state,assertCurrent:readback.assertCurrent})
   }
   if(name!=='content.operation.discover'||!identity(input['directoryRef']))throw Error('OPERATION_PAGE_COMMAND_REQUIRED')
   const discovery=await workspace.discover(input['directoryRef'])
   discovery.assertCurrent()
   const dataViewKey=buildDataViewKey('KnowledgeGuide','effectiveDirectory',scope.scenarioId)
   return Object.freeze({dataViewKey,
    count:discovery.items.length,reachable:discovery.items.filter(item=>item.state==='REACHABLE').length,
    assertCurrent:discovery.assertCurrent,
    async readGuide(rowKey:string){
     discovery.assertCurrent()
     const view=runtime.resolveView(dataViewKey)
     const row=view?.rows.find(item=>view.getPkKey(item)===rowKey)
     const entry=discovery.items.find(item=>row?.['guideRef']===item.guideRef&&row['versionRef']===item.versionRef&&
      row['kind']===item.kind&&row['actionName']===item.actionName)
     if(!entry)throw Error('OPERATION_PAGE_GUIDE_ROW_REQUIRED')
     return workspace.readGuide(discovery,entry)
    },
   })
  },
 }
}
