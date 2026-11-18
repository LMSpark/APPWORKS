/**
 * @module app:services/smart-bid/content/references/fixed-fact-use
 * 职责：动作31保留原事实版本，独立核该版在目标用途和时点的准用证据。
 */
import {snapshotReferenceIdentity as identity} from './snapshot-reference-values'
import {canonicalSnapshotValue} from '../revision-snapshot-hash'
import {isRecord} from '@spark-appworks/spark-utils'

type Target=Readonly<{projectId:string;baselineId:string;factId:string;version:number;scopeRef:unknown;purposeRef:string;useAt:number}>
type Proof=Readonly<{assertCurrent:()=>void}>
type FixedFact=Pick<Target,'projectId'|'baselineId'|'factId'|'version'|'scopeRef'>&Proof&Readonly<{decisionRefs:readonly string[]}>
type UseCheck=Target&Proof&Readonly<{
 useCheckRef:string;state:'USABLE'|'RESTRICTED'|'PENDING';decisionRefs:readonly string[]
}>
const fixedFields=['projectId','baselineId','factId','version'] as const
const useFields=[...fixedFields,'purposeRef','useAt'] as const

/** 调用方从目标修订的固定基线取事实，准用证明由原业务责任域出具。 */
export function checkFixedFactUse(target:Target,fact:FixedFact,check?:UseCheck){
 const {projectId,baselineId,factId,version,scopeRef,purposeRef,useAt}=target
 const assertCurrent=()=>{fact.assertCurrent();check?.assertCurrent()}
 assertCurrent()
 if(![projectId,baselineId,factId,purposeRef].every(identity)||(!identity(scopeRef)&&!isRecord(scopeRef))||
  !Number.isSafeInteger(version)||version<0||
  !Number.isSafeInteger(useAt)||!fact.decisionRefs.every(identity))throw Error('BID_FACT_USE_SCOPE')
 const fixedScope={projectId,baselineId,factId,version,scopeRef}
 const scope=canonicalSnapshotValue(scopeRef)
 if(fixedFields.some(key=>fact[key]!==target[key])||canonicalSnapshotValue(fact.scopeRef)!==scope)
  throw Error('BID_FACT_USE_SCOPE')
 const useScope={...fixedScope,purposeRef,useAt}
 if(check&&(useFields.some(key=>check[key]!==target[key])||canonicalSnapshotValue(check.scopeRef)!==scope||
  !identity(check.useCheckRef)||!['USABLE','RESTRICTED','PENDING'].includes(check.state)||
  !check.decisionRefs.every(identity)||new Set(check.decisionRefs).size!==check.decisionRefs.length||
  check.decisionRefs.length!==new Set(fact.decisionRefs).size||fact.decisionRefs.some(ref=>!check.decisionRefs.includes(ref))))
  throw Error('BID_FACT_USE_EVIDENCE')
 return Object.freeze({...useScope,state:check?.state??'PENDING',useCheckRef:check?.useCheckRef??null,assertCurrent})
}
