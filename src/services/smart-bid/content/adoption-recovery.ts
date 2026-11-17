/**
 * @module app:services/smart-bid/content/adoption-recovery
 * 职责：将原采用请求、结果观察及原责任域凭据配对。
 * 边界：纯核对，不查询、不写入。观察与凭据应由同一权威业务域读取。
 */
import {snapshotReferenceIdentity} from './references/snapshot-reference-values'

type AdoptionRequest=Readonly<{
 projectId:string;candidateRevisionId:string;requestKey:string;requestDigest:string;previewRef:string
}>
type Effect='COMMITTED'|'NOT_COMMITTED'|'UNKNOWN'
type Observation=AdoptionRequest&Readonly<{effect:Effect;resultEvidenceRef?:string}>
/** 已经从原业务域取得的事实投影。终结凭据含同笔请求的旧执行许可失效依据。 */
type Evidence=AdoptionRequest&Readonly<{resultEvidenceRef:string}>&(
 Readonly<{kind:'COMMITTED';adoptionRef:string;mergeRevisionId:string;commitCheckRef?:string}>
 |Readonly<{kind:'NOT_COMMITTED';executionFenceRef:string}>
)
type Recovery=Readonly<
 {effect:'UNKNOWN';missing:ReadonlyArray<'ORIGINAL_RESULT'|'RESULT_EVIDENCE'>}
 |{effect:'NOT_COMMITTED';resultEvidenceRef:string;executionFenceRef:string;missing:readonly []}
 |{effect:'COMMITTED';resultEvidenceRef:string;adoptionRef:string;mergeRevisionId:string;commitCheckRef?:string;missing:ReadonlyArray<'COMMIT_CHECK'>}
>
const identityFields=['projectId','candidateRevisionId','requestKey','requestDigest','previewRef'] as const
function sameRequest(expected:AdoptionRequest,actual:AdoptionRequest):boolean{
 return identityFields.every(field=>expected[field]===actual[field])
}

/** 当前头不参与旧采用事实认定；未取到原凭据时不得用观察状态推定终态。 */
export function inspectAdoptionRecovery(request:AdoptionRequest,observation:Observation|null,evidence:Evidence|null):Recovery{
 if(!identityFields.every(field=>snapshotReferenceIdentity(request[field])))throw Error('ADOPTION_RECOVERY_REQUEST_REQUIRED')
 if(observation===null)return {effect:'UNKNOWN',missing:['ORIGINAL_RESULT']}
 if(!sameRequest(request,observation))throw Error('ADOPTION_RECOVERY_REQUEST_MISMATCH')
 if(observation.effect==='UNKNOWN'||evidence===null||!sameRequest(request,evidence)||evidence.kind!==observation.effect||
  !snapshotReferenceIdentity(evidence.resultEvidenceRef)||evidence.resultEvidenceRef!==observation.resultEvidenceRef)
  return {effect:'UNKNOWN',missing:['RESULT_EVIDENCE']}
 const {resultEvidenceRef}=evidence
 if(evidence.kind==='NOT_COMMITTED'){
  if(!snapshotReferenceIdentity(evidence.executionFenceRef))return {effect:'UNKNOWN',missing:['RESULT_EVIDENCE']}
  return {effect:evidence.kind,resultEvidenceRef,executionFenceRef:evidence.executionFenceRef,missing:[]}
 }
 const {adoptionRef,mergeRevisionId,commitCheckRef}=evidence
 if(!snapshotReferenceIdentity(adoptionRef)||!snapshotReferenceIdentity(mergeRevisionId))return {effect:'UNKNOWN',missing:['RESULT_EVIDENCE']}
 return {effect:evidence.kind,resultEvidenceRef,adoptionRef,mergeRevisionId,
  ...(snapshotReferenceIdentity(commitCheckRef)?{commitCheckRef,missing:[]}:{missing:['COMMIT_CHECK']})}
}
