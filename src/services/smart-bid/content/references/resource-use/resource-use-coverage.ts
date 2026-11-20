/**
 * @module app:services/smart-bid/content/references/resource-use/resource-use-coverage
 * 职责：第17项按当时用途和字段核原资料决定链。
 */
import type {prepareResourceUseDecision} from './resource-use-decision'
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Decision=Awaited<ReturnType<typeof prepareResourceUseDecision>>['record']
const scopeFields=['sourceEnterpriseId','recipientEnterpriseId','projectId','applicationRef','resourceVersionId','decisionChainId'] as const
type Scope=Pick<Decision,(typeof scopeFields)[number]>
const time=(value:string)=>{
 const parsed=Date.parse(value)
 if(!Number.isFinite(parsed)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('RESOURCE_USE_DECISION_TIME')
 return parsed
}

/** 字段须逐一有据，撤销只影响原决定具体列出的用途和字段。 */
export function checkRegisteredResourceUse(input:Scope&Readonly<{
 purposeId:string;recipientId:string;fieldIds:readonly string[];useAt:string;knownAt:string
}>,source:Readonly<{
 versions:ReadonlyArray<Readonly<{versionId:string;record:Decision;assertCurrent:()=>void}>>
 assertCurrent:()=>void
}>){
 const versions=[...source.versions]
 const assertCurrent=()=>{source.assertCurrent();for(const version of versions)version.assertCurrent()}
 assertCurrent()
 const {purposeId,recipientId,fieldIds}=input
 const seen=new Set<string>(),requested=new Set(fieldIds)
 if(![...scopeFields.map(field=>input[field]),purposeId,recipientId,...fieldIds].every(identity)||
  !requested.size||requested.size!==fieldIds.length)throw Error('RESOURCE_USE_COVERAGE_SCOPE')
 const useAt=time(input.useAt),knownAt=time(input.knownAt)
 const decisions=new Map<string,Readonly<{state:'ALLOWED'|'DENIED'|'REVOKED'|'EXPIRED';versionId:string;decisionRef:string}>>()
 let previous:string|null=null
 for(const {versionId,record} of versions){
  if(!identity(versionId)||seen.has(versionId)||record.expectedVersion!==previous||
   scopeFields.some(field=>record[field]!==input[field]))throw Error('RESOURCE_USE_VERSION_CHAIN')
  seen.add(versionId)
  previous=versionId
  if(time(record.effectiveAt)>useAt||time(record.knownAt)>knownAt)continue
  const use=record.uses.find(item=>item.purposeId===purposeId&&item.recipientId===recipientId)
  if(!use)continue
  if(record.intent==='CHANGE'){
   const retained=new Set(use.fieldIds)
   for(const fieldId of decisions.keys())if(!retained.has(fieldId))
    decisions.set(fieldId,Object.freeze({state:'REVOKED',versionId,decisionRef:record.decisionRef}))
  }
  const state=record.intent==='DENY'?'DENIED':record.intent==='REVOKE'?'REVOKED':time(use.expiresAt)<=useAt?'EXPIRED':'ALLOWED'
  for(const fieldId of use.fieldIds)if(requested.has(fieldId))
   decisions.set(fieldId,Object.freeze({state,versionId,decisionRef:record.decisionRef}))
 }
 const fields=Object.freeze(fieldIds.map(fieldId=>Object.freeze({fieldId,
  ...(decisions.get(fieldId)??{state:'PENDING',versionId:null,decisionRef:null})})))
 assertCurrent()
 return Object.freeze({allowed:fields.every(field=>field.state==='ALLOWED'),fields,assertCurrent})
}

type AllocationRequirement=Readonly<{
 start:string;end:string;units:number;assertCurrent:()=>void
 decision?:Readonly<{
  enterpriseId:string;projectId:string;resourceVersionId:string;allocationRef:string
  intent:'ASSIGN'|'ADJUST'|'RELEASE'
  start:string;end:string;effectiveAt:string;knownAt:string;units:number;assertCurrent:()=>void
 }>
}>

/** 动作17同时核原用途决定和宿主企业现行的项目调配。 */
export function checkApplicableResourceUse(input:Parameters<typeof checkRegisteredResourceUse>[0],
 source:Parameters<typeof checkRegisteredResourceUse>[1],allocation:AllocationRequirement|Readonly<{
  unrestricted:true;assertCurrent:()=>void
 }>){
 const coverage=checkRegisteredResourceUse(input,source)
 allocation.assertCurrent()
 if('unrestricted' in allocation)return Object.freeze({...coverage,allocationRef:null,
  assertCurrent:()=>{coverage.assertCurrent();allocation.assertCurrent()}})
 const {decision,units}=allocation
 const start=time(allocation.start),end=time(allocation.end)
 if(start>=end||!Number.isSafeInteger(units)||units<1)throw Error('RESOURCE_USE_ALLOCATION_SCOPE')
 const assertCurrent=()=>{coverage.assertCurrent();allocation.assertCurrent();decision?.assertCurrent()}
 assertCurrent()
 if(decision&&(decision.enterpriseId!==input.recipientEnterpriseId||decision.projectId!==input.projectId||
  decision.resourceVersionId!==input.resourceVersionId||!identity(decision.allocationRef)||
  !['ASSIGN','ADJUST','RELEASE'].includes(decision.intent)))
  throw Error('RESOURCE_USE_ALLOCATION_SCOPE')
 const matched=decision!==undefined&&decision.intent!=='RELEASE'&&Number.isSafeInteger(decision.units)&&decision.units>=units&&
  time(decision.start)<=start&&time(decision.end)>=end&&time(decision.effectiveAt)<=Math.min(start,time(input.useAt))&&
  time(decision.knownAt)<=time(input.knownAt)
 return Object.freeze({...coverage,allowed:coverage.allowed&&matched,allocationRef:matched?decision.allocationRef:null,assertCurrent})
}
