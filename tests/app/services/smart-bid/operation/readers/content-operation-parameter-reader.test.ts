import {expect,it} from 'vitest'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {prepareOperationReworkParameter,readOperationDispatchParameter} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-parameter-reader'

async function dispatch(state:'ACTION_APPLIED'|'NO_ACTION_RECEIPT'|'SSE_UNKNOWN'='ACTION_APPLIED'){
 const parameters={operationId:'39',registrationId:'SmartBidOperationModule',businessInstanceId:'PROJECT',
  runtimeInstanceId:'RUNTIME',requestKey:'REQUEST',prompt:'采用候选',inputs:{revisionId:'REVISION'}}
 return {
  operationId:parameters.operationId,requestKey:parameters.requestKey,parameters,
  inputDigest:await hashCanonicalSnapshotText(canonicalSnapshotValue(parameters.inputs)),
  outcome:{sessionId:'SESSION',turnId:'TURN',transport:'SSE' as const,state,
   dispatched:state==='ACTION_APPLIED',
   ...(state==='ACTION_APPLIED'?{actionReceipt:{receiptRef:'RECEIPT'}}:{}),
  },
 }
}

it('keeps a receipt-free handoff pending original evidence',async()=>{
 const value=await dispatch('NO_ACTION_RECEIPT'),scope={projectId:'PROJECT',assertCurrent:()=>{}}
 const result=await readOperationDispatchParameter(scope,value)
 expect(result).toMatchObject({state:'HANDOFF_UNVERIFIED',sessionId:'SESSION',turnId:'TURN',
  dispatchState:'UNVERIFIED',handoffInputDigest:value.inputDigest,message:'交接记录待正式来源复核。'})
 expect(()=>result.readActualInput()).toThrow('OPERATION_PARAMETER_ORIGINAL_SOURCE_REQUIRED')
 expect(()=>result.readActionReceipt()).toThrow('OPERATION_PARAMETER_ORIGINAL_SOURCE_REQUIRED')
 const rework=await prepareOperationReworkParameter(scope,value,'复核输入')
 expect(rework).toMatchObject({state:'REWORK_EVIDENCE_REQUIRED',requestKey:'REQUEST',reason:'复核输入'})
 expect(rework).not.toHaveProperty('inputs')
 expect(rework).not.toHaveProperty('actionReceipt')
 await expect(readOperationDispatchParameter(scope,{...value,inputDigest:'a'.repeat(64)}))
  .rejects.toThrow('OPERATION_PARAMETER_INPUT_DIGEST')
 await expect(readOperationDispatchParameter({...scope,projectId:'OTHER'},value))
  .rejects.toThrow('OPERATION_PARAMETER_SCOPE')
})

it('keeps interrupted turns unknown and prepares rework only from explicit parameters',async()=>{
 const scope={projectId:'PROJECT',assertCurrent:()=>{},verifyOriginal:async()=>true}
 const unknown=await readOperationDispatchParameter(scope,await dispatch('SSE_UNKNOWN'))
 expect(unknown).toMatchObject({state:'UNKNOWN',dispatchState:'SSE_UNKNOWN'})
 expect(()=>unknown.readActionReceipt()).toThrow('OPERATION_PARAMETER_ACTION_RECEIPT_REQUIRED')
 await expect(prepareOperationReworkParameter(scope,await dispatch(),'')).rejects.toThrow('OPERATION_PARAMETER_REWORK_REQUIRED')
 await expect(prepareOperationReworkParameter(scope,await dispatch(),'复核输入')).resolves.toMatchObject({
  state:'REWORK_PARAMETERS_READY',reason:'复核输入',sessionId:'SESSION',turnId:'TURN',
  inputs:{revisionId:'REVISION'},actionReceipt:{receiptRef:'RECEIPT'},
 })
})
