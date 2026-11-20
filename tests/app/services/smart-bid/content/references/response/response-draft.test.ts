import {expect,it} from 'vitest'
import {prepareResponseDraft} from '@/services/smart-bid/content/references/response/response-draft'

const scope={projectId:'P',baselineId:'B',assignmentId:'A',lineageId:'R',version:'R1',targetRef:'FIELD'}
const input={...scope,authorRef:'OWNER',at:10,body:{statement:'承诺 {{price}}',data:{price:{type:'fact',factId:'PRICE'}}}}
const fact={kind:'FACT' as const,ref:'PRICE-V1',usable:true,assertCurrent:()=>{}}
const source={...scope,task:{...scope,taskRef:'TASK',assignmentVersion:'A1',assigneeRef:'OWNER',dueAt:20,state:'ACCEPTED' as const,acceptance:{receiptRef:'ACCEPT',assignmentVersion:'A1',assigneeRef:'OWNER',acceptedAt:1},assertCurrent:()=>{}},allowedNodeIds:[],requiredEvidence:[fact],evidence:[fact],assertCurrent:()=>{}}

it('keeps the independent response and its evidence with the current assignment',()=>{
 expect(prepareResponseDraft(input,source)).toMatchObject({body:input.body,evidenceRefs:[{kind:'FACT',ref:'PRICE-V1'}]})
 expect(()=>prepareResponseDraft(input,{...source,task:{...source.task,assigneeRef:'OTHER'}})).toThrow('BID_RESPONSE_TASK_NOT_ACCEPTED')
 expect(()=>prepareResponseDraft(input,{...source,task:{...source.task,assignmentVersion:'A2'}}))
  .toThrow('BID_RESPONSE_TASK_NOT_ACCEPTED')
 expect(()=>prepareResponseDraft({...input,at:21},source)).toThrow('BID_RESPONSE_TASK_NOT_ACCEPTED')
 expect(()=>prepareResponseDraft(input,{...source,evidence:[]})).toThrow('BID_RESPONSE_DRAFT_EVIDENCE')
 expect(()=>prepareResponseDraft(input,{...source,evidence:[{...fact,usable:false}]})).toThrow('BID_RESPONSE_DRAFT_EVIDENCE')
})

it('uses the chapter anchor without creating a second editable response body',()=>{
 const chapter={...source,chapterId:'C',allowedNodeIds:['NODE']}
 const body={chapterId:'C',anchorNodeId:'NODE'}
 expect(prepareResponseDraft({...input,body},chapter).body).toEqual(body)
 expect(()=>prepareResponseDraft({...input,body:{...body,statement:'重复'}},chapter)).toThrow('BID_RESPONSE_DRAFT_BODY')
})
