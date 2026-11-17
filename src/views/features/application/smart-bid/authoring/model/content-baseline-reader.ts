/**
 * @module app:views/features/application/smart-bid/authoring/model/content-baseline-reader
 * 职责：从原基线视图核项目、阶段及固定事实成员，再读取原事实版本。
 * 边界：不冻结、不选择活动基线或最新事实，不证明当前用途许可，不写数据。
 * AI用途：目标修订提供固定baselineId和stageRef，正文绑定沿原查询证明消费。
 */
import type {ContentRevisionReadHost} from './content-revision-reader'
import {hasContentScopeCondition} from './content-revision-reader'
import {readContentFactVersion} from './content-fact-version-reader'
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {hasCompleteSingleContentResult} from './content-node-version-reader'
import {selectBaselineFactMember} from '@/services/smart-bid/content/references/baseline-fact-members'
import {snapshotReferenceIdentity,snapshotReferenceRecord,visitSnapshotReferences} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {ContentStructureNode} from '@/services/smart-bid/content-tree-structure'
import {assessBaselineRequirementPins,selectBaselineRequirementMember,type BaselineRequirementPinIssue} from '@/services/smart-bid/content/references/baseline-requirement-members'
import {readContentRequirement,type ContentRequirementSelection} from './content-requirement-reader'
import {assertBaselineTenderRecordMember} from '@/services/smart-bid/content/references/baseline-tender-records'

/** 原基线挂接诊断；不是要求原记录或当前用途证明。 */
export type ContentBaselineRequirementPinsBinding=Readonly<{
 baselineDataViewKey:string;issues:readonly BaselineRequirementPinIssue[];requiresRevisionMatchCheck:true;requiresUseCheck:true;assertCurrent:()=>void
}>
/** 固定基线成员与调用方的章节挂接比较。 */
export async function readContentBaselineRequirementPins(host:ContentRevisionReadHost,input:Readonly<{
 baselineId:string;stageRef:unknown;pins:unknown;nodes:ReadonlyArray<Pick<ContentStructureNode,'nodeId'|'type'>>
}>):Promise<ContentBaselineRequirementPinsBinding>{
 const baseline=await readOriginalBaseline(host,input,'requirementVersions')
 const issues=assessBaselineRequirementPins(baseline.row['requirementVersions'],input.pins,input.nodes)
 baseline.assertCurrent()
 return Object.freeze({baselineDataViewKey:baseline.key,issues,requiresRevisionMatchCheck:true,requiresUseCheck:true,assertCurrent:baseline.assertCurrent})
}

/** 阶段引用来自目标修订；不是权限或冻结证明。 */
export type ContentBaselineFactSelection=Readonly<{factId:string;version?:number;baselineId:string;stageRef:unknown}>
/** 仅原基线成员和原事实版本读取成立；准用继续由责任域核验。 */
export type ContentBaselineFactBinding=Readonly<{
 baselineDataViewKey:string;factDataViewKey:string;baselineMembershipVerified:true;requiresRevisionMatchCheck:true;requiresUseCheck:true;assertCurrent:()=>void
}>
function stage(value:unknown,ancestors=new Set<object>()):string {
 if(typeof value==='string'&&snapshotReferenceIdentity(value))return JSON.stringify(value)
 if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value)
 if(typeof value!=='object'||ancestors.has(value))throw Error('CONTENT_BASELINE_STAGE_REQUIRED')
 ancestors.add(value)
 try{
  if(Array.isArray(value)){
   const items:string[]=[];visitSnapshotReferences(value,item=>items.push(stage(item,ancestors)),'CONTENT_BASELINE_STAGE_REQUIRED')
   return `[${items.join(',')}]`
  }
  const record=snapshotReferenceRecord(value,'CONTENT_BASELINE_STAGE_REQUIRED')
  return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${stage(record[key],ancestors)}`).join(',')}}`
 }finally{ancestors.delete(value)}
}
function valid(view:DataView):boolean {
 return view.dataTable?.modelBinding?.modelName==='Baseline'&&view.commitMode==='staged'
  &&hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
  &&hasContentScopeCondition(view,'id',{Type:'GetInputParam',ParamName:'baselineId'})
}
/** 两种成员消费共用原查询、阶段和字段证明，不复制查询/保存责任。 */
async function readOriginalBaseline(host:ContentRevisionReadHost,input:Readonly<{baselineId:string;stageRef:unknown}>,memberField:'factVersions'|'requirementVersions'|'tenderRecords'){
 const {runtime,scenarioId,projectId}=host,{baselineId}=input
 host.assertCurrent()
 if(!snapshotReferenceIdentity(scenarioId)||!snapshotReferenceIdentity(projectId)||!snapshotReferenceIdentity(baselineId)
  ||input.stageRef===null||typeof input.stageRef!=='string'&&typeof input.stageRef!=='object')throw Error('CONTENT_BASELINE_IDENTITY_REQUIRED')
 const expectedStage=stage(input.stageRef),baselineDataViewKey=buildDataViewKey('Baseline','selectedBaseline',scenarioId)
 const view=runtime.resolveView(baselineDataViewKey)
 if(!view||!valid(view))throw Error('CONTENT_BASELINE_SCOPE_REQUIRED')
 if(view.hasEditingChanges())throw Error('CONTENT_BASELINE_EDITING')
 view.queryContext={...view.queryContext,projectId,baselineId}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(baselineDataViewKey)!==view||!valid(view)||view.hasEditingChanges()
   ||view.queryContext['projectId']!==projectId||view.queryContext['baselineId']!==baselineId)throw Error('CONTENT_BASELINE_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_BASELINE_NOT_UNIQUE')
 const row=view.rows[0]
 if(row?.['id']!==baselineId||row['projectId']!==projectId)throw Error('CONTENT_BASELINE_UNAVAILABLE')
 const assertRow=view.captureReadRow(row,['id','projectId','stageRef',memberField])
 if(stage(row['stageRef'])!==expectedStage)throw Error('CONTENT_BASELINE_STAGE_MISMATCH')
 const assertCurrent=()=>{assertScope();assertResult();assertRow()}
 assertCurrent()
 return {key:baselineDataViewKey,view,row,assertCurrent}
}
/** 证明原基线固定了这条完整来源引用，原核定记录内容和准用另核。 */
export async function readContentBaselineTenderRecord(
 host:ContentRevisionReadHost,input:Readonly<{baselineId:string;stageRef:unknown}>,selection:unknown,
):Promise<Readonly<{baselineDataViewKey:string;assertCurrent:()=>void}>>{
 const baseline=await readOriginalBaseline(host,input,'tenderRecords')
 assertBaselineTenderRecordMember(baseline.row['tenderRecords'],selection)
 baseline.assertCurrent()
 return Object.freeze({baselineDataViewKey:baseline.key,assertCurrent:baseline.assertCurrent})
}
/** 原基线和事实证明组合；后续任何重查、编辑或宿主替换都会撤销该绑定。 */
export async function readContentBaselineFact(host:ContentRevisionReadHost,input:ContentBaselineFactSelection):Promise<ContentBaselineFactBinding>{
 const baseline=await readOriginalBaseline(host,input,'factVersions')
 const member=selectBaselineFactMember(baseline.row['factVersions'],{factId:input.factId,...(Object.hasOwn(input,'version')?{version:input.version}:{})})
 const fact=await readContentFactVersion({...host,assertCurrent:baseline.assertCurrent},member)
 const assertCurrent=()=>{baseline.assertCurrent();fact.assertCurrent()}
 assertCurrent()
 return Object.freeze({baselineDataViewKey:baseline.key,factDataViewKey:fact.dataViewKey,baselineMembershipVerified:true,requiresRevisionMatchCheck:true,requiresUseCheck:true,assertCurrent})
}

/** 基线成员与要求原记录的组合证明，当前用途仍须核定。 */
export async function readContentBaselineRequirement(
 host:ContentRevisionReadHost,
 input:ContentRequirementSelection&Readonly<{baselineId:string;stageRef:unknown}>,
):Promise<Readonly<{
 baselineDataViewKey:string;requirementDataViewKey:string;baselineMembershipVerified:true
 requiresRevisionMatchCheck:true;requiresUseCheck:true;assertCurrent:()=>void
}>>{
 const {lineageId,version}=input
 const baseline=await readOriginalBaseline(host,input,'requirementVersions')
 const member=selectBaselineRequirementMember(baseline.row['requirementVersions'],{lineageId,version})
 const requirement=await readContentRequirement({...host,assertCurrent:baseline.assertCurrent},member)
 requirement.assertCurrent()
 const sourceRecord=host.runtime.resolveView(requirement.dataViewKey)?.rows[0]?.['sourceRecord']
 let assertSource:(()=>void)|undefined
 if(sourceRecord!==null&&sourceRecord!==undefined){
  assertSource=baseline.view.captureReadRow(baseline.row,['tenderRecords'])
  assertBaselineTenderRecordMember(baseline.row['tenderRecords'],sourceRecord)
 }
 const assertCurrent=()=>{baseline.assertCurrent();requirement.assertCurrent();assertSource?.()}
 assertCurrent()
 return Object.freeze({baselineDataViewKey:baseline.key,requirementDataViewKey:requirement.dataViewKey,
  baselineMembershipVerified:true,requiresRevisionMatchCheck:true,requiresUseCheck:true,assertCurrent})
}
