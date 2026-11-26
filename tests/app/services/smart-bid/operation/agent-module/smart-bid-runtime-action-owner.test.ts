import {expect,it,vi} from 'vitest'
import {DataSet,bindDataSetCommandSubmit,ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {createSmartBidRuntimeActionExecutor} from '@/services/smart-bid/operation/agent-module/smart-bid-runtime-action-owner'

it.each([
 {caseName:'matching',changes:{inputs:{volumeId:'VOLUME',revisionId:'REVISION'}}},
 {caseName:'wrong request',changes:{requestKey:'OTHER'}},
 {caseName:'wrong project',changes:{businessInstanceId:'OTHER'}},
 {caseName:'wrong inputs',changes:{inputs:{revisionId:'OTHER'}}},
])('checks the $caseName business receipt from the explicit command view',async test=>{
 const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{}})
 const view=ensureDataSetResourceView({dataSet,tableName:'SmartBidAction',resource:{resourceType:'command',resourceId:'smart-bid:action'},
  columns:[{name:'commandId',primary:true},...['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','receiptRef']
   .map(name=>({name})),{name:'inputs',type:'json'}]})
 const submit=vi.fn(async row=>({...row,...test.changes,receiptRef:'RECEIPT'}))
 bindDataSetCommandSubmit(view,{resource:{resourceType:'command',resourceId:'smart-bid:action'},
  guard:()=>{},inputFields:['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs'],
  createKey:()=> 'COMMAND-1',submit,verify:async()=>undefined})
 await view.refresh()
 const execute=createSmartBidRuntimeActionExecutor({runtime:{destroyed:false,isLoaded:true,getDataSet:id=>id==='SPACE'?dataSet:undefined},
  scenarioId:'SPACE',assertCurrent:()=>{}})
 const input={operationId:'39',registrationId:'SmartBidOperationModule',businessInstanceId:'PROJECT',
  runtimeInstanceId:'RUNTIME',requestKey:'REQUEST',prompt:'采用候选',inputs:{revisionId:'REVISION',volumeId:'VOLUME'}}
 if(test.caseName==='matching')await expect(execute(input)).resolves.toEqual({...input,commandId:'COMMAND-1',receiptRef:'RECEIPT'})
 else await expect(execute(input)).rejects.toThrow('SMART_BID_ACTION_RECEIPT_CONFLICT')
 expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(input),expect.objectContaining({requestKey:'COMMAND-1'}))
 dataSet.destroy()
})
it('refuses missing or ambiguous action command owners',async()=>{
 const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{}})
 const runtime={destroyed:false,isLoaded:true,getDataSet:()=>dataSet}
 const execute=createSmartBidRuntimeActionExecutor({runtime,scenarioId:'SPACE',assertCurrent:()=>{}})
 const input={operationId:'39',registrationId:'R',businessInstanceId:'B',runtimeInstanceId:'I',requestKey:'K',prompt:'P',inputs:{}}
 await expect(execute(input)).rejects.toThrow('SMART_BID_ACTION_COMMAND_REQUIRED: 0')
 for(const name of ['First','Second'])ensureDataSetResourceView({dataSet,tableName:name,resource:{resourceType:'command',resourceId:name},
  columns:[{name:'commandId',primary:true},...['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs']
   .map(column=>({name:column}))]})
 await expect(execute(input)).rejects.toThrow('SMART_BID_ACTION_COMMAND_REQUIRED: 2')
 dataSet.destroy()
})
