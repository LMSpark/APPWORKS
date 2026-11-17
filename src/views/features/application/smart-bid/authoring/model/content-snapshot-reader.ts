/**
 * @module app:views/features/application/smart-bid/authoring/model/content-snapshot-reader
 * 职责：从正文宿主原RevisionSnapshot视图读取固定清单、复核同版摘要并取得节点版本索引。
 * 边界：不写入或缓存快照，不把摘要和索引通过等同业务闭包/rootHash或采用通过。
 * AI用途：先取得原清单读取证明，再按完整成员集合装配节点及其它固定业务记录。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {readSnapshotNodeIndex,type RevisionSnapshotNodeIndex} from '@/services/smart-bid/content/revision-snapshot-index'
import {hashRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'
import {hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'
import {hasCompleteSingleContentResult} from './content-node-version-reader'

/** 精确快照键；必须来自所选修订或冻结首稿，不能由草稿哈希冒充。 */
export type ContentSnapshotSelection=Readonly<{snapshotHash:string}>
/** 原清单绑定和索引；修订阶段/模板/基线匹配及完整校验另核。 */
export type ContentSnapshotIndexBinding=Readonly<{
 dataViewKey:string;index:RevisionSnapshotNodeIndex;manifestHashVerified:true;requiresRevisionMatchCheck:true;assertCurrent:()=>void
}>
function validScope(view:DataView):boolean {
 return view.dataTable?.modelBinding?.modelName==='RevisionSnapshot'&&view.commitMode==='staged'
  &&['projectId','snapshotHash'].every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

/** 沿本次原DataView读取清单索引；同值重新查询也使旧绑定失效，不生成替代快照。 */
export async function readContentSnapshotIndex(host:ContentRevisionReadHost,input:ContentSnapshotSelection):Promise<ContentSnapshotIndexBinding> {
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host,{snapshotHash}=input
 assertHost()
 if(typeof snapshotHash!=='string'||!/^[a-f0-9]{64}$/u.test(snapshotHash)
  ||typeof projectId!=='string'||projectId.trim().length===0||projectId.trim()!==projectId
  ||typeof scenarioId!=='string'||scenarioId.trim().length===0||scenarioId.trim()!==scenarioId)throw Error('CONTENT_SNAPSHOT_IDENTITY_REQUIRED')
 const dataViewKey=buildDataViewKey('RevisionSnapshot','selectedSnapshot',scenarioId),view=runtime.resolveView(dataViewKey)
 if(!view||!validScope(view))throw Error('CONTENT_SNAPSHOT_SCOPE_REQUIRED')
 if(view.hasEditingChanges())throw Error('CONTENT_SNAPSHOT_EDITING')
 view.queryContext={...view.queryContext,projectId,snapshotHash}
 const assertScope=()=>{
  assertHost()
  if(!validScope(view)||view.hasEditingChanges()||view.queryContext['projectId']!==projectId
   ||view.queryContext['snapshotHash']!==snapshotHash)throw Error('CONTENT_SNAPSHOT_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_SNAPSHOT_NOT_UNIQUE')
 const row=view.rows[0]
 if(row?.['projectId']!==projectId||row['snapshotHash']!==snapshotHash)throw Error('CONTENT_SNAPSHOT_UNAVAILABLE')
 const assertRow=view.captureReadRow(row,['projectId','snapshotHash','manifest'])
 const index=readSnapshotNodeIndex(row['manifest'],projectId)
 const actualHash=await hashRevisionSnapshot(row['manifest'])
 assertScope();assertResult();assertRow()
 if(actualHash!==snapshotHash)throw Error('CONTENT_SNAPSHOT_HASH_MISMATCH')
 return Object.freeze({dataViewKey,index,manifestHashVerified:true,requiresRevisionMatchCheck:true,assertCurrent:()=>{
  assertScope();assertResult();assertRow()
  if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_SNAPSHOT_NOT_UNIQUE')
 }})
}
