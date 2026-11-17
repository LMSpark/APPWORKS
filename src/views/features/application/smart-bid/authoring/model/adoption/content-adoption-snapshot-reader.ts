/**
 * @module app:views/features/application/smart-bid/authoring/model/adoption/content-adoption-snapshot-reader
 * 职责：沿原采用关联的合并修订回读快照及完整节点。
 * 边界：只读历史结果，不从现头重建，不证明原处理是否原子生效。
 */
import {buildDataViewKey} from '@spark-appworks/spark-data'
import type {ContentRevisionReadHost,readAdoptedContentRevision} from '../content-revision-reader'
import {assertRevisionManifest,readContentSnapshotIndex} from '../content-snapshot-reader'
import {readContentSnapshotNodes} from '../content-snapshot-nodes'

/** 历史读取使用独立命名视图，复用同版快照/成员验证。 */
export async function readAdoptionSnapshot(host:ContentRevisionReadHost,merge:Awaited<ReturnType<typeof readAdoptedContentRevision>>){
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent();merge.assertCurrent()
 const key=buildDataViewKey('ContentRevision','selectedAdoptionRevision',scenarioId)
 if(merge.dataViewKey!==key)throw Error('CONTENT_ADOPTION_REVISION_REQUIRED')
 const view=runtime.resolveView(key),row=view?.rows[0],snapshotHash=row?.['snapshotHash']
 if(!view||row?.['projectId']!==projectId||typeof snapshotHash!=='string')throw Error('CONTENT_ADOPTION_REVISION_REQUIRED')
 const assertRow=view.captureReadRow(row,['projectId','snapshotHash','baselineId','stageRef','templateRefs'])
 const scopedHost={...host,assertCurrent:()=>{host.assertCurrent();merge.assertCurrent();assertRow()}}
 const snapshot=await readContentSnapshotIndex(scopedHost,{snapshotHash},'adoption')
 assertRevisionManifest(runtime.resolveView(snapshot.dataViewKey)?.rows[0]?.['manifest'],row)
 const nodes=await readContentSnapshotNodes(scopedHost,snapshot)
 return Object.freeze({snapshot,nodes,assertCurrent:nodes.assertCurrent})
}
