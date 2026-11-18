/**
 * @module app:views/features/application/smart-bid/authoring/model/review/package/content-paper-submission-package-reader
 * 职责：经原装封 DataView 定位同一纸包，再核独立见证和原选件。
 * 边界：装封记录从当前实例读取；应装清单和见证由原证据来源提供。
 * AI用途：核对纸件清点是否关联同一装封请求及冻结选件。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {reviewPaperSubmissionPackage} from '@/services/smart-bid/content/review/paper-submission-package'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'

/** 纸件清点原范围和来源的业务合同。 */
type Review=Parameters<typeof reviewPaperSubmissionPackage>
/** 同封装的应装、实装与清点证据。 */
type Source=Review[1]
/** 原装封明细中的一笔纸件和份数。 */
type Member=Source['packed']['members'][number]
const keys=[['id','packageId'],['projectId','projectId'],['packingRequestRef','packingRequestRef']] as const
const fields=['id','projectId','packingRequestRef','format','sealRef','packageHash','selectionHash','packingRef','packed']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='SubmissionPackage'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&keys.every(([field,ParamName])=>
  hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName}))

/** 原包先读取；后续只请求同封装、同次选件的两个原证据。 */
export async function readRegisteredPaperPacking(host:ContentRevisionReadHost,
 input:Readonly<{packageId:string;packingRequestRef:string}>){
 const {runtime,scenarioId,projectId}=host,{packageId,packingRequestRef}=input
 host.assertCurrent()
 const context={projectId,packageId,packingRequestRef}
 const error='PAPER_SUBMISSION_ORIGINAL_SCOPE'
 if(![scenarioId,...Object.values(context)].every(identity))throw Error(error)
 const key=buildDataViewKey('SubmissionPackage','originalPackedPaper',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('PAPER_SUBMISSION_ORIGINAL_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('PAPER_SUBMISSION_ORIGINAL_STALE')
 }
 await view.refresh()
 assertScope()
 const row=view.rows[0]
 if(!row||!hasCompleteSingleContentResult(view))throw Error('PAPER_SUBMISSION_ORIGINAL_NOT_UNIQUE')
 const assertRead=view.captureReadResult(),assertRow=view.captureReadRow(row,fields)
 const assertCurrent=()=>{assertScope();assertRead();assertRow()}
 const {format,sealRef,packageHash,selectionHash,packingRef,packed}=row
 if(row['id']!==packageId||row['projectId']!==projectId||row['packingRequestRef']!==packingRequestRef||format!=='PAPER'||
  !identity(sealRef)||!identity(packingRef)||!identity(packageHash)||!/^[a-f0-9]{64}$/u.test(packageHash)||
  !identity(selectionHash)||!/^[a-f0-9]{64}$/u.test(selectionHash)||!Array.isArray(packed))
  throw Error(error)
 const members=packed.map((entry:unknown):Member=>{
  if(!isRecord(entry)||!identity(entry['position'])||!identity(entry['paperRef'])||!identity(entry['versionRef'])||
   typeof entry['copies']!=='number')throw Error(error)
  return Object.freeze({position:entry['position'],paperRef:entry['paperRef'],versionRef:entry['versionRef'],copies:entry['copies']})
 })
 const scope=Object.freeze({projectId,packageId,sealRef,selectionHash})
 assertCurrent()
 return Object.freeze({scope,packageHash,packed:Object.freeze({...scope,packingRef,members:Object.freeze(members),assertCurrent})})
}

/** 原包先读取；后续只请求同封装、同次选件的两个原证据。 */
export async function reviewRegisteredPaperSubmissionPackage(host:ContentRevisionReadHost,
 input:Parameters<typeof readRegisteredPaperPacking>[1],sources:Readonly<{
  readFrozen:(scope:Review[0])=>Promise<Source['frozen']>
  readWitness:(scope:Review[0])=>Promise<Source['observed']>
 }>){
 const {scope,packageHash,packed}=await readRegisteredPaperPacking(host,input)
 const [frozen,observed]=await Promise.all([sources.readFrozen(scope),sources.readWitness(scope)])
 const report=reviewPaperSubmissionPackage(scope,{frozen,packed,observed})
 return Object.freeze({...report,packageHash})
}
