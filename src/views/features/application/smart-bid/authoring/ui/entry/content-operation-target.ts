/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-operation-target
 * 职责：仅从正式发布导航和可信业务根准备页18工具实例。
 * 边界：只消费发布导航和当前会话，工作区装配交给本次 PageRuntime。
 * AI用途：排查入口是否缺少授权节点、工具或场景身份。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {resolveExecutionProjectId} from '@/services/application-scope'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {captureContentAuthoringSession} from '../../model/content-authoring-host'
import type {ContentAuthoringRoute} from './content-authoring-target'
import {createContentOperationScriptHost} from './content-operation-script-host'
import {bindPublishedPageRuntime,matchesPublishedPageBinding,type PublishedPageEntry} from './publication/published-page-binding'

/** 工艺脚本宿主装配使用的参数合同。 */
type ScriptHost=Parameters<typeof createContentOperationScriptHost>

/** 只认蓝图回读确认的节点、工具和空间；查询仅接受明确业务项目及浏览参数。 */
export function resolvePublishedContentOperationTarget(route:ContentAuthoringRoute,entry:PublishedPageEntry){
 if(!matchesPublishedPageBinding(route,entry,{
  identityError:'OPERATION_PAGE_PUBLICATION_REQUIRED',
  conflictError:'OPERATION_PAGE_PUBLICATION_CONFLICT',
  forbiddenQuery:['additionalScenarioIds','actorUserId','currentUserId','userId','scenarioInputs','rootKind'],
 }))return undefined
 const requestedProjectId=route.query['projectId']
 if(requestedProjectId!==undefined&&!identity(requestedProjectId))
  throw Error('OPERATION_PAGE_PUBLICATION_CONFLICT')
 const projectId=typeof requestedProjectId==='string'?requestedProjectId:resolveExecutionProjectId(route.path)
 if(!identity(projectId))throw Error('OPERATION_PAGE_PUBLICATION_CONFLICT')
 const {applicationId,pageId,scenarioId}=entry
 return Object.freeze({applicationId,pageId,scenarioId,projectId})
}

export function preparePublishedContentOperationCall(route:ContentAuthoringRoute,entry:PublishedPageEntry,
 bindRoot:(runtime:PageRuntime,target:NonNullable<ReturnType<typeof resolvePublishedContentOperationTarget>>)=>Readonly<{
  classModel:ScriptHost[1];rootKind:string;assertCurrent:()=>void
 dispatchOperation?:NonNullable<ScriptHost[2]['dispatchOperation']>
 operationModule?:NonNullable<ScriptHost[2]['operationModule']>
 }>){
 const target=resolvePublishedContentOperationTarget(route,entry)
 if(!target)return undefined
 if(route.query['scenarioId']!==target.scenarioId)throw Error('OPERATION_PAGE_PUBLICATION_SCENARIO_REQUIRED')
 const session=captureContentAuthoringSession(target)
 return bindPublishedPageRuntime({
  entry,session,exactScenarioSet:true,runtimeConflictError:'OPERATION_PAGE_PUBLICATION_RUNTIME_CONFLICT',
  validateRuntime(runtime){
   const inputs=runtime.call.scenarioInputs?.[target.scenarioId]
   if(inputs?.['projectId']!==target.projectId||inputs['currentUserId']!==session.actorUserId)
    throw Error('OPERATION_PAGE_PUBLICATION_RUNTIME_CONFLICT')
  },
  createHost(runtime:PageRuntime){
   const binding=bindRoot(runtime,target)
   if(!identity(binding.rootKind))throw Error('OPERATION_PAGE_ROOT_REQUIRED')
   const {classModel,rootKind,dispatchOperation,operationModule}=binding
   return createContentOperationScriptHost(runtime,classModel,{scenarioId:target.scenarioId,projectId:target.projectId,rootKind,
    registrationId:'SmartBidOperationModule',runtimeInstanceId:runtime.call.instanceId,
    ...(dispatchOperation?{dispatchOperation}:{}),
    ...(operationModule?{operationModule}:{}),
    assertCurrent:()=>{session.assertCurrent();binding.assertCurrent()}})
  },
 })
}
