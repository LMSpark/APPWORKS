/** @module app:services/smart-bid/content/draft/content-draft-candidate-request
 * 职责：将已保存草稿和已核编制范围形成确定的候选生成请求。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {validateContentDraftPayload} from '../../content-draft-save-rule'
import {hashContentNode} from '../../content-node-hash'
import {resolveContentTargetScope} from '../content-target-scope'
import {previewScopedContentTree} from '../content-scoped-preview'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'

type Draft=Readonly<{
 projectId:string;draftId:string;actorUserId:string;draftVersion:string;baseRevisionId:string|null
 draftJson:string;contentDigest:string;assertCurrent:()=>void
}>
type Basis=Readonly<Omit<Parameters<typeof resolveContentTargetScope>[0],'scope'>&{
 revisionId:string|null;baselineId:string;stageRef:unknown;inputSnapshotHash?:string;batchId?:string;lockHash?:string
 nodePayloads:readonly unknown[];assertCurrent:()=>void
}>

/** 请求只引用已保存草稿；独立答复合并和原子登记按正式执行证据办理。 */
export async function prepareDraftCandidateRequest(draft:Draft,basis:Basis,input:Readonly<{
 requestKey:string;targetScope:unknown;declaredAddedNodeIds?:readonly string[]
}>){
 const assertCurrent=()=>{draft.assertCurrent();basis.assertCurrent()}
 assertCurrent()
 const {projectId,draftId,actorUserId,draftVersion,baseRevisionId,contentDigest,draftJson}=draft
 const {baselineId,stageRef,inputSnapshotHash,batchId,lockHash}=basis,{requestKey}=input
 const error='CONTENT_DRAFT_CANDIDATE_SCOPE'
 if(![projectId,draftId,actorUserId,draftVersion,baselineId,requestKey].every(identity)||projectId!==basis.projectId||
  baseRevisionId!==basis.revisionId||(baseRevisionId!==null&&!identity(baseRevisionId))||
  (!identity(stageRef)&&!isRecord(stageRef))||
  (baseRevisionId===null?(!identity(batchId)||typeof inputSnapshotHash!=='string'||!/^[a-f0-9]{64}$/u.test(inputSnapshotHash)||
   typeof lockHash!=='string'||!/^[a-f0-9]{64}$/u.test(lockHash)):
   [inputSnapshotHash,batchId,lockHash].some(value=>value!==undefined)))
  throw Error(error)
 const snapshot:unknown=JSON.parse(draftJson)
 validateContentDraftPayload({projectId,draft:snapshot})
 if(!isRecord(snapshot)||!Array.isArray(snapshot['nodes'])||canonicalSnapshotValue(snapshot)!==draftJson)throw Error(error)
 const {scope}=resolveContentTargetScope({...basis,scope:input.targetScope})
 const responseOnly=scope.targets.every(item=>item.kind==='RESPONSE')
 if(responseOnly&&snapshot['nodes'].length>0)throw Error('CONTENT_DRAFT_CANDIDATE_TARGET_MISMATCH')
 const preview=previewScopedContentTree({projectId,basis:basis.nodePayloads,current:basis.nodePayloads,
  candidate:responseOnly?basis.nodePayloads:snapshot['nodes'],targetScope:scope,responses:basis.responses,
  declaredAddedNodeIds:input.declaredAddedNodeIds??[],responseChanges:snapshot['responseChanges']})
 if(!preview.scopeCheckPassed)throw Error('CONTENT_DRAFT_CANDIDATE_TARGET_MISMATCH')
 if(!responseOnly&&preview.comparison.linkChecks.some(link=>link.snapshot==='CANDIDATE'&&!link.targetExists))
  throw Error('CONTENT_DRAFT_CANDIDATE_UNRESOLVED_LINK')
 if(preview.comparison.nodes.some(node=>node.conflicts.includes('TYPE_CHANGED')))
  throw Error('CONTENT_DRAFT_CANDIDATE_NODE_TYPE_CHANGED')
 const targetScope:unknown=JSON.parse(canonicalSnapshotValue(scope))
 const capturedStage:unknown=JSON.parse(canonicalSnapshotValue(stageRef))
 const [nodes,actualDigest]=await Promise.all([Promise.all(snapshot['nodes'].map(async(node:unknown)=>{
  if(!isRecord(node)||!identity(node['nodeId']))throw Error(error)
  return Object.freeze({nodeId:node['nodeId'],nodeHash:await hashContentNode(node)})
 })),hashCanonicalSnapshotText(draftJson)])
 if(actualDigest!==contentDigest)throw Error('CONTENT_DRAFT_CANDIDATE_DIGEST')
 nodes.sort((left,right)=>left.nodeId<right.nodeId?-1:left.nodeId>right.nodeId?1:0)
 const requestJson=canonicalSnapshotValue({projectId,draftId,actorUserId,draftVersion,baseRevisionId,baselineId,
  stageRef:capturedStage,targetScope,requestKey,contentDigest,nodes,responseChanges:preview.responseChanges,
  declaredAddedNodeIds:preview.addedNodeIds,
  ...(inputSnapshotHash?{inputSnapshotHash,batchId,lockHash}:{})})
 const requestDigest=await hashCanonicalSnapshotText(`["spark-bid.draft-candidate/1",${requestJson}]`)
 assertCurrent()
 return Object.freeze({projectId,draftId,draftVersion,baseRevisionId,baselineId,requestKey,contentDigest,requestJson,requestDigest,
  requiresCurrentAuthorityChecks:true as const,assertCurrent})
}
