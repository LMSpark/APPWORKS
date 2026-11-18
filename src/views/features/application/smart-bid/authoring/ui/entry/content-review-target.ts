/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-review-target
 * 职责：按正式发布身份为审定、知识和配置业务页准备业务宿主。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {resolveExecutionProjectId} from '@/services/application-scope'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {captureContentAuthoringSession} from '../../model/content-authoring-host'
import type {ContentAuthoringRoute} from './content-authoring-target'
import {createContentReviewScriptHost} from './content-review-script-host'
import {createContentSubmissionScriptHost} from './content-submission-script-host'
import {createBidHandoffScriptHost} from '../../../collaboration/handoff/bid-handoff-script-host'
import {createTenderFollowupScriptHost} from '../../../followup/tender-followup-script-host'
import {createBidFindingsScriptHost} from '../../../collaboration/tasks/bid-findings-script-host'

import {createKnowledgeDirectoryScriptHost} from '../../../knowledge/knowledge-directory-script-host'
import {createBidClassModelCatalogHost} from '../../../knowledge/class-model-catalog-script-host'
import {createBidResponseScriptHost} from '../../../response/ui/entry/response-script-host'
import {createResourceAllocationScriptHost} from '../../../authority/resource-allocation-script-host'
import {createConfigurationReleaseScriptHost} from '../../../configuration/configuration-release-script-host'


type PublishedEntry=Readonly<{applicationId:string;scenarioId:string;nodeId:string;pageId:string}>
type Scope=Readonly<{projectId:string;scenarioId:string;assertCurrent:()=>void}>

/** 正式导航绑定和会话固定后，才在实例池所建运行时装配审定数据来源。 */
export function preparePublishedContentReviewCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 createSources:(runtime:PageRuntime,scope:Scope)=>Parameters<typeof createContentReviewScriptHost>[2],
){
 return preparePublishedCall(route,entry,(runtime,scope)=>createContentReviewScriptHost(runtime,scope,createSources(runtime,scope)))
}

/** 页13递交的签署、封装和渠道证据在本次正式运行实例中装配。 */
export function preparePublishedContentSubmissionCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 createSources:(runtime:PageRuntime,scope:Scope)=>NonNullable<Parameters<typeof createContentSubmissionScriptHost>[2]>,
){
 return preparePublishedCall(route,entry,(runtime,scope)=>createContentSubmissionScriptHost(runtime,scope,createSources(runtime,scope)))
}

type SubmissionSources=NonNullable<Parameters<typeof createContentSubmissionScriptHost>[2]>

/** 页14必须提供截止对账的原始证据来源，供本次正式运行实例读取。 */
export function preparePublishedContentDeadlineCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 createSources:(runtime:PageRuntime,scope:Scope)=>SubmissionSources&Required<Pick<SubmissionSources,'readDeadline'>>,
){
 return preparePublishedContentSubmissionCall(route,entry,createSources)
}

/** 页15使用正式运行实例读取原问题、登记及复验。 */
export function preparePublishedBidFindingsCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 createSources:(runtime:PageRuntime,scope:Scope)=>Parameters<typeof createBidFindingsScriptHost>[2],
){
 return preparePublishedCall(route,entry,(runtime,scope)=>createBidFindingsScriptHost(runtime,scope,createSources(runtime,scope)))
}

type RootBinding<ClassModel>=Readonly<{classModel:ClassModel;rootKind:string;assertCurrent:()=>void}>

/** 页16消费正式绑定的知识目录及模型根。 */
export function preparePublishedKnowledgeDirectoryCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 bindRoot:(runtime:PageRuntime,scope:Scope)=>RootBinding<Parameters<typeof createKnowledgeDirectoryScriptHost>[1]>,
){
 return preparePublishedCall(route,entry,(runtime,scope)=>{
  const root=bindRoot(runtime,scope)
  return createKnowledgeDirectoryScriptHost(runtime,root.classModel,{...scope,rootKind:root.rootKind,
   assertCurrent:()=>{scope.assertCurrent();root.assertCurrent()}})
 })
}

/** 页17从发布实例的可信模型根读取目录及指南。 */
export function preparePublishedBidClassModelCatalogCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 bindRoot:(runtime:PageRuntime,scope:Scope)=>RootBinding<Parameters<typeof createBidClassModelCatalogHost>[1]>,
){
 return preparePublishedCall(route,entry,(runtime,scope)=>{
  const root=bindRoot(runtime,scope)
  return createBidClassModelCatalogHost(runtime,root.classModel,{rootKind:root.rootKind,
   assertCurrent:()=>{scope.assertCurrent();root.assertCurrent()}})
 })
}

type ConfigurationHost=Parameters<typeof createConfigurationReleaseScriptHost>

/** 页19配置作用域和影响证据由当前运行实例的正式绑定提供。 */
export function preparePublishedConfigurationReleaseCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 bindScope:(runtime:PageRuntime,scope:Scope)=>Readonly<{
  scopeId:string;assertCurrent:()=>void;readDisableImpact?:NonNullable<ConfigurationHost[2]>
  readCandidate?:NonNullable<ConfigurationHost[3]>
 }>,
){
 const prepared=preparePublishedCall(route,entry,(runtime,scope)=>{
  const binding=bindScope(runtime,scope)
  const assertCurrent=()=>{scope.assertCurrent();binding.assertCurrent()}
  assertCurrent()
  if(!identity(binding.scopeId))throw Error('CONFIGURATION_RELEASE_PAGE_SCOPE')
  return createConfigurationReleaseScriptHost(runtime,{scenarioId:scope.scenarioId,scopeId:binding.scopeId,assertCurrent},
   binding.readDisableImpact,binding.readCandidate)
 })
 if(prepared&&Object.hasOwn(route.query,'scopeId'))throw Error('CONFIGURATION_RELEASE_PAGE_SCOPE')
 return prepared
}

/** 页07由本次正式实例绑定企业及原占用快照读取方。 */
export function preparePublishedResourceAllocationCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 bindEnterprise:(runtime:PageRuntime,scope:Scope)=>Readonly<{
  enterpriseId:string;assertCurrent:()=>void;readSnapshot:Parameters<typeof createResourceAllocationScriptHost>[2]
  readRelease?:NonNullable<Parameters<typeof createResourceAllocationScriptHost>[3]>
 }>,
){
 const prepared=preparePublishedCall(route,entry,(runtime,scope)=>{
  const binding=bindEnterprise(runtime,scope)
  const assertCurrent=()=>{scope.assertCurrent();binding.assertCurrent()}
  assertCurrent()
  return createResourceAllocationScriptHost(runtime,{enterpriseId:binding.enterpriseId,projectId:scope.projectId,assertCurrent},
   binding.readSnapshot,binding.readRelease)
 })
 if(prepared&&Object.hasOwn(route.query,'enterpriseId'))throw Error('BID_RESOURCE_ALLOCATION_PAGE_SCOPE')
 return prepared
}

type ResponseHost=Parameters<typeof createBidResponseScriptHost>

/** 页10绑定已发布项目及本轮响应范围，原证据由同一实例读取。 */
export function preparePublishedBidResponseCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 bindResponse:(runtime:PageRuntime,scope:Scope)=>Readonly<{
  context:Omit<ResponseHost[1],'scenarioId'>;sources:ResponseHost[2]
 }>,
){
 const prepared=preparePublishedCall(route,entry,(runtime,scope)=>{
  const {context,sources}=bindResponse(runtime,scope)
  const assertCurrent=()=>{scope.assertCurrent();context.assertCurrent()}
  assertCurrent()
  const {appointmentBasis,commitmentBasis,assignmentBasis,fixedFacts}=sources
  if([appointmentBasis,commitmentBasis,assignmentBasis,fixedFacts].some(source=>source&&source.projectId!==scope.projectId))
   throw Error('BID_RESPONSE_PUBLICATION_SCOPE')
  return createBidResponseScriptHost(runtime,{...context,scenarioId:scope.scenarioId,assertCurrent},sources)
 })
 if(prepared&&['scopeRef','purposeRef','asOf','rateOnly'].some(key=>Object.hasOwn(route.query,key)))
  throw Error('BID_RESPONSE_PUBLICATION_SCOPE')
 return prepared
}

type PublishedScopeBinding<Options>=Readonly<{projectId:string;options:Options;assertCurrent:()=>void}>

/** 页08原移交与签收按本轮正式绑定的标段和阶段读取。 */
export function preparePublishedBidHandoffCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 bindHandoff:(runtime:PageRuntime,scope:Scope)=>PublishedScopeBinding<Parameters<typeof createBidHandoffScriptHost>[2]>,
){
 return preparePublishedTenderScopeCall(route,entry,bindHandoff,createBidHandoffScriptHost)
}

/** 页09沿同一项目、轮次和主体查询正式通知。 */
export function preparePublishedTenderFollowupCall(route:ContentAuthoringRoute,entry:PublishedEntry,
 bindFollowup:(runtime:PageRuntime,scope:Scope)=>PublishedScopeBinding<Parameters<typeof createTenderFollowupScriptHost>[2]>,
){
 return preparePublishedTenderScopeCall(route,entry,bindFollowup,createTenderFollowupScriptHost)
}

function preparePublishedTenderScopeCall<Options,Host>(
 route:ContentAuthoringRoute,entry:PublishedEntry,
 bind:(runtime:PageRuntime,scope:Scope)=>PublishedScopeBinding<Options>,
 createHost:(runtime:PageRuntime,scope:Scope,options:Options)=>Host,
){
 const prepared=preparePublishedCall(route,entry,(runtime,scope)=>{
  const binding=bind(runtime,scope)
  const assertCurrent=()=>{scope.assertCurrent();binding.assertCurrent()}
  assertCurrent()
  if(binding.projectId!==scope.projectId)throw Error('BID_TENDER_PUBLICATION_SCOPE')
  return createHost(runtime,{...scope,assertCurrent},binding.options)
 })
 if(prepared&&['lotId','roundId','stageId','subjectId'].some(key=>Object.hasOwn(route.query,key)))
  throw Error('BID_TENDER_PUBLICATION_SCOPE')
 return prepared
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
  ['actorUserId','currentUserId','userId','scenarioInputs','additionalScenarioIds','rootKind'].some(key=>Object.hasOwn(route.query,key))||
  Object.entries({applicationId,pageId}).some(([key,value])=>Object.hasOwn(route.query,key)&&route.query[key]!==value))
  throw Error('CONTENT_REVIEW_PUBLICATION_IDENTITY_CONFLICT')
 const session=captureContentAuthoringSession({applicationId,scenarioId,projectId})
 const scope=Object.freeze({projectId,scenarioId,assertCurrent:session.assertCurrent})
 return Object.freeze({scenarioInputs:session.scenarioInputs,assertCurrent:session.assertCurrent,
  createHost(runtime:PageRuntime){
   session.assertCurrent()
   if(runtime.pageId!==pageId||!runtime.call.scenarioIds.includes(scenarioId))
    throw Error('CONTENT_REVIEW_PUBLICATION_RUNTIME_CONFLICT')
   return createHost(runtime,scope)
  },
 })
}
