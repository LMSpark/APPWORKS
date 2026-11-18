/**
 * @module app:views/features/application/smart-bid/collaboration/handoff/bid-project-scope-reader
 * 职责：动作20回读原编制项目现行的阶段引用、正文头及激活基线。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {canonicalSnapshotValue} from '@/services/smart-bid/content/revision-snapshot-hash'
import {isRecord} from '@spark-appworks/spark-utils'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'

import {readBaselineFactMembers} from '@/services/smart-bid/content/references/baseline-fact-members'
import {readBaselineRequirementMembers} from '@/services/smart-bid/content/references/baseline-requirement-members'
import {readBaselineTenderRecords} from '@/services/smart-bid/content/references/baseline-tender-records'

const frozenView='originalFrozenBaseline'
const previousFrozenView='previousFrozenBaseline'
const frozenFields=['stageRef','factVersions','requirementVersions','tenderRecords']
const fields=['stageRefs','headRevisionId','activeBaselineId']
const fixedBaselineView='originalHeadBaseline'
const targets={
 ContentRevision:{viewName:'originalProjectHead',fields:['status','snapshotHash','stageRef','baselineId']},
 Baseline:{viewName:'originalProjectBaseline',fields:['stageRef']},
} as const
type Host=Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{projectId:string}>

/** 据正式模型主键装配项目与两个独立原指针目标的视图。 */
export function bidProjectScopeScenarioViews(primaryKeys:Readonly<Record<'ContentProject'|'ContentRevision'|'Baseline',string>>){
 const keys=['projectId','id']
 return {
  ContentProject:{originalProjectScope:bidProjectScopeView(primaryKeys.ContentProject)},
  ContentRevision:{originalProjectHead:originalRegistrationView(primaryKeys.ContentRevision,keys,targets.ContentRevision.fields)},
  Baseline:{originalProjectBaseline:originalRegistrationView(primaryKeys.Baseline,keys,targets.Baseline.fields),
   [fixedBaselineView]:originalRegistrationView(primaryKeys.Baseline,keys,targets.Baseline.fields),
   [frozenView]:originalRegistrationView(primaryKeys.Baseline,keys,frozenFields),
   [previousFrozenView]:originalRegistrationView(primaryKeys.Baseline,keys,frozenFields)},
 }
}

async function readPointer(host:Host,model:keyof typeof targets,id:string|null,viewName:string=targets[model].viewName){
 if(id===null)return Object.freeze({state:'NOT_FORMED' as const,assertCurrent:host.assertCurrent})
 const target=targets[model]
 const read=await readOriginalRegistrationView(host,{model,viewName},{projectId:host.projectId,id})
 if(!read.row)return Object.freeze({state:'MISSING' as const,assertCurrent:read.assertCurrent})
 const assertCurrent=read.captureFields(target.fields)
 assertCurrent()
 const {status,snapshotHash,stageRef,baselineId}=read.row
 if((!identity(stageRef)&&!isRecord(stageRef))||
  model==='ContentRevision'&&(status!=='ADOPTED'||typeof snapshotHash!=='string'||!/^[a-f0-9]{64}$/u.test(snapshotHash)||!identity(baselineId)))
  throw Error('BID_PROJECT_SCOPE_POINTER')
 const stageKey=canonicalSnapshotValue(stageRef),stageText=identity(stageRef)?stageRef:stageKey
 return Object.freeze({state:'VERIFIED' as const,stageKey,stageText,revisionBaselineId:model==='ContentRevision'&&identity(baselineId)?baselineId:null,assertCurrent})
}

async function inspectPointer(host:Host,model:keyof typeof targets,id:string|null,viewName?:string){
 try{
  return await readPointer(host,model,id,viewName)
 }catch{
  host.assertCurrent()
  return Object.freeze({state:'UNVERIFIED' as const,assertCurrent:host.assertCurrent})
 }
}

/** 原项目指针按当前项目精确查询，关联记录沿各自原来源继续核验。 */
export function bidProjectScopeView(primaryKey:string){
 return originalRegistrationView(primaryKey,['projectId'],fields)
}

/** 完整空查询和已存在但尚未形成指针的项目分别呈现。 */
export async function readBidProjectScope(host:Host){
 const {projectId}=host
 const read=await readOriginalRegistrationView(host,{model:'ContentProject',viewName:'originalProjectScope'},{projectId})
 if(!read.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:read.assertCurrent})
 const assertProject=read.captureFields(fields)
 assertProject()
 const {stageRefs,headRevisionId,activeBaselineId}=read.row
 if(!Array.isArray(stageRefs)||!stageRefs.every(identity)||new Set(stageRefs).size!==stageRefs.length||
  (headRevisionId!==null&&!identity(headRevisionId))||(activeBaselineId!==null&&!identity(activeBaselineId)))
  throw Error('BID_PROJECT_SCOPE_READ')
 const boundHost={...host,assertCurrent:assertProject}
 const [head,baseline]=await Promise.all([inspectPointer(boundHost,'ContentRevision',headRevisionId),
  inspectPointer(boundHost,'Baseline',activeBaselineId)])
 const headBaselineId=head.state==='VERIFIED'?head.revisionBaselineId:null
 const fixed=headBaselineId===null?undefined:headBaselineId===activeBaselineId?baseline:
  await inspectPointer(boundHost,'Baseline',headBaselineId,fixedBaselineView)
 const fixedState=fixed?.state==='VERIFIED'&&head.state==='VERIFIED'&&fixed.stageKey!==head.stageKey?
  'STAGE_MISMATCH' as const:fixed?.state??'NOT_FORMED'
 const assertCurrent=()=>{assertProject();head.assertCurrent();baseline.assertCurrent();fixed?.assertCurrent()}
 assertCurrent()
 return Object.freeze({state:'REGISTERED' as const,projectId,stageRefs:Object.freeze([...stageRefs]),
  headRevisionId,activeBaselineId,headState:head.state,baselineState:baseline.state,
  headStage:head.state==='VERIFIED'?head.stageText:null,baselineStage:baseline.state==='VERIFIED'?baseline.stageText:null,
  headBaselineId,headBaselineState:fixedState,assertCurrent})
}

/** 按明确版本回读冻结引用。来源准用和正式激活仍沿各自办理。 */
export async function readBidFrozenBaseline(host:Host,id:string,side:'current'|'previous'='current'){
 const {projectId}=host
 const read=await readOriginalRegistrationView(host,{model:'Baseline',viewName:side==='current'?frozenView:previousFrozenView},{projectId,id})
 if(!read.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:read.assertCurrent})
 const assertCurrent=read.captureFields(frozenFields)
 assertCurrent()
 const {stageRef,factVersions,requirementVersions,tenderRecords}=read.row
 if(!identity(stageRef)&&!isRecord(stageRef))throw Error('BID_PROJECT_SCOPE_POINTER')
 const facts=readBaselineFactMembers(factVersions)
 const requirements=readBaselineRequirementMembers(requirementVersions)
 const tenders=readBaselineTenderRecords(tenderRecords)
 return Object.freeze({state:'REGISTERED' as const,baselineId:id,
  stageRef:structuredClone(stageRef),stage:identity(stageRef)?stageRef:canonicalSnapshotValue(stageRef),
  facts:Object.freeze([...facts].map(([factId,version])=>Object.freeze({factId,version}))),
  requirements:Object.freeze([...requirements].map(([lineageId,version])=>Object.freeze({lineageId,version}))),
  tenderRecords:Object.freeze([...tenders.values()]),
  assertCurrent})
}

function compareReferences<T>(before:readonly T[],after:readonly T[],key:(reference:T)=>string){
 const oldReferences=new Map(before.map(reference=>[key(reference),reference]))
 const newReferences=new Map(after.map(reference=>[key(reference),reference]))
 const changes=[]
 for(const id of new Set([...oldReferences.keys(),...newReferences.keys()])){
  const previous=oldReferences.get(id)??null
  const current=newReferences.get(id)??null
  if(canonicalSnapshotValue(previous)===canonicalSnapshotValue(current))continue
  changes.push(Object.freeze({previous,current}))
 }
 return Object.freeze(changes)
}

/** 比较同一项目两份原冻结记录，保留变化两侧的精确引用。 */
export async function compareBidFrozenBaselines(host:Host,previousId:string,currentId:string){
 const [previous,current]=await Promise.all([
  readBidFrozenBaseline(host,previousId,'previous'),
  readBidFrozenBaseline(host,currentId),
 ])
 const assertCurrent=()=>{previous.assertCurrent();current.assertCurrent()}
 assertCurrent()
 if(previous.state!=='REGISTERED'||current.state!=='REGISTERED')
  return Object.freeze({state:'UNKNOWN' as const,assertCurrent})
 return Object.freeze({state:'COMPARED' as const,previousId,currentId,previousStage:previous.stage,currentStage:current.stage,
  facts:compareReferences(previous.facts,current.facts,item=>item.factId),
  requirements:compareReferences(previous.requirements,current.requirements,item=>item.lineageId),
  tenderRecords:compareReferences(previous.tenderRecords,current.tenderRecords,item=>JSON.stringify([item.runId,item.type,item.ordinal])),
  assertCurrent})
}
