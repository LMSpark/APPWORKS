/**
 * @module app:services/smart-bid/content/hashes/qualification-review-hash
 * 职责：固定审核范围选中的完整资格核验记录。
 * 边界：标段、落点与本次使用由正式范围核定；摘要不判定资格通过。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceIdentity,snapshotReferenceRecord,visitSnapshotReferences} from '../references/snapshot-reference-values'

/** 仅使用固定快照中精确选中的核验记录，保留原证据及结论字段。 */
export async function hashQualificationReviews(records:unknown,reviewIds:readonly string[]):Promise<string>{
 const expected=new Set(reviewIds),seen=new Set<string>(),selected:Array<{id:string;record:Record<string,unknown>}>=[]
 if(expected.size!==reviewIds.length||!reviewIds.every(snapshotReferenceIdentity))throw Error('CONTENT_QUALIFICATION_SCOPE')
 const error='CONTENT_QUALIFICATION_MODEL'
 visitSnapshotReferences(records,value=>{
  const record=snapshotReferenceRecord(value,error),id=record['id']
  if(!snapshotReferenceIdentity(id)||seen.has(id))throw Error(error)
  seen.add(id)
  if(expected.has(id))selected.push({id,record})
 },error)
 if(selected.length!==expected.size)throw Error('CONTENT_QUALIFICATION_SCOPE')
 selected.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)
 return hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.qualification-reviews/1',selected.map(item=>item.record)]))
}
