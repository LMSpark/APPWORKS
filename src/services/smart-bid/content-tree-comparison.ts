/**
 * @module app:services/smart-bid/content-tree-comparison
 * 职责：对完整B/O/T内容树执行结构、身份、节点生命周期及同级顺序比较。
 * 边界：输出确定JSON诊断，不合并/保存，不核独立响应、外部引用、模板或采用授权。
 */
import {canonicalContentNode} from './content-node-hash'
import {validateContentTreeStructure} from './content-tree-structure'
import type {ContentStructureNode} from './content-tree-structure'
import {compareContentNodeVersions} from './content-node-comparison'
import type {ContentNodeComparison} from './content-node-comparison'
import {compareContentSiblingOrder} from './content-sibling-order'
import type {ContentSiblingOrderComparison} from './content-sibling-order'
import {readContentNodeLinks} from './content/content-node-links'
import type {ContentNodeLink} from './content/content-node-links'

/** 引用只在所属固定快照内定位，不把另一版存在当作本版有效。 */
export type ContentTreeLinkCheck=ContentNodeLink & Readonly<{
 snapshot:'BASIS'|'CURRENT'|'CANDIDATE';targetExists:boolean
}>
/** 空表是否计算表须核该版模板，不从空数组或类名猜生成器。 */
export type ContentTreeGeneratorCheck=Readonly<{snapshot:'BASIS'|'CURRENT'|'CANDIDATE';nodeId:string}>

/** 三份已完整取得的树；undefined不表示空树，允许首次建稿明确传空数组。 */
export type ContentTreeComparisonInput=Readonly<{
 projectId:string;basis:unknown;current:unknown;candidate:unknown
}>
/** 逐节点和逐父节点的诊断；不是完整修订语义校验或可提交的合并结果。 */
export type ContentTreeComparison=Readonly<{
 projectId:string;nodes:readonly ContentNodeComparison[];siblings:readonly ContentSiblingOrderComparison[]
 linkChecks:readonly ContentTreeLinkCheck[];tableGeneratorChecks:readonly ContentTreeGeneratorCheck[]
 requiresExternalReferenceChecks:true
 requiresCurrentBasisChecks:true
 /** 最终合并尚未形成，必须再对合并后的完整快照执行适用检查。 */
 requiresMergedSnapshotValidation:true
}>
type Entry=Readonly<{payload:unknown;structure:ContentStructureNode}>

function readTree(value:unknown,projectId:string,aliases:Map<string,string>):Map<string,Entry> {
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)throw Error('CONTENT_TREE_SNAPSHOT_REQUIRED')
 const result=new Map<string,Entry>(),structures:ContentStructureNode[]=[]
 for(let index=0;index<value.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(value,String(index))
  if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('CONTENT_TREE_SNAPSHOT_REQUIRED')
  const payload:unknown=descriptor.value
  canonicalContentNode(payload)
  if(payload===null||typeof payload!=='object')throw Error('CONTENT_TREE_SNAPSHOT_NODE')
  const nodeId:unknown=Object.getOwnPropertyDescriptor(payload,'nodeId')?.value
  const parentId:unknown=Object.getOwnPropertyDescriptor(payload,'parentId')?.value
  const position:unknown=Object.getOwnPropertyDescriptor(payload,'index')?.value
  const type:unknown=Object.getOwnPropertyDescriptor(payload,'type')?.value
  if(typeof nodeId!=='string'||typeof parentId!=='string'||typeof position!=='number'||typeof type!=='string')throw Error('CONTENT_TREE_SNAPSHOT_NODE')
  const key=nodeId.normalize('NFC'),previous=aliases.get(key)
  if(previous!==undefined&&previous!==nodeId)throw Error('CONTENT_TREE_IDENTITY_ALIAS')
  aliases.set(key,nodeId)
  const structure={nodeId,parentId,index:position,type}
  structures.push(structure);result.set(nodeId,{payload,structure})
 }
 const errors=validateContentTreeStructure({projectId,nodes:structures})
 if(errors.length)throw Error(`CONTENT_TREE_SNAPSHOT_STRUCTURE:${errors.join(';')}`)
 return result
}
function childIds(tree:ReadonlyMap<string,Entry>,parentId:string):string[] {
 return [...tree.values()].map(entry=>entry.structure).filter(node=>node.parentId===parentId)
  .sort((a,b)=>a.index-b.index).map(node=>node.nodeId)
}

/** 先核完整树，再识别仍足以阻断删除的内部引用；外部引用继续待核。 */
export function compareContentTreeSnapshots(input:ContentTreeComparisonInput):ContentTreeComparison {
 const {projectId}=input,aliases=new Map<string,string>()
 const basis=readTree(input.basis,projectId,aliases),current=readTree(input.current,projectId,aliases),candidate=readTree(input.candidate,projectId,aliases)
 const ids=[...new Set([...basis.keys(),...current.keys(),...candidate.keys()])].sort()
 const parents=new Set<string>()
 for(const tree of [basis,current,candidate])for(const entry of tree.values())parents.add(entry.structure.parentId)
 const siblings=[...parents].sort().map(parentId=>compareContentSiblingOrder({parentId,
  basis:childIds(basis,parentId),current:childIds(current,parentId),candidate:childIds(candidate,parentId)}))
 const linkChecks:ContentTreeLinkCheck[]=[],tableGeneratorChecks:ContentTreeGeneratorCheck[]=[]
 const trees:ReadonlyArray<Readonly<{snapshot:ContentTreeLinkCheck['snapshot'];tree:ReadonlyMap<string,Entry>}>>=[
  {snapshot:'BASIS',tree:basis},{snapshot:'CURRENT',tree:current},{snapshot:'CANDIDATE',tree:candidate}]
 for(const {snapshot,tree} of trees)for(const id of [...tree.keys()].sort()){
  const entry=tree.get(id)
  if(!entry)throw Error('CONTENT_TREE_SNAPSHOT_NODE')
  const inspection=readContentNodeLinks(entry.payload)
  for(const link of inspection.links)linkChecks.push({...link,snapshot,targetExists:tree.has(link.targetNodeId)})
  if(inspection.requiresTableGeneratorCheck)tableGeneratorChecks.push({snapshot,nodeId:id})
 }
 const linkIdentity=(link:ContentNodeLink)=>JSON.stringify([link.ownerNodeId,link.kind,link.path,link.targetNodeId])
 const basisLinks=new Set(linkChecks.filter(link=>link.snapshot==='BASIS').map(linkIdentity))
 const inbound=new Map<string,Set<string>>()
 for(const link of linkChecks){
  const {targetNodeId}=link
  if(!basis.has(targetNodeId)||!current.has(targetNodeId)||candidate.has(targetNodeId))continue
  if(link.snapshot!=='CANDIDATE'&&(link.snapshot!=='CURRENT'||basisLinks.has(linkIdentity(link))))continue
  const owners=inbound.get(targetNodeId)??new Set<string>()
  owners.add(link.ownerNodeId);inbound.set(targetNodeId,owners)
 }
 const nodes=ids.map(id=>{
  const owners=inbound.get(id)
  return compareContentNodeVersions({basis:basis.get(id)?.payload??null,current:current.get(id)?.payload??null,
   candidate:candidate.get(id)?.payload??null,...(owners?{deletionReferencedBy:[...owners].sort()}:{})})
 })
 return {projectId,nodes,siblings,linkChecks,tableGeneratorChecks,requiresExternalReferenceChecks:true,
  requiresCurrentBasisChecks:true,requiresMergedSnapshotValidation:true}
}
