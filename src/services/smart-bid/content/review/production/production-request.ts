/**
 * @module app:services/smart-bid/content/review/production/production-request
 * 职责：动作40固定制件用途、修订和可追溯输入，形成待登记的制作请求。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'

type Scope=Readonly<{projectId:string;documentId:string;revisionId:string;baselineId:string}>
type Version=Scope&Readonly<{state:'CANDIDATE'|'ADOPTED';rootHash:string;assertCurrent:()=>void}>
type Evidence=Scope&Readonly<{
 templateVersionRef:string;ruleVersionRef:string;factRefs:readonly string[]
 formRequired:boolean;formVersionRef:string|null;requiredAttachmentRefs:readonly string[];attachmentRefs:readonly string[]
 assertCurrent:()=>void
}>
const scopeFields=['projectId','documentId','revisionId','baselineId'] as const

/** 正式出件只接受已采用修订，规定的表与附件分别核齐。 */
export async function prepareProductionRequest(input:Scope&Readonly<{
 requestKey:string;purpose:'REVIEW'|'FORMAL';toolVersionRef:string;outputOptions:Readonly<Record<string,unknown>>
}>,version:Version,evidence:Evidence){
 const assertCurrent=()=>{version.assertCurrent();evidence.assertCurrent()}
 assertCurrent()
 if(![...scopeFields.map(key=>input[key]),input.requestKey,input.toolVersionRef,evidence.templateVersionRef,
  evidence.ruleVersionRef].every(identity)||scopeFields.some(key=>input[key]!==version[key]||input[key]!==evidence[key])||
  !/^[a-f0-9]{64}$/u.test(version.rootHash)||!['REVIEW','FORMAL'].includes(input.purpose)||
  (input.purpose==='REVIEW'?version.state!=='CANDIDATE':version.state!=='ADOPTED'))
  throw Error('BID_PRODUCTION_SCOPE')
 const {factRefs,requiredAttachmentRefs,attachmentRefs,formVersionRef}=evidence
 if(typeof evidence.formRequired!=='boolean'||(evidence.formRequired&&!identity(formVersionRef))||
  (formVersionRef!==null&&!identity(formVersionRef))||
  [factRefs,requiredAttachmentRefs,attachmentRefs].some(refs=>new Set(refs).size!==refs.length||!refs.every(identity))||
  requiredAttachmentRefs.some(ref=>!attachmentRefs.includes(ref)))throw Error('BID_PRODUCTION_EVIDENCE')
 const {projectId,documentId,revisionId,baselineId,requestKey,purpose,toolVersionRef}=input
 const payload={projectId,documentId,revisionId,baselineId,requestKey,purpose,toolVersionRef,
  outputOptions:structuredClone(input.outputOptions),rootHash:version.rootHash,
  templateVersionRef:evidence.templateVersionRef,ruleVersionRef:evidence.ruleVersionRef,formVersionRef,
  factRefs:Object.freeze([...factRefs].sort()),attachmentRefs:Object.freeze([...attachmentRefs].sort())}
 const inputText=canonicalSnapshotValue(payload)
 const inputDigest=await hashCanonicalSnapshotText(inputText)
 assertCurrent()
 return Object.freeze({request:Object.freeze({...payload,inputDigest}),assertCurrent:()=>{
  assertCurrent()
  if(canonicalSnapshotValue(payload)!==inputText)throw Error('BID_PRODUCTION_REQUEST_CHANGED')
 }})
}
