import {expect,it} from 'vitest'
import {assessBidHandoff,compareBidHandoffVersions} from '@/services/smart-bid/content/review/submission/bid-handoff-evidence'

it('keeps responsibility with the original assignee until the current version is accepted',()=>{
 const scope={projectId:'P',lotId:'L',roundId:'R',stageId:'RESULT'}
 const item={id:'GUARANTEE',versionRef:'V2',originalAssigneeId:'OWNER',receiverId:'FINANCE',openIssueRefs:['REFUND'],
  followupRef:'QUERY',nextDueAt:'2026-11-19T10:00:00+08:00'}
 const assertCurrent=()=>{}
 const old={...scope,itemId:item.id,versionRef:'V1',receiverId:item.receiverId,taskReceiptRef:'RECEIPT-1',
  state:'ACCEPTED' as const,assertCurrent}
 const assess=(receipts:Parameters<typeof assessBidHandoff>[1]['receipts'])=>
  assessBidHandoff(scope,{items:[item],receipts,assertCurrent})
 expect(assess([old])).toMatchObject({handoffConfirmed:false,items:[{state:'AWAITING_ACCEPTANCE',trackingAssigneeId:'OWNER'}]})
 const current={...old,versionRef:'V2',taskReceiptRef:'RECEIPT-2'}
 expect(assess([old,current])).toMatchObject({handoffConfirmed:true,items:[{state:'ACCEPTED',
  trackingAssigneeId:'FINANCE',openIssueRefs:['REFUND']}]})
 expect(assessBidHandoff(scope,{items:[{...item,followupRef:null}],receipts:[current],assertCurrent}))
  .toMatchObject({items:[{state:'FOLLOWUP_REQUIRED',trackingAssigneeId:'OWNER'}]})
 expect(()=>assess([{...current,receiverId:'OTHER'}])).toThrow('BID_HANDOFF_SCOPE')
 const past=assessBidHandoff(scope,{items:[{...item,versionRef:'V1'}],receipts:[old],assertCurrent})
 expect(compareBidHandoffVersions(past,assess([old])).items).toMatchObject([
  {state:'CHANGED',originalVersionRef:'V1',versionRef:'V2',requiresAcceptance:true},
 ])
 expect(compareBidHandoffVersions(past,past).items).toMatchObject([{state:'UNCHANGED',requiresAcceptance:false}])
 expect(compareBidHandoffVersions(past,assessBidHandoff(scope,{items:[],receipts:[],assertCurrent})).removed)
  .toMatchObject([{id:item.id,openIssueRefs:['REFUND'],trackingAssigneeId:'FINANCE'}])
 expect(()=>compareBidHandoffVersions(past,assessBidHandoff(scope,{
  items:[{...item,versionRef:'V1',nextDueAt:'2026-11-20T10:00:00+08:00'}],receipts:[old],assertCurrent,
 }))).toThrow('BID_HANDOFF_VERSION_DRIFT')
})
