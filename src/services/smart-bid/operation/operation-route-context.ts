/**
 * @module app:services/smart-bid/operation/operation-route-context
 * 职责：第03项固定本试次待发参数与来源，分开保存清单和实际输入摘要。
 * 边界：组织命名输入和来源上下文，正式数据由提供该上下文的 DataView 持有。
 * AI用途：检查工位是否得到指定来源的命名输入。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../content/references/snapshot-reference-values'
import type {verifyOperationRouteReturn} from './operation-route-return'
import type {readOperationActionGuide} from './guides/operation-action-guide'

/** 读取工艺证据所需的项目、场景和当前会话约束。 */
type Scope=Parameters<typeof verifyOperationRouteReturn>[0]
/** 当前工位的命名输入及其匹配条件。 */
type Slot=Readonly<{slotId:string;required:boolean}>
/** 参与工艺上下文计算的来源证据。 */
type Source=Readonly<{slotId:string;assertCurrent:()=>void}>&(
 Readonly<{state:'ALLOWED';sourceRef:string;versionRef:string;useRef:string;value:unknown}>|
 Readonly<{state:'MISSING'|'TRIMMED'|'DENIED';reasonRef:string}>
)

/** 缺必需字段只交待补清单，不计算可派发输入。 */
export async function freezeOperationRouteContext(scope:Scope,guide:Readonly<{
 action:Pick<Awaited<ReturnType<typeof readOperationActionGuide>>,'guideRef'|'guideDigest'|'assertCurrent'>
 guideVersionRef:string;createdAt:string;slots:readonly Slot[]
}>,sources:readonly Source[]){
 const evidence=[...sources]
 const {action,createdAt,guideVersionRef}=guide
 const assertCurrent=()=>{action.assertCurrent();for(const item of evidence)item.assertCurrent()}
 assertCurrent()
 const {runId,attemptRef,requestKey,projectId,targetDigest,configurationLockHash}=scope
 const {guideRef,guideDigest}=action
 const error='OPERATION_ROUTE_CONTEXT_SCOPE'
 if(![runId,attemptRef,requestKey,projectId,guideRef,guideVersionRef].every(identity)||
  ![targetDigest,configurationLockHash,guideDigest].every(value=>/^[a-f0-9]{64}$/u.test(value))||
  !Number.isFinite(Date.parse(createdAt))||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(createdAt))throw Error(error)
 const slots=new Set(guide.slots.map(slot=>slot.slotId))
 const bySlot=new Map(evidence.map(item=>[item.slotId,item]))
 if(slots.size!==guide.slots.length||bySlot.size!==evidence.length||
  guide.slots.some(slot=>!identity(slot.slotId))||evidence.some(item=>!slots.has(item.slotId)))throw Error(error)
 const entries:Array<readonly [string,unknown]>=[]
 const items=guide.slots.map(({slotId,required})=>{
  const selected=bySlot.get(slotId)
  if(selected?.state==='ALLOWED'){
   const {sourceRef,versionRef,useRef,value}=selected
   if(![sourceRef,versionRef,useRef].every(identity))throw Error(error)
   const snapshot:unknown=JSON.parse(canonicalSnapshotValue(value))
   entries.push([slotId,snapshot])
   return {slotId,required,state:selected.state,sourceRef,versionRef,useRef}
  }
  if(selected&&!identity(selected.reasonRef))throw Error(error)
  return {slotId,required,state:selected?.state??'MISSING',reasonRef:selected?.reasonRef??null}
 })
 const usable=!items.some(item=>item.required&&item.state!=='ALLOWED')
 const inputJson=usable?canonicalSnapshotValue(Object.fromEntries(entries)):null
 const manifestJson=canonicalSnapshotValue({runId,attemptRef,requestKey,projectId,targetDigest,configurationLockHash,
  guideRef,guideVersionRef,guideDigest,createdAt,items,inputJson})
 const [manifestDigest,inputDigest]=await Promise.all([
  hashCanonicalSnapshotText(manifestJson),inputJson===null?null:hashCanonicalSnapshotText(inputJson),
 ])
 assertCurrent()
 return Object.freeze({scope:Object.freeze({runId,attemptRef,requestKey,projectId,targetDigest,configurationLockHash}),
  guideRef,guideVersionRef,guideDigest,usable,manifestJson,manifestDigest,inputJson,inputDigest,assertCurrent})
}
