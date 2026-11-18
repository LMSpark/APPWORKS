/**
 * @module app:views/features/application/smart-bid/response/model/bid-security-reader
 * 职责：动作26从原担保要求行取得财务凭据的核验范围。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {reviewBidSecurity} from '@/services/smart-bid/content/references/commercial/bid-security-review'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'

const model='BidSecurity',viewName='selectedSecurityRequirement'
const keys=['scopeRef','requirementVersion','liablePartyRef']
const fields=['clauseRef','terms']
const error='BID_SECURITY_REQUIREMENT_EVIDENCE'
type Requirement=Parameters<typeof reviewBidSecurity>[0]
type Observation=Parameters<typeof reviewBidSecurity>[1]
type Milestone=Extract<Requirement,{kind:'REQUIRED'}>['milestones'][number]

function isMilestone(value:unknown):value is Milestone{
 return value==='ISSUED'||value==='RECEIVED'||value==='LINKED'||value==='HANDED_OVER'
}

function readTerms(base:Pick<Requirement,'scopeRef'|'requirementVersion'|'liablePartyRef'|'clauseRef'|'assertCurrent'>,
 terms:unknown):Requirement{
 if(!isRecord(terms))throw Error(error)
 const {kind,conditionRefs,methodRef,milestones,deadline,amount}=terms
 if(kind==='EXEMPT')return Object.freeze({...base,kind})
 if(kind==='CONDITIONAL_EXEMPT'&&Array.isArray(conditionRefs)&&conditionRefs.every(identity))
  return Object.freeze({...base,kind,conditionRefs:Object.freeze([...conditionRefs])})
 if(kind!=='REQUIRED'||!identity(methodRef)||!Array.isArray(milestones)||!milestones.every(isMilestone)||
  typeof deadline!=='number'||!Number.isSafeInteger(deadline))throw Error(error)
 if(amount===undefined||amount===null)return Object.freeze({...base,kind,methodRef,milestones:Object.freeze([...milestones]),deadline})
 if(!isRecord(amount)||typeof amount['minorUnits']!=='string'||!identity(amount['currency']))throw Error(error)
 return Object.freeze({...base,kind,methodRef,milestones:Object.freeze([...milestones]),deadline,
  amount:Object.freeze({minorUnits:amount['minorUnits'],currency:amount['currency']})})
}

/** 原条款和担保条件按固定要求版本读取。 */
export function bidSecurityRequirementView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

export async function readRegisteredBidSecurity(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{scopeRef:string}>,
 target:Readonly<{requirementVersion:string;liablePartyRef:string;asOf:number}>,
 readReceipts:(requirement:Requirement,asOf:number)=>Promise<Observation['receipts']>,
){
 const {scopeRef}=host
 const {requirementVersion,liablePartyRef,asOf}=target
 if(![scopeRef,requirementVersion,liablePartyRef].every(identity)||!Number.isSafeInteger(asOf))throw Error(error)
 const original=await readOriginalRegistrationView(host,{model,viewName},{scopeRef,requirementVersion,liablePartyRef})
 if(!original.row)return Object.freeze({state:'UNAVAILABLE' as const,assertCurrent:original.assertCurrent})
 const assertCurrent=original.captureFields(fields)
 assertCurrent()
 const {clauseRef,terms}=original.row
 if(!identity(clauseRef))throw Error(error)
 const requirement=readTerms({scopeRef,requirementVersion,liablePartyRef,clauseRef,assertCurrent},terms)
 let receipts:Observation['receipts']=[]
 let receiptsUnavailable=false
 if(requirement.kind!=='EXEMPT'){
  try{
   receipts=await readReceipts(requirement,asOf)
  }catch{
   assertCurrent()
   receiptsUnavailable=true
  }
 }
 return Object.freeze({...reviewBidSecurity(requirement,{asOf,receipts}),receiptsUnavailable})
}
