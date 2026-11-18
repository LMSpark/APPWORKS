/**
 * @module app:views/features/application/smart-bid/authoring/model/review/production/production-scenario-views
 * 职责：为正式共享场景提供 ProducedFile 原登记及实件核验视图。
 */
import type {ViewMetadata} from '@spark-appworks/spark-data'
import {fileObservationView} from '../content-file-answer-reader'
import {paperObservationView} from '../content-paper-answer-reader'
import {platformObservationView,submittedPlatformObservationsView} from '../content-platform-field-review'

/** 制件登记按原请求及输出查询，实件回读按登记身份和原制作关系查询。 */
export function producedFileScenarioViews(){
 const originalFileFields=['id','projectId','productionRequestRef','revisionId','documentId','fileHash','resourceVersionId']
 const view=(keys:ReadonlyArray<readonly [string,string]>,fields:string[],batch=false):ViewMetadata=>({
  autoLoad:false,autoCurrentFirst:false,autoSelectFirst:false,commitMode:'staged',
  scopeFilter:{logic:'and',filters:keys.map(([field,ParamName])=>({
   field,operator:'eq',value:{Type:'GetInputParam',ParamName},
  }))},
  queryConfig:{autoQuery:false,cacheType:'none',fields,...(batch?{allPages:true,pagination:'paged'}:{pagination:'none'})},
 })
 return {
  selectedPaperRegistration:view([['projectId','projectId'],['paperRef','paperRef'],['revisionId','revisionId']],
   ['id','projectId','paperRef','revisionId','copies','documentId','requestKey','inputDigest','productionRequestRef','witnessRef']),
  originalExportRegistration:view([['projectId','projectId'],['requestKey','requestKey'],['outputRef','outputRef']],
   [...originalFileFields,'requestKey','outputRef','inputDigest']),
  originalSignedRegistration:view([['projectId','projectId'],['signatureOperationRef','signatureOperationRef'],['signedObjectRef','signedObjectRef']],
   ['id','projectId','documentId','revisionId','fileHash','resourceVersionId','signatureOperationRef','signedObjectRef',
    'signatureRecordId','originalFileId','originalHash','signing']),
  selectedReviewFile:view([['projectId','projectId'],['id','producedFileId'],['productionRequestRef','productionRequestRef']],
   originalFileFields),
  selectedObservedReviewFile:view([['projectId','projectId'],['id','producedFileId']],originalFileFields),
  selectedReviewFiles:view([['projectId','projectId']],[...originalFileFields,'usage'],true),
 }
}

/** 正式场景按模型挂载实件登记和原填报位置视图。 */
export function contentProductionReviewScenarioViews(){
 return {
  ProducedFile:producedFileScenarioViews(),
  AnswerLocation:{
   selectedFileObservation:fileObservationView(),
   selectedPaperObservation:paperObservationView(),
   selectedPlatformObservation:platformObservationView(),
   submittedPlatformObservations:submittedPlatformObservationsView(),
  },
 }
}
