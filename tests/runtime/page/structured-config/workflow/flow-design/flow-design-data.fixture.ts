import {afterEach,beforeEach,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {createLowcodeFileResourceExecutors} from '@/lowcode/resources/repository/file-resource-registry'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {buildFormalModels} from '../../catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {FLOW_DESIGN_SCENARIO_ID,prepareFlowDesignViews} from '@/lowcode/resources/system/workflow/manage'
const storageState=vi.hoisted(()=>({text:'',exists:true,writes:0,removes:0,loseReceipt:false,loseDeleteReceipt:false,posts:[] as string[]}))
vi.mock('@/lowcode/lowcode-runtime',()=>({
 lowcodeApi:{readRequestScope:()=>({token:'scope',headers:{'X-AppId':'APP'}}),design:{
  readTextFile:vi.fn(async()=>{if(!storageState.exists)throw new LowcodeApiError(404,'Missing isolated design file');return storageState.text}),
  removeFile:vi.fn(async()=>{storageState.removes++;storageState.exists=false;if(storageState.loseDeleteReceipt){storageState.loseDeleteReceipt=false;throw Error('lost delete receipt')}}),
 }},
 lowcodeHttp:{request:async(input:{url:string})=>{storageState.posts.push(input.url);return {Code:200,Result:true}}},
 lowcodeDesignFileUpload:{uploadWorkingText:async(input:{text:string})=>{storageState.writes++;storageState.exists=true;storageState.text=input.text;if(storageState.loseReceipt){storageState.loseReceipt=false;throw Error('lost file receipt')}return {}}},
}))
export const storage=storageState
import {lowcodeApi,lowcodeDesignFileUpload} from '@/lowcode/lowcode-runtime'
const pages:PageRuntime[]=[]
beforeEach(()=>{storage.text='{"nodes":[{"id":"N1","x":7,"y":9,"custom":"preserve"}],"edges":[],"viewport":{"zoom":2}}';storage.exists=true;storage.writes=0;storage.removes=0;storage.loseReceipt=false;storage.loseDeleteReceipt=false;storage.posts=[]})
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
export async function fixture(extra=false,prepare=true){
 const text=readFileSync('config/pages/workflow/flow-design/pagedata.json','utf8').replace('__SCENARIO__',FLOW_DESIGN_SCENARIO_ID)
 const raw=JSON.parse(text) as {tables:Record<string,{modelBinding?:{modelId:string};views:Record<string,{queryConfig?:{fields?:string[]}}>}>}
 const formalOutputs=JSON.parse(readFileSync('tests/runtime/page/structured-config/workflow/flow-design/flow-design-formal-outputs.fixture.json','utf8')) as Record<string,string[]>
 const models=Object.entries(raw.tables).filter(([,table])=>table.modelBinding).flatMap(([name,table])=>buildFormalModels({[name]:formalOutputs[name]!}).map(model=>({...model,id:table.modelBinding!.modelId,fields:model.fields.map(field=>({...field,modelId:table.modelBinding!.modelId}))})))
 const http=new ApiBackend();http.records={WFM_FLOW_MODLE:[{rowid:'FM-1',TITLE:'Flow 1',sysid:''}],WFM_FLOW_NODE:[{rowid:'N1',FLOWID:'FM-1',TITLE:'Start',TYPEID:11,MEMO:''}],WFM_NODE_REALATION:[],WFM_WORKFORM:[{rowid:'WF1',FlowID:'FM-1',FORMID:'FORM1',FormName:'Form'}],Base_AppSystemList:[{rowid:'APP',AppDesc:'Original',AppName:'app'}]}
 if(extra){http.records['WFM_FLOW_MODLE']!.push({rowid:'FM-2',TITLE:'Other',sysid:''});http.records['WFM_FLOW_NODE']!.push({rowid:'OTHER',FLOWID:'FM-2',TITLE:'Other',TYPEID:11,MEMO:''})}
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(FLOW_DESIGN_SCENARIO_ID,text),space:{dataSpaceId:FLOW_DESIGN_SCENARIO_ID,name:'Design'},models,relations:[],fileExecutors:createLowcodeFileResourceExecutors({applicationId:'APP',api:lowcodeApi.design,fileUpload:lowcodeDesignFileUpload,assertCurrent(){}})}).dataSet
 const runtime=new PageRuntime({pageId:'design-save',scenarioIds:[FLOW_DESIGN_SCENARIO_ID],loadScenario:async()=>ds});pages.push(runtime);await runtime.load()
 if(prepare)await prepareFlowDesignViews(runtime,'FM-1')
 return{ds,http,runtime,nodes:ds.getView('WFM_FLOW_NODE')!,forms:ds.getView('WFM_WORKFORM')!}
}
