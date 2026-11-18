/**
 * @module app:services/smart-bid/content/references/template-content-rules
 * 职责：按节点实际选中的固定模板类解析角色和可交付性。
 * 边界：无显式可交付值时消费原规则提供的默认值；不继承版式字段所用的 basedOn。
 */
import {snapshotReferenceIdentity,snapshotReferenceRecord,visitSnapshotReferences} from './snapshot-reference-values'

/** 仅计算选中类的直接声明；同一节点不允许互斥规则并存。 */
export function resolveTemplateContentRules(node:unknown,classes:unknown,defaultDeliverable:boolean){
 const error='CONTENT_TEMPLATE_RULE_CLASS'
 const row=snapshotReferenceRecord(node,error),type=row['type']
 if(!snapshotReferenceIdentity(type)||typeof defaultDeliverable!=='boolean')throw Error(error)
 const definitions=new Map<string,Record<string,unknown>>()
 visitSnapshotReferences(classes,item=>{
  const definition=snapshotReferenceRecord(item,error),name=definition['name']
  if(!snapshotReferenceIdentity(name)||definitions.has(name))throw Error(error)
  definitions.set(name,definition)
 },error)
 const selected=new Set<string>(),groups=new Set<string>()
 let role:'RESPONSE'|'GENERAL'|null=null,deliverable:boolean|undefined
 visitSnapshotReferences(row['class'],name=>{
  const definition=typeof name==='string'?definitions.get(name):undefined
  if(typeof name!=='string'||!definition||selected.has(name)||!Array.isArray(definition['elements'])||!definition['elements'].includes(type))
   throw Error(error)
  selected.add(name)
  const group=definition['exclusiveGroup'],explicitRole=definition['role'],explicitDeliverable=definition['deliverable']
  if(group!==undefined&&(!snapshotReferenceIdentity(group)||groups.has(group)))throw Error(error)
  if(typeof group==='string')groups.add(group)
  if(explicitRole!==undefined){
   if(type!=='chapter'||role!==null||explicitRole!=='RESPONSE'&&explicitRole!=='GENERAL')throw Error(error)
   role=explicitRole
  }
  if(explicitDeliverable!==undefined){
   if(typeof explicitDeliverable!=='boolean'||deliverable!==undefined&&deliverable!==explicitDeliverable)throw Error(error)
   deliverable=explicitDeliverable
  }
  if(name==='legacy'&&(type!=='raw'||explicitDeliverable!==false))throw Error(error)
 },error)
 if(type==='raw'&&(!selected.has('legacy')||deliverable!==false))throw Error(error)
 return Object.freeze({role,deliverable:deliverable??defaultDeliverable})
}
