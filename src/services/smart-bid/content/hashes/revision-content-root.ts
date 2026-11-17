/**
 * @module app:services/smart-bid/content/hashes/revision-content-root
 * 职责：组合固定修订清单与同版基线成员的根摘要。
 * 边界：依赖快照和基线的原读取证明；不查最新事实，不确认本次用途。
 */
import {canonicalRevisionSnapshot,canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {readBaselineFactMembers} from '../references/baseline-fact-members'
import {snapshotReferenceFields,snapshotReferenceIdentity,snapshotReferenceRecord} from '../references/snapshot-reference-values'
import {hashContentRoot} from './content-root-hash'
import {hashContentRootSections} from './content-root-sections'

/** 事实分组固定不可变事实键及版本，正式值的显示摘要另由有效内容核验。 */
export async function hashRevisionContentRoot(input:Readonly<{manifest:unknown;baseline:unknown}>):Promise<string>{
 const error='CONTENT_ROOT_BASELINE_MISMATCH'
 const parsed:unknown=JSON.parse(canonicalRevisionSnapshot(input.manifest))
 const manifest=snapshotReferenceRecord(parsed,'CONTENT_ROOT_SNAPSHOT_MODEL')
 const baseline=snapshotReferenceFields(input.baseline,['id','projectId','stageRef','factVersions'],error)
 const {projectId,stageRef,nodes}=manifest
 if(!snapshotReferenceIdentity(projectId)||baseline['projectId']!==projectId||baseline['id']!==manifest['baselineId']||
  canonicalSnapshotValue(baseline['stageRef'])!==canonicalSnapshotValue(stageRef))throw Error(error)
 const members=[...readBaselineFactMembers(baseline['factVersions'])].sort(([a],[b])=>a<b?-1:a>b?1:0)
 const [factTableHash,sections]=await Promise.all([
  hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.fact-table/1',members])),
  hashContentRootSections(manifest),
 ])
 return hashContentRoot({projectId,nodes,factTableHash,...sections})
}
