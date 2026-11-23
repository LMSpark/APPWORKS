import {expect,it,vi} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {resolveSmartBidModel} from '@/services/smart-bid/operation/agent-module/smart-bid-model-resolver'
import {SmartBidOperationModule} from '@/services/smart-bid/operation/agent-module/smart-bid-operation-module'

const models=['KnowledgeGuide','ActionContract','ContextManifest','GenerationRun','ActionVerification',
 'TenderLot','BidSubject','TenderFileRegister','TenderFileVersion','PrebidInquiry','TenderAddendum','TenderRecord',
 'ResourceVersion','ProjectSubject','ParticipationDecision','ContentProject','Requirement','Baseline','SubmissionObligation',
 'Person','BidSecurity','AuthorityGrant','PriceSheet','ApprovedPrice','FactVersion','BidVolume','DocumentTemplate',
 'ResponseAssignment','QualificationReview','Response','ContentRevision','ContentAdoption','ProducedFile','AnswerLocation',
 'CheckFinding','Approval','SignatureRecord','DeliveryManifest','SubmissionPackage','SubmissionAttempt','ChannelReceipt',
 'SubmissionReconciliation','ResourceUseDecision','TenderFollowup','TenderOutcome','BidHandoff','ConfigurationRelease']

function listFiles(directory:string):string[]{
 return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const path=resolve(directory,entry.name)
  return entry.isDirectory()?listFiles(path):[path]
 })
}

function requiredMatch(match:RegExpMatchArray,index:number):string{
 const value=match[index]
 if(value===undefined)throw Error(`SMART_BID_ACTION_MATCH_REQUIRED: ${index}`)
 return value
}

it('constructs all 47 compiled kinds by exact model name',()=>{
 const execute=vi.fn(async()=>({ok:true}))
 for(const kind of models)expect(resolveSmartBidModel(kind,execute)).toBeInstanceOf(Object)
 expect(models).toHaveLength(47)
 expect(()=>resolveSmartBidModel('UnknownKind',execute)).toThrow('SMART_BID_MODEL_KIND_UNAVAILABLE')
})

it('keeps the 47 models and 61 methods closed with the specification and generated surface',async()=>{
 const specification=readFileSync(resolve('docs/smart-bid/contracts/action-index.md'),'utf8')
 const rows=[...specification.matchAll(/\|\s*\[(\d{2})\]\([^)]*#bid-action-\1\)\s*\|[^|]*\|[^|]*\|\s*`([^`]+)`\s*\|/gu)]
 const specified=rows.map(match=>({id:requiredMatch(match,1),member:requiredMatch(match,2)}))
 expect(specified).toHaveLength(61)
 expect(new Set(specified.map(({member})=>member.split('.')[0]))).toEqual(new Set(models))
 expect(new Set(specified.map(({id})=>id)).size).toBe(61)

 const generatedDirectory=resolve('generated/dts-class-model/files/src/services/smart-bid/operation/agent-module/models')
 const generatedKinds=new Set<string>()
 const generatedMembers=new Set<string>()
 for(const file of listFiles(generatedDirectory)){
  const document=JSON.parse(readFileSync(file,'utf8')) as {
   module:{symbols:readonly string[]};$defs:Record<string,{$defs?:Record<string,unknown>}>
  }
  for(const kind of document.module.symbols){
   generatedKinds.add(kind)
   for(const member of Object.keys(document.$defs[kind]?.$defs??{})){
    if(member.startsWith('method.')&&member.endsWith('.params'))generatedMembers.add(`${kind}.${member.slice(7,-7)}`)
   }
  }
 }
 expect(generatedKinds).toEqual(new Set(models))
 expect(generatedMembers).toEqual(new Set(specified.map(({member})=>member)))

 const sourceDirectory=resolve('src/services/smart-bid/operation/agent-module/models')
 const sourceActions=new Map<string,string>()
 for(const file of listFiles(sourceDirectory)){
  const source=readFileSync(file,'utf8')
  for(const match of source.matchAll(/export class ([A-Za-z]+)[\s\S]*?(?=export class |$)/gu)){
   for(const action of match[0].matchAll(/public async ([\p{Script=Han}]+)\(input:SmartBidActionRequest\)\{return executeSmartBidAction\(this\.execute,'(\d{2})',input\)\}/gu))
    sourceActions.set(`${requiredMatch(match,1)}.${requiredMatch(action,1)}`,requiredMatch(action,2))
  }
 }
 expect(sourceActions).toEqual(new Map(specified.map(({id,member})=>[member,id])))
 const execute=vi.fn(async input=>({operationId:input.operationId}))
 const operation=new SmartBidOperationModule(execute)
 for(const {id,member} of specified){
  const [kind,actionName]=member.split('.')
  if(kind===undefined||actionName===undefined)throw Error('SMART_BID_SPECIFIED_MEMBER_INVALID')
  const result=await operation.dispatchAction({kind,actionName,input:{
   registrationId:'SmartBidOperationModule',businessInstanceId:'P',runtimeInstanceId:'R',
   requestKey:`Q-${id}`,prompt:actionName,inputs:{},
  }})
  expect(result).toMatchObject({operationId:id,requestKey:`Q-${id}`})
 }
 expect(execute).toHaveBeenCalledTimes(61)
})
