/**
 * @module app:views/features/application/smart-bid/authoring/model/review/production/production-scenario-views
 * 职责：为正式共享场景提供 ProducedFile 原登记及实件核验视图。
 */
import type {ViewMetadata} from '@spark-appworks/spark-data'

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
   ['id','projectId','paperRef','revisionId','copies']),
  originalExportRegistration:view([['projectId','projectId'],['requestKey','requestKey'],['outputRef','outputRef']],
   [...originalFileFields,'requestKey','outputRef','inputDigest']),
  originalSignedRegistration:view([['projectId','projectId'],['signatureOperationRef','signatureOperationRef'],['signedObjectRef','signedObjectRef']],
   ['id','projectId','documentId','revisionId','fileHash','resourceVersionId','signatureOperationRef','signedObjectRef',
    'signatureRecordId','originalFileId','originalHash','signing']),
  selectedReviewFile:view([['projectId','projectId'],['id','producedFileId'],['productionRequestRef','productionRequestRef']],
   originalFileFields),
  selectedReviewFiles:view([['projectId','projectId']],[...originalFileFields,'usage'],true),
 }
}
