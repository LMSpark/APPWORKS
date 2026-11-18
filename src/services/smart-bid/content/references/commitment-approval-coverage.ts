/**
 * @module app:services/smart-bid/content/references/commitment-approval-coverage
 * 职责：动作30逐字段核同范围、同用途的批准依据。
 */
import {snapshotReferenceIdentity as identity} from './snapshot-reference-values'

type Field=Readonly<{key:string;kind:'PRICE'|'PERSON'|'OTHER';value:string;unit:string|null}>
type Approval=Field&Readonly<{
 scopeRef:string;purposeRef:string;decisionRefs:readonly string[]
 usable:boolean;assertCurrent:()=>void
}>

/** 金额和人选分别核据。有任一待核字段时整项承诺不进入登记。 */
export function checkCommitmentApprovalCoverage(input:Readonly<{
 scopeRef:string;purposeRef:string;fields:readonly Field[];approvals:readonly Approval[];assertCurrent:()=>void
}>){
 const {scopeRef,purposeRef,fields}=input
 const approvals=[...input.approvals]
 const assertCurrent=()=>{input.assertCurrent();for(const item of approvals)item.assertCurrent()}
 assertCurrent()
 const expected=new Map(fields.map(item=>[item.key,item]))
 if(!identity(scopeRef)||!identity(purposeRef)||!fields.length||expected.size!==fields.length||
  fields.some(item=>!identity(item.key)||!['PRICE','PERSON','OTHER'].includes(item.kind)))throw Error('BID_COMMITMENT_SCOPE')
 const byKey=new Map<string,Approval>()
 for(const item of approvals){
  const field=expected.get(item.key)
  if(!field||byKey.has(item.key)||item.kind!==field.kind||item.scopeRef!==scopeRef||item.purposeRef!==purposeRef||
   typeof item.usable!=='boolean'||!item.decisionRefs.every(identity))throw Error('BID_COMMITMENT_APPROVAL_SCOPE')
  byKey.set(item.key,item)
 }
 const results=Object.freeze(fields.map(field=>{
  const approval=byKey.get(field.key)
  const verified=approval?.usable===true&&approval.decisionRefs.length>0&&
   field.value.trim().length>0&&approval.value===field.value&&approval.unit===field.unit
  return Object.freeze({key:field.key,state:verified?'VERIFIED' as const:'PENDING' as const,
   decisionRefs:Object.freeze(verified?[...new Set(approval.decisionRefs)].sort():[])})
 }))
 assertCurrent()
 return Object.freeze({scopeRef,purposeRef,ready:results.every(result=>result.state==='VERIFIED'),fields:results,assertCurrent})
}
