/**
 * @module app:services/smart-bid/content/references/resource-use/resource-allocation-release
 * 职责：按原调配记录核准释放所需的义务终止证据。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Allocation=Readonly<{enterpriseId:string;projectId:string;allocationRef:string}>
type ObligationEnd=Allocation&Readonly<{obligationRef:string;evidenceRef:string;endedAt:number;assertCurrent:()=>void}>

/** obligationRefs 来自原调配的完整义务清单。释放决定仍由正式调配命令办理。 */
export function checkResourceAllocationRelease(input:Readonly<{
 allocation:Allocation;obligationRefs:readonly string[];effectiveAt:number
 evidence:readonly ObligationEnd[];assertCurrent:()=>void
}>){
 input.assertCurrent()
 const {allocation:{enterpriseId,projectId,allocationRef},effectiveAt,evidence}=input
 const obligations=new Set(input.obligationRefs)
 if(![enterpriseId,projectId,allocationRef,...obligations].every(identity)||!Number.isSafeInteger(effectiveAt)||
  obligations.size!==input.obligationRefs.length)throw Error('BID_RESOURCE_RELEASE_SCOPE')
 const proven=new Set<string>()
 const ended=new Set<string>()
 const evidenceRefs:string[]=[]
 for(const item of evidence){
  item.assertCurrent()
  if(item.enterpriseId!==enterpriseId||item.projectId!==projectId||item.allocationRef!==allocationRef||
   !identity(item.evidenceRef)||!obligations.has(item.obligationRef)||proven.has(item.obligationRef)||
   !Number.isSafeInteger(item.endedAt))throw Error('BID_RESOURCE_RELEASE_SCOPE')
  if(item.endedAt<=effectiveAt){
   ended.add(item.obligationRef)
   evidenceRefs.push(item.evidenceRef)
  }
  proven.add(item.obligationRef)
 }
 const pending=Object.freeze([...obligations].filter(ref=>!ended.has(ref)).sort())
 input.assertCurrent()
 return pending.length
  ? Object.freeze({state:'KEEP_OCCUPIED' as const,pending})
  : Object.freeze({state:'READY_FOR_RELEASE_DECISION' as const,allocationRef,effectiveAt,evidenceRefs:Object.freeze(evidenceRefs.sort())})
}
