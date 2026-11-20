/**
 * @module app:services/smart-bid/content/review/production/paper-output-registration
 * 职责：动作41核原印制请求及独立清点所得的纸件页份。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import {canonicalSnapshotValue} from '../../revision-snapshot-hash'
import type {prepareProductionRequest} from './production-request'

type Prepared=Awaited<ReturnType<typeof prepareProductionRequest>>
type Scope=Pick<Prepared['request'],'projectId'|'documentId'|'revisionId'|'requestKey'|'inputDigest'>
type Copy=Readonly<{copyRef:string;pageRefs:readonly string[]}>
type Paper=Scope&Readonly<{productionRequestRef:string;paperRef:string;copies:readonly Copy[];assertCurrent:()=>void}>
const keys=['projectId','documentId','revisionId','requestKey','inputDigest'] as const
const paperIdentity=(source:Paper)=>[...keys.map(key=>source[key]),source.productionRequestRef,source.paperRef,
 source.copies.map(({copyRef,pageRefs})=>[copyRef,pageRefs])]

/** 原印制登记须有逐份页标识和同件独立清点凭据。 */
export function preparePaperOutputRegistration(prepared:Prepared,paper:Paper,
 observed:Paper&Readonly<{witnessRef:string;complete:boolean}>){
 const {request}=prepared
 const {projectId,documentId,revisionId,requestKey,inputDigest,productionRequestRef,paperRef}=paper
 const {witnessRef}=observed
 const assertCurrent=()=>{prepared.assertCurrent();paper.assertCurrent();observed.assertCurrent()}
 assertCurrent()
 if(![productionRequestRef,paperRef,witnessRef].every(identity)||observed.complete!==true||
  keys.some(key=>paper[key]!==request[key]||observed[key]!==request[key])||
  observed.productionRequestRef!==productionRequestRef||observed.paperRef!==paperRef)
  throw Error('BID_PAPER_OUTPUT_SCOPE')
 const actual=new Map(observed.copies.map(copy=>[copy.copyRef,copy.pageRefs]))
 const copyIds=new Set(paper.copies.map(copy=>copy.copyRef))
 if(!copyIds.size||copyIds.size!==paper.copies.length||actual.size!==observed.copies.length||copyIds.size!==actual.size)
  throw Error('BID_PAPER_OUTPUT_COPIES')
 const copies=paper.copies.map(({copyRef,pageRefs})=>{
  const pages=actual.get(copyRef)
  if(!identity(copyRef)||!pageRefs.length||!pageRefs.every(identity)||new Set(pageRefs).size!==pageRefs.length||
   pages?.length!==pageRefs.length||pageRefs.some((page,index)=>page!==pages[index]))
   throw Error('BID_PAPER_OUTPUT_PAGES')
  return Object.freeze({copyRef,pageRefs:Object.freeze([...pageRefs])})
 })
 assertCurrent()
 const fingerprint=canonicalSnapshotValue([paperIdentity(paper),paperIdentity(observed),witnessRef,true])
 const assertRegistrationCurrent=()=>{
  assertCurrent()
  if(canonicalSnapshotValue([paperIdentity(paper),paperIdentity(observed),observed.witnessRef,observed.complete])!==fingerprint)
   throw Error('BID_PAPER_OUTPUT_STALE')
 }
 return Object.freeze({record:Object.freeze({projectId,documentId,revisionId,requestKey,inputDigest,productionRequestRef,
  paperRef,witnessRef,copies:Object.freeze(copies)}),assertCurrent:assertRegistrationCurrent})
}
