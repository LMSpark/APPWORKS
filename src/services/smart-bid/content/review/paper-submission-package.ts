/**
 * @module app:services/smart-bid/content/review/paper-submission-package
 * 职责：第50项核同一纸件封装的应装、实装和独立清点。
 * 边界：按正式来源证明比较，实际装封和见证由各自办理方提供。
 * AI用途：定位纸件的版次、份数或位置差异，并判断缺项是否仍待清点。
 */
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'

/** 同一纸件封装与已冻结交付范围的身份。 */
type Scope=Readonly<{projectId:string;packageId:string;sealRef:string;selectionHash:string}>
/** 纸件分配位置、版本和份次。 */
type Member=Readonly<{position:string;paperRef:string;versionRef:string;copies:number}>
/** 保留原业务来源有效性检查的证据。 */
type Evidence<T>=T&Readonly<{assertCurrent:()=>void}>
const scopeKeys=['projectId','packageId','sealRef','selectionHash'] as const

function index(members:readonly Member[]){
 const result=new Map<string,Member>()
 for(const member of members){
  const {position,paperRef,versionRef,copies}=member
  if(![position,paperRef,versionRef].every(identity)||!Number.isSafeInteger(copies)||copies<1||result.has(position))
   throw Error('PAPER_SUBMISSION_MEMBER_SCOPE')
  result.set(position,member)
 }
 return result
}

/** 不完整清点可报告已见差异，缺项只记待核。 */
export function reviewPaperSubmissionPackage(scope:Scope,source:Readonly<{
 frozen:Evidence<Pick<Scope,'projectId'|'selectionHash'>&Readonly<{members:readonly Member[]}>>
 packed:Evidence<Scope&Readonly<{packingRef:string;members:readonly Member[]}>>
 observed:Evidence<Scope&Readonly<{witnessRef:string;complete:boolean;members:readonly Member[]}>>
}>){
 const {frozen,packed,observed}=source
 const assertCurrent=()=>{frozen.assertCurrent();packed.assertCurrent();observed.assertCurrent()}
 assertCurrent()
 if(![scope.projectId,scope.packageId,scope.sealRef,packed.packingRef,observed.witnessRef].every(identity)||
  !/^[a-f0-9]{64}$/u.test(scope.selectionHash)||frozen.projectId!==scope.projectId||frozen.selectionHash!==scope.selectionHash||
  scopeKeys.some(field=>packed[field]!==scope[field]||observed[field]!==scope[field])||typeof observed.complete!=='boolean')
  throw Error('PAPER_SUBMISSION_PACKAGE_SCOPE')
 const expected=index(frozen.members),declared=index(packed.members),actual=index(observed.members)
 const positions=[...new Set([...expected.keys(),...declared.keys(),...actual.keys()])].sort()
 const sameVersion=(left:Member,right:Member)=>left.paperRef===right.paperRef&&left.versionRef===right.versionRef
 const members=positions.map(position=>{
  const plan=expected.get(position),record=declared.get(position),seen=actual.get(position),issues:string[]=[]
  if(!plan)issues.push('UNPLANNED')
  if(!record)issues.push('PACKING_RECORD_MISSING')
  if(!seen)issues.push(observed.complete?'MEMBER_MISSING':'COUNT_PENDING')
  if(plan&&record&&(!sameVersion(plan,record)||plan.copies!==record.copies))issues.push('PACKING_MISMATCH')
  if(record&&seen&&!sameVersion(record,seen))issues.push('OBSERVED_VERSION_MISMATCH')
  if(record&&seen&&record.copies!==seen.copies)issues.push('COPY_COUNT_MISMATCH')
  return Object.freeze({position,expected:plan?Object.freeze({...plan}):null,packed:record?Object.freeze({...record}):null,
   observed:seen?Object.freeze({...seen}):null,issues:Object.freeze(issues)})
 })
 assertCurrent()
 return Object.freeze({...scope,packingRef:packed.packingRef,witnessRef:observed.witnessRef,
  membershipMatches:observed.complete&&members.length>0&&members.every(item=>item.issues.length===0),
  members:Object.freeze(members),assertCurrent})
}
