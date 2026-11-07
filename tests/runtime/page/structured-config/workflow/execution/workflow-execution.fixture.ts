import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {DataViewFilter,DataViewFilterCodec} from '@spark-appworks/spark-data'
import type {HttpResponse,RequestConfig} from '@spark-appworks/spark-utils'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout/layout-resource'
import {prepareWorkflowExecutionInput} from '@/lowcode/resources/structured-config/workflow-definition/execution/runtime-bindings'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText,workflowDesignCommandBindings} from '../workflow-native-design.fixture'
export class ExecutionHttp extends ApiBackend{
 readonly executions:RequestConfig[]=[]
 loseReceipt=false
 hold:Promise<void>|undefined
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  if(!['/api/Workflow/runSingleNodeTest','/api/Workflow/runWorkflowTest'].includes(request.url))return super.executeRequest(request)
  this.executions.push(request);await this.hold;if(this.loseReceipt)throw Error('execution receipt lost')
  const result=(nodeId:string)=>({workflowId:'W1',nodeId,status:'SUCCESS',count:nodeId==='N1'?1:0,output:nodeId==='N1'?[{value:0,enabled:false}]:[]})
  return{data:{Code:200,Result:request.url.endsWith('runSingleNodeTest')?result('N1'):['START','N1','END'].map(result)},status:200,statusText:'OK',headers:{}}
 }
}
export async function workflowExecutionFixture(pages:PageRuntime[],operation:'add'|'edit'|'delete'='add',filtered=false){
 const http=new ExecutionHttp()
 const constant=(Value:unknown)=>JSON.stringify({Type:'GetConstValue',Value})
 http.records={
  Base_WorkflowDefinition:[{rowid:'W1',name:'Captured workflow'}],Base_DataSet:[{rowid:'W1',Type:'workflow',inputParams:'[]'}],
  Base_WorkflowNodeDefinition:[{rowid:'START',workflow_id:'W1',position_type:0,node_type:'query',output_mapping:'[]'},
   {rowid:'N1',workflow_id:'W1',position_type:1,node_type:operation,dataOperateModId:'M1',input_mapping:'[]',output_mapping:'[]'},
   {rowid:'END',workflow_id:'W1',position_type:2,node_type:'query',output_mapping:'[]'}],
  Base_WorkflowConnectors:[{rowid:'SN',workflow_id:'W1',sourceID:'START',targetID:'N1',params:'[]'},{rowid:'NE',workflow_id:'W1',sourceID:'N1',targetID:'END',params:'[]'}],
  Base_DataModel:[{rowid:'M1',dataSetId:'W1',Name:'Target',MetaName:'Disposable',DbId:'DB',DbName:'TestDB',Type:'数据库表',requestType:operation,Filter:filtered?DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'rowid',operator:'eq',value:'OWNED'})):''}],
  Base_DataModel_Field:[{rowid:'F1',dataSetId:'W1',dataModelId:'M1',type:'inputParams',Name:'rowid',FieldType:'varchar',description:'ID',IsPKey:1,ValueFun:filtered?'':constant('OWNED')},
   {rowid:'F2',dataSetId:'W1',dataModelId:'M1',type:'inputParams',Name:'name',FieldType:'varchar',description:'Name',IsPKey:0,ValueFun:constant('value')}],
  Base_DataModel_Relation:[],
  View_TblList:[{rowid:'TABLE',dbid:'DB',DbName:'TestDB',tblname:'Disposable',tbldesc:''},{rowid:'OTHER_TABLE',dbid:'DB',DbName:'TestDB',tblname:'OtherTarget',tbldesc:''}],
  Base_TblField:['TABLE','OTHER_TABLE'].flatMap(tblid=>[{rowid:`${tblid}_PK`,tblid,enname:'rowid',DataType:'varchar',cnname:'ID',IsPKey:1},{rowid:`${tblid}_NAME`,tblid,enname:'name',DataType:'varchar',cnname:'Name',IsPKey:0}]),
 }
 const config=new ScenarioViewConfig(WORKFLOW_DESIGN,workflowDesignText),runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space:{dataSpaceId:WORKFLOW_DESIGN,name:'Workflow'},models:workflowDesignModels(),relations:[],...workflowDesignCommandBindings(workflowDesignText,http),
  fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{removeFile:async()=>{throw Error('unexpected delete')},readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>{throw Error('unexpected upload')}},assertCurrent:()=>undefined})}}).dataSet
 const page=new PageRuntime({pageId:'execution-proof',scenarioIds:[WORKFLOW_DESIGN],scenarioInputs:{[WORKFLOW_DESIGN]:{workflowId:'W1'}},loadScenario:async()=>ds});pages.push(page);await page.load()
 await Promise.all(['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors','Base_DataSet'].map(name=>ds.getView(name)!.refresh()))
 const view=ds.getView('WorkflowExecution')!
 const stage=async(mode:'node'|'workflow'='node')=>{const presentation=await prepareWorkflowExecutionInput(view,{workflowId:'W1',mode,...mode==='node'?{nodeId:'N1'}:{}});return{presentation,id:String(view.getPkKey(view.currentRow!))}}
 const save=(id:string)=>ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:[id]}]})
 return{http,ds,page,view,stage,save}
}
