/**
 * @module app:services/smart-bid/content/review/delivery-selection-digest
 * 职责：按第48项合同计算固定跨册成员摘要与完整选件摘要。
 * 边界：由权威冻结入口核依赖及并发；此处也供第49、50项独立回读校验。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'

type GroupScope=Readonly<{
 enterpriseId:string;projectId:string;lotId:string;roundId:string;stageId:string;obligationGroupId:string
}>
type Member=Readonly<{manifestId:string;manifestVersion:string;position:string;fileVersionId:string;fileHash:string}>
type Selection=Readonly<{
 requestKey:string;requestDigest:string;selectionId:string;selectionVersion:string;expectedSelectionVersion:string|null
 groupScope:GroupScope;targetBasisRefs:readonly string[];members:readonly Member[]
 compatibilityRefs:readonly string[];checkedStateRefs:readonly string[]
}>
const isDigest=(value:string)=>/^[a-f0-9]{64}$/u.test(value)

/** 成员摘要以明确位置及版本排序，整份结果包含原请求和所有固定证据引用。 */
export async function computeDeliverySelectionDigests(selection:Selection){
 const {requestKey,requestDigest,selectionId,selectionVersion,expectedSelectionVersion,groupScope,
  targetBasisRefs,members,compatibilityRefs,checkedStateRefs}=selection
 if(![requestKey,selectionId,selectionVersion,groupScope.enterpriseId,groupScope.projectId,groupScope.lotId,
  groupScope.roundId,groupScope.stageId,groupScope.obligationGroupId].every(identity)||!isDigest(requestDigest)||
  expectedSelectionVersion!==null&&(!identity(expectedSelectionVersion)||expectedSelectionVersion===selectionVersion)||
  [targetBasisRefs,compatibilityRefs,checkedStateRefs].some(refs=>!refs.length||!refs.every(identity)||new Set(refs).size!==refs.length))
  throw Error('DELIVERY_SELECTION_SCOPE')
 const positions=new Set<string>()
 const ordered=members.map(member=>{
  const {manifestId,manifestVersion,position,fileVersionId,fileHash}=member
  if(![manifestId,manifestVersion,position,fileVersionId].every(identity)||!isDigest(fileHash)||positions.has(position))
   throw Error('DELIVERY_SELECTION_MEMBER')
  positions.add(position)
  return {manifestId,manifestVersion,position,fileVersionId,fileHash}
 }).sort((left,right)=>left.position<right.position?-1:left.position>right.position?1:0)
 if(!ordered.length)throw Error('DELIVERY_SELECTION_MEMBER')
 const memberText=canonicalSnapshotValue(ordered)
 const body={requestKey,requestDigest,selectionId,selectionVersion,expectedSelectionVersion,groupScope:{...groupScope},
  targetBasisRefs:[...targetBasisRefs],members:ordered,compatibilityRefs:[...compatibilityRefs],checkedStateRefs:[...checkedStateRefs]}
 const memberSetHash=await hashCanonicalSnapshotText(memberText)
 const selectionHash=await hashCanonicalSnapshotText(canonicalSnapshotValue({...body,memberSetHash}))
 return Object.freeze({memberSetHash,selectionHash})
}

/** 对从原冻结记录读回的完整结果复算，两份摘要都必须与原登记一致。 */
export async function verifyDeliverySelectionDigests(record:Selection&Readonly<{memberSetHash:string;selectionHash:string}>){
 const {memberSetHash,selectionHash}=record
 const observed=await computeDeliverySelectionDigests(record)
 if(observed.memberSetHash!==memberSetHash||observed.selectionHash!==selectionHash)throw Error('DELIVERY_SELECTION_HASH_MISMATCH')
 return observed
}
