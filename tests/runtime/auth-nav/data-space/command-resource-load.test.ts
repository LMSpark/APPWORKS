import {expect,it,vi} from 'vitest'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {DataRow,DataView} from '@spark-appworks/spark-data'
const service=vi.hoisted(()=>({readSpaceDefinition:vi.fn(async()=>({dataSpaceId:'SPACE',name:'Commands'})),readModelBatch:vi.fn(async()=>[]),readRelations:vi.fn(async()=>[])}))
vi.mock('../../../../src/lowcode/lowcode-runtime',async()=>{
 const {HttpClientBase}=await import('@spark-appworks/spark-utils'),{DataSpaceRuntimeApi}=await import('@spark-appworks/spark-lowcode-api')
 const http=new class extends HttpClientBase{protected override async executeRequest():Promise<never>{throw Error('Unexpected network')}}()
 return{lowcodeApi:{dataSpace:{design:service,runtime:new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{}})})}},lowcodeHttp:http,lowcodeDesignFileUpload:undefined,createLowcodeProjectGateways:()=>{throw Error('Unexpected file owner')}}
})
import {loadScenarioDataSet} from '../../../../src/lowcode/data-space/lowcode-data-space-runtime'
function config(){return new ScenarioViewConfig('SPACE',JSON.stringify({scenarioId:'SPACE',schemaVersion:2,resourceRelations:[],tables:{Run:{resourceType:'command',resourceId:'test-command',columns:[{name:'commandId',type:'string',isPrimaryKey:true},{name:'key',type:'string'}],views:{default:{autoLoad:false,commitMode:'staged',queryConfig:{pagination:'none'}}}}}}))}
it('loads configured commands without querying a fake formal model',async()=>{
 service.readModelBatch.mockClear()
 const result=await loadScenarioDataSet({scenarioId:'SPACE',config:config(),modelScope:'Run',commandBindings:{Run:(_view:DataView)=>({resource:{resourceType:'command',resourceId:'test-command'},inputFields:['key'],guard:()=>undefined,createKey:()=> 'C1',submit:async(row:DataRow)=>row,verify:async()=>undefined})}})
 try{expect(service.readModelBatch).not.toHaveBeenCalled();expect(result.dataSet.getTable('Run')?.resourceType).toBe('command');await result.dataSet.getView('Run')!.refresh()}
 finally{result.dataSet.destroy()}
})
it('rejects an unbound command before metadata reads',async()=>{
 service.readSpaceDefinition.mockClear()
 await expect(loadScenarioDataSet({scenarioId:'SPACE',config:config()})).rejects.toThrow('SCENARIO_COMMAND_BINDING')
 expect(service.readSpaceDefinition).not.toHaveBeenCalled()
})
