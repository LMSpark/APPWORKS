/**
 * @module app:services/smart-bid/content/references/commercial/commitment-fact-registration
 * 职责：动作30固定待追加请求，并按原请求核对版本登记结果。
 */
import type {prepareApprovedCommitmentFacts} from './commitment-approval-coverage'
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'

type Prepared=ReturnType<typeof prepareApprovedCommitmentFacts>
type Request=Readonly<{projectId:string;requestKey:string;requestDigest:string}>
type AuthorityResult=Readonly<{request:Request;assertCurrent:()=>void}>&(
 Readonly<{state:'REGISTERED';versions:ReadonlyArray<Readonly<{key:string;id:string;version:number}>>}>|
 Readonly<{state:'NOT_EFFECTIVE';terminalRef:string}>|Readonly<{state:'UNKNOWN'}>
)

/** 请求摘要独立于字段输入顺序，覆盖项目、事实正文与全部来源。 */
export async function prepareCommitmentFactRegistration(prepared:Prepared,requestKey:string){
 prepared.assertCurrent()
 const projectId=prepared.facts[0]?.projectId
 if(!identity(projectId)||!identity(requestKey)||prepared.facts.some(fact=>fact.projectId!==projectId))
  throw Error('BID_FACT_REGISTRATION_SCOPE')
 const facts=Object.freeze([...prepared.facts].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0))
 const factKeys=Object.freeze(facts.map(item=>item.key))
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue({projectId,requestKey,facts}))
 prepared.assertCurrent()
 return Object.freeze({request:Object.freeze({projectId,requestKey,requestDigest}),facts,factKeys,assertCurrent:prepared.assertCurrent})
}

/** 原回执缺失保持未知；完整回执须对应全部事实键。 */
export async function recoverCommitmentFactRegistration(
 originalRequest:Readonly<{request:Request;factKeys:readonly string[]}>,
 source:Readonly<{lookup:(request:Request)=>Promise<AuthorityResult|undefined>;assertCurrent:()=>void}>,
){
 const request=Object.freeze({...originalRequest.request})
 const expected=new Set(originalRequest.factKeys),ids=new Set<string>()
 if(!identity(request.projectId)||!identity(request.requestKey)||!/^[a-f0-9]{64}$/u.test(request.requestDigest)||
  !expected.size||expected.size!==originalRequest.factKeys.length||![...expected].every(identity))
  throw Error('BID_FACT_REGISTRATION_REQUEST')
 source.assertCurrent()
 const original=await source.lookup(request)
 const assertCurrent=()=>{source.assertCurrent();original?.assertCurrent()}
 assertCurrent()
 if(!original)return Object.freeze({state:'UNKNOWN' as const,assertCurrent})
 if(original.request.projectId!==request.projectId||original.request.requestKey!==request.requestKey||
  original.request.requestDigest!==request.requestDigest)throw Error('BID_FACT_REGISTRATION_REQUEST')
 if(original.state==='UNKNOWN')return Object.freeze({state:original.state,assertCurrent})
 if(original.state==='NOT_EFFECTIVE'){
  if(!identity(original.terminalRef))throw Error('BID_FACT_REGISTRATION_RESULT')
  return Object.freeze({state:original.state,terminalRef:original.terminalRef,assertCurrent})
 }
 const versions=original.versions.map(item=>{
  const {key,id,version}=item
  if(!expected.delete(key)||!identity(id)||ids.has(id)||!Number.isSafeInteger(version)||version<0)
   throw Error('BID_FACT_REGISTRATION_RESULT')
  ids.add(id)
  return Object.freeze({key,id,version})
 })
 if(expected.size)throw Error('BID_FACT_REGISTRATION_RESULT')
 return Object.freeze({state:original.state,versions:Object.freeze(versions),assertCurrent})
}
