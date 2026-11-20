import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from './workflow-native-design.fixture'
export async function workflowSourceEditFixture(pages:PageRuntime[],options:Readonly<{legacyModelFlagTypes?:boolean;legacyRelationFlagTypes?:boolean}>={}){
 const http=new ApiBackend();http.records={Base_WorkflowDefinition:[{rowid:'W',name:'workflow'}],Base_DataSet:[{rowid:'W',Type:'workflow',inputParams:'[]'}],Base_DataModel_Relation:[],Base_WorkflowNodeDefinition:[
  {rowid:'START',workflow_id:'W',position_type:0,node_type:'query',name:'开始',output_mapping:JSON.stringify([{rowid:'P',pid:null,Name:'code',Description:'编码',FieldType:'string',isParent:false}])},
  {rowid:'QUERY',workflow_id:'W',position_type:1,node_type:'query',node_config:'MODEL',dataOperateModId:'',output_mapping:'[]'},
  {rowid:'SECOND',workflow_id:'W',position_type:1,node_type:'query',node_config:'MODEL',dataOperateModId:'',output_mapping:'[]'}],
  Base_WorkflowConnectors:[{rowid:'E',workflow_id:'W',sourceID:'START',targetID:'QUERY'}],
  Base_DataModel:[{rowid:'MODEL',dataSetId:'W',Name:'Orders',Type:'数据库表',requestType:'query'},{rowid:'FORK',dataSetId:'W',Name:'Isolated',Type:'数据库表',requestType:'query'}],
  Base_DataModel_Field:[{rowid:'F',dataSetId:'W',dataModelId:'MODEL',type:'dataModel',Name:'code',FieldType:'varchar',description:'编码',IsOutput:1,IsPKey:0},
   {rowid:'FF',dataSetId:'W',dataModelId:'FORK',type:'dataModel',Name:'isolated',AsName:'code',FieldType:'varchar',description:'隔离字段',IsOutput:1,IsPKey:0}]}
 const config=JSON.parse(workflowDesignText) as {tables:Record<string,unknown>;viewCascades:unknown[];resourceRelations:unknown[]};config.tables=Object.fromEntries(Object.keys(http.records).map(name=>[name,config.tables[name]]));config.viewCascades=[];config.resourceRelations=[]
 const formal=workflowDesignModels().map(model=>model.metaName==='Base_DataModel'&&options.legacyModelFlagTypes?{...model,fields:model.fields.map(field=>field.name==='IsBusiness'?{...field,type:'varchar'}:field)}:model.metaName==='Base_DataModel_Relation'&&options.legacyRelationFlagTypes?{...model,fields:model.fields.map(field=>field.name==='cascadeDel'?{...field,type:'varchar'}:field)}:model)
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})}),ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(WORKFLOW_DESIGN,JSON.stringify(config)),space:{dataSpaceId:WORKFLOW_DESIGN,name:'Design'},models:formal,relations:[]}).dataSet
 const page=new PageRuntime({pageId:'prospective-input',scenarioIds:[WORKFLOW_DESIGN],scenarioInputs:{[WORKFLOW_DESIGN]:{workflowId:'W'}},loadScenario:async()=>ds});pages.push(page);await page.load()
 const nodes=ds.getView('Base_WorkflowNodeDefinition')!,originalModels=ds.getView('Base_DataModel')!,originalFields=ds.getView('Base_DataModel_Field')!
 originalModels.queryContext={workflowId:'W',modelId:'MODEL'};originalFields.queryContext={workflowId:'W',modelId:'MODEL'};originalFields.filterExpression={field:'dataModelId',operator:'eq',value:'MODEL'}
 const models=ds.getView('Base_DataModel','modelCatalog')!.createQueryView('prospectiveModels'),fields=ds.getView('Base_DataModel_Field','modelInputFields')!.createQueryView('prospectiveFields')
 models.queryContext={dataSpaceId:'W'};fields.queryContext={dataSpaceId:'W',modelIds:['FORK']}
 await Promise.all([...Object.keys(http.records).map(name=>ds.getView(name)!),models,fields].map(view=>view.refresh()))
 return{http,ds,nodes,projection:{fromModelId:'MODEL',modelId:'FORK',models,fields}}
}
