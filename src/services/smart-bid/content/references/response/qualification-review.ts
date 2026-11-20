/**
 * @module app:services/smart-bid/content/references/response/qualification-review
 * 职责：动作35对已选合法路径逐项核资格依据。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Scope=Readonly<{projectId:string;baselineId:string;requirementVersion:string;assignmentRef:string;subjectRef:string;asOf:number}>
type Proof=Readonly<{assertCurrent:()=>void}>
type Condition=Readonly<{conditionRef:string;kind:'MATERIAL'|'FACT'|'PERSON'}>
type Evidence=Scope&Condition&Proof&Readonly<{evidenceRef:string;use:'USABLE'|'RESTRICTED'|'PENDING'}>
const scopeFields=['projectId','baselineId','requirementVersion','assignmentRef','subjectRef','asOf'] as const

/** 各路径只核所选路径；需制作声明时留待制件，不等待尚未制作的实件。 */
export function reviewSelectedQualification(scope:Scope&Proof,path:Readonly<{
 pathRef:string;conditions:readonly Condition[];declarationRequired:boolean;assertCurrent:()=>void
}>,provided:readonly Evidence[]){
 const evidence=[...provided]
 const assertCurrent=()=>{scope.assertCurrent();path.assertCurrent();for(const item of evidence)item.assertCurrent()}
 assertCurrent()
 if(![scope.projectId,scope.baselineId,scope.requirementVersion,scope.assignmentRef,scope.subjectRef,path.pathRef].every(identity)||
  !Number.isSafeInteger(scope.asOf)||typeof path.declarationRequired!=='boolean'||!path.conditions.length)
  throw Error('BID_QUALIFICATION_PATH')
 const conditions=new Map(path.conditions.map(item=>[item.conditionRef,item.kind]))
 if(conditions.size!==path.conditions.length||path.conditions.some(item=>!identity(item.conditionRef)||
  !['MATERIAL','FACT','PERSON'].includes(item.kind)))throw Error('BID_QUALIFICATION_PATH')
 const matched=new Map<string,Evidence>()
 for(const item of evidence){
  if(scopeFields.some(key=>item[key]!==scope[key])||conditions.get(item.conditionRef)!==item.kind||
   matched.has(item.conditionRef)||!identity(item.evidenceRef)||!['USABLE','RESTRICTED','PENDING'].includes(item.use))
   throw Error('BID_QUALIFICATION_EVIDENCE')
  matched.set(item.conditionRef,item)
 }
 const checks=Object.freeze(path.conditions.map(({conditionRef,kind})=>{
  const item=matched.get(conditionRef)
  return Object.freeze({conditionRef,kind,state:item?.use??'PENDING',evidenceRef:item?.evidenceRef??null})
 }))
 assertCurrent()
 return Object.freeze({pathRef:path.pathRef,verified:checks.every(item=>item.state==='USABLE'),checks,
  declaration:path.declarationRequired?'TO_PRODUCE' as const:'NOT_REQUIRED' as const,assertCurrent})
}
