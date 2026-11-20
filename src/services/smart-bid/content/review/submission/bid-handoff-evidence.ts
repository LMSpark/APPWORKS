/**
 * @module app:services/smart-bid/content/review/submission/bid-handoff-evidence
 * 职责：第59项核本轮实际签收，按固定事项版本交接后续责任。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'

type Scope=Readonly<{projectId:string;lotId:string;roundId:string;stageId:string}>
type Item=Readonly<{
 id:string;versionRef:string;originalAssigneeId:string;receiverId:string;openIssueRefs:readonly string[]
 followupRef:string|null;nextDueAt:string|null
}>
type Receipt=Scope&Readonly<{
 itemId:string;versionRef:string;receiverId:string;taskReceiptRef:string;state:'ACCEPTED'|'RETURNED'
 assertCurrent:()=>void
}>

/** 当前版有权签收才接续责任；旧版签收保留供回查。 */
export function assessBidHandoff(scope:Scope,source:Readonly<{
 items:readonly Item[];receipts:readonly Receipt[];assertCurrent:()=>void
}>){
 const receipts=[...source.receipts]
 const assertCurrent=()=>{source.assertCurrent();for(const receipt of receipts)receipt.assertCurrent()}
 assertCurrent()
 const keys=['projectId','lotId','roundId','stageId'] as const
 const itemIds=new Set(source.items.map(item=>item.id))
 const error='BID_HANDOFF_SCOPE'
 if(keys.some(key=>!identity(scope[key]))||itemIds.size!==source.items.length)throw Error(error)
 const receiptKey=(id:string,version:string)=>JSON.stringify([id,version])
 const byVersion=new Map<string,Receipt>()
 const receiptRefs=new Set<string>()
 for(const receipt of receipts){
  const key=receiptKey(receipt.itemId,receipt.versionRef)
  if(keys.some(field=>scope[field]!==receipt[field])||!itemIds.has(receipt.itemId)||
   ![receipt.taskReceiptRef,receipt.versionRef,receipt.receiverId].every(identity)||byVersion.has(key)||
   receiptRefs.has(receipt.taskReceiptRef))throw Error(error)
  byVersion.set(key,receipt)
  receiptRefs.add(receipt.taskReceiptRef)
 }
 const items=source.items.map(item=>{
  const {id,versionRef,originalAssigneeId,receiverId,followupRef,nextDueAt}=item
  const openIssueRefs=Object.freeze([...item.openIssueRefs])
  if(![id,versionRef,originalAssigneeId,receiverId,...openIssueRefs].every(identity)||
   new Set(openIssueRefs).size!==openIssueRefs.length)throw Error(error)
  const receipt=byVersion.get(receiptKey(id,versionRef))
  if(receipt&&receipt.receiverId!==receiverId)throw Error(error)
  const hasFollowup=openIssueRefs.length===0||
   identity(followupRef)&&nextDueAt!==null&&Number.isFinite(Date.parse(nextDueAt))&&/(?:Z|[+-]\d{2}:\d{2})$/u.test(nextDueAt)
  const state=!hasFollowup?'FOLLOWUP_REQUIRED':receipt?.state==='ACCEPTED'?'ACCEPTED':
   receipt?.state==='RETURNED'?'RETURNED':'AWAITING_ACCEPTANCE'
  return Object.freeze({id,versionRef,originalAssigneeId,receiverId,followupRef,nextDueAt,openIssueRefs,state,
   taskReceiptRef:receipt?.taskReceiptRef??null,trackingAssigneeId:state==='ACCEPTED'?receiverId:originalAssigneeId})
 })
 assertCurrent()
 return Object.freeze({...scope,items:Object.freeze(items),handoffConfirmed:items.length>0&&items.every(item=>item.state==='ACCEPTED'),assertCurrent})
}

/** 交接差异保留原版签收，只对新增或换版事项重签。 */
export function compareBidHandoffVersions(previous:ReturnType<typeof assessBidHandoff>,current:ReturnType<typeof assessBidHandoff>){
 const assertCurrent=()=>{previous.assertCurrent();current.assertCurrent()}
 assertCurrent()
 const fields=['projectId','lotId','roundId','stageId'] as const
 if(fields.some(field=>previous[field]!==current[field]))throw Error('BID_HANDOFF_SCOPE')
 const originals=new Map(previous.items.map(item=>[item.id,item]))
 const items=current.items.map(item=>{
  const original=originals.get(item.id)
  originals.delete(item.id)
  if(original&&original.versionRef!==item.versionRef&&item.taskReceiptRef!==null&&item.taskReceiptRef===original.taskReceiptRef)
   throw Error('BID_HANDOFF_VERSION_DRIFT')
  if(original?.versionRef!==item.versionRef)return Object.freeze({id:item.id,originalVersionRef:original?.versionRef??null,
   versionRef:item.versionRef,state:original?'CHANGED':'ADDED',requiresAcceptance:item.state!=='ACCEPTED',
   acceptanceReceiptRef:item.state==='ACCEPTED'?item.taskReceiptRef:null})
  const originalIssues=[...original.openIssueRefs].sort(),currentIssues=[...item.openIssueRefs].sort()
  if(original.originalAssigneeId!==item.originalAssigneeId||original.receiverId!==item.receiverId||
   original.followupRef!==item.followupRef||original.nextDueAt!==item.nextDueAt||
   JSON.stringify(originalIssues)!==JSON.stringify(currentIssues))throw Error('BID_HANDOFF_VERSION_DRIFT')
  const acceptanceReceiptRef=item.state==='ACCEPTED'?item.taskReceiptRef:
   item.state==='AWAITING_ACCEPTANCE'&&original.state==='ACCEPTED'?original.taskReceiptRef:null
  return Object.freeze({id:item.id,originalVersionRef:original.versionRef,versionRef:item.versionRef,
   state:'UNCHANGED',requiresAcceptance:acceptanceReceiptRef===null,acceptanceReceiptRef})
 })
 const removed=Object.freeze([...originals.values()].map(item=>Object.freeze({
  id:item.id,versionRef:item.versionRef,openIssueRefs:item.openIssueRefs,trackingAssigneeId:item.trackingAssigneeId,
  followupRef:item.followupRef,nextDueAt:item.nextDueAt,
 })))
 return Object.freeze({items:Object.freeze(items),removed,assertCurrent})
}
