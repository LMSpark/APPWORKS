/** @module app:services/smart-bid/content/references/tender-change-requirement-impact
 * 职责：动作23正文侧，按精确旧版挂接追查受招标变更影响的责任章。
 */
import type {BaselineRequirementMember} from './baseline-requirement-members'
import type {RevisionRequirementPin} from './revision-requirement-pins'

type RequirementChange =
 | Readonly<{previous:BaselineRequirementMember;current:BaselineRequirementMember|null}>
 | Readonly<{previous:null;current:BaselineRequirementMember}>

type RequirementChangeEvidence = Readonly<{
 changes:readonly RequirementChange[]
 assertCurrent:()=>void
}>
type ChapterPinEvidence = Readonly<{
 revisionId:string
 pins:readonly RevisionRequirementPin[]
 assertCurrent:()=>void
}>

/** 从已核验的变更和原正文挂接形成候选影响，处置仍由原成果责任人登记。 */
export function traceTenderChangeChapterPins(changeEvidence:RequirementChangeEvidence,revision:ChapterPinEvidence){
 const assertCurrent=()=>{changeEvidence.assertCurrent();revision.assertCurrent()}
 assertCurrent()
 const pinsByVersion=new Map<string,RevisionRequirementPin[]>()
 const key=({lineageId,version}:BaselineRequirementMember)=>JSON.stringify([lineageId,version])
 for(const pin of revision.pins){
  const identity=key(pin)
  const pins=pinsByVersion.get(identity)??[]
  pins.push(Object.freeze({...pin}))
  pinsByVersion.set(identity,pins)
 }
 const items=changeEvidence.changes.map(({previous,current})=>{
  const actualPins=Object.freeze(previous ? pinsByVersion.get(key(previous))??[] : [])
  return Object.freeze({
   previous:previous&&Object.freeze({...previous}),
   current:current&&Object.freeze({...current}),
   actualPins,
   state:previous===null?'NEW_OBLIGATION' as const:actualPins.length?'PIN_CONFIRMED' as const:'REFERENCE_UNVERIFIED' as const,
  })
 })
 assertCurrent()
 return Object.freeze({revisionId:revision.revisionId,items:Object.freeze(items),assertCurrent})
}
