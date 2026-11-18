/**
 * @module app:services/smart-bid/content/review/delivery-freeze-recovery
 * 职责：核对第48项原冻结结果，随原读取权限和记录版本失效。
 */
import {verifyDeliverySelectionDigests} from './delivery-selection-digest'
import {canonicalSnapshotValue} from '../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'

type Record=Parameters<typeof verifyDeliverySelectionDigests>[0]
type Request=Pick<Record,'groupScope'|'requestKey'|'requestDigest'>
type AuthorityResult=Readonly<{request:Request;assertCurrent:()=>void}>&(
 Readonly<{status:'FROZEN';record:Record}>|
 Readonly<{status:'NOT_EFFECTIVE';terminalRef:string}>|
 Readonly<{status:'UNKNOWN'}>
)

/** 空回读保持未知，只有原请求的权威终结才能确认未生效。 */
export async function readOriginalDeliveryFreeze(input:Request,
 source:Readonly<{lookup:(request:Request)=>Promise<AuthorityResult|undefined>;assertCurrent:()=>void}>){
 source.assertCurrent()
 const request=Object.freeze({...input,groupScope:Object.freeze({...input.groupScope})})
 const {enterpriseId,projectId,lotId,roundId,stageId,obligationGroupId}=request.groupScope
 if(![enterpriseId,projectId,lotId,roundId,stageId,obligationGroupId,request.requestKey].every(identity)||
  !/^[a-f0-9]{64}$/u.test(request.requestDigest))throw Error('DELIVERY_FREEZE_REQUEST_SCOPE')
 const signature=(value:Request)=>canonicalSnapshotValue({
  groupScope:value.groupScope,requestKey:value.requestKey,requestDigest:value.requestDigest,
 })
 const result=await source.lookup(request)
 const assertCurrent=()=>{source.assertCurrent();result?.assertCurrent()}
 assertCurrent()
 if(!result)return Object.freeze({status:'UNKNOWN' as const,assertCurrent})
 if(signature(result.request)!==signature(request))throw Error('DELIVERY_FREEZE_REQUEST_SCOPE')
 if(result.status==='UNKNOWN')return Object.freeze({status:result.status,assertCurrent})
 if(result.status==='NOT_EFFECTIVE'){
  if(!identity(result.terminalRef))throw Error('DELIVERY_FREEZE_TERMINAL_EVIDENCE')
  return Object.freeze({status:result.status,terminalRef:result.terminalRef,assertCurrent})
 }
 const record=structuredClone(result.record)
 if(signature(record)!==signature(request))throw Error('DELIVERY_FREEZE_REQUEST_SCOPE')
 await verifyDeliverySelectionDigests(record)
 assertCurrent()
 const immutable=Object.freeze({...record,groupScope:Object.freeze(record.groupScope),members:Object.freeze(record.members.map(member=>Object.freeze(member))),
  targetBasisRefs:Object.freeze(record.targetBasisRefs),compatibilityRefs:Object.freeze(record.compatibilityRefs),
  checkedStateRefs:Object.freeze(record.checkedStateRefs)})
 return Object.freeze({status:result.status,record:immutable,assertCurrent})
}
