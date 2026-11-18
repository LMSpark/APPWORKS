/**
 * @module app:views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views
 * 职责：供正式共享场景装配原递交、回执、截止与阶段结果命名视图。
 * 边界：只提供视图配置，模型身份、字段与授权由正式场景确定。
 * AI用途：查找各正式办理视图的固定查询参数与字段投影。
 */
import type {DataViewFilterTree,ViewMetadata} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'

const scope=['projectId','lotId','subjectId','channelId']
const roundScope=['projectId','lotId','roundId','stageId']
const outcomeFields=['subjectId','kind','eventRef','issuerRef','documentVersionId','eventAt','knownAt','supersedesRef']
/** 固定查询字段，以及与字段名不同时使用的参数名。 */
type Key=string|readonly [field:string,parameter:string]

function view(primaryKey:string,keys:readonly Key[],options:Readonly<{
 fields:readonly string[];allPages?:boolean;extra?:DataViewFilterTree
}>):ViewMetadata{
 const {fields,allPages,extra}=options
 if(!identity(primaryKey))throw Error('SUBMISSION_SCENARIO_PRIMARY_KEY_REQUIRED')
 const filters:DataViewFilterTree[]=keys.map(key=>{
  const [field,ParamName]=typeof key==='string'?[key,key]:key
  return {field,operator:'eq',value:{Type:'GetInputParam',ParamName}}
 })
 if(extra)filters.push(extra)
 return {autoLoad:false,autoCurrentFirst:false,autoSelectFirst:false,commitMode:'staged',
  scopeFilter:{logic:'and',filters},queryConfig:{autoQuery:false,cacheType:'none',
   fields:[...new Set([primaryKey,...keys.map(key=>typeof key==='string'?key:key[0]),...fields])],
   ...(allPages?{allPages:true}:{pagination:'none'})}}
}

/** 页13按原装封请求读取冻结结果及同次纸包或电子包登记。 */
export function contentDeliveryPackageScenarioViews(primaryKeys:Readonly<Record<'DeliveryManifest'|'SubmissionPackage',string>>){
 const {DeliveryManifest,SubmissionPackage}=primaryKeys
 const packageKeys:readonly Key[]=['projectId',['id','packageId'],'packingRequestRef']
 return {
  DeliveryManifest:{
   originalFreeze:view(DeliveryManifest,['projectId','requestKey','requestDigest'],{
    fields:['groupScope','status','terminalRef','frozenResult'],
   }),
  },
  SubmissionPackage:{
   originalPackedZip:view(SubmissionPackage,packageKeys,{
    fields:['format','packageHash','resourceVersionId','selectionId','selectionVersion','selectionHash','requiredPositions','packed'],
   }),
   originalPackedPaper:view(SubmissionPackage,packageKeys,{
    fields:['format','sealRef','packageHash','selectionHash','packingRef','packed'],
   }),
  },
 }
}

/** 仅生成视图定义，已登记模型、主键及服务授权仍由正式场景提供。 */
export function contentSubmissionScenarioViews(primaryKeys:Readonly<Record<
 'SubmissionAttempt'|'ChannelReceipt'|'SubmissionReconciliation'|'TenderOutcome',string
>>){
 const {SubmissionAttempt,ChannelReceipt,SubmissionReconciliation,TenderOutcome}=primaryKeys
 return {
  SubmissionAttempt:{
   originalRequest:view(SubmissionAttempt,['projectId',['id','attemptRef'],'requestKey'],{fields:['requestDigest','requestPayload']}),
   originalEvents:view(SubmissionAttempt,[...scope,['id','attemptRef'],'requestDigest'],{fields:['events','combinedWithdrawalTarget']}),
   receiptCandidates:view(SubmissionAttempt,scope,{fields:['id','operationRef','actualObjectRef','withdrawalTargetRef'],allPages:true}),
  },
  ChannelReceipt:{
   originalPairing:view(ChannelReceipt,['projectId',['id','receiptRef']],
    {fields:['lotId','subjectId','channelId','eventRef','eventKind','eventAt','operationRef','objectRef','sources']}),
  },
  SubmissionReconciliation:{
   originalDeadline:view(SubmissionReconciliation,['projectId',['id','deadlineRef']],
    {fields:['lotId','roundId','stageId','subjectId','channelId','cutoffAt','knownAt','obligationIds']}),
  },
  TenderOutcome:{
   officialSubjectEvents:view(TenderOutcome,[...roundScope,'subjectId'],{fields:outcomeFields,allPages:true}),
   officialRoundEvents:view(TenderOutcome,roundScope,{fields:outcomeFields,allPages:true,
    extra:{field:'kind',operator:'eq',value:'ROUND_TERMINATED'}}),
  },
 }
}
