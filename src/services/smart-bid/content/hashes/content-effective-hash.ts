/**
 * @module app:services/smart-bid/content/hashes/content-effective-hash
 * 职责：组合树、显示引用和全部适用业务依赖的有效内容摘要。
 * 边界：输入须来自同一审核范围的已核固定记录；相同摘要仍须重新核使用许可。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from '../references/snapshot-reference-values'

export const CONTENT_EFFECTIVE_HASH_CONTRACT='spark-bid.content-effective/1'
const dependencyFields=['factDependencyHash','requirementBindingHash','responseDependencyHash',
 'qualificationHash','contentRulesHash','calculationInputsHash'] as const
const fields=['subtreeHash','displayRefs',...dependencyFields] as const
function digest(value:unknown):string{
 if(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value))throw Error('CONTENT_EFFECTIVE_COMPONENT')
 return value
}

/** 将独立答复的显示摘要绑定到同一范围原响应依赖；不与正文节点身份混用。 */
export async function hashEffectiveResponseDependencies(responseDependencyHash:string,displayRefs:unknown):Promise<string>{
 const error='CONTENT_EFFECTIVE_RESPONSE_DISPLAY_MODEL'
 const display:Array<{assignmentId:string;responseId:string;occurrence:number;displayHash:string}>=[]
 const seen=new Set<string>()
 visitSnapshotReferences(displayRefs,value=>{
  const {assignmentId,responseId,occurrence,displayHash}=snapshotReferenceFields(value,
   ['assignmentId','responseId','occurrence','displayHash'],error)
  if(!snapshotReferenceIdentity(assignmentId)||!snapshotReferenceIdentity(responseId)||
   typeof occurrence!=='number'||!Number.isSafeInteger(occurrence)||occurrence<0)throw Error(error)
  const key=JSON.stringify([assignmentId,responseId,occurrence])
  if(seen.has(key))throw Error('CONTENT_EFFECTIVE_DISPLAY_DUPLICATE')
  seen.add(key);display.push({assignmentId,responseId,occurrence,displayHash:digest(displayHash)})
 },error)
 const compare=(a:string,b:string)=>a<b?-1:a>b?1:0
 display.sort((a,b)=>compare(a.assignmentId,b.assignmentId)||compare(a.responseId,b.responseId)||a.occurrence-b.occurrence)
 const original=digest(responseDependencyHash)
 if(!display.length)return original
 return hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.effective-response-dependencies/1',original,display]))
}
/** 已核显示摘要只按原节点及出现序组合，动态页码不应进入该列表。 */
export async function hashContentEffective(input:unknown):Promise<string>{
 const row=snapshotReferenceFields(input,fields,'CONTENT_EFFECTIVE_MODEL')
 const display:Array<Readonly<{nodeId:string;occurrence:number;displayHash:string}>>=[],seen=new Set<string>()
 const error='CONTENT_EFFECTIVE_DISPLAY_MODEL'
 visitSnapshotReferences(row['displayRefs'],value=>{
  const {nodeId,occurrence,displayHash}=snapshotReferenceFields(value,['nodeId','occurrence','displayHash'],error)
  if(!snapshotReferenceIdentity(nodeId)||typeof occurrence!=='number'||!Number.isSafeInteger(occurrence)||occurrence<0)throw Error(error)
  const key=JSON.stringify([nodeId,occurrence])
  if(seen.has(key))throw Error('CONTENT_EFFECTIVE_DISPLAY_DUPLICATE')
  seen.add(key);display.push({nodeId,occurrence,displayHash:digest(displayHash)})
 },error)
 display.sort((left,right)=>left.nodeId<right.nodeId?-1:left.nodeId>right.nodeId?1:left.occurrence-right.occurrence)
 return hashCanonicalSnapshotText(canonicalSnapshotValue([CONTENT_EFFECTIVE_HASH_CONTRACT,digest(row['subtreeHash']),
  display,dependencyFields.map(field=>digest(row[field]))]))
}
