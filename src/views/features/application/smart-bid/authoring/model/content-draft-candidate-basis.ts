/** @module app:views/features/application/smart-bid/authoring/model/content-draft-candidate-basis
 * 职责：沿草稿基版回读不可变的正文和分工身份。
 */
import {readRevisionBasisResponses} from '@/services/smart-bid/content/content-scoped-preview'
import {readBidFrozenBaseline} from '../../collaboration/handoff/bid-project-scope-reader'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readAdoptedContentRevision,type ContentRevisionReadHost} from './content-revision-reader'
import {assertRevisionManifest,readContentSnapshotIndex} from './hashes/content-snapshot-reader'
import {readContentSnapshotNodes} from './content-snapshot-nodes'
import {assertContentNodeVersionPayload} from './content-node-version-reader'
import {readContentReviewBaseline} from './content-baseline-reader'

/** 首版须由调用方已核空头；已有基版沿原修订保留固定基线。 */
export async function readDraftCandidateBasis(host:ContentRevisionReadHost,selection:
 Readonly<{revisionId:string}|{revisionId:null;firstBaselineId:string}>){
 const {runtime,projectId}=host,{revisionId}=selection
 const error='CONTENT_DRAFT_CANDIDATE_BASIS'
 if(revisionId===null){
  const frozen=await readBidFrozenBaseline(host,selection.firstBaselineId)
  if(frozen.state!=='REGISTERED')throw Error(error)
  return Object.freeze({projectId,revisionId,baselineId:frozen.baselineId,stageRef:frozen.stageRef,basisNodes:[],responses:[],
   assertCurrent:frozen.assertCurrent})
 }
 const revision=await readAdoptedContentRevision(host,{kind:'basis',revisionId})
 const view=runtime.resolveView(revision.dataViewKey),row=view?.rows[0]
 if(!view||!row||!identity(row['snapshotHash'])||!identity(row['baselineId']))throw Error(error)
 const {snapshotHash,baselineId,stageRef}=row
 const rowProof=view.captureReadRow(row,['snapshotHash','baselineId','stageRef','templateRefs'])
 const assertRevision=()=>{revision.assertCurrent();rowProof()}
 assertRevision()
 const scopedHost={...host,assertCurrent:assertRevision}
 const snapshot=await readContentSnapshotIndex(scopedHost,{snapshotHash},'basis')
 const manifest=runtime.resolveView(snapshot.dataViewKey)?.rows[0]?.['manifest']
 assertRevisionManifest(manifest,row)
 const [nodes,frozen]=await Promise.all([
  readContentSnapshotNodes(scopedHost,snapshot),
  readContentReviewBaseline(scopedHost,{baselineId,stageRef,viewName:'selectedBasisBaseline'}),
 ])
 const members=nodes.dataViewKey?runtime.resolveView(nodes.dataViewKey)?.rows:[]
 if(!members)throw Error(error)
 const basisNodes=members.map(member=>{
  const nodeId=member['nodeId'],payload=member['payload']
  if(!identity(nodeId))throw Error(error)
  assertContentNodeVersionPayload(payload,nodeId)
  return Object.freeze({nodeId,parentId:payload.parentId,type:payload.type,index:payload.index})
 })
 const responses=readRevisionBasisResponses(projectId,manifest)
 const assertCurrent=()=>{nodes.assertCurrent();frozen.assertCurrent()}
 assertCurrent()
 return Object.freeze({projectId,revisionId,baselineId,stageRef:structuredClone(stageRef),
  basisNodes:Object.freeze(basisNodes),responses:Object.freeze(responses),assertCurrent})
}
