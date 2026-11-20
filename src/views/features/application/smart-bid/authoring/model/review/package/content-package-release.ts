/**
 * @module app:views/features/application/smart-bid/authoring/model/review/package/content-package-release
 * 职责：第50项按当次要求核放行证据，供第51项绑定最终待发包。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'
/** Identity of the registered original package and its frozen selection. */
type Scope=Readonly<{projectId:string;packageId:string;packageHash:string;selectionHash:string}>
/** Current member comparison from an independently observed final package. */
type PackageProof=Scope&Readonly<{membershipMatches:boolean;assertCurrent:()=>void}>
type Requirement=Readonly<{kind:'SELECTION_USE'|'APPROVAL'|'SIGNATURE';targetId:string}>
type Evidence=Scope&Requirement&Readonly<{evidenceRef:string;accepted:boolean;assertCurrent:()=>void}>
const key=({kind,targetId}:Requirement)=>JSON.stringify([kind,targetId])

type SignatureTarget=Readonly<{targetId:string;signerRef:string;positionRef:string}>
type SignatureCheck=Scope&SignatureTarget&Readonly<{
 signatureRef:string;verificationRef:string;valid:boolean;assertCurrent:()=>void
}>

const signatureScope=['projectId','packageId','packageHash','selectionHash'] as const
const signatureFields=[...signatureScope,'id','targetId','signerRef','positionRef','verificationRef','valid']

/** 仅核当前包同一查询代次可读的原签署记录。 */
export async function readPackageSignatureChecks(host:ContentRevisionReadHost,pack:Scope,ids:readonly string[]){
 host.assertCurrent()
 if(pack.projectId!==host.projectId||!identity(host.scenarioId)||!ids.every(identity)||new Set(ids).size!==ids.length)
  throw Error('SUBMISSION_PACKAGE_SIGNATURE_SCOPE')
 if(!ids.length)return Object.freeze([])
 const viewKey=buildDataViewKey('SignatureRecord','packageSignatureChecks',host.scenarioId)
 const view=host.runtime.resolveView(viewKey)
 const context={projectId:pack.projectId,packageId:pack.packageId,packageHash:pack.packageHash,selectionHash:pack.selectionHash}
 const valid=(target:DataView)=>target.dataTable?.modelBinding?.modelName==='SignatureRecord'&&
  target.commitMode==='staged'&&target.queryConfig.autoQuery===false&&target.queryConfig.allPages===true&&
  signatureScope.every(field=>hasContentScopeCondition(target,field,{Type:'GetInputParam',ParamName:field}))
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('SUBMISSION_PACKAGE_SIGNATURE_VIEW')
 const requested=new Set(ids)
 view.queryContext={...view.queryContext,...context}
 view.filterExpression={logic:'or',filters:[...requested].map(id=>({field:'id',operator:'eq',value:id}))}
 const filter=JSON.stringify(view.filterExpression)
 const assertScope=()=>{
  host.assertCurrent()
  if(host.runtime.resolveView(viewKey)!==view||!valid(view)||view.hasEditingChanges()||view.loadingError||
   signatureScope.some(field=>view.queryContext[field]!==context[field])||JSON.stringify(view.filterExpression)!==filter)
   throw Error('SUBMISSION_PACKAGE_SIGNATURE_STALE')
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true)
  throw Error('SUBMISSION_PACKAGE_SIGNATURE_INCOMPLETE')
 const assertResult=view.captureReadResult()
 return Object.freeze(view.rows.map((row):SignatureCheck=>{
  const assertRow=view.captureReadRow(row,signatureFields)
  const {id,targetId,signerRef,positionRef,verificationRef,valid:verified}=row
  if(!identity(id)||!requested.delete(id)||!identity(targetId)||!identity(signerRef)||!identity(positionRef)||
   !identity(verificationRef)||typeof verified!=='boolean'||signatureScope.some(field=>row[field]!==context[field]))
   throw Error('SUBMISSION_PACKAGE_SIGNATURE_SCOPE')
  return Object.freeze({...context,targetId,signerRef,positionRef,signatureRef:id,verificationRef,valid:verified,
   assertCurrent:()=>{assertScope();assertResult();assertRow()}})
 }))
}

/** 动作47逐人逐位置核最终包，缺项保留给放行检查。 */
export function bindPackageSignatureCoverage(pack:Scope&Readonly<{assertCurrent:()=>void}>,
 required:readonly SignatureTarget[],checks:readonly SignatureCheck[]){
 const targets=new Map(required.map(target=>[target.targetId,target]))
 if(targets.size!==required.length||required.some(target=>!Object.values(target).every(identity)))
  throw Error('SUBMISSION_PACKAGE_SIGNATURE_SCOPE')
 const assertCurrent=()=>{pack.assertCurrent();for(const check of checks)check.assertCurrent()}
 assertCurrent()
 const used=new Set<string>()
 const evidence=checks.map(check=>{
  const {targetId,signerRef,positionRef,signatureRef,verificationRef,valid}=check
  const target=targets.get(targetId)
  if(target?.signerRef!==signerRef||target.positionRef!==positionRef||used.has(targetId)||
   check.projectId!==pack.projectId||check.packageId!==pack.packageId||check.packageHash!==pack.packageHash||
   check.selectionHash!==pack.selectionHash||![signatureRef,verificationRef].every(identity)||typeof valid!=='boolean')
   throw Error('SUBMISSION_PACKAGE_SIGNATURE_SCOPE')
  used.add(targetId)
  const {projectId,packageId,packageHash,selectionHash}=pack
  return Object.freeze({projectId,packageId,packageHash,selectionHash,kind:'SIGNATURE' as const,targetId,
   evidenceRef:verificationRef,accepted:valid,assertCurrent})
 })
 return Object.freeze(evidence)
}

/** 成员匹配后仍须验证当次选件适用、批准覆盖及规则要求的签署。 */
export function assessSubmissionPackageRelease(pack:PackageProof,rules:Scope&Readonly<{
 requirements:readonly Requirement[];assertCurrent:()=>void
}>,evidence:readonly Evidence[]){
 const proofs=[...evidence]
 const assertCurrent=()=>{pack.assertCurrent();rules.assertCurrent();for(const proof of proofs)proof.assertCurrent()}
 assertCurrent()
 const {projectId,packageId,packageHash,selectionHash}=pack
 const requirements=new Map(rules.requirements.map(requirement=>[key(requirement),requirement]))
 if(rules.projectId!==projectId||rules.packageId!==packageId||rules.packageHash!==packageHash||
  rules.selectionHash!==selectionHash||requirements.size!==rules.requirements.length||
  !rules.requirements.some(item=>item.kind==='SELECTION_USE')||!rules.requirements.some(item=>item.kind==='APPROVAL')||
  rules.requirements.some(({kind,targetId})=>!['SELECTION_USE','APPROVAL','SIGNATURE'].includes(kind)||!identity(targetId)))
  throw Error('SUBMISSION_PACKAGE_RELEASE_SCOPE')
 const matched=new Map<string,Evidence>()
 for(const proof of proofs){
  const id=key(proof)
  if(proof.projectId!==projectId||proof.packageId!==packageId||proof.packageHash!==packageHash||
   proof.selectionHash!==selectionHash||!requirements.has(id)||matched.has(id)||!identity(proof.evidenceRef))
   throw Error('SUBMISSION_PACKAGE_RELEASE_SCOPE')
  matched.set(id,proof)
 }
 const decisions=Object.freeze(rules.requirements.map(requirement=>{
  const proof=matched.get(key(requirement))
  return Object.freeze({...requirement,evidenceRef:proof?.evidenceRef??null,accepted:proof?.accepted===true})
 }))
 return Object.freeze({projectId,packageId,packageHash,selectionHash,decisions,
  deliverable:pack.membershipMatches&&decisions.every(item=>item.accepted),assertCurrent})
}
