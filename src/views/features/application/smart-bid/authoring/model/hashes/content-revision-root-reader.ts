/**
 * @module app:views/features/application/smart-bid/authoring/model/hashes/content-revision-root-reader
 * 职责：沿原修订和快照证明读取同版基线，复核根摘要。
 * 边界：调用方须确认编码合同；只读，不修改原摘要或判定采用许可。
 */
import {readContentBaselineFactIndex} from '../content-baseline-reader'
import type {ContentRevisionReadHost} from '../content-revision-reader'
import type {ContentSnapshotIndexBinding} from '../content-snapshot-reader'
import {hashRevisionContentRoot} from '@/services/smart-bid/content/hashes/revision-content-root'
import {CONTENT_ROOT_HASH_CONTRACT} from '@/services/smart-bid/content/hashes/content-root-hash'

export async function verifyReadableRevisionRoot(input:Readonly<{
 host:ContentRevisionReadHost;revisionDataViewKey:string;snapshot:ContentSnapshotIndexBinding;contract:string
}>){
 const {host,revisionDataViewKey,snapshot,contract}=input,{runtime,projectId}=host
 host.assertCurrent();snapshot.assertCurrent()
 if(contract!==CONTENT_ROOT_HASH_CONTRACT)throw Error('CONTENT_ROOT_HASH_CONTRACT_REQUIRED')
 const view=runtime.resolveView(revisionDataViewKey),row=view?.rows[0],expected=row?.['rootHash']
 const manifestRow=runtime.resolveView(snapshot.dataViewKey)?.rows[0]
 if(!view||!manifestRow||row?.['projectId']!==projectId||row['snapshotHash']!==manifestRow['snapshotHash']||
  row['baselineId']!==snapshot.index.baselineId)throw Error('CONTENT_ROOT_REVISION_MISMATCH')
 const assertRoot=view.captureReadRow(row,['projectId','snapshotHash','baselineId','stageRef','rootHash'])
 if(typeof expected!=='string'||!/^[a-f0-9]{64}$/u.test(expected))throw Error('CONTENT_ROOT_HASH_REQUIRED')
 const assertSnapshot=()=>{host.assertCurrent();snapshot.assertCurrent();assertRoot()}
 const baseline=await readContentBaselineFactIndex({...host,assertCurrent:assertSnapshot},
  {baselineId:snapshot.index.baselineId,stageRef:row['stageRef'],role:snapshot.role})
 const assertCurrent=()=>{assertSnapshot();baseline.assertCurrent()}
 assertCurrent()
 const source=runtime.resolveView(baseline.dataViewKey)?.rows[0]
 if(!source)throw Error('CONTENT_ROOT_BASELINE_MISMATCH')
 const rootHash=await hashRevisionContentRoot({manifest:manifestRow['manifest'],
  baseline:{id:source['id'],projectId:source['projectId'],stageRef:source['stageRef'],factVersions:source['factVersions']}})
 assertCurrent()
 if(rootHash!==expected)throw Error('CONTENT_ROOT_HASH_MISMATCH')
 return Object.freeze({rootHash,rootHashVerified:true,assertCurrent})
}
