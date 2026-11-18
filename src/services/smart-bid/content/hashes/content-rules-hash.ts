/**
 * @module app:services/smart-bid/content/hashes/content-rules-hash
 * 职责：将已核适用的章节角色、可交付性和分册限制固定为审核依赖。
 * 边界：模板和分册限制的实际选取由原来源负责，版式另在呈现层处理。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from '../references/snapshot-reference-values'

/** 只接审核范围中的每个节点和每册已解析出的业务限制。 */
export async function hashContentRules(input:Readonly<{
 scope:ReadonlyArray<Readonly<{nodeId:string;documentId:string}>>;nodes:unknown;documents:unknown
}>):Promise<string>{
 const owners=new Map(input.scope.map(({nodeId,documentId})=>[nodeId,documentId])),documentIds=new Set(owners.values())
 if(owners.size!==input.scope.length||input.scope.some(({nodeId,documentId})=>
  !snapshotReferenceIdentity(nodeId)||!snapshotReferenceIdentity(documentId)))throw Error('CONTENT_RULES_SCOPE')
 const error='CONTENT_RULES_MODEL'
 const nodes=new Map<string,Record<string,unknown>>(),documents=new Map<string,Record<string,unknown>>()
 visitSnapshotReferences(input.nodes,value=>{
  const row=snapshotReferenceFields(value,['nodeId','documentId','role','deliverable'],error)
  const {nodeId,documentId,role,deliverable}=row
  if(!snapshotReferenceIdentity(nodeId)||!snapshotReferenceIdentity(documentId)||
   role!==null&&role!=='RESPONSE'&&role!=='GENERAL'||typeof deliverable!=='boolean')throw Error(error)
  if(owners.get(nodeId)!==documentId||nodes.has(nodeId))throw Error('CONTENT_RULES_SCOPE')
  nodes.set(nodeId,row)
 },error)
 visitSnapshotReferences(input.documents,value=>{
  const row=snapshotReferenceFields(value,['documentId','restrictions'],error),documentId=row['documentId']
  if(!snapshotReferenceIdentity(documentId))throw Error(error)
  if(!documentIds.has(documentId)||documents.has(documentId))throw Error('CONTENT_RULES_SCOPE')
  visitSnapshotReferences(row['restrictions'],()=>{},error)
  documents.set(documentId,row)
 },error)
 if(nodes.size!==owners.size||documents.size!==documentIds.size)throw Error('CONTENT_RULES_SCOPE')
 const order=(records:ReadonlyMap<string,Record<string,unknown>>)=>[...records.keys()].sort().map(id=>records.get(id))
 return hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.content-rules/1',order(nodes),order(documents)]))
}
