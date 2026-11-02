/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-computed-fields
 * 职责：工作流计算字段只暂存到原DataView。
 * 边界：保存、取消与输出同步交同一查询字段命令，不执行函数或另建草稿。
 */
import type {DataSet,DataRow} from '@spark-appworks/spark-data'
import {workflowQueryFieldScope,readWorkflowFieldValue as read} from './query-field-context'
import {validateWorkflowQueryInputChanges} from './query-inputs'
import {buildComputedFieldDefinition} from '@/lowcode/data-space/model-source/field/computed-field-definition'
type Values=Readonly<{Name:string;description:string;ValueFun:string;IsOutput?:0|1}>
/** 校验实际新增内容，不能把来源字段伪装为新计算字段或覆盖既有输出。 */
export function validateWorkflowComputedField(dataSet:DataSet,workflowId:string,nodeId:string,row:DataRow,ownId?:string):void{
 const {fields,modelId}=workflowQueryFieldScope(dataSet,workflowId,nodeId)
 if(row['dataSetId']!==workflowId||row['dataModelId']!==modelId||row['type']!=='dataModel'||row['FieldType']!=='计算字段'||row['IsPKey']!==0)throw Error('新增计算字段身份或用途不符')
 buildComputedFieldDefinition({targetId:workflowId,modelId},row)
 for(const key of ['Name','AsName']){
  const value=row[key]
  if(typeof value!=='string'||value.includes('.'))throw Error('计算字段名称或别名不能含点路径')
 }
 if(typeof row['ValueFun']!=='string'||row['Expression']!==''||row['allowAIAdd']!==0)throw Error('新增计算字段函数或固定属性格式无效')
 const name=String(row['Name']),alias=row['AsName'],outputName=typeof alias==='string'&&alias.length>0?alias:name
 for(const original of fields.rows){
  const id=fields.getPkKey(original)
  if(id===undefined)throw Error('已有字段缺少正式身份')
  if(id===ownId)continue
  if(read(fields,original,'type')!=='dataModel')continue
  const other=fields.getEditingRow(id)??original
  for(const key of ['Name','AsName'])read(fields,original,key)
  const otherAlias=other['AsName'],otherOutput=typeof otherAlias==='string'&&otherAlias.length>0?otherAlias:String(other['Name'])
  if(other['Name']===name||otherOutput===outputName)throw Error('计算字段名称或输出名称已存在')
 }
 validateWorkflowQueryInputChanges(dataSet,workflowId,nodeId,{values:[row['ValueFun']]})
}
export class WorkflowComputedFields{
 /** 新身份由原DataView生成；取消沿原视图丢弃，默认与参考一致不参与输出。 */
 static async add(dataSet:DataSet,workflowId:string,nodeId:string,input:Values):Promise<string>{
  const {fields,nodes,models,edges,modelId}=workflowQueryFieldScope(dataSet,workflowId,nodeId)
  if([fields,nodes,models,edges].some(view=>view.hasUnconfirmedSave))throw Error('请先核验原查询配置提交')
  if(fields.addActionState()!=='enabled')throw Error('当前查询不允许新增计算字段')
  const values=buildComputedFieldDefinition({targetId:workflowId,modelId},{Name:input.Name.trim(),AsName:'',description:input.description.trim(),ValueFun:input.ValueFun,IsOutput:input.IsOutput??0})
  validateWorkflowComputedField(dataSet,workflowId,nodeId,values)
  for(const key of Object.keys(values))if(fields.newRowFieldAccess(key).write!=='allowed')throw Error(`当前查询不允许新增字段属性: ${key}`)
  const row=await fields.addRow(values),id=fields.getPkKey(row)
  if(typeof id!=='string'||!id)throw Error('计算字段缺少原生新增身份')
  return id
 }
}
