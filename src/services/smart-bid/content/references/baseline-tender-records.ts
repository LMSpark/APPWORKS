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
type TenderRecord=ReturnType<typeof readTenderRecordReference>
const referenceKey=({runId,type,ordinal}:TenderRecord)=>JSON.stringify([runId,type,ordinal])

/** 核验整份固定引用目录并返回原记录版。 */
export function readBaselineTenderRecords(value:unknown):ReadonlyMap<string,TenderRecord>{
 const versions=new Map<string,TenderRecord>()
 visitSnapshotReferences(value,item=>{
  const record=readTenderRecordReference(item),key=referenceKey(record)
  if(versions.has(key))throw Error('BASELINE_TENDER_RECORD_DUPLICATE')
  versions.set(key,record)
 },'BASELINE_TENDER_RECORD_MODEL')
 return versions
}

/** 核验整份固定引用目录。 */
export function assertBaselineTenderRecords(value:unknown):void {
 readBaselineTenderRecords(value)
}
/** 精确核对核定版和摘要，不回退到同序号的其它版本。 */
export function assertBaselineTenderRecordMember(value:unknown,selected:unknown):void {
 const expected=readTenderRecordReference(selected),record=readBaselineTenderRecords(value).get(referenceKey(expected))
 if(record?.recordVersion!==expected.recordVersion||record.recordHash!==expected.recordHash)throw Error('BASELINE_TENDER_RECORD_MISSING')
}
