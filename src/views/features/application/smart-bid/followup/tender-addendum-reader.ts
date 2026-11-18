/** @module app:views/features/application/smart-bid/followup/tender-addendum-reader
 * 职责：动作14回读本标段本轮次的正式变动及新旧原件位置，供动作23继续取证。
 */
import {snapshotReferenceFields,snapshotReferenceIdentity as identity,visitSnapshotReferences}
 from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../authority/original-registration-view'

const fields=['issuerRef','publicationRef','applicableScopeRef','effectiveAt','changes']
const keys=['projectId','lotId','roundId','id']
const viewName='originalTenderAddendum'
const error='TENDER_ADDENDUM_EVIDENCE'

/** 公告或附件的固定版本及原位。 */
function source(value:unknown){
 const {documentVersionId,locator}=snapshotReferenceFields(value,['documentVersionId','locator'],error)
 if(!identity(documentVersionId)||!identity(locator))throw Error(error)
 return Object.freeze({documentVersionId,locator})
}

function change(value:unknown){
 const {id,kind,subjectRef,previousSource,currentSource}=snapshotReferenceFields(value,
  ['id','kind','subjectRef','previousSource','currentSource'],error)
 if(!identity(id)||!identity(subjectRef)||(kind!=='ADDED'&&kind!=='REPLACED'&&kind!=='CANCELLED'))throw Error(error)
 if(kind==='ADDED'?previousSource!==null:previousSource===null)throw Error(error)
 return Object.freeze({id,kind,subjectRef,previous:previousSource===null?null:source(previousSource),current:source(currentSource)})
}

/** 将同一原登记按当次项目、标段及轮次查询。 */
export function tenderAddendumScenarioView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

export async function readTenderAddendum(host:Parameters<typeof readOriginalRegistrationView>[0],
 scope:Readonly<{projectId:string;lotId:string;roundId:string;id:string}>){
 const read=await readOriginalRegistrationView(host,{model:'TenderAddendum',viewName},scope)
 if(!read.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:read.assertCurrent})
 const assertCurrent=read.captureFields(fields)
 const {issuerRef,publicationRef,applicableScopeRef,effectiveAt,changes}=read.row
 assertCurrent()
 if(!identity(issuerRef)||!identity(publicationRef)||!identity(applicableScopeRef)||!identity(effectiveAt)
  ||!Number.isFinite(Date.parse(effectiveAt)))throw Error(error)
 const items:Array<ReturnType<typeof change>>=[],ids=new Set<string>()
 visitSnapshotReferences(changes,value=>{
  const item=change(value)
  if(ids.has(item.id))throw Error(error)
  ids.add(item.id)
  items.push(item)
 },error)
 return Object.freeze({state:'REGISTERED' as const,id:scope.id,issuerRef,publicationRef,applicableScopeRef,effectiveAt,
  items:Object.freeze(items),assertCurrent})
}
