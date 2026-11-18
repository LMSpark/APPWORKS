/**
 * @module app:services/smart-bid/content/revision-template-bindings
 * 职责：核固定清单中的分册模板引用结构及本版逻辑册归属。
 * 边界：不读取模板实体、不选择默认模板、不证明发布/适用或交付通过，不修改内容哈希。
 * AI用途：节点完整装配后核模板绑定；模板格式与业务内容分离，实体摘要及发布证据另查。
 */
import type {ContentStructureNode} from '../content-tree-structure'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from './references/snapshot-reference-values'

/** 新清单的固定模板引用；版本是精确字符串标识，不作版本号大小比较。 */
export type RevisionTemplateRef=Readonly<{documentId:string;key:string;version:string;hash:string}>
function reference(value:unknown):RevisionTemplateRef {
 const fields=snapshotReferenceFields(value,['documentId','key','version','hash'],'SNAPSHOT_TEMPLATE_MODEL')
 const documentId=fields['documentId'],key=fields['key'],version=fields['version'],hash=fields['hash']
 if(!snapshotReferenceIdentity(documentId))throw Error('SNAPSHOT_TEMPLATE_DOCUMENT')
 if(!snapshotReferenceIdentity(key)||!snapshotReferenceIdentity(version)||typeof hash!=='string'||!/^[a-f0-9]{64}$/u.test(hash))throw Error('SNAPSHOT_TEMPLATE_MODEL')
 return {documentId,key,version,hash}
}

/** 未选模板仍可编辑内容树；显式引用必须唯一指向本版document，不能指标题或已删册。 */
export function assertRevisionTemplateBindings(value:unknown,nodes:ReadonlyArray<Pick<ContentStructureNode,'nodeId'|'type'>>):void {
 const documents=new Set(nodes.filter(node=>node.type==='document').map(node=>node.nodeId)),bound=new Set<string>()
 const versions=new Map<string,Map<string,string>>()
 visitSnapshotReferences(value,item=>{
  const ref=reference(item)
  if(!documents.has(ref.documentId))throw Error('SNAPSHOT_TEMPLATE_DOCUMENT')
  if(bound.has(ref.documentId))throw Error('SNAPSHOT_TEMPLATE_DUPLICATE')
  bound.add(ref.documentId)
  const byVersion=versions.get(ref.key)??new Map<string,string>(),previous=byVersion.get(ref.version)
  if(previous!==undefined&&previous!==ref.hash)throw Error('SNAPSHOT_TEMPLATE_VERSION')
  byVersion.set(ref.version,ref.hash);versions.set(ref.key,byVersion)
 },'SNAPSHOT_TEMPLATE_MODEL')
}

function findDocument(byId:ReadonlyMap<string,ContentStructureNode>,nodeId:string):ContentStructureNode|undefined {
 const seen=new Set<string>()
 let current=byId.get(nodeId)
 while(current&&current.type!=='document'&&!seen.has(current.nodeId)){
  seen.add(current.nodeId)
  current=byId.get(current.parentId)
 }
 return current?.type==='document'?current:undefined
}

/** 从原树父链取各节点所属逻辑册，包含逻辑册自身。 */
export function readContentDocumentScope(nodes:readonly ContentStructureNode[],nodeIds:readonly string[]){
 const byId=new Map(nodes.map(node=>[node.nodeId,node]))
 if(byId.size!==nodes.length||new Set(nodeIds).size!==nodeIds.length)throw Error('CONTENT_DOCUMENT_SCOPE')
 return Object.freeze(nodeIds.map(nodeId=>{
  const document=findDocument(byId,nodeId)
  if(!document)throw Error('CONTENT_DOCUMENT_SCOPE')
  return Object.freeze({nodeId,documentId:document.nodeId})
 }))
}

/** 每个所选计算表沿原父链找到逻辑册，必须有该册明确固定的模板。 */
export function readCalculationTableTemplateRefs(value:unknown,nodes:readonly ContentStructureNode[],tableIds:readonly string[]){
 assertRevisionTemplateBindings(value,nodes)
 const bindings=new Map<string,RevisionTemplateRef>()
 visitSnapshotReferences(value,item=>{const ref=reference(item);bindings.set(ref.documentId,ref)},'SNAPSHOT_TEMPLATE_MODEL')
 const byId=new Map(nodes.map(node=>[node.nodeId,node]))
 return Object.freeze(tableIds.map(nodeId=>{
  const table=byId.get(nodeId)
  if(table?.type!=='table')throw Error('SNAPSHOT_CALCULATION_TABLE')
  const document=findDocument(byId,nodeId)
  const template=document?bindings.get(document.nodeId):undefined
  if(!template)throw Error('SNAPSHOT_CALCULATION_TEMPLATE_REQUIRED')
  return Object.freeze({nodeId,template:Object.freeze(template)})
 }))
}
