/**
 * @module app:views/features/application/smart-bid/authoring/model/content-snapshot-nodes
 * 职责：在原完整成员视图中装配固定清单节点，核精确集合、结构和逐项摘要。
 * 边界：不复制节点真源或逐节点重查，不保存/采用；其它业务分组、外部引用和rootHash仍另核。
 * AI用途：已核快照索引交完整成员绑定，标准组件继续消费同一DataView。
 */
import {buildDataViewKey,type DataView,type DataViewFilterTree,type TreeConfig} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {hashContentNode} from '@/services/smart-bid/content-node-hash'
import {validateContentTreeStructure} from '@/services/smart-bid/content-tree-structure'
import {readContentNodeLinks} from '@/services/smart-bid/content/content-node-links'
import {hashContentSubtrees,SUBTREE_HASH_CONTRACT,type ContentSubtreeHash} from '@/services/smart-bid/content/hashes/content-subtree-hash'
import {assertContentNodeVersionPayload} from './content-node-version-reader'
import {hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'
import type {ContentSnapshotIndexBinding,ContentSnapshotRole} from './content-snapshot-reader'

const memberViews:Record<ContentSnapshotRole,string>={basis:'basisSnapshotMembers',head:'headSnapshotMembers',
 candidate:'snapshotMembers',adoption:'adoptionSnapshotMembers'}

/** 整批原成员绑定；空节点清单不绑定旧视图，也不发空IN查询。 */
export type ContentSnapshotNodesBinding=Readonly<{
 dataViewKey:string|null;nodeMembershipVerified:true;requiresBusinessSectionChecks:true;assertCurrent:()=>void
 subtreeHashContract:typeof SUBTREE_HASH_CONTRACT;subtreeHashes:readonly ContentSubtreeHash[]
}>
function validScope(view:DataView):boolean {
 const hashScope=(node:DataViewFilterTree):boolean=>{
  if('logic' in node)return node.logic==='and'&&node.filters.some(hashScope)
  return node.field==='nodeHash'&&node.operator==='in'&&isRecord(node.value)
   &&node.value['Type']==='GetInputParam'&&node.value['ParamName']==='nodeHashes'
 }
 return view.dataTable?.modelBinding?.modelName==='ContentNodeVersion'&&view.commitMode==='staged'
  &&view.queryConfig.allPages===true&&view.queryConfig.pagination==='paged'
  &&hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
  &&view.scopeFilter!==undefined&&hashScope(view.scopeFilter)
}
function complete(view:DataView,count:number):boolean {
 return view.countReported===true&&view.total===count&&view.rows.length===count&&view.nextPageAvailable!==true
}

/** 一次完整成员查询保留所有原证明；结构、集合或任一摘要不符均不交出有效绑定。 */
export async function readContentSnapshotNodes(host:ContentRevisionReadHost,snapshot:ContentSnapshotIndexBinding):Promise<ContentSnapshotNodesBinding> {
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host
 const assertOwners=()=>{assertHost();snapshot.assertCurrent()}
 assertOwners()
 if(snapshot.index.projectId!==projectId)throw Error('CONTENT_SNAPSHOT_NODES_PROJECT')
 const members=snapshot.index.nodes
 if(!members.length)return Object.freeze({dataViewKey:null,nodeMembershipVerified:true,requiresBusinessSectionChecks:true,assertCurrent:assertOwners,
  subtreeHashContract:SUBTREE_HASH_CONTRACT,subtreeHashes:Object.freeze([])})
 const dataViewKey=buildDataViewKey('ContentNodeVersion',memberViews[snapshot.role],scenarioId),view=runtime.resolveView(dataViewKey)
 if(!view||!validScope(view))throw Error('CONTENT_SNAPSHOT_NODES_SCOPE_REQUIRED')
 if(view.hasEditingChanges())throw Error('CONTENT_SNAPSHOT_NODES_EDITING')
 const treeConfig:TreeConfig={idField:'nodeId',parentIdField:{field:'payload',path:['parentId'],format:'native'},
  orderField:{field:'payload',path:['index'],format:'native'},textField:'nodeId',rootParentValue:projectId,lazy:false,treeMode:'flat'}
 view.setTreeConfig(treeConfig)
 const treeSignature=JSON.stringify(view.treeConfig)
 const expected=new Map(members.map(node=>[node.nodeId,node.nodeHash])),hashes=Object.freeze(members.map(node=>node.nodeHash))
 if(expected.size!==members.length)throw Error('CONTENT_SNAPSHOT_NODES_MEMBERS')
 view.queryConfig={...view.queryConfig,maxRows:members.length+1}
 view.queryContext={...view.queryContext,projectId,nodeHashes:hashes}
 const assertScope=()=>{
  assertOwners()
  if(runtime.resolveView(dataViewKey)!==view||!validScope(view)||view.hasEditingChanges()||view.queryConfig.maxRows!==members.length+1||JSON.stringify(view.treeConfig)!==treeSignature
   ||view.queryContext['projectId']!==projectId||JSON.stringify(view.queryContext['nodeHashes'])!==JSON.stringify(hashes))throw Error('CONTENT_SNAPSHOT_NODES_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(!complete(view,members.length))throw Error('CONTENT_SNAPSHOT_NODES_INCOMPLETE')
 const seen=new Set<string>()
 const prepared=view.rows.map(row=>{
  const nodeId=row['nodeId'],hash=row['nodeHash']
  if(row['projectId']!==projectId||typeof nodeId!=='string'||typeof hash!=='string'||seen.has(nodeId)||expected.get(nodeId)!==hash)throw Error('CONTENT_SNAPSHOT_NODES_MEMBERS')
  seen.add(nodeId)
  const proof=view.captureReadRow(row,['projectId','nodeId','nodeHash','payload']),payload=row['payload']
  assertContentNodeVersionPayload(payload,nodeId)
  if(readContentNodeLinks(payload).links.some(link=>!expected.has(link.targetNodeId)))throw Error('CONTENT_SNAPSHOT_NODES_REFERENCE')
  return {payload,hash,proof}
 })
 const errors=validateContentTreeStructure({projectId,nodes:prepared.map(item=>item.payload)})
 if(errors.length)throw Error(`CONTENT_SNAPSHOT_NODES_TREE:${errors.join(';')}`)
 const digests=await Promise.all(prepared.map(item=>hashContentNode(item.payload)))
 assertScope();assertResult();prepared.forEach(item=>item.proof())
 if(prepared.some((item,index)=>item.hash!==digests[index]))throw Error('CONTENT_SNAPSHOT_NODES_HASH')
 const assertCurrent=()=>{
  assertScope();assertResult();prepared.forEach(item=>item.proof())
  if(!complete(view,members.length))throw Error('CONTENT_SNAPSHOT_NODES_INCOMPLETE')
 }
 const subtreeHashes=await hashContentSubtrees({projectId,nodes:prepared.map(({payload,hash})=>({
  nodeId:payload.nodeId,parentId:payload.parentId,index:payload.index,type:payload.type,nodeHash:hash}))})
 assertCurrent()
 return Object.freeze({dataViewKey,nodeMembershipVerified:true,requiresBusinessSectionChecks:true,assertCurrent,
  subtreeHashContract:SUBTREE_HASH_CONTRACT,subtreeHashes})
}
