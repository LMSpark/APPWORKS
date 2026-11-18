/**
 * @module app:views/features/application/smart-bid/collaboration/handoff/bid-project-scope-reader
 * 职责：动作20回读原编制项目现行的阶段引用、正文头及激活基线。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {canonicalSnapshotValue} from '@/services/smart-bid/content/revision-snapshot-hash'
import {isRecord} from '@spark-appworks/spark-utils'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'

const fields=['stageRefs','headRevisionId','activeBaselineId']
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
  Baseline:{originalProjectBaseline:originalRegistrationView(primaryKeys.Baseline,keys,targets.Baseline.fields)},
 }
}

async function readPointer(host:Host,model:keyof typeof targets,id:string|null){
 if(id===null)return Object.freeze({state:'NOT_FORMED' as const,assertCurrent:host.assertCurrent})
 const target=targets[model]
 const read=await readOriginalRegistrationView(host,{model,viewName:target.viewName},{projectId:host.projectId,id})
 if(!read.row)return Object.freeze({state:'MISSING' as const,assertCurrent:read.assertCurrent})
 const assertCurrent=read.captureFields(target.fields)
 assertCurrent()
 const {status,snapshotHash,stageRef,baselineId}=read.row
 if((!identity(stageRef)&&!isRecord(stageRef))||
  model==='ContentRevision'&&(status!=='ADOPTED'||typeof snapshotHash!=='string'||!/^[a-f0-9]{64}$/u.test(snapshotHash)||!identity(baselineId)))
  throw Error('BID_PROJECT_SCOPE_POINTER')
 const stageText=identity(stageRef)?stageRef:canonicalSnapshotValue(stageRef)
 return Object.freeze({state:'VERIFIED' as const,stageText,revisionBaselineId:model==='ContentRevision'&&identity(baselineId)?baselineId:null,assertCurrent})
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
 const [head,baseline]=await Promise.all([readPointer(boundHost,'ContentRevision',headRevisionId),
  readPointer(boundHost,'Baseline',activeBaselineId)])
 const assertCurrent=()=>{assertProject();head.assertCurrent();baseline.assertCurrent()}
 assertCurrent()
 return Object.freeze({state:'REGISTERED' as const,projectId,stageRefs:Object.freeze([...stageRefs]),
  headRevisionId,activeBaselineId,headState:head.state,baselineState:baseline.state,
  headStage:head.state==='VERIFIED'?head.stageText:null,baselineStage:baseline.state==='VERIFIED'?baseline.stageText:null,
  headBaselineId:head.state==='VERIFIED'?head.revisionBaselineId:null,assertCurrent})
}
