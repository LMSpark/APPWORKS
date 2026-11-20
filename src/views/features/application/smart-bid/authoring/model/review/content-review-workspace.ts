/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-review-workspace
 * 职责：按动作45固定清单读取实件、拟填栏、原批准及检查结果。
 */
import {readContentApprovals} from './content-approval-reader'
import {readApprovalCoverageEvidence} from './content-approval-coverage'
import {readRegisteredProducedFileReviewVersions} from './content-produced-file-review'
import {readContentReviewCoverageFromFindings} from './content-review-coverage-reader'
import {bindReviewVersions} from './content-review-versions'
import type {ContentRevisionReadHost} from '../content-revision-reader'

type ReviewSelection=Parameters<typeof bindReviewVersions>[0]
type FileTarget=Parameters<typeof readRegisteredProducedFileReviewVersions>[1][number]
type FieldProof=Extract<Parameters<typeof bindReviewVersions>[1][number],{kind:'FIELD'}>['source']

/** 审定范围由固定清单交入，证据始终随原查询和来源失效。 */
export async function readContentReviewWorkspace(host:ContentRevisionReadHost,selection:ReviewSelection&Readonly<{
 files:readonly FileTarget[];approvalIds:readonly string[]
}>,sources:Readonly<{
 openFile:Parameters<typeof readRegisteredProducedFileReviewVersions>[2]
 readField:(input:Readonly<{projectId:string;revisionId:string;fieldId:string}>)=>Promise<FieldProof>
 readDecision:Parameters<typeof readApprovalCoverageEvidence>[1]
 readCompleted:Parameters<typeof readContentReviewCoverageFromFindings>[2]['readCompleted']
}>){
 const assertCurrent=()=>{host.assertCurrent();selection.assertCurrent()}
 assertCurrent()
 const {projectId,revisionId}=selection
 if(projectId!==host.projectId)throw Error('CONTENT_REVIEW_COVERAGE_SCOPE')
 const targets=structuredClone(selection.targets),files=structuredClone(selection.files),approvalIds=[...selection.approvalIds]
 const fileIds=new Set(files.map(file=>file.producedFileId))
 const requestedFiles=targets.filter(target=>target.kind==='FILE')
 if(requestedFiles.length!==files.length||fileIds.size!==files.length||
  requestedFiles.some(target=>!fileIds.delete(target.targetId)))throw Error('CONTENT_REVIEW_VERSION_SCOPE')
 const scopedHost={...host,assertCurrent}
 const actualFiles=await readRegisteredProducedFileReviewVersions(scopedHost,files,sources.openFile)
 const approvedFields:Array<{kind:'FIELD';source:FieldProof}>=[]
 for(const {kind,targetId} of targets){
  if(kind!=='FIELD')continue
  assertCurrent()
  const source=await sources.readField(Object.freeze({projectId,revisionId,fieldId:targetId}))
  if(source.fieldId!==targetId)throw Error('CONTENT_REVIEW_VERSION_SCOPE')
  approvedFields.push({kind,source})
 }
 const versioned=bindReviewVersions({projectId,revisionId,targets,assertCurrent},[
  ...actualFiles.map(source=>({kind:'FILE' as const,source})),...approvedFields,
 ])
 const records=await readContentApprovals({...host,assertCurrent:versioned.assertCurrent},approvalIds)
 const approvals=await Promise.all(records.map(record=>readApprovalCoverageEvidence(record,sources.readDecision)))
 return readContentReviewCoverageFromFindings(host,versioned,{approvals,readCompleted:sources.readCompleted})
}
