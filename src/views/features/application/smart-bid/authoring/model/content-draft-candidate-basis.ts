/** @module app:views/features/application/smart-bid/authoring/model/content-draft-candidate-basis
 * 职责：沿草稿基版回读不可变的正文和分工身份。
 */
import {readRevisionBasisResponses} from '@/services/smart-bid/content/content-scoped-preview'
import {assertRevisionTemplateBindings} from '@/services/smart-bid/content/revision-template-bindings'
import {assertRevisionResponseAnchors} from '@/services/smart-bid/content/references/revision-response-anchors'
import {assertRevisionResponseText,readIndependentResponseFactOccurrences,type IndependentResponseFactTarget}
 from '@/services/smart-bid/content/references/revision-response-text'
import {readBaselineFactMembers} from '@/services/smart-bid/content/references/baseline-fact-members'
import {assessBaselineRequirementPins,readBaselineRequirementMembers} from '@/services/smart-bid/content/references/baseline-requirement-members'
import {readBidFrozenBaseline} from '../../collaboration/handoff/bid-project-scope-reader'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readAdoptedContentRevision,type ContentRevisionReadHost} from './content-revision-reader'
import {assertRevisionManifest,readContentSnapshotIndex} from './hashes/content-snapshot-reader'
import {readContentSnapshotNodes} from './content-snapshot-nodes'
import {assertContentNodeVersionPayload} from './content-node-version-reader'
import {readContentReviewBaseline} from './content-baseline-reader'
import {canonicalSnapshotValue} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceRecord,visitSnapshotReferences} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'

const error='CONTENT_DRAFT_CANDIDATE_BASIS'
const batchFields=['basisRevisionId','baselineId','inputSnapshotHash','targetScopes','lockHash']
const batchView='originalFirstCandidateBatch'

function assertBasisRequirementVersions(manifest:unknown,basisNodes:Awaited<ReturnType<typeof readBasisMembers>>['basisNodes'],requirements:unknown){
 const sections=snapshotReferenceRecord(manifest,error)
 const versions=readBaselineRequirementMembers(requirements)
 if(assessBaselineRequirementPins(requirements,sections['requirementPins'],basisNodes).length)
  throw Error('CONTENT_DRAFT_CANDIDATE_BASIS_REQUIREMENT')
 visitSnapshotReferences(sections['responseAssignments'],value=>{
  const {lineageId,version}=snapshotReferenceRecord(value,error)
  if(!identity(lineageId)||!identity(version)||versions.get(lineageId)!==version)
   throw Error('CONTENT_DRAFT_CANDIDATE_BASIS_REQUIREMENT')
 },error)
}

export function firstCandidateBatchScenarioView(primaryKey:string){
 return originalRegistrationView(primaryKey,['projectId','id'],batchFields)
}

async function readBasisMembers(host:ContentRevisionReadHost,snapshot:Awaited<ReturnType<typeof readContentSnapshotIndex>>,manifest:unknown){
 const nodes=await readContentSnapshotNodes(host,snapshot)
 const members=nodes.dataViewKey?host.runtime.resolveView(nodes.dataViewKey)?.rows:[]
 if(!members)throw Error(error)
 const nodePayloads=members.map(member=>{
  const nodeId=member['nodeId'],payload=member['payload']
  if(!identity(nodeId))throw Error(error)
  assertContentNodeVersionPayload(payload,nodeId)
  return structuredClone(payload)
 })
 const basisNodes=nodePayloads.map(({nodeId,parentId,type,index})=>Object.freeze({nodeId,parentId,type,index}))
 const responses=readRevisionBasisResponses(host.projectId,manifest)
 const sections=snapshotReferenceRecord(manifest,error)
 assertRevisionTemplateBindings(sections['templateRefs'],nodePayloads)
 assertRevisionResponseAnchors(sections['responses'],sections['requirementPins'],basisNodes)
 assertRevisionResponseText(sections['responses'],basisNodes.map(node=>node.nodeId))
 const independent:IndependentResponseFactTarget[]=[]
 visitSnapshotReferences(sections['responses'],value=>{
  const response=snapshotReferenceRecord(value,error)
  if(Object.hasOwn(response,'chapterId'))return
  const {id:responseId,assignmentId}=response
  if(!identity(responseId)||!identity(assignmentId))throw Error(error)
  independent.push({responseId,assignmentId})
 },error)
 const factIds=new Set([
  ...nodes.readFactIds(basisNodes.map(node=>node.nodeId)),
  ...readIndependentResponseFactOccurrences(sections['responses'],independent).map(item=>item.factId),
 ])
 nodes.assertCurrent()
 return Object.freeze({basisNodes:Object.freeze(basisNodes),nodePayloads:Object.freeze(nodePayloads),
  responses:Object.freeze(responses),factIds:Object.freeze([...factIds]),assertCurrent:nodes.assertCurrent})
}

function assertBasisFacts(factIds:readonly string[],members:unknown){
 const versions=readBaselineFactMembers(members)
 if(factIds.some(id=>!versions.has(id)))throw Error('CONTENT_DRAFT_CANDIDATE_BASIS_FACT')
}

/** 首版须由调用方已核空头；已有基版沿原修订保留固定基线。 */
export async function readDraftCandidateBasis(host:ContentRevisionReadHost,selection:
 Readonly<{revisionId:string}|{revisionId:null;firstBaselineId:string;firstBatchId:string;targetScope?:unknown;targetScopeIndex?:number}>){
 const {runtime,projectId}=host,{revisionId}=selection
 if(revisionId===null){
  const {firstBatchId,firstBaselineId,targetScope,targetScopeIndex}=selection
  if(!identity(firstBatchId)||!identity(firstBaselineId))throw Error(error)
  const byIndex=targetScopeIndex!==undefined
  if(byIndex?(targetScope!==undefined||!Number.isSafeInteger(targetScopeIndex)||targetScopeIndex<0):targetScope===undefined)throw Error(error)
  const requestedScope=byIndex?null:canonicalSnapshotValue(targetScope)
  const batch=await readOriginalRegistrationView(host,{model:'GenerationBatch',viewName:batchView},{projectId,id:firstBatchId})
  if(!batch.row)throw Error(error)
  const assertBatch=batch.captureFields(batchFields)
  assertBatch()
  const {inputSnapshotHash,lockHash}=batch.row
  if(batch.row['basisRevisionId']!==null||batch.row['baselineId']!==firstBaselineId||
   typeof inputSnapshotHash!=='string'||!/^[a-f0-9]{64}$/u.test(inputSnapshotHash)||
   typeof lockHash!=='string'||!/^[a-f0-9]{64}$/u.test(lockHash))throw Error(error)
  const scopes=new Set<string>()
  visitSnapshotReferences(batch.row['targetScopes'],value=>{
   const encoded=canonicalSnapshotValue(value)
   if(scopes.has(encoded))throw Error(error)
   scopes.add(encoded)
  },error)
  const approvedScope=requestedScope??[...scopes][targetScopeIndex??-1]
  if(approvedScope===undefined||!scopes.has(approvedScope))throw Error(error)
  const registeredTargetScope:unknown=JSON.parse(approvedScope)
  const frozen=await readBidFrozenBaseline({...host,assertCurrent:assertBatch},firstBaselineId)
  if(frozen.state!=='REGISTERED')throw Error(error)
  const scopedHost={...host,assertCurrent:frozen.assertCurrent}
  const snapshot=await readContentSnapshotIndex(scopedHost,{snapshotHash:inputSnapshotHash},'basis')
  const manifest=runtime.resolveView(snapshot.dataViewKey)?.rows[0]?.['manifest']
  const {stageRef}=snapshotReferenceRecord(manifest,error)
  if(snapshot.index.baselineId!==frozen.baselineId||canonicalSnapshotValue(stageRef)!==canonicalSnapshotValue(frozen.stageRef))
   throw Error(error)
  const members=await readBasisMembers(scopedHost,snapshot,manifest)
  assertBasisRequirementVersions(manifest,members.basisNodes,frozen.requirements)
  assertBasisFacts(members.factIds,frozen.facts)
  members.assertCurrent()
  return Object.freeze({...members,projectId,revisionId,baselineId:frozen.baselineId,stageRef:frozen.stageRef,
   inputSnapshotHash,batchId:firstBatchId,lockHash,targetScope:registeredTargetScope})
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
 assertBasisRequirementVersions(manifest,nodes.basisNodes,frozen.requirementVersions)
 assertBasisFacts(nodes.factIds,frozen.factVersions)
 assertCurrent()
 return Object.freeze({projectId,revisionId,baselineId,stageRef:structuredClone(stageRef),
  basisNodes:nodes.basisNodes,nodePayloads:nodes.nodePayloads,responses:nodes.responses,assertCurrent})
}
