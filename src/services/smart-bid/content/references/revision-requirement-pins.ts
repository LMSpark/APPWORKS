/**
 * @module app:services/smart-bid/content/references/revision-requirement-pins
 * 职责：核快照章节挂接的确定JSON模型及本版责任章归属。
 * 边界：不选择基线要求、不确认采纳状态、不删除旧挂接或放行响应/交付。
 * AI用途：完整节点装配后核本地挂接，再沿固定基线核被引要求版本和待处置事项。
 */
import type {ContentStructureNode} from '../../content-tree-structure'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from './snapshot-reference-values'

/** 新清单按精确版本字符串引用要求，不存原文/格式副本。 */
export type RevisionRequirementPin=Readonly<{chapterId:string;lineageId:string;version:string}>
/** 允许编辑稿保留待处置旧版；跨版适用和ADOPTED状态必须由固定基线实核。 */
export function assertRevisionRequirementPins(value:unknown,nodes:ReadonlyArray<Pick<ContentStructureNode,'nodeId'|'type'>>):void {
 const chapters=new Set(nodes.filter(node=>node.type==='chapter').map(node=>node.nodeId)),seen=new Set<string>()
 visitSnapshotReferences(value,item=>{
  const row=snapshotReferenceFields(item,['chapterId','lineageId','version'],'SNAPSHOT_REQUIREMENT_PIN_MODEL')
  const chapterId=row['chapterId'],lineageId=row['lineageId'],version=row['version']
  if(!snapshotReferenceIdentity(chapterId)||!chapters.has(chapterId))throw Error('SNAPSHOT_REQUIREMENT_PIN_CHAPTER')
  if(!snapshotReferenceIdentity(lineageId)||!snapshotReferenceIdentity(version))throw Error('SNAPSHOT_REQUIREMENT_PIN_MODEL')
  const identity=JSON.stringify([chapterId,lineageId,version])
  if(seen.has(identity))throw Error('SNAPSHOT_REQUIREMENT_PIN_DUPLICATE')
  seen.add(identity)
 },'SNAPSHOT_REQUIREMENT_PIN_MODEL')
}
