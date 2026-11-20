/**
 * @module app:services/smart-bid/content/projection/page-reference-projection
 * 职责：将一次出件的分页结果绑定到原正文和展开表格中的每处页码引用。
 * 边界：只返回呈现替换位置和值，不改变原节点、引用或中间表示。
 */
import {readContentNodeLinkOccurrences} from '../content-node-links'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from '../references/snapshot-reference-values'

/** 分页适配器提供目标节点和实际显示页标；保留罗马数字等版面标签。 */
export function projectContentPageReferences(nodes:readonly unknown[],pagination:unknown){
 const pages=new Map<string,string>(),error='CONTENT_PAGE_PAGINATION_MODEL'
 visitSnapshotReferences(pagination,value=>{
  const {nodeId,pageLabel}=snapshotReferenceFields(value,['nodeId','pageLabel'],error)
  if(!snapshotReferenceIdentity(nodeId)||!snapshotReferenceIdentity(pageLabel)||pages.has(nodeId))throw Error(error)
  pages.set(nodeId,pageLabel)
 },error)
 return Object.freeze(nodes.flatMap(node=>readContentNodeLinkOccurrences(node).flatMap(occurrence=>{
  if(occurrence.kind!=='page')return []
  const pageLabel=pages.get(occurrence.targetNodeId)
  if(pageLabel===undefined)throw Error(`CONTENT_PAGE_TARGET_MISSING:${occurrence.ownerNodeId}:${occurrence.targetNodeId}`)
  return [Object.freeze({...occurrence,path:Object.freeze([...occurrence.path]),pageLabel})]
 })))
}
