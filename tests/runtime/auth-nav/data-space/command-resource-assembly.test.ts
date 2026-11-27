import {afterEach,expect,it,vi} from 'vitest'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import type {DataSet,DataView,DataRow} from '@spark-appworks/spark-data'
import {HttpClientBase,type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../src/platform-adapters/data-space/lowcode-data-space-assembler'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
class NoNetwork extends HttpClientBase{protected override async executeRequest(_request:RequestConfig):Promise<never>{throw Error('Unexpected network')}}
const config=()=>new ScenarioViewConfig('SPACE',JSON.stringify({scenarioId:'SPACE',tables:{Run:{resourceType:'command',resourceId:'test-command',columns:[{name:'commandId',type:'string',isPrimaryKey:true},{name:'key',type:'string'},{name:'receipt',type:'string'}],views:{default:{autoLoad:false,commitMode:'staged',queryConfig:{pagination:'none'}}}}}}))
function fixture(){const http=new NoNetwork(),runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{}})});return new LowcodeDataSpaceAssembler(runtime,http)}
function options(resourceId='test-command'){
 const submit=vi.fn(async(row:DataRow)=>({...row,receipt:'accepted'})),verify=vi.fn(async(_row:DataRow):Promise<DataRow|undefined>=>undefined)
 return{resource:{resourceType:'command' as const,resourceId},inputFields:['key'],guard:()=>undefined,createKey:()=> 'cmd1',submit,verify}
}
it('requires an exact command binding rather than a backend model or file owner',()=>{
 expect(()=>fixture().assemble({config:config(),space:{dataSpaceId:'SPACE',name:'Commands'},models:[],relations:[]})).toThrow('SCENARIO_COMMAND_BINDING')
 expect(()=>fixture().assemble({config:config(),space:{dataSpaceId:'SPACE',name:'Commands'},models:[],relations:[],commandBindings:{'test-command':(_view:DataView)=>options('other')}})).toThrow('SCENARIO_COMMAND_RESOURCE')
})
it('assembles the configured command view once and dispatches only through native DataSet save',async()=>{
 const command=options(),assembled=fixture().assemble({config:config(),space:{dataSpaceId:'SPACE',name:'Commands'},models:[],relations:[],commandBindings:{'test-command':(_view:DataView)=>command}})
 const ds=assembled.dataSet;sets.push(ds)
 const view=ds.getView('Run')!;expect(view.dataTable?.modelBinding).toBeUndefined();expect(view.dataTable?.resourceType).toBe('command')
 await view.refresh();expect(command.submit).not.toHaveBeenCalled()
 await view.addRow({key:'K'});expect(command.submit).not.toHaveBeenCalled();expect(view.rows[0]?.['commandId']).toBe('cmd1')
 await ds.saveChanges({views:[{tableName:'Run',viewId:'default'}]})
 expect(command.submit).toHaveBeenCalledOnce();expect(view.rows[0]).toMatchObject({commandId:'cmd1',key:'K',receipt:'accepted'})
})


it('selects the command owner by the declared resource and binds each scenario instance independently',async()=>{
 const factories=vi.fn((_view:DataView)=>options())
 const input={config:config(),space:{dataSpaceId:'SPACE',name:'Commands'},models:[],relations:[],
   commandBindings:{'test-command':factories}}
 const first=fixture().assemble(input).dataSet
 const second=fixture().assemble(input).dataSet
 sets.push(first,second)
 const firstView=first.getView('Run')!,secondView=second.getView('Run')!
 expect(factories.mock.calls).toEqual([[firstView],[secondView]])
 await firstView.refresh()
 await secondView.refresh()
 await firstView.addRow({key:'FIRST'})
 await secondView.addRow({key:'SECOND'})
 await first.saveChanges()
 expect(factories.mock.results[0]?.value.submit).toHaveBeenCalledTimes(1)
 expect(factories.mock.results[1]?.value.submit).not.toHaveBeenCalled()
 expect(firstView.rows[0]).toMatchObject({key:'FIRST',receipt:'accepted'})
 expect(secondView.rows[0]).toMatchObject({key:'SECOND'})
})

it('rejects registrations using a table key instead of the declared resource',()=>{
 const factory=vi.fn((_view:DataView)=>options())
 const input={config:config(),space:{dataSpaceId:'SPACE',name:'Commands'},models:[],relations:[],commandBindings:{Run:factory}}
 expect(()=>fixture().assemble(input)).toThrow('SCENARIO_COMMAND_BINDING')
 expect(factory).not.toHaveBeenCalled()
})
