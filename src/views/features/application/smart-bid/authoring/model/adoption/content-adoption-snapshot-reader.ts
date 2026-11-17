/**
 * @module app:views/features/application/smart-bid/authoring/model/adoption/content-adoption-snapshot-reader
 * 职责：沿原采用关联的合并修订回读快照及完整节点。
 * 边界：只读历史结果，不从现头重建，不证明原处理是否原子生效。
 */
import {buildDataViewKey} from '@spark-appworks/spark-data'
import type {ContentRevisionReadHost,readAdoptedContentRevision} from '../content-revision-reader'
import {assertRevisionManifest,readContentSnapshotIndex} from '../content-snapshot-reader'
import {readContentSnapshotNodes} from '../content-snapshot-nodes'
import {readContentBaselineFactIndex} from '../content-baseline-reader'
import {hashRevisionContentRoot} from '@/services/smart-bid/content/hashes/revision-content-root'
import {CONTENT_ROOT_HASH_CONTRACT} from '@/services/smart-bid/content/hashes/content-root-hash'

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
 return Object.freeze({snapshot,nodes,assertCurrent:nodes.assertCurrent,
  async verifyRootHash(contract:string){
   nodes.assertCurrent()
   if(contract!==CONTENT_ROOT_HASH_CONTRACT)throw Error('CONTENT_ROOT_HASH_CONTRACT_REQUIRED')
   const assertRoot=view.captureReadRow(row,['rootHash'])
   const expected=row['rootHash']
   if(typeof expected!=='string'||!/^[a-f0-9]{64}$/u.test(expected))throw Error('CONTENT_ROOT_HASH_REQUIRED')
   const assertSnapshot=()=>{nodes.assertCurrent();assertRoot()}
   const baseline=await readContentBaselineFactIndex({...host,assertCurrent:assertSnapshot},
    {baselineId:snapshot.index.baselineId,stageRef:row['stageRef']})
   const assertCurrent=()=>{assertSnapshot();baseline.assertCurrent()}
   assertCurrent()
   const source=runtime.resolveView(baseline.dataViewKey)?.rows[0]
   if(!source)throw Error('CONTENT_ROOT_BASELINE_MISMATCH')
   const rootHash=await hashRevisionContentRoot({manifest:runtime.resolveView(snapshot.dataViewKey)?.rows[0]?.['manifest'],
    baseline:{id:source['id'],projectId:source['projectId'],stageRef:source['stageRef'],factVersions:source['factVersions']}})
   assertCurrent()
   if(rootHash!==expected)throw Error('CONTENT_ROOT_HASH_MISMATCH')
   return Object.freeze({rootHash,rootHashVerified:true,assertCurrent})
  }})
}
