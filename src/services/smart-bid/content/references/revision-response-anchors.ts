/**
 * @module app:services/smart-bid/content/references/revision-response-anchors
 * 职责：核固定响应版本身份、章内锚点及同版要求挂接。
 * 边界：只检查定位投影，不代完整Response模型、分工、承诺、证明、句意与核定授权。
 * AI用途：原快照完整节点和挂接通过后检查响应落点；独立答复不造虚假章或正文锚点。
 */
import type {ContentStructureNode} from '../../content-tree-structure'
import {assertRevisionRequirementPins} from './revision-requirement-pins'
import {snapshotReferenceFields,snapshotReferenceIdentity,snapshotReferenceRecord,visitSnapshotReferences} from './snapshot-reference-values'

type AnchorNode=Pick<ContentStructureNode,'nodeId'|'parentId'|'type'>
function within(anchor:string,chapter:string,nodes:ReadonlyMap<string,AnchorNode>):boolean {
 const seen=new Set<string>()
 let current=nodes.get(anchor)
 while(current&&!seen.has(current.nodeId)){
  if(current.nodeId===chapter)return true
  seen.add(current.nodeId);current=nodes.get(current.parentId)
 }
 return false
}
/** 原响应版可早于本候选修订；只核固定身份，不把revisionId换成当前候选，也不改正文。 */
export function assertRevisionResponseAnchors(value:unknown,pins:unknown,nodes:readonly AnchorNode[]):void {
 assertRevisionRequirementPins(pins,nodes)
 const pinSet=new Set<string>(),byId=new Map(nodes.map(node=>[node.nodeId,node])),seen=new Set<string>()
 if(byId.size!==nodes.length)throw Error('SNAPSHOT_RESPONSE_ANCHOR')
 visitSnapshotReferences(pins,item=>{
  const pin=snapshotReferenceFields(item,['chapterId','lineageId','version'],'SNAPSHOT_RESPONSE_PIN')
  pinSet.add(JSON.stringify([pin['chapterId'],pin['lineageId'],pin['version']]))
 },'SNAPSHOT_RESPONSE_PIN')
 visitSnapshotReferences(value,item=>{
  const row=snapshotReferenceRecord(item,'SNAPSHOT_RESPONSE_MODEL'),id=row['id']
  if(!Object.hasOwn(row,'id')||!snapshotReferenceIdentity(id)
   ||['assignmentId','lineageId','version','revisionId'].some(field=>!Object.hasOwn(row,field)||!snapshotReferenceIdentity(row[field])))
   throw Error('SNAPSHOT_RESPONSE_MODEL')
  if(seen.has(id))throw Error('SNAPSHOT_RESPONSE_DUPLICATE')
  seen.add(id)
  if(!Object.hasOwn(row,'chapterId')){
   if(Object.hasOwn(row,'anchorNodeId'))throw Error('SNAPSHOT_RESPONSE_ANCHOR')
   return
  }
  const chapterId=row['chapterId'],anchor=row['anchorNodeId']
  if(!snapshotReferenceIdentity(chapterId)||byId.get(chapterId)?.type!=='chapter'||!snapshotReferenceIdentity(anchor)
   ||!within(anchor,chapterId,byId))throw Error('SNAPSHOT_RESPONSE_ANCHOR')
  if(!pinSet.has(JSON.stringify([chapterId,row['lineageId'],row['version']])))throw Error('SNAPSHOT_RESPONSE_PIN')
 },'SNAPSHOT_RESPONSE_MODEL')
}
