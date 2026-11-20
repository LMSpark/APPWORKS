/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/publication/published-page-binding
 * 职责：统一已发布 SmartBid 页面入口的导航身份校验与本次 PageRuntime 绑定。
 * 边界：只处理公共发布身份和生命周期；项目、业务范围、命令及 owner 仍由调用方 policy 提供。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {resolveExecutionProjectId} from '@/services/application-scope'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {ContentAuthoringRoute} from '../content-authoring-target'

export type PublishedPageEntry=Readonly<{
 applicationId:string;nodeId:string;pageId:string;scenarioId:string
}>

type PublishedPagePolicy=Readonly<{
 identityError:string
 conflictError:string
 forbiddenQuery?:readonly string[]
 allowMissingBlueprintScenario?:boolean
 requireScenarioQuery?:boolean
}>

export type PublishedPageSession=Readonly<{
 scenarioInputs:Readonly<Record<string,Readonly<Record<string,unknown>>>>
 assertCurrent:()=>void
}>

export function matchesPublishedPageBinding(
 route:ContentAuthoringRoute,
 entry:PublishedPageEntry,
 policy:PublishedPagePolicy,
):boolean{
 if(![entry.applicationId,entry.nodeId,entry.pageId,entry.scenarioId].every(identity))
  throw Error(policy.identityError)
 if(resolveExecutionProjectId(route.path)!==entry.applicationId||route.meta['nodeId']!==entry.nodeId)
  return false
 const tool=route.meta['tool'],blueprintScenarioId=route.meta['blueprintScenarioId']
 if(route.meta['type']!=='config-page'||route.meta['programmaticTool']===true||
  !isRecord(tool)||tool['projectId']!==entry.applicationId||tool['pageId']!==entry.pageId||
  route.meta['pageId']!==entry.pageId||
  ((policy.requireScenarioQuery===true||Object.hasOwn(route.query,'scenarioId'))&&route.query['scenarioId']!==entry.scenarioId)||
  blueprintScenarioId!==entry.scenarioId&&(blueprintScenarioId!==undefined||policy.allowMissingBlueprintScenario!==true))
  throw Error(policy.conflictError)
 if(policy.forbiddenQuery?.some(key=>Object.hasOwn(route.query,key)))throw Error(policy.conflictError)
 for(const [key,value] of Object.entries(entry)){
  if(key!=='nodeId'&&Object.hasOwn(route.query,key)&&route.query[key]!==value)
   throw Error(policy.conflictError)
 }
 return true
}

export function bindPublishedPageRuntime<Host>(input:Readonly<{
 entry:PublishedPageEntry
 session:PublishedPageSession
 exactScenarioSet?:boolean
 runtimeConflictError?:string
 validateRuntime?:(runtime:PageRuntime)=>void
 createHost:(runtime:PageRuntime)=>Host
}>){
 const {entry,session,exactScenarioSet,validateRuntime,createHost}=input
 return Object.freeze({
  scenarioInputs:session.scenarioInputs,
  assertCurrent:session.assertCurrent,
  createHost(runtime:PageRuntime){
   session.assertCurrent()
   if(runtime.pageId!==entry.pageId||
    exactScenarioSet===true&&(
     runtime.call.scenarioIds.length!==1||runtime.call.scenarioIds[0]!==entry.scenarioId
    )||
    exactScenarioSet!==true&&!runtime.call.scenarioIds.includes(entry.scenarioId))
    throw Error(input.runtimeConflictError??'SMART_BID_PUBLISHED_RUNTIME_CONFLICT')
   validateRuntime?.(runtime)
   return createHost(runtime)
  },
 })
}
