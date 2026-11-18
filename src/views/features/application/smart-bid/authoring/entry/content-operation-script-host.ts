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
   if(name!=='content.operation.discover'||!isRecord(input)||!identity(input['directoryRef']))
    throw Error('OPERATION_PAGE_COMMAND_REQUIRED')
   const workspace=openContentOperationWorkspace(runtime,classModel,{...scope,signal})
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
