/**
 * @module app:views/features/application/smart-bid/authoring/model/content-node-version-reader
 * 职责：通过正文宿主原视图读取精确节点版本，复核查询唯一性及载荷摘要。
 * 边界：不保存、不复制节点真源、不读取完整快照或授予采用权；清单成员另核。
 * AI用途：固定快照给定nodeId/nodeHash后取得原字段绑定，供完整清单组装消费。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {canonicalContentNode,hashContentNode} from '@/services/smart-bid/content-node-hash'
import {readContentNodeLinks} from '@/services/smart-bid/content/content-node-links'
import type {ContentStructureNode} from '@/services/smart-bid/content-tree-structure'
import {hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'

/** 固定快照交出的精确节点版本；节点稳定身份不按NFC另找替代行。 */
export type ContentNodeVersionSelection=Readonly<{nodeId:string;nodeHash:string}>
/** 原视图读取证明；消费者须继续核本节点属于本次完整清单。 */
export type ContentNodeVersionBinding=Readonly<{
 dataViewKey:string;requiresSnapshotMembershipCheck:true;assertCurrent:()=>void
}>
const fields=['projectId','nodeId','nodeHash','payload']
function identity(value:unknown):value is string {
 return typeof value==='string'&&value.trim().length>0&&value.trim()===value
}
function validScope(view:DataView):boolean {
 return view.dataTable?.modelBinding?.modelName==='ContentNodeVersion'&&view.commitMode==='staged'
  &&['projectId','nodeId','nodeHash'].every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}
/** 来源明确报告完整单项匹配；不把物理主键或已加载一行当语义唯一约束。 */
export function hasCompleteSingleContentResult(view:DataView):boolean {
 return view.countReported===true&&view.total===1&&view.rows.length===1&&view.nextPageAvailable!==true
}
/** 核单节点确定载荷及引用形状；完整树和外部引用另核。 */
export function assertContentNodeVersionPayload(payload:unknown,nodeId:string):asserts payload is ContentStructureNode {
 canonicalContentNode(payload)
 if(!isRecord(payload)||Object.getOwnPropertyDescriptor(payload,'nodeId')?.value!==nodeId)
  throw Error('CONTENT_NODE_VERSION_PAYLOAD_IDENTITY')
 const keys=['nodeId','parentId','index','type','class','value','data']
 if(Reflect.ownKeys(payload).length!==keys.length||!keys.every(key=>Object.hasOwn(payload,key)))
  throw Error('CONTENT_NODE_VERSION_PAYLOAD_MODEL')
 readContentNodeLinks(payload)
}

/** 复用原查询、字段权限和读证明；有完整来源计数才认定一个语义匹配，不自行拉全或探空页。 */
export async function readContentNodeVersion(host:ContentRevisionReadHost,input:ContentNodeVersionSelection):Promise<ContentNodeVersionBinding> {
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host,{nodeId,nodeHash}=input
 assertHost()
 if(!identity(scenarioId)||!identity(projectId)||!identity(nodeId)||typeof nodeHash!=='string'||!/^[a-f0-9]{64}$/u.test(nodeHash))
  throw Error('CONTENT_NODE_VERSION_IDENTITY_REQUIRED')
 const dataViewKey=buildDataViewKey('ContentNodeVersion','selectedVersion',scenarioId),view=runtime.resolveView(dataViewKey)
 if(!view||!validScope(view))throw Error('CONTENT_NODE_VERSION_SCOPE_REQUIRED')
 if(view.hasEditingChanges())throw Error('CONTENT_NODE_VERSION_EDITING')
 view.queryContext={...view.queryContext,projectId,nodeId,nodeHash}
 const assertScope=()=>{
  assertHost()
  if(!validScope(view)||view.hasEditingChanges()||view.queryContext['projectId']!==projectId
   ||view.queryContext['nodeId']!==nodeId||view.queryContext['nodeHash']!==nodeHash)throw Error('CONTENT_NODE_VERSION_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_NODE_VERSION_NOT_UNIQUE')
 const row=view.rows[0]
 if(row?.['projectId'] !== projectId||row['nodeId']!==nodeId||row['nodeHash']!==nodeHash)
  throw Error('CONTENT_NODE_VERSION_UNAVAILABLE')
 const assertRow=view.captureReadRow(row,fields),payload=row['payload']
 assertContentNodeVersionPayload(payload,nodeId)
 const hash=await hashContentNode(payload)
 assertScope();assertResult();assertRow()
 if(hash!==nodeHash)throw Error('CONTENT_NODE_VERSION_HASH_MISMATCH')
 return Object.freeze({dataViewKey,requiresSnapshotMembershipCheck:true,assertCurrent:()=>{
  assertScope();assertResult();assertRow()
  if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_NODE_VERSION_NOT_UNIQUE')
 }})
}
