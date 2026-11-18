/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-operation-target
 * 职责：仅从正式发布导航和可信业务根准备页18工具实例。
 * 边界：只消费发布导航和当前会话，工作区装配交给本次 PageRuntime。
 * AI用途：排查入口是否缺少授权节点、工具或场景身份。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {resolveExecutionProjectId} from '@/services/application-scope'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {captureContentAuthoringSession} from '../../model/content-authoring-host'
import type {ContentAuthoringRoute} from './content-authoring-target'
import {createContentOperationScriptHost} from './content-operation-script-host'

/** 正式导航发布的应用、节点、工具和场景身份。 */
type PublishedEntry=Readonly<{applicationId:string;nodeId:string;pageId:string;scenarioId:string}>
/** 工艺脚本宿主装配使用的参数合同。 */
type ScriptHost=Parameters<typeof createContentOperationScriptHost>

/** 只认蓝图回读确认的节点、工具和空间；查询仅接受明确业务项目及浏览参数。 */
export function resolvePublishedContentOperationTarget(route:ContentAuthoringRoute,entry:PublishedEntry){
 const {applicationId,nodeId,pageId,scenarioId}=entry
 if(![applicationId,nodeId,pageId,scenarioId].every(identity))throw Error('OPERATION_PAGE_PUBLICATION_REQUIRED')
 if(resolveExecutionProjectId(route.path)!==applicationId||route.meta['nodeId']!==nodeId)return undefined
 const tool=route.meta['tool'],projectId=route.query['projectId'],navigationScenario=route.meta['blueprintScenarioId']
 if(route.meta['type']!=='config-page'||route.meta['programmaticTool']===true||route.meta['pageId']!==pageId||
  !isRecord(tool)||tool['projectId']!==applicationId||tool['pageId']!==pageId||
  navigationScenario!==scenarioId||!identity(projectId)||
  ['additionalScenarioIds','actorUserId','currentUserId','userId','scenarioInputs','rootKind'].some(key=>Object.hasOwn(route.query,key)))
  throw Error('OPERATION_PAGE_PUBLICATION_CONFLICT')
 for(const [key,value] of Object.entries({applicationId,pageId,scenarioId})){
  if(Object.hasOwn(route.query,key)&&route.query[key]!==value)throw Error('OPERATION_PAGE_PUBLICATION_CONFLICT')
 }
 return Object.freeze({applicationId,pageId,scenarioId,projectId})
}

export function preparePublishedContentOperationCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 bindRoot:(runtime:PageRuntime,target:NonNullable<ReturnType<typeof resolvePublishedContentOperationTarget>>)=>Readonly<{
  classModel:ScriptHost[1];rootKind:string;assertCurrent:()=>void
  resolveOriginalGuide?:NonNullable<ScriptHost[2]['resolveOriginalGuide']>
 }>){
 const target=resolvePublishedContentOperationTarget(route,entry)
 if(!target)return undefined
 const session=captureContentAuthoringSession(target)
 return {
  scenarioInputs:session.scenarioInputs,assertCurrent:session.assertCurrent,
  createHost(runtime:PageRuntime){
   session.assertCurrent()
   const binding=bindRoot(runtime,target)
   if(!identity(binding.rootKind))throw Error('OPERATION_PAGE_ROOT_REQUIRED')
   const {classModel,rootKind,resolveOriginalGuide}=binding
   return createContentOperationScriptHost(runtime,classModel,{scenarioId:target.scenarioId,projectId:target.projectId,rootKind,
    ...(resolveOriginalGuide?{resolveOriginalGuide}:{}),assertCurrent:()=>{session.assertCurrent();binding.assertCurrent()}})
  },
 }
}
