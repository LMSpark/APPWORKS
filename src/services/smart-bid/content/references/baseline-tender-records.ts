/** @module app:services/smart-bid/content/references/baseline-tender-records
 * 职责：校验基线固定的核定记录引用。
 */
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from './snapshot-reference-values'

/** 核验原来源引用，实际存在性与核定权由业务宿主确认。 */
export function readTenderRecordReference(item:unknown){
 const error='BASELINE_TENDER_RECORD_MODEL'
  const fields=snapshotReferenceFields(item,['runId','type','ordinal','recordVersion','recordHash'],error)
  const {runId,type,ordinal,recordVersion,recordHash}=fields
  if(!snapshotReferenceIdentity(runId)||!snapshotReferenceIdentity(type)||!snapshotReferenceIdentity(recordVersion)
   ||typeof ordinal!=='number'||!Number.isSafeInteger(ordinal)||ordinal<0
   ||typeof recordHash!=='string'||!/^[0-9a-f]{64}$/u.test(recordHash))throw Error(error)
 return Object.freeze({runId,type,ordinal,recordVersion,recordHash})
}
function tenderReference(item:unknown){
 const {runId,type,ordinal,recordVersion,recordHash}=readTenderRecordReference(item)
 return {identity:JSON.stringify([runId,type,ordinal]),version:JSON.stringify([recordVersion,recordHash])}
}
function fixedVersions(value:unknown):Map<string,string>{
 const versions=new Map<string,string>()
 visitSnapshotReferences(value,item=>{
  const {identity,version}=tenderReference(item)
  if(versions.has(identity))throw Error('BASELINE_TENDER_RECORD_DUPLICATE')
  versions.set(identity,version)
 },'BASELINE_TENDER_RECORD_MODEL')
 return versions
}
/** 核验整份固定引用目录。 */
export function assertBaselineTenderRecords(value:unknown):void {
 fixedVersions(value)
}
/** 精确核对核定版和摘要，不回退到同序号的其它版本。 */
export function assertBaselineTenderRecordMember(value:unknown,selected:unknown):void {
 const {identity,version}=tenderReference(selected)
 if(fixedVersions(value).get(identity)!==version)throw Error('BASELINE_TENDER_RECORD_MISSING')
}
