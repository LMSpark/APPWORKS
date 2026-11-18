import {expect,it,vi} from 'vitest'
import {createBidResponseScriptHost} from '@/views/features/application/smart-bid/response/ui/entry/response-script-host'
import script from '@/views/features/application/smart-bid/response/page10/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {checkCommitmentApprovalCoverage,prepareApprovedCommitmentFacts,priceCommitmentApproval} from '@/services/smart-bid/content/references/commercial/commitment-approval-coverage'
import {reviewApprovedPrice} from '@/services/smart-bid/content/references/commercial/approved-price-review'

const scope={projectId:'PROJECT',scopeRef:'SCOPE',purposeRef:'USE',assertCurrent:()=>{}}
const price={key:'fee',kind:'PRICE' as const,value:'0',unit:'CNY'}
const person={key:'lead',kind:'PERSON' as const,value:'P1',unit:null}
const approvedPrice={...scope,...price,usable:true,decisionRefs:['PRICE-V1']}
const approvedPerson={...scope,...person,usable:true,decisionRefs:['PERSON-DECISION']}

it('requires separate approval of both price and person, retaining zero as a value',()=>{
 const input={...scope,fields:[price,person]}
 expect(checkCommitmentApprovalCoverage({...input,approvals:[approvedPrice]})).toMatchObject({ready:false,fields:[
  {key:'fee',state:'VERIFIED'},{key:'lead',state:'PENDING'},
 ]})
 expect(checkCommitmentApprovalCoverage({...input,approvals:[approvedPrice,approvedPerson]})).toMatchObject({ready:true})
 expect(checkCommitmentApprovalCoverage({...input,approvals:[approvedPrice,{...approvedPerson,value:'P2'}]}).ready).toBe(false)
 expect(checkCommitmentApprovalCoverage({...input,approvals:[approvedPrice,{...approvedPerson,usable:false}]}).ready).toBe(false)
 expect(()=>checkCommitmentApprovalCoverage({...input,approvals:[{...approvedPrice,purposeRef:'OTHER'},approvedPerson]}))
  .toThrow('BID_COMMITMENT_APPROVAL_SCOPE')
})

it('prepares append inputs only when all original approvals are available',()=>{
 const input={...scope,fields:[price,person]}
 const source={projectId:'PROJECT',scopeRef:scope.scopeRef,sourceIds:['SOURCE'],claimId:null,assertCurrent:()=>{}}
 expect(()=>prepareApprovedCommitmentFacts(checkCommitmentApprovalCoverage({...input,approvals:[approvedPrice]}),source))
  .toThrow('BID_COMMITMENT_FACT_PENDING')
 const approved=checkCommitmentApprovalCoverage({...input,approvals:[{...approvedPrice,sourceVersion:'V1'},approvedPerson]})
 const {facts}=prepareApprovedCommitmentFacts(approved,source)
 expect(facts).toMatchObject([
  {key:'fee',kind:'PRICE',value:'0',unit:'CNY',decisionRefs:['PRICE-V1'],dependencyRefs:['V1']},
  {key:'lead',kind:'PERSON',value:'P1',unit:null,decisionRefs:['PERSON-DECISION']},
 ])
 expect(facts[0]).not.toHaveProperty('version')
 expect(()=>prepareApprovedCommitmentFacts(approved,{...source,projectId:'OTHER'})).toThrow('BID_COMMITMENT_FACT_SOURCE')
 expect(()=>prepareApprovedCommitmentFacts(approved,{...source,scopeRef:'OTHER'})).toThrow('BID_COMMITMENT_FACT_SOURCE')
})

it('carries the original price approval and use decision into commitment coverage',()=>{
 const request={...scope,approvalRef:'PRICE-V2',version:'V2',rateOnly:false}
 const approval={...request,approverRef:'APPROVER',value:price.value,unit:price.unit,detailRef:'DETAIL-V2'}
 const detail={...request,detailRef:'DETAIL-V2',matchesApproval:true}
 const use={...request,decisionRef:'USE-V2',state:'USABLE' as const}
 const ready=priceCommitmentApproval(price.key,reviewApprovedPrice(request,{...scope,approval,detail,use}))
 const restricted=priceCommitmentApproval(price.key,reviewApprovedPrice(request,{...scope,approval,detail,use:{...use,state:'RESTRICTED'}}))
 if(!ready||!restricted)throw Error('PRICE_APPROVAL_REQUIRED')
 expect(checkCommitmentApprovalCoverage({...scope,fields:[price],approvals:[ready]})).toMatchObject({
  ready:true,fields:[{decisionRefs:['PRICE-V2','USE-V2']}],
 })
 expect(checkCommitmentApprovalCoverage({...scope,fields:[price],approvals:[restricted]}).ready).toBe(false)
})

it('prepares facts from the page only once every field has the original approval',async()=>{
 let approvals:Array<typeof approvedPrice|typeof approvedPerson>=[approvedPrice]
 const runtime={resolveView:()=>undefined,generation:1,isLoaded:true,destroyed:false}
 const read=async()=>({commitmentRef:'C',coverage:{...scope,fields:[price,person],approvals},
  source:{...scope,sourceIds:['SOURCE'],claimId:null}})
 const host=createBidResponseScriptHost(runtime,{...scope,scenarioId:'S',asOf:10,rateOnly:false},{
  commitmentBasis:{...scope,read},readPriceEvidence:async()=>{throw Error('UNEXPECTED_PRICE')},readSecurityReceipts:async()=>[],
 })
 const signal=new AbortController().signal,showAlert=vi.fn(async()=>{})
 const invoke=(name:string,input:unknown)=>host.invoke(name,input,signal)
 const {openCommitmentReview}=compileFunctions(script,{$route:{query:{commitmentRef:'C'}},
  $page:{showAlert,invokeHostCommand:invoke}} as unknown as PageContext)
 if(!openCommitmentReview)throw Error('TEST_COMMITMENT_HANDLER_REQUIRED')
 await openCommitmentReview()
 expect(showAlert).toHaveBeenLastCalledWith('待补批准，暂缓登记\nfee · 已核批准 PRICE-V1\nlead · 待核批准','承诺登记前核对')
 expect(await invoke('bid.response.reviewCommitment',{commitmentRef:'C'})).not.toHaveProperty('facts')
 approvals=[approvedPrice,approvedPerson]
 await openCommitmentReview()
 expect(showAlert).toHaveBeenLastCalledWith('批准齐全 · 承诺事实待登记\nfee · 已核批准 PRICE-V1\nlead · 已核批准 PERSON-DECISION','承诺登记前核对')
 expect(await invoke('bid.response.reviewCommitment',{commitmentRef:'C'})).toMatchObject({facts:[
  {projectId:'PROJECT',key:'fee',value:'0'},{projectId:'PROJECT',key:'lead',value:'P1'},
 ]})
 await expect(invoke('bid.response.reviewCommitment',{commitmentRef:'OTHER'})).rejects.toThrow('BID_RESPONSE_COMMITMENT_REQUEST')
})
