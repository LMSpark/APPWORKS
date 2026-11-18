/**
 * @module app:views/features/application/smart-bid/authoring/entry/content-operation-script-host
 * 职责：把本次页18工作区的目录查询与同版指南交给四文件脚本。
 */
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {openContentOperationWorkspace} from './content-operation-workspace'

type Open=Parameters<typeof openContentOperationWorkspace>

export function createContentOperationScriptHost<Runtime extends Open[0]>(runtime:Runtime,classModel:Open[1],scope:Omit<Open[2],'signal'>){
 return {runtime,assertCurrent:scope.assertCurrent,
  async invoke(name:string,input:unknown,signal:AbortSignal){
   if(!isRecord(input))throw Error('OPERATION_PAGE_COMMAND_REQUIRED')
   const workspace=openContentOperationWorkspace(runtime,classModel,{...scope,signal})
   if(name==='content.operation.readDispatch'){
    const {runId,attemptRef,requestKey,targetDigest,configurationLockHash}=input
    if(!identity(runId)||!identity(attemptRef)||!identity(requestKey)||!identity(targetDigest)||!identity(configurationLockHash)||
     ![targetDigest,configurationLockHash].every(value=>/^[a-f0-9]{64}$/u.test(value)))throw Error('OPERATION_PAGE_ATTEMPT_REQUIRED')
    const readback=await workspace.readDispatch({projectId:scope.projectId,runId,attemptRef,requestKey,targetDigest,configurationLockHash})
    readback.assertCurrent()
    return readback.state==='DISPATCH_RECORDED'
     ?Object.freeze({state:readback.state,dispatchRef:readback.dispatchRef,actualInputDigest:readback.actualInputDigest,assertCurrent:readback.assertCurrent})
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
