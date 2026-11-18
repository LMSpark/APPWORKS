/**
 * @module app:services/smart-bid/content/references/baseline-fact-members
 * 职责：核固定基线事实成员的确定JSON合同及精确选版。
 * 边界：不查询最新版本、不确认冻结/采纳或当前用途许可、不存事实值。
 * AI用途：基线原记录读取后核成员，再沿原事实视图读取固定版本。
 */
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from './snapshot-reference-values'

/** 项目及阶段归基线原记录；成员只引用事实键和显式原版本。 */
export type BaselineFactMember=Readonly<{factId:string;version:number}>
function validVersion(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0}
/** 读取完整固定版本索引，缺失或重复成员均拒绝。 */
export function readBaselineFactMembers(members:unknown):ReadonlyMap<string,number>{
 const versions=new Map<string,number>()
 visitSnapshotReferences(members,item=>{
  const row=snapshotReferenceFields(item,['factId','version'],'BASELINE_FACT_MEMBER_MODEL')
  const factId=row['factId'],version=row['version']
  if(!snapshotReferenceIdentity(factId)||!validVersion(version))throw Error('BASELINE_FACT_MEMBER_MODEL')
  if(versions.has(factId))throw Error('BASELINE_FACT_MEMBER_DUPLICATE')
  versions.set(factId,version)
 },'BASELINE_FACT_MEMBER_MODEL')
 return versions
}
/** 整组先核唯一性，再确认目标存在；不以同额、状态或列表顺序代替选版。 */
export function selectBaselineFactMember(members:unknown,selection:Readonly<{factId:string;version?:number}>):BaselineFactMember {
 if(!snapshotReferenceIdentity(selection.factId)||Object.hasOwn(selection,'version')&&!validVersion(selection.version))throw Error('BASELINE_FACT_SELECTION')
 const versions=readBaselineFactMembers(members)
 const version=versions.get(selection.factId)
 if(version===undefined||Object.hasOwn(selection,'version')&&version!==selection.version)throw Error('BASELINE_FACT_MEMBER_MISSING')
 return Object.freeze({factId:selection.factId,version})
}
/** 已有精确版本的调用仍必须与基线原成员逐项一致。 */
export function assertBaselineFactMember(members:unknown,selection:BaselineFactMember):void {selectBaselineFactMember(members,selection)}
