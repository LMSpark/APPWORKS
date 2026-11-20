/**
 * @module app:services/smart-bid/content-sibling-order
 * 职责：比较固定三版同一父节点下共同成员的相对顺序，单列成员变化。
 * 边界：不猜插入落点，不判缺席即删除，不生成完整合并稿或采用许可。
 * AI用途：先识别单方/相同/冲突重排，再交生命周期及插入位置预演接续。
 */

/** 顺序必须来自明确已取得的同一父节点快照，空数组与未加载不同。 */
export type ContentSiblingOrderInput=Readonly<{
 parentId:string;basis:readonly string[];current:readonly string[];candidate:readonly string[]
}>
/** 共同成员顺序结果；有新到或缺席成员时仍须解析其生命周期与落点。 */
export type ContentSiblingOrderComparison=Readonly<{
 parentId:string;status:'UNCHANGED'|'CURRENT_ORDER'|'CANDIDATE_ORDER'|'SAME_ORDER'|'CONFLICT'
 resolvedCommonOrder:readonly string[]|null
 currentNewAtParent:readonly string[];candidateNewAtParent:readonly string[]
 currentMissing:readonly string[];candidateMissing:readonly string[]
 requiresPresenceResolution:boolean;requiresCurrentBasisChecks:true;requiresFullSnapshotValidation:true
}>

function identity(value:unknown):string {
 if(typeof value!=='string'||!value.trim())throw Error('CONTENT_SIBLING_ID')
 for(const character of value){
  const point=character.codePointAt(0)
  if(point!==undefined&&point>=0xD800&&point<=0xDFFF)throw Error('CONTENT_SIBLING_ID')
 }
 return value
}
function order(value:unknown,parentId:string,aliases:Map<string,string>):string[] {
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)throw Error('CONTENT_SIBLING_ORDER_REQUIRED')
 const result:string[]=[],seen=new Set<string>()
 for(let index=0;index<value.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(value,String(index))
  if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('CONTENT_SIBLING_ORDER_REQUIRED')
  const id=identity(descriptor.value),key=id.normalize('NFC')
  if(key===parentId.normalize('NFC'))throw Error('CONTENT_SIBLING_SELF_PARENT')
  if(seen.has(key))throw Error('CONTENT_SIBLING_DUPLICATE')
  const previous=aliases.get(key)
  if(previous!==undefined&&previous!==id)throw Error('CONTENT_SIBLING_IDENTITY_ALIAS')
  seen.add(key);aliases.set(key,id);result.push(id)
 }
 return result
}
function equal(left:readonly string[],right:readonly string[]):boolean {
 return left.length===right.length&&left.every((id,index)=>id===right[index])
}

/** 只解决共同成员重排。新增/移入/缺席均逐项保留，不从旧index推定当前插入位置。 */
export function compareContentSiblingOrder(input:ContentSiblingOrderInput):ContentSiblingOrderComparison {
 const parentId=identity(input.parentId),aliases=new Map<string,string>()
 const basis=order(input.basis,parentId,aliases),current=order(input.current,parentId,aliases),candidate=order(input.candidate,parentId,aliases)
 const basisIds=new Set(basis),currentIds=new Set(current),candidateIds=new Set(candidate)
 const commonIds=new Set(basis.filter(id=>currentIds.has(id)&&candidateIds.has(id)))
 const b=basis.filter(id=>commonIds.has(id)),o=current.filter(id=>commonIds.has(id)),t=candidate.filter(id=>commonIds.has(id))
 const changedCurrent=!equal(b,o),changedCandidate=!equal(b,t)
 let status:ContentSiblingOrderComparison['status']='UNCHANGED',resolvedCommonOrder:readonly string[]|null=b
 if(changedCurrent&&changedCandidate){
  if(equal(o,t)){status='SAME_ORDER';resolvedCommonOrder=o}
  else{status='CONFLICT';resolvedCommonOrder=null}
 }else if(changedCurrent){status='CURRENT_ORDER';resolvedCommonOrder=o}
 else if(changedCandidate){status='CANDIDATE_ORDER';resolvedCommonOrder=t}
 const currentNewAtParent=current.filter(id=>!basisIds.has(id)),candidateNewAtParent=candidate.filter(id=>!basisIds.has(id))
 const currentMissing=basis.filter(id=>!currentIds.has(id)),candidateMissing=basis.filter(id=>!candidateIds.has(id))
 return {parentId,status,resolvedCommonOrder,currentNewAtParent,candidateNewAtParent,currentMissing,candidateMissing,
  requiresPresenceResolution:currentNewAtParent.length+candidateNewAtParent.length+currentMissing.length+candidateMissing.length>0,
  requiresCurrentBasisChecks:true,requiresFullSnapshotValidation:true}
}
