/**
 * @module app:services/smart-bid/content/review/submission-package-members
 * 职责：动作50逐位置核对冻结清单、装封记录和独立实包读取。
 * 边界：包身份、材料准用、审核与签署覆盖由原证据另核。
 */
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'

type ObservedMember=Readonly<{position:string;fileHash:string}>
type RegisteredMember=ObservedMember&Readonly<{fileVersionId:string}>
function index<T extends ObservedMember>(records:readonly T[]):Map<string,T>{
 const result=new Map<string,T>()
 for(const item of records){
  if(!identity(item.position)||!/^[a-f0-9]{64}$/u.test(item.fileHash)||result.has(item.position))
   throw Error('SUBMISSION_PACKAGE_MEMBER_SCOPE')
  result.set(item.position,item)
 }
 return result
}

/** 成员即使同名或同内容，也须按规定位置核原版与实际摘要。 */
export function compareSubmissionPackageMembers(input:Readonly<{
 expected:readonly RegisteredMember[];packed:readonly RegisteredMember[];observed:readonly ObservedMember[]
}>){
 const expected=index(input.expected),packed=index(input.packed),observed=index(input.observed)
 if([...expected.values(),...packed.values()].some(item=>!identity(item.fileVersionId)))throw Error('SUBMISSION_PACKAGE_MEMBER_SCOPE')
 const positions=new Set([...expected.keys(),...packed.keys(),...observed.keys()])
 const members=[...positions].sort().map(position=>{
  const planned=expected.get(position),sealed=packed.get(position),actual=observed.get(position)
  const issues:string[]=[]
  if(!planned)issues.push('UNPLANNED')
  if(!sealed)issues.push('PACKING_RECORD_MISSING')
  if(!actual)issues.push('MEMBER_MISSING')
  if(planned&&sealed&&(planned.fileVersionId!==sealed.fileVersionId||planned.fileHash!==sealed.fileHash))issues.push('PACKED_VERSION_MISMATCH')
  if(sealed&&actual&&sealed.fileHash!==actual.fileHash)issues.push('OBSERVED_HASH_MISMATCH')
  return Object.freeze({position,expectedVersionId:planned?.fileVersionId??null,packedVersionId:sealed?.fileVersionId??null,
   expectedHash:planned?.fileHash??null,packedHash:sealed?.fileHash??null,observedHash:actual?.fileHash??null,issues:Object.freeze(issues)})
 })
 return Object.freeze({members:Object.freeze(members),membershipMatches:members.length>0&&members.every(item=>!item.issues.length)})
}
