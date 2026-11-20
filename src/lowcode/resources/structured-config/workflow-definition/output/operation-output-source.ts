/**
 * @module app:lowcode/resources/structured-config/workflow-definition/output/operation-output-source
 * 职责：显式操作输出命令按正式SQL身份重读物理列，复用唯一纯投影。
 * 边界：只查询来源元数据，不查询业务行，不缓存、保存或重置调用方首轮合同。
 */
import {RequestState,type DataSet,type DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'
import {buildWorkflowOperationOutput,workflowOperationOutputTarget} from './operation-output'

type Input=Omit<Parameters<typeof buildWorkflowOperationOutput>[0],'physical'>&Readonly<{dataSet:DataSet;assertCurrent():void}>
/** 返回正式模型字段ID的目录；来源查询期间及返回后继续使用同一首轮守卫。 */
export async function resolveWorkflowOperationOutput(input:Input):Promise<Array<Record<string,unknown>>>{
 input.assertCurrent()
 const target=workflowOperationOutputTarget(input)
 const physical=await LowcodeDataSpaceModelSourceReader.readTableTarget(input.dataSet,target,input.assertCurrent)
 input.assertCurrent()
 return buildWorkflowOperationOutput({...input,physical:physical.fields})
}
/** 显式输出生成或提交复核的独立正式读取；不依赖页面当前模型选择。 */
export async function loadWorkflowOperationOutput(input:Omit<Input,'model'|'fields'>){
 input.assertCurrent();const {dataSet,workflowId,modelId}=input
 const source=dataSet.getView('Base_DataModel','modelCatalog'),fieldSource=dataSet.getView('Base_DataModel_Field','modelInputFields')
 if(!source||!fieldSource)throw Error('操作输出缺少正式模型或字段视图')
 const suffix=`operationOutput_${crypto.randomUUID().replaceAll('-','')}`,models=source.createQueryView(suffix),fields=fieldSource.createQueryView(suffix)
 const modelKeys=['rowid','dataSetId','Type','requestType','DbId','DbName','MetaName'],fieldKeys=['rowid','dataSetId','dataModelId','type','IsOutput','IsPKey','AsName','Name','FieldType','description']
 const rows=(view:DataView,keys:string[])=>view.rows.map(row=>Object.fromEntries(keys.map(key=>{if(view.fieldAccess(row,key).read!=='visible'||!Object.hasOwn(row,key))throw Error('操作输出正式字段不可读或缺失');return[key,row[key]]})))
 try{
  models.queryContext={dataSpaceId:workflowId};models.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:workflowId},{field:'rowid',operator:'eq',value:modelId}]};models.queryConfig={...models.queryConfig,allPages:true,fields:modelKeys}
  fields.queryContext={dataSpaceId:workflowId,modelIds:[modelId]};fields.queryConfig={...fields.queryConfig,allPages:true,fields:fieldKeys}
  for(const view of [models,fields]){await view.refresh();input.assertCurrent();if(view.destroyed||view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total)throw Error('操作输出正式定义未完整读取')}
  const model=rows(models,modelKeys)[0];if(models.rows.length!==1||!model)throw Error('操作输出正式模型不唯一')
  const target=workflowOperationOutputTarget({...input,model}),output=await resolveWorkflowOperationOutput({...input,model,fields:rows(fields,fieldKeys)})
  return{target,output}
 }finally{for(const view of [models,fields])if(!view.destroyed)view.dataTable?.destroyView(view.viewId)}
}
