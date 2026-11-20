/**
 * @module app:services/smart-bid/content-node-comparison
 * 职责：按固定B/O/T快照比较一个内容节点的生命周期、内容与位置。
 * 边界：只返回诊断JSON，不合并/保存节点，不核授权；完整树、句段、兄弟顺序与采用依据另核。
 * AI用途：预演区分内容冲突与位置变化，并显式保留删除引用及当前依据的检查责任。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {canonicalContentNode} from './content-node-hash'

/** 三方分量关系；DIVERGED只表示两边均改且不同，索引不能据此直接判整树冲突。 */
export type ContentVersionDelta='UNCHANGED'|'CURRENT_ONLY'|'CANDIDATE_ONLY'|'SAME_CHANGE'|'DIVERGED'
/** 节点存在性与增删来源。 */
export type ContentNodePresence='ABSENT'|'PRESENT'|'CURRENT_ADDITION'|'CANDIDATE_ADDITION'|'CONCURRENT_ADDITION'
 |'CURRENT_DELETION'|'CANDIDATE_DELETION'|'CONCURRENT_DELETION'
/** 已确定的节点级冲突；顺序仍须在完整同级集合中判定。 */
export type ContentNodeConflict='TYPE_CHANGED'|'CONTENT'|'PARENT'|'DELETE_EDIT'|'ADD_COLLISION'|'REFERENCED_DELETE'
/** 节点比较输入；null是明确缺席，undefined不得冒充删除或未加载。 */
export type ContentNodeComparisonInput=Readonly<{
 basis:unknown;current:unknown;candidate:unknown
 /** 当前引用检查的完整已取结果；省略表示尚未检查，不是无引用。 */
 deletionReferencedBy?:readonly string[]
}>
/** 固定比较结果；不包含合并稿、采用许可或头指针。 */
export type ContentNodeComparison=Readonly<{
 nodeId:string|null;presence:ContentNodePresence
 content:ContentVersionDelta|null;parent:ContentVersionDelta|null;position:ContentVersionDelta|null
 conflicts:readonly ContentNodeConflict[]
 deletionReferenceCheck:'NOT_APPLICABLE'|'REQUIRED'|'CLEAR'|'REFERENCED';referencedBy:readonly string[]
 /** 插入与重排须结合完整同级集合，不能从单节点index自动裁决。 */
 requiresSiblingOrderReview:boolean
 /** 即使节点相同，当前基线、绑定、模板、所选来源及权限仍由正式预演责任方核验。 */
 requiresCurrentBasisChecks:true
 /** 核预演命令的完整合并快照；不是普通保存前全空间加载的前置。 */
 requiresFullSnapshotValidation:true
}>
type Version=Readonly<{nodeId:string;type:string;parentId:string;index:number;body:string}>

function version(value:unknown):Version|null {
 if(value===null)return null
 if(value===undefined)throw Error('CONTENT_NODE_SNAPSHOT_REQUIRED')
 const canonical=canonicalContentNode(value),parsed:unknown=JSON.parse(canonical)
 if(!isRecord(value)||!isRecord(parsed))throw Error('CONTENT_NODE_CANONICAL')
 const nodeId:unknown=Object.getOwnPropertyDescriptor(value,'nodeId')?.value
 const type:unknown=Object.getOwnPropertyDescriptor(value,'type')?.value
 const parentId:unknown=Object.getOwnPropertyDescriptor(value,'parentId')?.value,index=parsed['index']
 if(typeof nodeId!=='string'||typeof type!=='string'||typeof parentId!=='string'||typeof index!=='number')throw Error('CONTENT_NODE_CANONICAL')
 const body=JSON.stringify(Object.fromEntries(Object.entries(parsed).filter(([key])=>key!=='parentId'&&key!=='index')))
 return {nodeId,type,parentId,index,body}
}
function sameVersion(left:Version,right:Version):boolean {
 return left.nodeId===right.nodeId&&left.type===right.type&&left.body===right.body&&left.parentId===right.parentId&&left.index===right.index
}
function delta<T>(basis:T,current:T,candidate:T):ContentVersionDelta {
 if(current===basis&&candidate===basis)return 'UNCHANGED'
 if(current===basis)return 'CANDIDATE_ONLY'
 if(candidate===basis)return 'CURRENT_ONLY'
 return current===candidate?'SAME_CHANGE':'DIVERGED'
}
function presence(b:Version|null,o:Version|null,t:Version|null):ContentNodePresence {
 if(!b)return o?(t?'CONCURRENT_ADDITION':'CURRENT_ADDITION'):(t?'CANDIDATE_ADDITION':'ABSENT')
 return o?(t?'PRESENT':'CANDIDATE_DELETION'):(t?'CURRENT_DELETION':'CONCURRENT_DELETION')
}
function references(source:unknown):string[]|null {
 if(source===undefined)return null
 if(!Array.isArray(source)||Reflect.ownKeys(source).length!==source.length+1)throw Error('CONTENT_NODE_REFERENCE_CHECK')
 const result:string[]=[]
 for(let index=0;index<source.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(source,String(index)),value:unknown=descriptor?.value
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof value!=='string'||!value.trim())throw Error('CONTENT_NODE_REFERENCE_CHECK')
  result.push(value)
 }
 return result
}

/** 只比较当次明确快照，忽略自报hash；即使内容相同，依赖版本及当前权限仍须重新核验。 */
export function compareContentNodeVersions(input:ContentNodeComparisonInput):ContentNodeComparison {
 const b=version(input.basis),o=version(input.current),t=version(input.candidate)
 const versions=[b,o,t].filter((item):item is Version=>item!==null),first=versions[0]
 if(first&&versions.some(item=>item.nodeId!==first.nodeId))throw Error('CONTENT_NODE_IDENTITY_MISMATCH')
 const conflicts:ContentNodeConflict[]=[]
 if(first&&versions.some(item=>item.type!==first.type))conflicts.push('TYPE_CHANGED')
 const state=presence(b,o,t)
 const content=b&&o&&t?delta(b.body,o.body,t.body):null
 const parent=b&&o&&t?delta(b.parentId,o.parentId,t.parentId):null
 const position=b&&o&&t?delta(b.index,o.index,t.index):null
 if(content==='DIVERGED')conflicts.push('CONTENT')
 if(parent==='DIVERGED')conflicts.push('PARENT')
 if(b&&((!o&&t&&!sameVersion(t,b))||(!t&&o&&!sameVersion(o,b))))conflicts.push('DELETE_EDIT')
 if(!b&&o&&t&&!sameVersion(o,t))conflicts.push('ADD_COLLISION')
 const refs=state==='CANDIDATE_DELETION'?references(input.deletionReferencedBy):[]
 if(refs?.length)conflicts.push('REFERENCED_DELETE')
 return {nodeId:first?.nodeId??null,presence:state,content,parent,position,conflicts,
  deletionReferenceCheck:state!=='CANDIDATE_DELETION'?'NOT_APPLICABLE':refs===null?'REQUIRED':refs.length?'REFERENCED':'CLEAR',referencedBy:refs??[],
  requiresSiblingOrderReview:state==='PRESENT'?parent!=='UNCHANGED'||position!=='UNCHANGED':state!=='ABSENT',requiresCurrentBasisChecks:true,requiresFullSnapshotValidation:true}
}
