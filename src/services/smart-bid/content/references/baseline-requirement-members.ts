/**
 * @module app:services/smart-bid/content/references/baseline-requirement-members
 * 职责：核固定基线要求选版与章节挂接的待处置差异。
 * 边界：不查询、不改旧挂接，不推断撤回或授予采用/交付许可。
 */
import type {ContentStructureNode} from '../../content-tree-structure'
import {assertRevisionRequirementPins,type RevisionRequirementPin} from './revision-requirement-pins'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from './snapshot-reference-values'
/** 基线成员只引用谱系及精确版本字符串。 */
export type BaselineRequirementMember=Readonly<{lineageId:string;version:string}>
/** 诊断只带引用，未入基线不等于已有撤回决定。 */
export type BaselineRequirementPinIssue=RevisionRequirementPin&Readonly<
 {reason:'VERSION_CHANGED';selectedVersion:string}|{reason:'NOT_IN_BASELINE'}>
function selectedVersions(members:unknown):Map<string,string>{
 const versions=new Map<string,string>()
 visitSnapshotReferences(members,item=>{
  const row=snapshotReferenceFields(item,['lineageId','version'],'BASELINE_REQUIREMENT_MEMBER_MODEL')
  const lineageId=row['lineageId'],version=row['version']
  if(!snapshotReferenceIdentity(lineageId)||!snapshotReferenceIdentity(version))throw Error('BASELINE_REQUIREMENT_MEMBER_MODEL')
  if(versions.has(lineageId))throw Error('BASELINE_REQUIREMENT_MEMBER_DUPLICATE')
  versions.set(lineageId,version)
 },'BASELINE_REQUIREMENT_MEMBER_MODEL')
 return versions
}
/** 选定唯一固定成员；不采用latest等默认版本。 */
export function selectBaselineRequirementMember(members:unknown,selection:Readonly<{lineageId:string;version?:string}>):BaselineRequirementMember {
 const hasVersion=Object.hasOwn(selection,'version')
 const row=snapshotReferenceFields(selection,hasVersion?['lineageId','version']:['lineageId'],'BASELINE_REQUIREMENT_SELECTION')
 const lineageId=row['lineageId'],requestedVersion=row['version']
 if(!snapshotReferenceIdentity(lineageId)||hasVersion&&!snapshotReferenceIdentity(requestedVersion))throw Error('BASELINE_REQUIREMENT_SELECTION')
 const version=selectedVersions(members).get(lineageId)
 if(version===undefined||hasVersion&&version!==requestedVersion)throw Error('BASELINE_REQUIREMENT_MEMBER_MISSING')
 return Object.freeze({lineageId,version})
}
/** 只报告换版/未入基线；删除条款须另有原决定。 */
export function assessBaselineRequirementPins(members:unknown,pins:unknown,nodes:ReadonlyArray<Pick<ContentStructureNode,'nodeId'|'type'>>):readonly BaselineRequirementPinIssue[]{
 const versions=selectedVersions(members),issues:BaselineRequirementPinIssue[]=[]
 assertRevisionRequirementPins(pins,nodes)
 visitSnapshotReferences(pins,item=>{
  const row=snapshotReferenceFields(item,['chapterId','lineageId','version'],'SNAPSHOT_REQUIREMENT_PIN_MODEL')
  const chapterId=row['chapterId'],lineageId=row['lineageId'],version=row['version']
  if(!snapshotReferenceIdentity(chapterId)||!snapshotReferenceIdentity(lineageId)||!snapshotReferenceIdentity(version))throw Error('SNAPSHOT_REQUIREMENT_PIN_MODEL')
  const pin={chapterId,lineageId,version},selectedVersion=versions.get(lineageId)
  if(selectedVersion===undefined)issues.push(Object.freeze({...pin,reason:'NOT_IN_BASELINE'}))
  else if(selectedVersion!==pin.version)issues.push(Object.freeze({...pin,reason:'VERSION_CHANGED',selectedVersion}))
 },'SNAPSHOT_REQUIREMENT_PIN_MODEL')
 return Object.freeze(issues)
}
