/** @module app:views/features/application/smart-bid/followup/tender-change-chapter-reader
 * 职责：以原已采用正文的固定快照核对两版基线要求差异涉及的章节挂接。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {hashRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'
import {readSnapshotNodeIndex} from '@/services/smart-bid/content/revision-snapshot-index'
import {readSnapshotRequirementPins} from '@/services/smart-bid/content/hashes/content-root-sections'
import {traceTenderChangeChapterPins} from '@/services/smart-bid/content/references/tender-change-requirement-impact'
import {originalRegistrationView,readOriginalRegistrationView} from '../authority/original-registration-view'
import {assertRevisionManifest} from '../authoring/model/hashes/content-snapshot-reader'
import {compareBidFrozenBaselines,readBidFrozenBaseline} from '../collaboration/handoff/bid-project-scope-reader'

const revisionFields=['baselineId','snapshotHash','stageRef','templateRefs','status']
const revisionView='originalImpactRevision',snapshotView='originalImpactSnapshot'
type Host=Parameters<typeof compareBidFrozenBaselines>[0]

/** 接入页09共享场景的独立精确回查视图。 */
export function tenderChangeChapterScenarioViews(primaryKeys:Readonly<Record<'ContentRevision'|'RevisionSnapshot',string>>){
 return {
  ContentRevision:{[revisionView]:originalRegistrationView(primaryKeys.ContentRevision,['projectId','id'],revisionFields)},
  RevisionSnapshot:{[snapshotView]:originalRegistrationView(primaryKeys.RevisionSnapshot,['projectId','snapshotHash'],['manifest'])},
 }
}

export async function readTenderChangeChapterPins(host:Host,selection:Readonly<{revisionId:string;previousId:string;currentId:string|null}>){
 const {projectId}=host,{revisionId,previousId,currentId}=selection
 const original=await readOriginalRegistrationView(host,{model:'ContentRevision',viewName:revisionView},{projectId,id:revisionId})
 if(!original.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:original.assertCurrent})
 const assertRevision=original.captureFields(revisionFields)
 const {snapshotHash,baselineId,status}=original.row
 if(status!=='ADOPTED'||baselineId!==previousId||typeof snapshotHash!=='string'||!/^[a-f0-9]{64}$/u.test(snapshotHash))
  throw Error('TENDER_CHANGE_CHAPTER_REVISION')
 const snapshot=await readOriginalRegistrationView({...host,assertCurrent:assertRevision},
  {model:'RevisionSnapshot',viewName:snapshotView},{projectId,snapshotHash})
 if(!snapshot.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:snapshot.assertCurrent})
 const assertCurrent=snapshot.captureFields(['manifest'])
 const manifest=snapshot.row['manifest']
 assertRevisionManifest(manifest,original.row)
 const index=readSnapshotNodeIndex(manifest,projectId)
 if(!isRecord(manifest)||await hashRevisionSnapshot(manifest)!==snapshotHash)throw Error('TENDER_CHANGE_CHAPTER_SNAPSHOT')
 const pins=readSnapshotRequirementPins(manifest['requirementPins'])
 const ids=new Set(index.nodes.map(node=>node.nodeId))
 if(pins.some(pin=>!ids.has(pin.chapterId)))throw Error('TENDER_CHANGE_CHAPTER_PIN')
 if(currentId===null){
  const previous=await readBidFrozenBaseline({...host,assertCurrent},previousId,'previous')
  if(previous.state!=='REGISTERED')return previous
  const versions=new Map(previous.requirements.map(({lineageId,version})=>[lineageId,version]))
  const originalPins=pins.filter(({lineageId,version})=>versions.get(lineageId)===version)
  previous.assertCurrent()
  return Object.freeze({state:'PREVIOUS_ONLY' as const,pins:Object.freeze(originalPins),assertCurrent:previous.assertCurrent})
 }
 const comparison=await compareBidFrozenBaselines({...host,assertCurrent},previousId,currentId)
 if(comparison.state!=='COMPARED')return comparison
 const changes=comparison.requirements.flatMap(({previous,current})=>previous?[{previous,current}]:[])
 const additions=comparison.requirements.flatMap(({previous,current})=>!previous&&current?[{previous:null,current}]:[])
 const trace=traceTenderChangeChapterPins({changes:[...changes,...additions],assertCurrent:comparison.assertCurrent},
  {revisionId,pins,assertCurrent})
 return Object.freeze({state:'TRACED' as const,...trace})
}
