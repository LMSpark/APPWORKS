/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-guide-reader
 * 职责：页18第01项沿正式目录视图发现当前根可达的指南。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {discoverOperationGuides} from '@/services/smart-bid/operation/guides/operation-guide-discovery'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

type Discovery = Parameters<typeof discoverOperationGuides>
const scopeFields=['projectId','directoryRef'] as const
const evidenceFields=[...scopeFields,'state','source','publicationRef','guideRef','versionRef','guideDigest',
 'kind','actionName','pathRefs','materialRefs']

function isDirectoryView(view:DataView){
 return view.dataTable?.modelBinding?.modelName==='KnowledgeGuide'&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&hasContentScopeCondition(view,'state','EFFECTIVE')&&
  scopeFields.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

/** 公共条目由正式查询投影当前企业有效发布的证据；这里仅交候选引用。 */
export async function discoverRegisteredOperationGuides(host:ContentRevisionReadHost,runtime:Discovery[0],
 selection:Readonly<{directoryRef:string;rootKind:string}>){
 const {scenarioId,projectId}=host,{directoryRef,rootKind}=selection
 host.assertCurrent()
 if(![scenarioId,projectId,directoryRef,rootKind].every(identity))throw Error('OPERATION_GUIDE_DIRECTORY_SCOPE')
 const key=buildDataViewKey('KnowledgeGuide','effectiveDirectory',scenarioId),view=host.runtime.resolveView(key)
 if(!view||!isDirectoryView(view)||view.hasEditingChanges())throw Error('OPERATION_GUIDE_DIRECTORY_VIEW_REQUIRED')
 const context={projectId,directoryRef}
 view.queryContext={...view.queryContext,...context}
 await view.refresh()
 const assertScope=()=>{
  host.assertCurrent()
  if(host.runtime.resolveView(key)!==view||!isDirectoryView(view)||view.loadingError||view.hasEditingChanges()||
   scopeFields.some(field=>view.queryContext[field]!==context[field]))throw Error('OPERATION_GUIDE_DIRECTORY_STALE')
 }
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true)
  throw Error('OPERATION_GUIDE_DIRECTORY_INCOMPLETE')
 const assertResult=view.captureReadResult()
 const entries=view.rows.map(row=>{
  const assertCurrent=view.captureReadRow(row,evidenceFields)
  const {state,source,publicationRef,guideRef,versionRef,guideDigest,kind,actionName,pathRefs,materialRefs}=row
  if(row['projectId']!==projectId||row['directoryRef']!==directoryRef||state!=='EFFECTIVE'||
   (source!=='ENTERPRISE'&&(source!=='PUBLIC'||!identity(publicationRef)))||
   !identity(guideRef)||!identity(versionRef)||!identity(guideDigest)||!identity(kind)||!identity(actionName)||
   !Array.isArray(pathRefs)||!pathRefs.every(identity)||!Array.isArray(materialRefs)||!materialRefs.every(identity))
   throw Error('OPERATION_GUIDE_DIRECTORY_SCOPE')
  return {guideRef,versionRef,guideDigest,kind,actionName,pathRefs,materialRefs,assertCurrent}
 })
 return discoverOperationGuides(runtime,{rootKind,entries,assertCurrent:()=>{assertScope();assertResult()}})
}
