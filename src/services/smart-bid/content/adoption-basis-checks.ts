/**
 * @module app:services/smart-bid/content/adoption-basis-checks
 * 职责：比较动作38预演固定的依据和原责任域的观察结果。
 * 边界：仅诊断待重核的依据；正式提交同次检查、授权时限和原子写入由权威执行端完成。
 */
import {canonicalSnapshotValue} from './revision-snapshot-hash'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from './references/snapshot-reference-values'

type BasisEntry=Readonly<{owner:string;scopeRef:unknown;scopeVersion:string;records:readonly string[]}>
type BasisIssue=Readonly<{
 owner:string;scopeRef:unknown;expectedVersion:string|null;actualVersion:string|null
 code:'SCOPE_CHECK_MISSING'|'SCOPE_CHECK_ADDED'|'SCOPE_VERSION_CHANGED'|'SCOPE_EVIDENCE_CHANGED'
}>
function reference(value:unknown):string{
 if(!snapshotReferenceIdentity(value)&&(value===null||typeof value!=='object'||Array.isArray(value)))
  throw Error('ADOPTION_BASIS_CHECK_MODEL')
 return canonicalSnapshotValue(value)
}
function entries(value:unknown):Map<string,BasisEntry>{
 const error='ADOPTION_BASIS_CHECK_MODEL',result=new Map<string,BasisEntry>()
 visitSnapshotReferences(value,item=>{
  const {owner,scopeRef,scopeVersion,recordRefs}=snapshotReferenceFields(item,['owner','scopeRef','scopeVersion','recordRefs'],error)
  if(!snapshotReferenceIdentity(owner)||!snapshotReferenceIdentity(scopeVersion))throw Error(error)
  const scopeJson=reference(scopeRef),key=JSON.stringify([owner,scopeJson]),records=new Set<string>()
  if(result.has(key))throw Error('ADOPTION_BASIS_CHECK_DUPLICATE')
  visitSnapshotReferences(recordRefs,record=>{
   const encoded=reference(record)
   if(records.has(encoded))throw Error('ADOPTION_BASIS_CHECK_DUPLICATE')
   records.add(encoded)
  },error)
  result.set(key,{owner,scopeRef:JSON.parse(scopeJson) as unknown,scopeVersion,records:[...records].sort()})
 },error)
 return result
}

/** 空预演依据不提供比对证明；相同也只说明两份输入一致。 */
export function compareAdoptionBasisChecks(expected:unknown,actual:unknown):Readonly<{
 matches:boolean;issues:readonly BasisIssue[];requiresAtomicCommitChecks:true
}>{
 const fixed=entries(expected),observed=entries(actual),issues:BasisIssue[]=[]
 if(!fixed.size)throw Error('ADOPTION_BASIS_CHECK_REQUIRED')
 for(const key of [...new Set([...fixed.keys(),...observed.keys()])].sort()){
  const before=fixed.get(key),after=observed.get(key)
  const entry=before??after
  if(!entry)continue
  const code=!after?'SCOPE_CHECK_MISSING':!before?'SCOPE_CHECK_ADDED':before.scopeVersion!==after.scopeVersion?'SCOPE_VERSION_CHANGED':
   JSON.stringify(before.records)!==JSON.stringify(after.records)?'SCOPE_EVIDENCE_CHANGED':null
  if(code)issues.push({owner:entry.owner,scopeRef:entry.scopeRef,expectedVersion:before?.scopeVersion??null,actualVersion:after?.scopeVersion??null,code})
 }
 return {matches:issues.length===0,issues,requiresAtomicCommitChecks:true}
}
