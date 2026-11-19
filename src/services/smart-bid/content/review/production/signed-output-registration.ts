/**
 * @module app:services/smart-bid/content/review/production/signed-output-registration
 * 职责：动作41按原签署回执关联签前件与实际签后文件。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import {hashContentBytes} from '../../revision-snapshot-hash'
import type {recoverSignatureRequest} from '../submission/signature-request'

type FileScope=Readonly<{projectId:string;documentId:string;revisionId:string}>
type SignedReceipt=FileScope&Readonly<{
 signatureOperationRef:string;signatureRecordId:string;originalFileId:string;originalHash:string
 signedObjectRef:string;resourceVersionId:string;fileHash:string;assertCurrent:()=>void
}>
type Recovered=Extract<Awaited<ReturnType<typeof recoverSignatureRequest>>,{state:'SIGNED'}>

/** 只准备签后登记，签署和验签分别消费各自的原办理凭据。 */
export async function prepareSignedOutputRegistration(
 original:FileScope&Readonly<{producedFileId:string;objectVersion:string;versionHash:string;assertCurrent:()=>void}>,
 receipt:SignedReceipt,{recovered,open}:Readonly<{recovered:Recovered;
 open:(input:Readonly<{projectId:string;resourceVersionId:string}>)=>Promise<Readonly<{
  projectId:string;resourceVersionId:string;bytes:ArrayBuffer;assertCurrent:()=>void
 }>>}>,
){
 const {projectId,documentId,revisionId,signatureOperationRef,signatureRecordId,originalFileId,originalHash,
  signedObjectRef,resourceVersionId,fileHash}=receipt
 const record=Object.freeze({projectId,documentId,revisionId,signatureOperationRef,signatureRecordId,originalFileId,
  originalHash,signedObjectRef,resourceVersionId,fileHash})
 const {requestKey,requestDigest,objectVersion,signerRef,positionRef}=recovered.request
 const signing=Object.freeze({requestKey,requestDigest,objectVersion,signerRef,positionRef})
 const assertOrigin=()=>{
  original.assertCurrent()
  receipt.assertCurrent()
  recovered.assertCurrent()
  if(original.projectId!==projectId||original.documentId!==documentId||original.revisionId!==revisionId||
   original.producedFileId!==originalFileId||original.versionHash!==originalHash||
   recovered.request.projectId!==projectId||recovered.request.objectKind!=='FILE'||
   recovered.request.objectRef!==originalFileId||recovered.request.objectVersion!==original.objectVersion||
   recovered.request.objectHash!==originalHash||
   recovered.operationRef!==signatureOperationRef||recovered.signatureRecordId!==signatureRecordId||
   recovered.signedObjectRef!==signedObjectRef||recovered.signedObjectHash!==fileHash||
   recovered.request.requestKey!==requestKey||recovered.request.requestDigest!==requestDigest||
   recovered.request.objectVersion!==objectVersion||recovered.request.signerRef!==signerRef||recovered.request.positionRef!==positionRef||
   receipt.projectId!==projectId||receipt.documentId!==documentId||receipt.revisionId!==revisionId||
   receipt.signatureOperationRef!==signatureOperationRef||receipt.signatureRecordId!==signatureRecordId||
   receipt.originalFileId!==originalFileId||receipt.originalHash!==originalHash||receipt.signedObjectRef!==signedObjectRef||
   receipt.resourceVersionId!==resourceVersionId||receipt.fileHash!==fileHash)
   throw Error('BID_SIGNED_OUTPUT_SCOPE')
 }
 assertOrigin()
 if(![projectId,documentId,revisionId,signatureOperationRef,signatureRecordId,originalFileId,resourceVersionId].every(identity)||
  ![originalHash,fileHash].every(hash=>/^[a-f0-9]{64}$/u.test(hash))||fileHash===originalHash)
  throw Error('BID_SIGNED_OUTPUT_SCOPE')
 const resource=await open(Object.freeze({projectId,resourceVersionId}))
 const assertCurrent=()=>{
  assertOrigin()
  resource.assertCurrent()
  if(resource.projectId!==projectId||resource.resourceVersionId!==resourceVersionId)throw Error('BID_SIGNED_OUTPUT_RESOURCE')
 }
 assertCurrent()
 if(resource.bytes.byteLength===0||await hashContentBytes(resource.bytes)!==fileHash)throw Error('BID_SIGNED_OUTPUT_HASH')
 assertCurrent()
 return Object.freeze({record:Object.freeze({...record,signing}),assertCurrent})
}
