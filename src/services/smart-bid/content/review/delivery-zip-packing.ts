/**
 * @module app:services/smart-bid/content/review/delivery-zip-packing
 * 职责：第49项按固定选件和本包指定位置封装电子待核包。
 * 边界：原文件读取方负责授权；生成后另行登记、复核和签署。
 */
import {Uint8ArrayReader,Uint8ArrayWriter,ZipWriter} from '@zip.js/zip.js'
import {verifyDeliverySelectionDigests} from './delivery-selection-digest'
import {hashContentBytes} from '../revision-snapshot-hash'

type FrozenSelection=Parameters<typeof verifyDeliverySelectionDigests>[0]
type Member=FrozenSelection['members'][number]
type OriginalFile=Readonly<{
 projectId:string;fileVersionId:string;bytes:ArrayBuffer;assertCurrent:()=>void
}>

/** 逐件核登记版本和实件摘要，任何不符都不给出待核包。 */
export async function packFrozenDeliveryZip(input:Readonly<{
 record:FrozenSelection;positions:readonly string[];maxMemberBytes:number;assertCurrent:()=>void
 openOriginal:(member:Member)=>Promise<OriginalFile>
}>){
 const {maxMemberBytes,openOriginal}=input
 input.assertCurrent()
 const record=structuredClone(input.record),positions=[...input.positions].sort()
 if(!Number.isSafeInteger(maxMemberBytes)||maxMemberBytes<1)throw Error('DELIVERY_PACK_LIMIT')
 const byPosition=new Map(record.members.map(member=>[member.position,member]))
 if(!positions.length||new Set(positions).size!==positions.length||positions.some(path=>
  !byPosition.has(path)||path.includes('\\')||path.includes('\0')||path.split('/').some(part=>!part||part==='.'||part==='..')))
  throw Error('DELIVERY_PACK_POSITION')
 await verifyDeliverySelectionDigests(record)
 const reads:Array<()=>void>=[]
 const assertCurrent=()=>{input.assertCurrent();for(const assertRead of reads)assertRead()}
 const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false})
 const packed:Member[]=[]
 let total=0
 for(const position of positions){
  assertCurrent()
  const member=byPosition.get(position)
  if(!member)throw Error('DELIVERY_PACK_POSITION')
  const expected=Object.freeze(member)
  const original=await openOriginal(expected)
  assertCurrent();original.assertCurrent()
  if(original.projectId!==record.groupScope.projectId||original.fileVersionId!==expected.fileVersionId)
   throw Error('DELIVERY_PACK_VERSION')
  total+=original.bytes.byteLength
  if(total>maxMemberBytes)throw Error('DELIVERY_PACK_LIMIT')
  const bytes=new Uint8Array(original.bytes.slice(0))
  if(await hashContentBytes(bytes)!==expected.fileHash)throw Error('DELIVERY_PACK_HASH')
  original.assertCurrent()
  reads.push(()=>original.assertCurrent())
  await writer.add(position,new Uint8ArrayReader(bytes),{lastModDate:new Date(2000,0,1),extendedTimestamp:false})
  packed.push(expected)
 }
 const archive=await writer.close()
 const bytes=Uint8Array.from(archive).buffer
 const packageHash=await hashContentBytes(bytes)
 assertCurrent()
 return Object.freeze({projectId:record.groupScope.projectId,selectionId:record.selectionId,
  selectionVersion:record.selectionVersion,selectionHash:record.selectionHash,packageHash,bytes,
  packed:Object.freeze(packed),assertCurrent})
}
