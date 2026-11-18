/**
 * @module app:services/smart-bid/content/references/revision-response-text
 * 职责：核独立答复原文、占位绑定及内部节点链接，禁止章内响应复制第二份正文。
 * 边界：不展开显示、不读最新事实、不核外部资源版本/权限，不代完整响应及作答分工。
 * AI用途：原响应定位通过后复用正文的占位和引用规则；数据与呈现格式分别处理。
 */
import {inspectContentPlaceholders,validateContentPlaceholders} from '../../content-placeholders'
import {validateContentReference} from '../../content-reference'
import {snapshotReferenceIdentity,snapshotReferenceRecord,visitSnapshotReferences} from './snapshot-reference-values'

export type IndependentResponseFactTarget=Readonly<{assignmentId:string;responseId:string}>

/** 从已通过原快照文本和锚点校验的独立答复取事实键。 */
export function readIndependentResponseFactIds(value:unknown,targets:readonly IndependentResponseFactTarget[]):readonly string[]{
 const requested=new Map<string,string>()
 for(const {responseId,assignmentId} of targets){
  if(!snapshotReferenceIdentity(responseId)||!snapshotReferenceIdentity(assignmentId)||requested.has(responseId))
   throw Error('SNAPSHOT_RESPONSE_FACT_SCOPE')
  requested.set(responseId,assignmentId)
 }
 if(!requested.size)return []
 const byId=new Map<string,readonly string[]>()
 visitSnapshotReferences(value,item=>{
  const row=snapshotReferenceRecord(item,'SNAPSHOT_RESPONSE_TEXT'),id=row['id']
  if(typeof id!=='string'||!requested.has(id))return
  const statement=row['statement']
  if(Object.hasOwn(row,'chapterId')||requested.get(id)!==row['assignmentId']||typeof statement!=='string'||byId.has(id))
   throw Error('SNAPSHOT_RESPONSE_FACT_SCOPE')
  const data=snapshotReferenceRecord(row['data'],'SNAPSHOT_RESPONSE_TEXT'),keys:string[]=[]
  for(const name of inspectContentPlaceholders(statement).names){
   const ref=snapshotReferenceRecord(data[name],'SNAPSHOT_RESPONSE_REFERENCE'),factId=ref['factId']
   if(ref['type']==='fact'&&typeof factId==='string')keys.push(factId)
  }
  byId.set(id,keys)
 },'SNAPSHOT_RESPONSE_TEXT')
 if(byId.size!==requested.size)throw Error('SNAPSHOT_RESPONSE_FACT_SCOPE')
 return [...new Set([...byId.keys()].sort().flatMap(id=>byId.get(id)??[]))]
}

/** 不改原串或规范值；章内内容只能沿已核anchor读取，独立答复保留自己的statement/data。 */
export function assertRevisionResponseText(value:unknown,nodeIds:readonly string[]):void {
 const nodes=new Set(nodeIds)
 visitSnapshotReferences(value,item=>{
  const row=snapshotReferenceRecord(item,'SNAPSHOT_RESPONSE_TEXT')
  if(Object.hasOwn(row,'chapterId')){
   if(Object.hasOwn(row,'statement')&&row['statement']!=='')throw Error('SNAPSHOT_RESPONSE_BODY_COPY')
   if(Object.hasOwn(row,'data')&&Object.keys(snapshotReferenceRecord(row['data'],'SNAPSHOT_RESPONSE_BODY_COPY')).length!==0)
    throw Error('SNAPSHOT_RESPONSE_BODY_COPY')
   return
  }
  const statement=row['statement']
  if(!Object.hasOwn(row,'statement')||!Object.hasOwn(row,'data')||typeof statement!=='string')throw Error('SNAPSHOT_RESPONSE_TEXT')
  for(const character of statement){const code=character.codePointAt(0)??0
   if(code>=0xD800&&code<=0xDFFF)throw Error('SNAPSHOT_RESPONSE_TEXT')}
  const data=snapshotReferenceRecord(row['data'],'SNAPSHOT_RESPONSE_TEXT')
  const errors=validateContentPlaceholders({value:statement,data})
  if(errors.length)throw Error(`SNAPSHOT_RESPONSE_PLACEHOLDER:${errors.join(';')}`)
  for(const key of Object.keys(data)){
   const ref=snapshotReferenceRecord(data[key],'SNAPSHOT_RESPONSE_REFERENCE'),referenceErrors=validateContentReference(ref)
   if(referenceErrors.length)throw Error(`SNAPSHOT_RESPONSE_REFERENCE:${referenceErrors.join(';')}`)
   const kind=ref['type'],target=ref['nodeId']
   if((kind==='page'||kind==='xref')&&(typeof target!=='string'||!nodes.has(target)))throw Error('SNAPSHOT_RESPONSE_LINK')
  }
 },'SNAPSHOT_RESPONSE_TEXT')
}
