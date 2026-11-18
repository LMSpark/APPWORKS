/**
 * @module app:services/smart-bid/content/calculation/attachment-index-generator
 * 职责：把固定递交范围内的附件资源版本及原正文落点投影为目录。
 * 边界：按来源交付顺序展开；附件准用、实件内容和目标页码由原责任方核验。
 */
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from '../references/snapshot-reference-values'

export const ATTACHMENT_INDEX_GENERATOR=Object.freeze({key:'attachment-index',version:'1'})

/** 目录格保留资源版本和页码引用，供中间表示及最终分页分别解析。 */
export function generateAttachmentIndex(entries:unknown){
 const error='CONTENT_ATTACHMENT_INDEX_ENTRY'
 const seen=new Set<string>()
 const rows:Array<readonly [
  {value:string;data:{附件:{type:'resource';resourceVersionId:string}}},
  {value:string;data:{页码:{type:'page';nodeId:string}}},
 ]>=[]
 visitSnapshotReferences(entries,value=>{
  const {resourceVersionId,nodeId}=snapshotReferenceFields(value,['resourceVersionId','nodeId'],error)
  if(!snapshotReferenceIdentity(resourceVersionId)||!snapshotReferenceIdentity(nodeId))throw Error(error)
  const identity=JSON.stringify([resourceVersionId,nodeId])
  if(seen.has(identity))throw Error(error)
  seen.add(identity)
  rows.push([
   {value:'{{附件}}',data:{附件:{type:'resource',resourceVersionId}}},
   {value:'{{页码}}',data:{页码:{type:'page',nodeId}}},
  ])
 },error)
 return {header:['附件','页码'],rows}
}
