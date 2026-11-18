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
import {canonicalSnapshotValue} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceRecord} from '@/services/smart-bid/content/references/snapshot-reference-values'

const error='CONTENT_DRAFT_CANDIDATE_BASIS'

async function readBasisMembers(host:ContentRevisionReadHost,snapshot:Awaited<ReturnType<typeof readContentSnapshotIndex>>,manifest:unknown){
 const nodes=await readContentSnapshotNodes(host,snapshot)
 const members=nodes.dataViewKey?host.runtime.resolveView(nodes.dataViewKey)?.rows:[]
 if(!members)throw Error(error)
 const basisNodes=members.map(member=>{
  const nodeId=member['nodeId'],payload=member['payload']
  if(!identity(nodeId))throw Error(error)
  assertContentNodeVersionPayload(payload,nodeId)
  return Object.freeze({nodeId,parentId:payload.parentId,type:payload.type,index:payload.index})
 })
 const responses=readRevisionBasisResponses(host.projectId,manifest)
 nodes.assertCurrent()
 return Object.freeze({basisNodes:Object.freeze(basisNodes),responses:Object.freeze(responses),assertCurrent:nodes.assertCurrent})
}

/** 首版须由调用方已核空头；已有基版沿原修订保留固定基线。 */
export async function readDraftCandidateBasis(host:ContentRevisionReadHost,selection:
 Readonly<{revisionId:string}|{revisionId:null;firstBaselineId:string;firstInputSnapshotHash:string}>){
 const {runtime,projectId}=host,{revisionId}=selection
 if(revisionId===null){
  const frozen=await readBidFrozenBaseline(host,selection.firstBaselineId)
  if(frozen.state!=='REGISTERED')throw Error(error)
  const scopedHost={...host,assertCurrent:frozen.assertCurrent}
  const snapshot=await readContentSnapshotIndex(scopedHost,{snapshotHash:selection.firstInputSnapshotHash},'basis')
  const manifest=runtime.resolveView(snapshot.dataViewKey)?.rows[0]?.['manifest']
  const {stageRef}=snapshotReferenceRecord(manifest,error)
  if(snapshot.index.baselineId!==frozen.baselineId||canonicalSnapshotValue(stageRef)!==canonicalSnapshotValue(frozen.stageRef))
   throw Error(error)
  const members=await readBasisMembers(scopedHost,snapshot,manifest)
  return Object.freeze({...members,projectId,revisionId,baselineId:frozen.baselineId,stageRef:frozen.stageRef,
   inputSnapshotHash:selection.firstInputSnapshotHash})
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
  readBasisMembers(scopedHost,snapshot,manifest),
  readContentReviewBaseline(scopedHost,{baselineId,stageRef,viewName:'selectedBasisBaseline'}),
 ])
 const assertCurrent=()=>{nodes.assertCurrent();frozen.assertCurrent()}
 assertCurrent()
 return Object.freeze({projectId,revisionId,baselineId,stageRef:structuredClone(stageRef),
  basisNodes:nodes.basisNodes,responses:nodes.responses,assertCurrent})
}
