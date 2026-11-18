/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-review-target
 * 职责：按正式发布身份为页12、13准备业务宿主。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {resolveExecutionProjectId} from '@/services/application-scope'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {captureContentAuthoringSession} from '../../model/content-authoring-host'
import type {ContentAuthoringRoute} from './content-authoring-target'
import {createContentReviewScriptHost} from './content-review-script-host'
import {createContentSubmissionScriptHost} from './content-submission-script-host'

type PublishedEntry=Readonly<{applicationId:string;scenarioId:string;nodeId:string;pageId:string}>
type Scope=Readonly<{projectId:string;scenarioId:string;assertCurrent:()=>void}>

/** 正式导航绑定和会话固定后，才在实例池所建运行时装配审定数据来源。 */
export function preparePublishedContentReviewCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 createSources:(runtime:PageRuntime,scope:Scope)=>Parameters<typeof createContentReviewScriptHost>[2],
){
 return preparePublishedCall(route,entry,(runtime,scope)=>createContentReviewScriptHost(runtime,scope,createSources(runtime,scope)))
}

/** 递交的原签署、封装和渠道证据在本次正式运行实例中装配。 */
export function preparePublishedContentSubmissionCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 createSources:(runtime:PageRuntime,scope:Scope)=>NonNullable<Parameters<typeof createContentSubmissionScriptHost>[2]>,
){
 return preparePublishedCall(route,entry,(runtime,scope)=>createContentSubmissionScriptHost(runtime,scope,createSources(runtime,scope)))
}

function preparePublishedCall<Host>(route:ContentAuthoringRoute,entry:PublishedEntry,createHost:(runtime:PageRuntime,scope:Scope)=>Host){
 const {applicationId,scenarioId,nodeId,pageId}=entry
 if(![applicationId,scenarioId,nodeId,pageId].every(identity))throw Error('CONTENT_REVIEW_PUBLICATION_IDENTITY_REQUIRED')
 if(resolveExecutionProjectId(route.path)!==applicationId||route.meta['nodeId']!==nodeId)return undefined
 const {tool,type,blueprintScenarioId,programmaticTool}=route.meta
 const {projectId}=route.query
 if(type!=='config-page'||programmaticTool===true||!isRecord(tool)||tool['projectId']!==applicationId||
  tool['pageId']!==pageId||route.meta['pageId']!==pageId||blueprintScenarioId!==scenarioId||
  route.query['scenarioId']!==scenarioId||!identity(projectId)||
  ['actorUserId','currentUserId','userId','scenarioInputs','additionalScenarioIds'].some(key=>Object.hasOwn(route.query,key))||
  Object.entries({applicationId,pageId}).some(([key,value])=>Object.hasOwn(route.query,key)&&route.query[key]!==value))
  throw Error('CONTENT_REVIEW_PUBLICATION_IDENTITY_CONFLICT')
 const session=captureContentAuthoringSession({applicationId,scenarioId,projectId})
 const scope=Object.freeze({projectId,scenarioId,assertCurrent:session.assertCurrent})
 return Object.freeze({scenarioInputs:session.scenarioInputs,assertCurrent:session.assertCurrent,
  createHost(runtime:PageRuntime){
   session.assertCurrent()
   return createHost(runtime,scope)
  },
 })
}
