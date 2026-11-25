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

/** 当前正式草稿与原保存回执的版本和内容核验结果。 */
export type SavedContentDraftComparison=Readonly<{
 /** 原保存回执确认的版本。 */
 savedVersion:string
 /** 当前查询可读并已核验的已保存版本。 */
 currentVersion:string
 /** 原保存回执的正式引用。 */
 receiptRef:string
 /** 同版同内容、版本差异及同版内容差异各有独立结论。 */
 currentState:'MATCHED'|'VERSION_MISMATCH'|'CONTENT_MISMATCH'
 /** 重新校验原回执、当前结果及捕获的版本和内容。 */
 assertCurrent:()=>void
}>

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

/** 将原保存版本与当前正式读取的已保存草稿比较，版本与内容各自验证。 */
export async function reconcileSavedContentDraft(
 saved:Extract<Awaited<ReturnType<typeof readOriginalContentDraftSave>>,{state:'SAVED'}>,
 current:Readonly<{projectId:string;draftId:string;authorId:string;draftVersion:string;draft:unknown;assertCurrent:()=>void}>):Promise<SavedContentDraftComparison>{
 const assertCurrent=()=>{saved.assertCurrent();current.assertCurrent()}
 assertCurrent()
 if(current.projectId!==saved.projectId||current.draftId!==saved.draftId||current.authorId!==saved.authorId)
  throw Error('CONTENT_DRAFT_SAVE_RECEIPT_SCOPE')
 const currentVersion=current.draftVersion
 if(!identity(currentVersion))throw Error('CONTENT_DRAFT_SAVE_COMPARISON_UNAVAILABLE')
 const snapshot=canonicalSnapshotValue(current.draft)
 const assertSnapshot=()=>{
  assertCurrent()
  if(current.draftVersion!==currentVersion||canonicalSnapshotValue(current.draft)!==snapshot)throw Error('CONTENT_DRAFT_SAVE_STALE')
 }
 const contentDigest=await hashCanonicalSnapshotText(snapshot)
 assertSnapshot()
 const currentState=currentVersion!==saved.draftVersion ? 'VERSION_MISMATCH'
  : contentDigest===saved.contentDigest ? 'MATCHED' : 'CONTENT_MISMATCH'
 return Object.freeze({savedVersion:saved.draftVersion,currentVersion,receiptRef:saved.receiptRef,
  currentState,assertCurrent:assertSnapshot})
}
