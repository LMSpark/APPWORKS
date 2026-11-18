/**
 * @module app:services/smart-bid/content/review/submission/signature-request
 * 职责：动作46核同版待签对象、签署位置及代表权，生成待办理请求。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'
import {checkRegisteredAuthorityGrant} from './authority-grant-coverage'

type Target=Readonly<{projectId:string;objectKind:'FILE'|'PACKAGE';objectRef:string;objectVersion:string;objectHash:string;positionRef:string}>
type Request=Target&Readonly<{requestKey:string;enterpriseId:string;signerRef:string;grantId:string;actionAt:string;knownAt:string}>
type Basis=Target&Readonly<{requirementRef:string;coverageRef:string;approved:boolean;assertCurrent:()=>void}>
const targetKeys=['projectId','objectKind','objectRef','objectVersion','objectHash','positionRef'] as const

/** 实际签署由获准工具办理，此处固定同一请求及使用依据。 */
export async function prepareSignatureRequest(input:Request,basis:Basis,source:Parameters<typeof checkRegisteredAuthorityGrant>[1]){
 basis.assertCurrent()
 if(![...targetKeys.map(key=>input[key]),input.requestKey,input.enterpriseId,input.signerRef,input.grantId,
  basis.requirementRef,basis.coverageRef].every(identity)||!['FILE','PACKAGE'].includes(input.objectKind)||
  !/^[a-f0-9]{64}$/u.test(input.objectHash)||targetKeys.some(key=>basis[key]!==input[key])||basis.approved!==true)
  throw Error('BID_SIGNATURE_TARGET_SCOPE')
 const {projectId,objectKind,objectRef,objectVersion,objectHash,positionRef,requestKey,enterpriseId,signerRef,grantId,actionAt,knownAt}=input
 const grant=checkRegisteredAuthorityGrant({projectId,objectRef,enterpriseId,grantId,representativeId:signerRef,
  action:'SIGN',actionAt,knownAt},source)
 if(grant.state!=='COVERED'||!identity(grant.versionId)||!identity(grant.decisionRef))throw Error('BID_SIGNATURE_AUTHORITY_REQUIRED')
 const record=Object.freeze({projectId,objectKind,objectRef,objectVersion,objectHash,positionRef,requestKey,enterpriseId,signerRef,
  grantId,actionAt,knownAt,requirementRef:basis.requirementRef,coverageRef:basis.coverageRef,
  authorityVersionId:grant.versionId,authorityDecisionRef:grant.decisionRef})
 const assertCurrent=()=>{
  basis.assertCurrent();grant.assertCurrent()
  if(targetKeys.some(key=>basis[key]!==record[key])||basis.requirementRef!==record.requirementRef||
   basis.coverageRef!==record.coverageRef||basis.approved!==true)throw Error('BID_SIGNATURE_TARGET_SCOPE')
 }
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.signature-request/1',record]))
 assertCurrent()
 return Object.freeze({record,requestDigest,assertCurrent})
}

type OriginalSignature=Target&Readonly<{signerRef:string;requestKey:string;requestDigest:string}>
type SignatureResult=Readonly<{request:OriginalSignature;assertCurrent:()=>void}>&(
 Readonly<{state:'UNKNOWN'|'IN_PROGRESS'}>|
 Readonly<{state:'NOT_EFFECTIVE';terminalRef:string}>|
 Readonly<{state:'SIGNED';operationRef:string;signatureRecordId:string;signedObjectRef:string;signedObjectHash:string}>
)
const recoveryKeys=[...targetKeys,'signerRef','requestKey','requestDigest'] as const

/** 只查已发原请求，独立验证签后实件与登记仍由后续动作办理。 */
export async function recoverSignatureRequest(input:OriginalSignature,source:Readonly<{
 lookup:(request:OriginalSignature)=>Promise<SignatureResult|undefined>;assertCurrent:()=>void
}>){
 const request=Object.freeze({...input})
 if(!recoveryKeys.every(key=>identity(request[key]))||!['FILE','PACKAGE'].includes(request.objectKind)||
  ![request.objectHash,request.requestDigest].every(hash=>/^[a-f0-9]{64}$/u.test(hash)))throw Error('BID_SIGNATURE_RECOVERY_SCOPE')
 source.assertCurrent()
 const result=await source.lookup(request)
 const assertCurrent=()=>{
  source.assertCurrent()
  result?.assertCurrent()
  if(result&&recoveryKeys.some(key=>result.request[key]!==request[key]))throw Error('BID_SIGNATURE_RECOVERY_SCOPE')
 }
 assertCurrent()
 if(result===undefined)return Object.freeze({state:'UNKNOWN' as const,assertCurrent})
 if(result.state==='NOT_EFFECTIVE'){
  if(!identity(result.terminalRef))throw Error('BID_SIGNATURE_RECOVERY_RECEIPT')
  return Object.freeze({state:result.state,terminalRef:result.terminalRef,assertCurrent})
 }
 if(result.state==='SIGNED'){
  const {operationRef,signatureRecordId,signedObjectRef,signedObjectHash}=result
  if(![operationRef,signatureRecordId,signedObjectRef].every(identity)||!/^[a-f0-9]{64}$/u.test(signedObjectHash))
   throw Error('BID_SIGNATURE_RECOVERY_RECEIPT')
  return Object.freeze({state:result.state,request,operationRef,signatureRecordId,signedObjectRef,signedObjectHash,assertCurrent})
 }
 return Object.freeze({state:result.state,assertCurrent})
}
