/**
 * @module app:services/smart-bid/content/references/response/response-draft
 * 职责：动作36核当前承办任务及引用后生成待核答复。
 */
import {assertRevisionResponseText} from '../revision-response-text'
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'
import {checkResponseTaskAuthor} from './response-task'

type Scope=Readonly<{projectId:string;baselineId:string;assignmentId:string;lineageId:string;version:string;targetRef:string}>
type Proof=Readonly<{assertCurrent:()=>void}>
type Body=Readonly<{chapterId:string;anchorNodeId:string}>|Readonly<{statement:string;data:Readonly<Record<string,unknown>>}>
type Evidence=Readonly<{ref:string;kind:'FACT'|'MATERIAL'|'QUALIFICATION';usable:boolean;assertCurrent:()=>void}>
const fields=['projectId','baselineId','assignmentId','lineageId','version','targetRef'] as const

/** 只接受原任务当前承办人及规定落点；章内正文仍由原节点承载。 */
export function prepareResponseDraft(input:Scope&Readonly<{authorRef:string;at:number;body:Body}>,source:Scope&Proof&Readonly<{
 task:Parameters<typeof checkResponseTaskAuthor>[1];chapterId?:string;allowedNodeIds:readonly string[]
 requiredEvidence:ReadonlyArray<Pick<Evidence,'kind'|'ref'>>;evidence:readonly Evidence[]
}>){
 const evidence=[...source.evidence]
 source.assertCurrent()
 if(![...fields.map(key=>input[key]),input.authorRef].every(identity)||fields.some(key=>source[key]!==input[key]))
  throw Error('BID_RESPONSE_DRAFT_SCOPE')
 const {taskRef,assignmentVersion,acceptanceRef,assertCurrent:assertTask}=checkResponseTaskAuthor(input,source.task)
 const assertCurrent=()=>{source.assertCurrent();assertTask();for(const item of evidence)item.assertCurrent()}
 assertCurrent()
 const {body}=input
 if('chapterId' in body){
  if(!identity(body.chapterId)||body.chapterId!==source.chapterId||!source.allowedNodeIds.includes(body.anchorNodeId)||
   Object.hasOwn(body,'statement')||Object.hasOwn(body,'data'))throw Error('BID_RESPONSE_DRAFT_BODY')
 }else{
  if(source.chapterId!==undefined||typeof body.statement!=='string'||!body.statement.trim())
   throw Error('BID_RESPONSE_DRAFT_BODY')
  assertRevisionResponseText([body],source.allowedNodeIds)
 }
 const key=(item:Pick<Evidence,'kind'|'ref'>)=>JSON.stringify([item.kind,item.ref])
 const expected=new Set(source.requiredEvidence.map(key))
 if(expected.size!==source.requiredEvidence.length||source.requiredEvidence.some(item=>!identity(item.ref)||
  !['FACT','MATERIAL','QUALIFICATION'].includes(item.kind)))throw Error('BID_RESPONSE_DRAFT_EVIDENCE')
 const evidenceRefs=evidence.map(item=>{
  if(!expected.delete(key(item))||item.usable!==true)throw Error('BID_RESPONSE_DRAFT_EVIDENCE')
  return Object.freeze({kind:item.kind,ref:item.ref})
 })
 if(expected.size)throw Error('BID_RESPONSE_DRAFT_EVIDENCE')
 return Object.freeze({projectId:input.projectId,baselineId:input.baselineId,assignmentId:input.assignmentId,
  lineageId:input.lineageId,version:input.version,targetRef:input.targetRef,authorRef:input.authorRef,
  body:structuredClone(body),taskRef,assignmentVersion,acceptanceRef,evidenceRefs:Object.freeze(evidenceRefs),assertCurrent})
}
