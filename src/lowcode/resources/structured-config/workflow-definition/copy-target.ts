/**
 * @module app:lowcode/resources/structured-config/workflow-definition/copy-target
 * 职责：核验迁移目标的正式物理表身份，将目标配置暂存到原节点DataView。
 * 边界：不保存、不执行业务迁移、不建立第二份可编辑配置；保留目标之外的原配置。
 * AI用途：迁移节点选择物理目标或执行预检时复用同一配置解析与正式来源核验。
 */
import {RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'
import type {PageDataSpaceModelSource} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
import {LowcodeDataSpaceSourceCatalog} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
import {definitionTargetDraftSignature} from '@/lowcode/data-space/model-source/data-space-definition-save'

function read(view:DataView,row:DataRow,key:string):unknown{
 if(view.fieldAccess(row,key).read!=='visible')throw Error(`迁移目标定义不可读: ${key}`)
 return row[key]
}
function configObject(value:unknown):Record<string,unknown>{
 const parsed=typeof value==='string'&&value.trim()?parseJsonDocument(value):value===''||value===undefined||value===null?{}:value
 if(!isRecord(parsed))throw Error('迁移目标配置必须是JSON对象')
 return parsed
}
/** 按已实服核定的目标属性解析配置；缺省批大小沿服务合同为500，不猜改旧数据库属性名。 */
export function workflowCopyTargetConfig(value:unknown):Record<string,unknown>&{targetDbName:string;targetTableName:string;size:number}{
 const config=configObject(value),db=config['targetDbName'],table=config['targetTableName'],size=config['size']??500
 if(typeof db!=='string'||!db.trim()||typeof table!=='string'||!table.trim())throw Error('迁移目标缺少targetDbName或targetTableName，请选择正式目标表')
 if(typeof size!=='number'||!Number.isSafeInteger(size)||size<1||size>2000)throw Error('迁移批大小必须为1至2000的整数')
 return {...config,targetDbName:db,targetTableName:table,size}
}
/** 执行命令按正式数据库名和表名定位唯一目标；目标字段仍由公共来源读取器核验，私有查询随后释放。 */
export async function readWorkflowCopyTarget(dataSet:DataSet,value:unknown,assertCurrent:()=>void){
 const config=workflowCopyTargetConfig(value),template=dataSet.getView('View_TblList','sourceDetails')
 if(!template||template.dataTable?.modelBinding?.modelName!=='View_TblList')throw Error('迁移目标缺少正式来源视图')
 const view=template.createQueryView(`copyTarget_${crypto.randomUUID().replaceAll('-','')}`)
 try{
  view.queryConfig={...view.queryConfig,allPages:true}
  view.filterExpression={logic:'and',filters:[{field:'DbName',operator:'eq',value:config.targetDbName},{field:'tblname',operator:'eq',value:config.targetTableName}]}
  assertCurrent();await view.refresh();assertCurrent()
  const row=view.rows[0]
  if(view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==1||view.total!==1||!view.countReported||!row)throw Error('迁移目标来源不存在或不唯一')
  const source=LowcodeDataSpaceSourceCatalog.source('table',view,row)
  const result=await LowcodeDataSpaceModelSourceReader.readTableTarget(dataSet,source,assertCurrent)
  DataSpaceDesignApi.resolveSourcePrimaryKey(result.fields.map(field=>({name:field.Name,primaryKey:field.IsPKey===1})))
  return result
 }finally{if(!dataSet.destroyed)view.dataTable?.destroyView(view.viewId)}
}
/** 显式选择正式表后只写原节点config编辑域；保存、取消及未知结果仍由原DataView负责。 */
export async function stageWorkflowCopyTarget(input:Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;selection:PageDataSpaceModelSource;assertCurrent():void}>):Promise<void>{
 const {dataSet,workflowId,nodeId,selection}=input,nodes=dataSet.getView('Base_WorkflowNodeDefinition'),definition=dataSet.getView('Base_WorkflowDefinition')
 if(!nodes||!definition||selection.type!=='table')throw Error('迁移目标必须选择正式数据库表')
 const context=JSON.stringify([nodes.queryContext,nodes.queryConfig,nodes.filterExpression])
 const check=()=>{
  input.assertCurrent()
  if(dataSet.destroyed||nodes.destroyed||dataSet.getView(nodes.tableName,nodes.viewId)!==nodes||nodes.queryContext['workflowId']!==workflowId||JSON.stringify([nodes.queryContext,nodes.queryConfig,nodes.filterExpression])!==context
   ||nodes.requestState!==RequestState.Loaded||nodes.loadingError||nodes.mutating||nodes.hasUnconfirmedSave)throw Error('迁移目标节点实例已变化或保存尚未确认')
  const root=definition.rows[0],node=nodes.rows.find(row=>nodes.getPkKey(row)===nodeId)
  if(definition.queryContext['workflowId']!==workflowId||definition.rows.length!==1||!root||read(definition,root,'rowid')!==workflowId
   ||!node||read(nodes,node,'workflow_id')!==workflowId||String(read(nodes,node,'position_type'))!=='1'||read(nodes,node,'node_type')!=='copy')throw Error('迁移目标节点身份或归属已变化')
  if(nodes.editActionState(node)!=='enabled'||nodes.fieldAccess(node,'config').write!=='allowed')throw Error('当前查询不允许修改迁移目标')
  return node
 }
 check()
 const signature=definitionTargetDraftSignature(nodes,[nodeId])
 const source=await LowcodeDataSpaceModelSourceReader.readTableTarget(dataSet,selection,()=>{check()})
 const node=check()
 if(source.source.id!==selection.id||definitionTargetDraftSignature(nodes,[nodeId])!==signature)throw Error('迁移目标候选或节点草稿已变化，请重新选择')
 DataSpaceDesignApi.resolveSourcePrimaryKey(source.fields.map(field=>({name:field.Name,primaryKey:field.IsPKey===1})))
 const config=configObject(nodes.getEditingRow(nodeId)?.['config']??read(nodes,node,'config'))
 const {targetDatabaseName:retired,...preserved}=config;void retired
 const next=workflowCopyTargetConfig({...preserved,targetDbName:source.source.databaseName,targetTableName:source.source.name,
  text:`表：${source.source.description||source.source.name} [${source.source.name}]`})
 nodes.updateEditingValue(nodeId,'config',JSON.stringify(next))
}
