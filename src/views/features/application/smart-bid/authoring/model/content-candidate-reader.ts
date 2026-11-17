/**
 * @module app:views/features/application/smart-bid/authoring/model/content-candidate-reader
 * 职责：在原正文运行实例串联候选修订、同版清单及完整节点成员。
 * 边界：仅返回原视图绑定与证明；不缓存载荷、不采用、不冒充完整业务闭包或三版预演。
 * AI用途：候选内容先核固定依据一致，再交后续业务检查；JSON内容与模板引用分别核对。
 */
import {canonicalRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'
import {assertRevisionTemplateBindings} from '@/services/smart-bid/content/revision-template-bindings'
import {assertRevisionResponseAnchors} from '@/services/smart-bid/content/references/revision-response-anchors'
import {assertRevisionResponseText} from '@/services/smart-bid/content/references/revision-response-text'
import {hasCompleteSingleContentResult,readContentRevisionBasis,readContentRevisions,type ContentRevisionReadHost,type ContentRevisionSelection,type ContentRevisionReadBinding} from './content-revision-reader'
import {assertContentNodeVersionPayload} from './content-node-version-reader'
import {readContentSnapshotIndex,type ContentSnapshotIndexBinding,type ContentSnapshotRole} from './content-snapshot-reader'
import {readContentSnapshotNodes,type ContentSnapshotNodesBinding} from './content-snapshot-nodes'
import {readContentBaselineFact,readContentBaselineRequirement,readContentBaselineRequirementPins,readContentBaselineTenderRecord,type ContentBaselineFactBinding,type ContentBaselineRequirementPinsBinding} from './content-baseline-reader'
import type {RevisionRequirementPin} from '@/services/smart-bid/content/references/revision-requirement-pins'
import {snapshotReferenceFields} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readTenderRecordReference} from '@/services/smart-bid/content/references/baseline-tender-records'
import {readContentTenderRecord} from './content-tender-record-reader'

/** 原候选及同版清单已证明基线身份；冻结和用途许可仍不在读取层推断。 */
export type ContentCandidateFactBinding=Omit<ContentBaselineFactBinding,'requiresRevisionMatchCheck'>&Readonly<{requiresRevisionMatchCheck:false}>
/** 候选固定基线的挂接诊断；要求原记录及准用另核。 */
export type ContentCandidateRequirementPinsBinding=Omit<ContentBaselineRequirementPinsBinding,'requiresRevisionMatchCheck'>&Readonly<{requiresRevisionMatchCheck:false}>
/** 候选章节、固定基线和原要求记录已匹配；用途另核。 */
export type ContentCandidateRequirementBinding=Omit<Awaited<ReturnType<typeof readContentBaselineRequirement>>,'requiresRevisionMatchCheck'>&Readonly<{requiresRevisionMatchCheck:false}>
type PreviewVersion=Readonly<{snapshot:ContentSnapshotIndexBinding;nodes:ContentSnapshotNodesBinding}>
type PreviewVersions=Readonly<{basis:PreviewVersion|null;head:PreviewVersion|null;candidate:PreviewVersion;assertCurrent:()=>void}>

function assertRevisionManifest(manifest:unknown,row:Readonly<Record<string,unknown>>):asserts manifest is object{
 if(typeof manifest!=='object'||manifest===null||Array.isArray(manifest))throw Error('CONTENT_CANDIDATE_MANIFEST_REQUIRED')
 const original=canonicalRevisionSnapshot(manifest)
 const withRevision=canonicalRevisionSnapshot({...manifest,projectId:row['projectId'],baselineId:row['baselineId'],
  stageRef:row['stageRef'],templateRefs:row['templateRefs']})
 if(original!==withRevision)throw Error('CONTENT_CANDIDATE_REVISION_MISMATCH')
}

/** 候选链保留各原视图证明；其它业务分组、当前依据、rootHash和采用必须继续核验。 */
export type ContentCandidateBinding=Readonly<{
 runtime:ContentRevisionReadHost['runtime']
 readFixedFact:(selection:Readonly<{factId:string;version?:number}>,assertConsumer?:()=>void)=>Promise<ContentCandidateFactBinding>
 readRequirementPinIssues:(assertConsumer?:()=>void)=>Promise<ContentCandidateRequirementPinsBinding>
 readFixedRequirement:(pin:RevisionRequirementPin,assertConsumer?:()=>void)=>Promise<ContentCandidateRequirementBinding>
 readFixedTenderRecord:(reference:unknown,assertConsumer?:()=>void)=>ReturnType<typeof readContentTenderRecord>
 readPreviewVersions:(assertConsumer?:()=>void)=>Promise<PreviewVersions>
 revisions:ContentRevisionReadBinding;snapshot:ContentSnapshotIndexBinding;nodes:ContentSnapshotNodesBinding
 revisionMatchVerified:true;templateBindingsVerified:true;requirementBindingsVerified:true;responseAnchorsVerified:true;responseTextVerified:true
 requiresResponseReferenceChecks:true;requiresResponsePayloadChecks:true;requiresTemplateResourceChecks:true;requiresRequirementVersionChecks:true;requiresBusinessSectionChecks:true;assertCurrent:()=>void
}>

/** 只装配候选；头/基准须另用正式角色视图，不能覆盖本次单个快照视图后沿用旧证明。 */
export async function readCandidateContent(host:ContentRevisionReadHost,selection:ContentRevisionSelection):Promise<ContentCandidateBinding>{
 const revisions=await readContentRevisions(host,selection)
 const candidate=host.runtime.resolveView(revisions.candidateDataViewKey)
 if(!candidate||!hasCompleteSingleContentResult(candidate))throw Error('CONTENT_CANDIDATE_NOT_UNIQUE')
 const row=candidate.rows[0]
 if(!row)throw Error('CONTENT_CANDIDATE_UNAVAILABLE')
 const assertResult=candidate.captureReadResult()
 const assertRow=candidate.captureReadRow(row,['id','projectId','status','snapshotHash','baselineId','stageRef','templateRefs'])
 const assertCandidate=()=>{host.assertCurrent();revisions.assertCurrent();assertResult();assertRow()}
 assertCandidate()
 const snapshotHash=row['snapshotHash']
 if(typeof snapshotHash!=='string')throw Error('CONTENT_CANDIDATE_SNAPSHOT_REQUIRED')
 const snapshot=await readContentSnapshotIndex(host,{snapshotHash})
 assertCandidate();snapshot.assertCurrent()
 const snapshotView=host.runtime.resolveView(snapshot.dataViewKey),manifest=snapshotView?.rows[0]?.['manifest']
 // 同一规范编码保留精确引用身份；临时比较值不是另一份可编辑或保存的业务真源。
 assertRevisionManifest(manifest,row)
 const nodes=await readContentSnapshotNodes(host,snapshot)
 const assertCurrent=()=>{assertCandidate();snapshot.assertCurrent();nodes.assertCurrent()}
 assertCurrent()
 const payloads=(nodes.dataViewKey?host.runtime.resolveView(nodes.dataViewKey)?.rows:[])?.map(member=>{
  const nodeId=member['nodeId'],payload=member['payload']
  if(typeof nodeId!=='string')throw Error('CONTENT_CANDIDATE_NODE_REQUIRED')
  assertContentNodeVersionPayload(payload,nodeId)
  return payload
 })
 if(!payloads)throw Error('CONTENT_CANDIDATE_NODE_REQUIRED')
 const templateRefs:unknown=Object.getOwnPropertyDescriptor(manifest,'templateRefs')?.value
 assertRevisionTemplateBindings(templateRefs,payloads)
 const requirementPins:unknown=Object.getOwnPropertyDescriptor(manifest,'requirementPins')?.value
 const responses:unknown=Object.getOwnPropertyDescriptor(manifest,'responses')?.value
 assertRevisionResponseAnchors(responses,requirementPins,payloads)
 assertRevisionResponseText(responses,payloads.map(payload=>payload.nodeId))
 assertCurrent()
 const readFixedFact=async(factSelection:Readonly<{factId:string;version?:number}>,assertConsumer?:()=>void):Promise<ContentCandidateFactBinding>=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const fact=await readContentBaselineFact({...host,assertCurrent:assertContext},{...factSelection,baselineId,stageRef:row['stageRef']})
  const assertFact=()=>{assertContext();fact.assertCurrent()}
  assertFact()
  return Object.freeze({...fact,requiresRevisionMatchCheck:false,assertCurrent:assertFact})
 }
 const readRequirementPinIssues=async(assertConsumer?:()=>void):Promise<ContentCandidateRequirementPinsBinding>=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const report=await readContentBaselineRequirementPins({...host,assertCurrent:assertContext},
   {baselineId,stageRef:row['stageRef'],pins:requirementPins,nodes:payloads})
  const assertReport=()=>{assertContext();report.assertCurrent()}
  assertReport()
  return Object.freeze({...report,requiresRevisionMatchCheck:false,assertCurrent:assertReport})
 }
 const readFixedRequirement=async(pin:RevisionRequirementPin,assertConsumer?:()=>void):Promise<ContentCandidateRequirementBinding>=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const {chapterId,lineageId,version}=pin
  const matched=Array.isArray(requirementPins)&&requirementPins.some((item:unknown)=>{
   const originalPin=snapshotReferenceFields(item,['chapterId','lineageId','version'],'CONTENT_CANDIDATE_REQUIREMENT_PIN')
   return originalPin['chapterId']===chapterId&&originalPin['lineageId']===lineageId&&originalPin['version']===version
  })
  if(!matched)throw Error('CONTENT_CANDIDATE_REQUIREMENT_PIN')
  const result=await readContentBaselineRequirement({...host,assertCurrent:assertContext},{baselineId,stageRef:row['stageRef'],lineageId,version})
  result.assertCurrent()
  return Object.freeze({...result,requiresRevisionMatchCheck:false})
 }
 const readFixedTenderRecord=async(reference:unknown,assertConsumer?:()=>void)=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const fixedReference=readTenderRecordReference(reference)
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const baseline=await readContentBaselineTenderRecord({...host,assertCurrent:assertContext},{baselineId,stageRef:row['stageRef']},fixedReference)
  return readContentTenderRecord({...host,assertCurrent:baseline.assertCurrent},fixedReference)
 }
 const readPreviewVersions=async(assertConsumer?:()=>void):Promise<PreviewVersions>=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  const basisRevision=await readContentRevisionBasis({...host,assertCurrent:assertContext},revisions)
  const assertRevisions=()=>{assertContext();basisRevision.assertCurrent()}
  const readVersion=async(revisionKey:string|null,role:ContentSnapshotRole):Promise<PreviewVersion|null>=>{
   assertRevisions()
   if(revisionKey===null)return null
   const view=host.runtime.resolveView(revisionKey),revisionRow=view?.rows[0],hash=revisionRow?.['snapshotHash']
   if(!view||!revisionRow||typeof hash!=='string')throw Error('CONTENT_CANDIDATE_SNAPSHOT_REQUIRED')
   const assertRevisionRow=view.captureReadRow(revisionRow,['projectId','snapshotHash','baselineId','stageRef','templateRefs'])
   const versionHost={...host,assertCurrent:()=>{assertRevisions();assertRevisionRow()}}
   const index=await readContentSnapshotIndex(versionHost,{snapshotHash:hash},role)
   assertRevisionManifest(host.runtime.resolveView(index.dataViewKey)?.rows[0]?.['manifest'],revisionRow)
   const members=await readContentSnapshotNodes(versionHost,index)
   return Object.freeze({snapshot:index,nodes:members})
  }
  const [basis,head]=await Promise.all([readVersion(basisRevision.dataViewKey,'basis'),readVersion(revisions.headDataViewKey,'head')])
  const assertPreview=()=>{assertRevisions();basis?.nodes.assertCurrent();head?.nodes.assertCurrent()}
  assertPreview()
  return Object.freeze({basis,head,candidate:Object.freeze({snapshot,nodes}),assertCurrent:assertPreview})
 }
 return Object.freeze({runtime:host.runtime,readFixedFact,readFixedRequirement,readRequirementPinIssues,readFixedTenderRecord,readPreviewVersions,revisions,snapshot,nodes,revisionMatchVerified:true,templateBindingsVerified:true,requirementBindingsVerified:true,
  responseAnchorsVerified:true,responseTextVerified:true,requiresResponseReferenceChecks:true,requiresResponsePayloadChecks:true,
  requiresTemplateResourceChecks:true,requiresRequirementVersionChecks:true,
  requiresBusinessSectionChecks:true,assertCurrent})
}
