/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-produced-file-review
 * 职责：为动作45重新打开动作41登记的电子实件并复算文件摘要。
 * 边界：文件和登记读取方核原授权；不登记、签署、保存或代纸件验收。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'

type FileSelection=Readonly<{projectId:string;producedFileId:string;productionRequestRef:string}>
type RegisteredFile=FileSelection&Readonly<{
 revisionId:string;documentId:string;fileHash:string
 assertCurrent:()=>void;reopen:()=>Promise<ArrayBuffer>
}>

/** 沿原制作请求及文件身份重开，读实件字节产生可交审核的版本摘要。 */
export async function readProducedFileReviewVersion(selection:FileSelection,readOriginal:(input:FileSelection)=>Promise<RegisteredFile>){
 const {projectId,producedFileId,productionRequestRef}=selection
 if(![projectId,producedFileId,productionRequestRef].every(identity))throw Error('CONTENT_PRODUCED_FILE_SCOPE')
 const record=await readOriginal(Object.freeze({projectId,producedFileId,productionRequestRef}))
 record.assertCurrent()
 const {revisionId,documentId,fileHash}=record
 if(record.projectId!==projectId||record.producedFileId!==producedFileId||record.productionRequestRef!==productionRequestRef||
  !identity(revisionId)||!identity(documentId)||!/^[a-f0-9]{64}$/u.test(fileHash))throw Error('CONTENT_PRODUCED_FILE_SCOPE')
 const bytes=await record.reopen()
 record.assertCurrent()
 if(bytes.byteLength===0)throw Error('CONTENT_PRODUCED_FILE_EMPTY')
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes)
 const versionHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
 record.assertCurrent()
 if(versionHash!==fileHash)throw Error('CONTENT_PRODUCED_FILE_HASH_MISMATCH')
 return Object.freeze({projectId,producedFileId,productionRequestRef,revisionId,documentId,versionHash,
  assertCurrent:()=>record.assertCurrent()})
}
