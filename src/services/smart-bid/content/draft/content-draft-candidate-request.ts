/** @module app:services/smart-bid/content/draft/content-draft-candidate-request
 * 职责：将已保存草稿和已核编制范围形成确定的候选生成请求。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {validateContentDraftPayload} from '../../content-draft-save-rule'
import {hashContentNode} from '../../content-node-hash'
import {resolveContentTargetScope} from '../content-target-scope'
import {previewScopedContentTree} from '../content-scoped-preview'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity,snapshotReferenceRecord} from '../references/snapshot-reference-values'
import {readContentNodeFactIds} from '../content-node-links'
import {readBaselineFactMembers,type BaselineFactMember} from '../references/baseline/baseline-fact-members'

type Draft=Readonly<{
 projectId:string;draftId:string;actorUserId:string;draftVersion:string;baseRevisionId:string|null
 draftJson:string;contentDigest:string;assertCurrent:()=>void
}>
type Basis=Readonly<Omit<Parameters<typeof resolveContentTargetScope>[0],'scope'>&{
 revisionId:string|null;baselineId:string;stageRef:unknown;inputSnapshotHash?:string;batchId?:string;lockHash?:string
 nodePayloads:readonly unknown[];factVersions:readonly BaselineFactMember[];assertCurrent:()=>void
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
 const fixedFacts=readBaselineFactMembers(basis.factVersions)
 const referencedFacts=[...new Set(snapshot['nodes'].flatMap(readContentNodeFactIds))].sort().map(factId=>{
  const version=fixedFacts.get(factId)
  if(version===undefined)throw Error('CONTENT_DRAFT_CANDIDATE_FACT_NOT_FROZEN')
  return {factId,version}
 })
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
  declaredAddedNodeIds:preview.addedNodeIds,factVersions:referencedFacts,
  ...(inputSnapshotHash?{inputSnapshotHash,batchId,lockHash}:{})})
 const requestDigest=await hashCanonicalSnapshotText(`["spark-bid.draft-candidate/1",${requestJson}]`)
 assertCurrent()
 return Object.freeze({projectId,draftId,draftVersion,baseRevisionId,baselineId,requestKey,contentDigest,requestJson,requestDigest,
  factVersions:Object.freeze(referencedFacts.map(item=>Object.freeze(item))),
  nodeIds:Object.freeze((responseOnly?basis.basisNodes:nodes).map(item=>item.nodeId)),
  responseChanges:Object.freeze(preview.responseChanges.map(item=>Object.freeze(item))),requiresCurrentAuthorityChecks:true as const,assertCurrent})
}

/** 将已核事实记录的依赖摘要固定到本次候选请求。 */
export async function bindDraftCandidateFactEvidence(request:Awaited<ReturnType<typeof prepareDraftCandidateRequest>>,
 facts:Readonly<{factDependencyHash:string;factVersions:readonly BaselineFactMember[]
  responseVersions:ReadonlyArray<Readonly<{responseId:string;assignmentId:string;payloadHash:string}>>;assertCurrent:()=>void}>){
 const assertCurrent=()=>{request.assertCurrent();facts.assertCurrent()}
 assertCurrent()
 const {factDependencyHash,factVersions,responseVersions}=facts
 const error='CONTENT_DRAFT_CANDIDATE_FACT_EVIDENCE'
 if(!/^[a-f0-9]{64}$/u.test(factDependencyHash))throw Error(error)
 const fixedFacts=readBaselineFactMembers(factVersions)
 if(request.factVersions.some(({factId,version})=>fixedFacts.get(factId)!==version))throw Error(error)
 const pinnedFactVersions=Object.freeze([...fixedFacts].map(([factId,version])=>Object.freeze({factId,version}))
  .sort((left,right)=>left.factId<right.factId?-1:left.factId>right.factId?1:0))
 const expectedResponses=new Map(request.responseChanges.flatMap(({assignmentId,responseId})=>
  responseId===null?[]:[[assignmentId,responseId] as const]))
 for(const {assignmentId,responseId,payloadHash} of responseVersions){
  if(expectedResponses.get(assignmentId)!==responseId||!/^[a-f0-9]{64}$/u.test(payloadHash))throw Error(error)
  expectedResponses.delete(assignmentId)
 }
 if(expectedResponses.size)throw Error(error)
 const pinnedResponseVersions=Object.freeze(responseVersions.map(({responseId,assignmentId,payloadHash})=>
  Object.freeze({responseId,assignmentId,payloadHash}))
  .sort((left,right)=>left.responseId<right.responseId?-1:left.responseId>right.responseId?1:0))
 const parsed:unknown=JSON.parse(request.requestJson)
 const input=snapshotReferenceRecord(parsed,error)
 const requestJson=canonicalSnapshotValue({...input,factDependencyHash,factVersions:pinnedFactVersions,responseVersions:pinnedResponseVersions})
 const requestDigest=await hashCanonicalSnapshotText(`["spark-bid.draft-candidate/1",${requestJson}]`)
 assertCurrent()
 return Object.freeze({...request,requestJson,requestDigest,factDependencyHash,factVersions:pinnedFactVersions,
  responseVersions:pinnedResponseVersions,requiresFactUseCheck:true as const,requiresResponseUseCheck:pinnedResponseVersions.length>0,assertCurrent})
}
