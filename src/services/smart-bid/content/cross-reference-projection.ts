/**
 * @module app:services/smart-bid/content/cross-reference-projection
 * 职责：将固定呈现目标的标题或编号关联到每处 xref。
 * 边界：编号和标题解析由本次呈现提供；不改原节点或提前填页码。
 */
import {readContentNodeLinkOccurrences} from './content-node-links'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from './references/snapshot-reference-values'

/** 目标没有适用的标题或编号时，报告原引用位置。 */
export function projectContentCrossReferences(nodes:readonly unknown[],targets:unknown){
 const displays=new Map<string,Readonly<{title:string|null;number:string|null}>>(),error='CONTENT_XREF_TARGET_MODEL'
 visitSnapshotReferences(targets,value=>{
  const {nodeId,title,number}=snapshotReferenceFields(value,['nodeId','title','number'],error)
  if(!snapshotReferenceIdentity(nodeId)||title!==null&&!snapshotReferenceIdentity(title)||
   number!==null&&!snapshotReferenceIdentity(number)||displays.has(nodeId))throw Error(error)
  displays.set(nodeId,{title,number})
 },error)
 return Object.freeze(nodes.flatMap(node=>readContentNodeLinkOccurrences(node).flatMap(occurrence=>{
  if(occurrence.kind!=='xref')return []
  const display=occurrence.show===undefined?undefined:displays.get(occurrence.targetNodeId)?.[occurrence.show]
  if(display===undefined||display===null)throw Error(`CONTENT_XREF_TARGET_MISSING:${occurrence.ownerNodeId}:${occurrence.targetNodeId}`)
  return [Object.freeze({...occurrence,path:Object.freeze([...occurrence.path]),display})]
 })))
}
