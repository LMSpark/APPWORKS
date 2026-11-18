/**
 * @module app:views/features/application/smart-bid/collaboration/handoff/bid-project-scope-reader
 * 职责：动作20回读原编制项目现行的阶段引用、正文头及激活基线。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'

const fields=['stageRefs','headRevisionId','activeBaselineId']

/** 原项目指针按当前项目精确查询，关联记录沿各自原来源继续核验。 */
export function bidProjectScopeView(primaryKey:string){
 return originalRegistrationView(primaryKey,['projectId'],fields)
}

/** 完整空查询和已存在但尚未形成指针的项目分别呈现。 */
export async function readBidProjectScope(host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{projectId:string}>){
 const {projectId}=host
 const read=await readOriginalRegistrationView(host,{model:'ContentProject',viewName:'originalProjectScope'},{projectId})
 if(!read.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:read.assertCurrent})
 const assertCurrent=read.captureFields(fields)
 assertCurrent()
 const {stageRefs,headRevisionId,activeBaselineId}=read.row
 if(!Array.isArray(stageRefs)||!stageRefs.every(identity)||new Set(stageRefs).size!==stageRefs.length||
  (headRevisionId!==null&&!identity(headRevisionId))||(activeBaselineId!==null&&!identity(activeBaselineId)))
  throw Error('BID_PROJECT_SCOPE_READ')
 return Object.freeze({state:'REGISTERED' as const,projectId,stageRefs:Object.freeze([...stageRefs]),
  headRevisionId,activeBaselineId,assertCurrent})
}
