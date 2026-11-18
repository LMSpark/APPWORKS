/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-delivery-package-preparation
 * 职责：第49项在获得本次用途和封装范围证明后，从原冻结读回制待核包。
 */
import {packFrozenDeliveryZip} from '@/services/smart-bid/content/review/delivery-zip-packing'
import {readRegisteredDeliveryFreeze} from './content-delivery-freeze-reader'

type Host=Parameters<typeof readRegisteredDeliveryFreeze>[0]
type Request=Parameters<typeof readRegisteredDeliveryFreeze>[1]
type Packing=Parameters<typeof packFrozenDeliveryZip>[0]
type UseScope=Readonly<{request:Request;selectionId:string;selectionVersion:string;selectionHash:string;positions:readonly string[]}>
type UseProof=Readonly<{allowed:boolean;selectionHash:string;positions:readonly string[];assertCurrent:()=>void}>

/** 原冻结成功只证明历史结果，当前封装仍须核同一选件及位置。 */
export async function prepareRegisteredDeliveryZipPackage(host:Host,request:Request,input:Pick<Packing,'positions'|'maxMemberBytes'|'openOriginal'>&Readonly<{
 readCurrentUse:(scope:UseScope)=>Promise<UseProof>
}>){
 const positions=Object.freeze([...input.positions])
 const {maxMemberBytes,openOriginal,readCurrentUse}=input
 const original=await readRegisteredDeliveryFreeze(host,request)
 original.assertCurrent()
 if(original.status!=='FROZEN')return original
 const {record}=original
 const {groupScope,requestKey,requestDigest,selectionId,selectionVersion,selectionHash}=record
 const proof=await readCurrentUse(Object.freeze({
  request:Object.freeze({groupScope,requestKey,requestDigest}),selectionId,selectionVersion,selectionHash,positions,
 }))
 const assertCurrent=()=>{original.assertCurrent();proof.assertCurrent()}
 assertCurrent()
 const approved=new Set(proof.positions)
 if(!proof.allowed||proof.selectionHash!==selectionHash||approved.size!==proof.positions.length||
  positions.length!==approved.size||new Set(positions).size!==positions.length||positions.some(position=>!approved.has(position)))
  throw Error('DELIVERY_PACK_CURRENT_USE_REQUIRED')
 const candidate=await packFrozenDeliveryZip({record,positions,maxMemberBytes,openOriginal,assertCurrent})
 return Object.freeze({status:'PREPARED' as const,candidate,assertCurrent:candidate.assertCurrent})
}
