/**
 * @module app:services/smart-bid/content/draft/content-draft-save-recovery
 * 职责：按原请求、作者和内容摘要核验权威草稿保存回执。
 */
import type {prepareContentDraftSaveRequest} from './content-draft-save-request'
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'

type Prepared=Awaited<ReturnType<typeof prepareContentDraftSaveRequest>>
type Request=Pick<Prepared,'projectId'|'draftId'|'requestKey'|'requestDigest'|'expectedDraftVersion'|'contentDigest'>&
 Readonly<{authorId:string}>
type Receipt=Request&Readonly<{assertCurrent:()=>void}>&(
 Readonly<{state:'SAVED';draftVersion:string;receiptRef:string}>|
 Readonly<{state:'NOT_SAVED';terminalRef:string}>|
 Readonly<{state:'UNKNOWN'}>
)

/** 不依赖旧页面绑定；冷重开时用本次查询权读取原回执。 */
export async function readOriginalContentDraftSave(input:Request,source:Readonly<{
 lookup:(request:Request)=>Promise<Receipt|undefined>;assertCurrent:()=>void
}>){
 source.assertCurrent()
 const {projectId,draftId,authorId,requestKey,requestDigest,expectedDraftVersion,contentDigest}=input
 const error='CONTENT_DRAFT_SAVE_RECEIPT_SCOPE'
 if(![projectId,draftId,authorId,requestKey].every(identity)||expectedDraftVersion!==null&&!identity(expectedDraftVersion)||
  ![requestDigest,contentDigest].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value)))throw Error(error)
 const request=Object.freeze({projectId,draftId,authorId,requestKey,requestDigest,expectedDraftVersion,contentDigest})
 const receipt=await source.lookup(request)
 const assertCurrent=()=>{source.assertCurrent();receipt?.assertCurrent()}
 assertCurrent()
 if(!receipt)return Object.freeze({state:'UNKNOWN' as const,assertCurrent})
 const fields=['projectId','draftId','authorId','requestKey','requestDigest','expectedDraftVersion','contentDigest'] as const
 if(!['SAVED','NOT_SAVED','UNKNOWN'].includes(receipt.state)||fields.some(field=>receipt[field]!==request[field]))throw Error(error)
 if(receipt.state==='UNKNOWN')return Object.freeze({state:receipt.state,assertCurrent})
 if(receipt.state==='NOT_SAVED'){
  if(!identity(receipt.terminalRef))throw Error(error)
  return Object.freeze({state:receipt.state,terminalRef:receipt.terminalRef,assertCurrent})
 }
 if(![receipt.draftVersion,receipt.receiptRef].every(identity)||receipt.draftVersion===expectedDraftVersion)throw Error(error)
 return Object.freeze({state:receipt.state,projectId,draftId,authorId,requestKey,requestDigest,
  draftVersion:receipt.draftVersion,receiptRef:receipt.receiptRef,contentDigest,assertCurrent})
}

/** 迟到回执只确认已发送的原快照，保留回执之后发生的编辑。 */
export async function reconcileSavedContentDraft(
 saved:Extract<Awaited<ReturnType<typeof readOriginalContentDraftSave>>,{state:'SAVED'}>,
 current:Readonly<{projectId:string;draftId:string;authorId:string;draft:unknown;assertCurrent:()=>void}>){
 const assertCurrent=()=>{saved.assertCurrent();current.assertCurrent()}
 assertCurrent()
 if(current.projectId!==saved.projectId||current.draftId!==saved.draftId||current.authorId!==saved.authorId)
  throw Error('CONTENT_DRAFT_SAVE_RECEIPT_SCOPE')
 const snapshot=canonicalSnapshotValue(current.draft)
 const contentDigest=await hashCanonicalSnapshotText(snapshot)
 assertCurrent()
 if(canonicalSnapshotValue(current.draft)!==snapshot)throw Error('CONTENT_DRAFT_SAVE_STALE')
 return Object.freeze({savedVersion:saved.draftVersion,receiptRef:saved.receiptRef,
  currentState:contentDigest===saved.contentDigest?'MATCHED':'NEWER_EDITS',assertCurrent:()=>{
   assertCurrent()
   if(canonicalSnapshotValue(current.draft)!==snapshot)throw Error('CONTENT_DRAFT_SAVE_STALE')
  }})
}
