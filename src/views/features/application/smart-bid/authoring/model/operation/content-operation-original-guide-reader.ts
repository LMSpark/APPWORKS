/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-original-guide-reader
 * 职责：按原冻结的精确版本核读页18返回核验所用的动作指南。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {readOperationActionGuide} from '@/services/smart-bid/operation/guides/operation-action-guide'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'
import type {readRegisteredFrozenOperationContext} from './content-operation-frozen-reader'

type Frozen=NonNullable<Awaited<ReturnType<typeof readRegisteredFrozenOperationContext>>>
type Original=Pick<Frozen,'scope'|'guideRef'|'guideVersionRef'|'guideDigest'>
const keys=['projectId','guideRef','versionRef'] as const
const fields=[...keys,'guideDigest','kind','actionName','source','publicationRef']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='KnowledgeGuide'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
 keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))

/** 公共指南的历史版本须由原版本查询返回向本项目可读的发布引用。 */
export async function readRegisteredOriginalOperationGuide(host:ContentRevisionReadHost,
 runtime:Parameters<typeof readOperationActionGuide>[0],input:Readonly<{rootKind:string;original:Original}>){
 const {rootKind,original}=input
 const {scenarioId,projectId}=host,{guideRef,guideDigest,guideVersionRef:versionRef}=original
 host.assertCurrent()
 if(original.scope.projectId!==projectId||![scenarioId,projectId,guideRef,versionRef,rootKind].every(identity)||
  !/^[a-f0-9]{64}$/u.test(guideDigest))throw Error('OPERATION_ORIGINAL_GUIDE_SCOPE')
 const key=buildDataViewKey('KnowledgeGuide','originalVersion',scenarioId),view=host.runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('OPERATION_ORIGINAL_GUIDE_VIEW_REQUIRED')
 const context={projectId,guideRef,versionRef}
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(host.runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   keys.some(field=>view.queryContext[field]!==context[field]))throw Error('OPERATION_ORIGINAL_GUIDE_STALE')
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
  throw Error('OPERATION_ORIGINAL_GUIDE_INCOMPLETE')
 const assertResult=view.captureReadResult(),row=view.rows[0]
 if(!row)return undefined
 const assertRow=view.captureReadRow(row,fields)
 const assertCurrent=()=>{assertScope();assertResult();assertRow()}
 const {kind,actionName,source,publicationRef}=row
 if(keys.some(field=>row[field]!==context[field])||row['guideDigest']!==guideDigest||!identity(kind)||!identity(actionName)||
  (source!=='ENTERPRISE'&&(source!=='PUBLIC'||!identity(publicationRef))))throw Error('OPERATION_ORIGINAL_GUIDE_SCOPE')
 const guide=await readOperationActionGuide(runtime,{rootKind,kind,actionName,guideRef,guideDigest,assertCurrent})
 return Object.freeze({...guide,guideVersionRef:versionRef})
}
