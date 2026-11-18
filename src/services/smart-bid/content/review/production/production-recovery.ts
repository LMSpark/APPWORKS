/**
 * @module app:services/smart-bid/content/review/production/production-recovery
 * 职责：按原制作请求复核完成、在办或未知结果。
 */
import type {prepareProductionRequest} from './production-request'
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'

type Request=Pick<Awaited<ReturnType<typeof prepareProductionRequest>>['request'],
 'projectId'|'documentId'|'revisionId'|'requestKey'|'inputDigest'|'purpose'>
type File=Readonly<{producedFileId:string;productionRequestRef:string;fileHash:string;completedScopeRefs:readonly string[]}>
type Outcome=Readonly<{request:Request;assertCurrent:()=>void}>&(
 Readonly<{state:'UNKNOWN'|'IN_PROGRESS'}>|
 Readonly<{state:'COMPLETED';file:File}>|
 Readonly<{state:'NOT_EFFECTIVE';terminalRef:string}>
)
const keys=['projectId','documentId','revisionId','requestKey','inputDigest','purpose'] as const

/** 空查回应视为未知；原结果有效时仍只交待核件。 */
export async function recoverProductionRequest(request:Request,source:Readonly<{
 lookup:(request:Request)=>Promise<Outcome|undefined>;assertCurrent:()=>void
}>){
 const selection=Object.freeze({...request})
 if(!keys.every(key=>identity(selection[key]))||!/^[a-f0-9]{64}$/u.test(selection.inputDigest)||
  !['REVIEW','FORMAL'].includes(selection.purpose))throw Error('BID_PRODUCTION_RECOVERY_SCOPE')
 source.assertCurrent()
 const result=await source.lookup(selection)
 const assertCurrent=()=>{source.assertCurrent();result?.assertCurrent()}
 assertCurrent()
 if(!result)return Object.freeze({state:'UNKNOWN' as const,assertCurrent})
 if(keys.some(key=>result.request[key]!==selection[key]))throw Error('BID_PRODUCTION_RECOVERY_SCOPE')
 if(result.state==='NOT_EFFECTIVE'){
  if(!identity(result.terminalRef))throw Error('BID_PRODUCTION_RECOVERY_RECEIPT')
  return Object.freeze({state:result.state,terminalRef:result.terminalRef,assertCurrent})
 }
 if(result.state!=='COMPLETED')return Object.freeze({state:result.state,assertCurrent})
 const {producedFileId,productionRequestRef,fileHash,completedScopeRefs}=result.file
 if(!identity(producedFileId)||!identity(productionRequestRef)||!/^[a-f0-9]{64}$/u.test(fileHash)||!completedScopeRefs.length||
  new Set(completedScopeRefs).size!==completedScopeRefs.length||!completedScopeRefs.every(identity))
  throw Error('BID_PRODUCTION_RECOVERY_RECEIPT')
 return Object.freeze({state:result.state,request:selection,producedFileId,productionRequestRef,fileHash,
  completedScopeRefs:Object.freeze([...completedScopeRefs]),
  requiresFileVerification:true as const,assertCurrent})
}
