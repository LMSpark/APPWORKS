/**
 * @module app:views/features/application/smart-bid/authority/resource-version-reader
 * 职责：页05读取固定编号的企业资料原版及出处。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {buildDataViewKey,type DataView,type ViewMetadata} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {assertRegistrationViewRefreshable,originalRegistrationView,readOriginalRegistrationView} from './original-registration-view'
import {hasContentScopeCondition} from '../authoring/model/content-revision-reader'

const fields=['id','typeVersion','validFrom','validTo','sourceTerms','rights']
const model='ResourceVersion',viewName='originalVersion'
const error='BID_RESOURCE_VERSION_SCOPE'
const historyFields=['resourceId','id','version','typeVersion','createdAt']

/** 资料和版本均为明确原请求参数，由正式查询执行企业资料可读范围。 */
export function resourceVersionReadView(primaryKey:string){
 return originalRegistrationView(primaryKey,['resourceId','version'],[...fields,'files'])
}

/** 本资料的历史只查询元信息；原文及出处通过明确版本读取。 */
export function resourceVersionHistoryView(primaryKey:string):ViewMetadata{
 if(!identity(primaryKey))throw Error(error)
 return {commitMode:'staged',autoLoad:false,autoSelectFirst:false,autoCurrentFirst:false,
  scopeFilter:{field:'resourceId',operator:'eq',value:{Type:'GetInputParam',ParamName:'resourceId'}},
  queryConfig:{autoQuery:false,cacheType:'none',pagination:'paged',allPages:true,fields:[...new Set([primaryKey,...historyFields])]}}
}

function isHistoryView(view:DataView){
 return view.dataTable?.modelBinding?.modelName===model&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  view.queryConfig.allPages===true&&hasContentScopeCondition(view,'resourceId',{Type:'GetInputParam',ParamName:'resourceId'})
}

async function readHistory(host:Parameters<typeof readOriginalRegistrationView>[0],resourceId:string){
 const {runtime,scenarioId}=host
 const dataViewKey=buildDataViewKey(model,'versionHistory',scenarioId),view=runtime.resolveView(dataViewKey)
 if(!view||!isHistoryView(view)||view.hasEditingChanges())throw Error(error)
 assertRegistrationViewRefreshable(view,error)
 view.queryContext={...view.queryContext,resourceId}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(dataViewKey)!==view||!isHistoryView(view)||view.loadingError||view.hasEditingChanges()||
   view.queryContext['resourceId']!==resourceId)throw Error(error)
 }
 const refreshed=await view.requestRefresh({defer:false})
 if(refreshed.refreshStatus!=='read')throw Error(error)
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true)throw Error('BID_RESOURCE_HISTORY_INCOMPLETE')
 const assertResult=view.captureReadResult(),knownVersions=new Set<string>()
 const entries=new Map<string|number,Readonly<{version:string;id:string}>>()
 const proofs=view.rows.map(row=>{
  const proof=view.captureReadRow(row,historyFields)
  const {id,version,typeVersion,createdAt}=row
  const rowKey=view.getPkKey(row)
  if(row['resourceId']!==resourceId||!identity(id)||!identity(version)||!identity(typeVersion)||!identity(createdAt)||
   !(identity(rowKey)||(typeof rowKey==='number'&&Number.isSafeInteger(rowKey)))||knownVersions.has(version)||entries.has(rowKey))throw Error(error)
  knownVersions.add(version)
  entries.set(rowKey,Object.freeze({version,id}))
  return proof
 })
 const assertCurrent=()=>{assertScope();assertResult();for(const proof of proofs)proof()}
 assertCurrent()
 return Object.freeze({dataViewKey,count:proofs.length,assertCurrent,async readVersion(rowKey:string|number,selection:unknown){
  assertCurrent()
  const entry=entries.get(rowKey)
  if(!entry||!isRecord(selection)||selection['resourceId']!==resourceId||selection['version']!==entry.version||
   selection['id']!==entry.id)throw Error(error)
  const result=await readVersion({...host,assertCurrent},{resourceId,version:entry.version})
  assertCurrent()
  if(result.state==='READ'&&result.versionId!==entry.id)throw Error(error)
  return result
 }})
}

async function readVersion(host:Parameters<typeof readOriginalRegistrationView>[0],selection:Readonly<{resourceId:string;version:string}>){
 const read=await readOriginalRegistrationView(host,{model,viewName},selection)
 const {row}=read
 if(!row)return Object.freeze({state:'UNAVAILABLE' as const,assertCurrent:read.assertCurrent})
 const assertRow=read.captureFields(fields)
 assertRow()
 const {id:versionId,typeVersion,validFrom,validTo,sourceTerms,rights}=row
 if(!identity(versionId)||!identity(typeVersion)||(validFrom!==null&&!identity(validFrom))||
  (validTo!==null&&!identity(validTo))||(rights!=='EXTERNAL'&&rights!=='INTERNAL'))throw Error(error)
 let attachmentCount:number|undefined
 let assertAttachments:(()=>void)|undefined
 if(Array.isArray(row['files'])){
  try{
   const proof=read.captureFields(['files'])
   proof()
   attachmentCount=row['files'].length
   assertAttachments=proof
  }catch{
   assertRow()
  }
 }
 return Object.freeze({state:'READ' as const,...selection,versionId,typeVersion,validFrom,validTo,rights,
  sourceTerms:structuredClone(sourceTerms),attachmentCount,assertCurrent:()=>{assertRow();assertAttachments?.()}})
}

/** 受限于宿主提供的原资料身份，页面只提供待核版本。 */
export function createBidResourceVersionHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,host:Omit<Parameters<typeof readOriginalRegistrationView>[0],'runtime'>&Readonly<{resourceId:string}>){
 const {resourceId}=host
 return {runtime,assertCurrent:host.assertCurrent,async invoke(name:string,input:unknown,signal:AbortSignal){
  if(!isRecord(input)||!identity(resourceId)||!identity(host.scenarioId))throw Error(error)
  const generation=runtime.generation
  const assertCurrent=()=>{
   host.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)throw Error('BID_RESOURCE_VERSION_STALE')
  }
  assertCurrent()
  if(name==='bid.resources.readHistory'&&Object.keys(input).length===0)return readHistory({...host,runtime,assertCurrent},resourceId)
  if(name!=='bid.resources.readVersion'||Object.keys(input).length!==1||!identity(input['version']))throw Error(error)
  return readVersion({...host,runtime,assertCurrent},{resourceId,version:input['version']})
 }}
}
