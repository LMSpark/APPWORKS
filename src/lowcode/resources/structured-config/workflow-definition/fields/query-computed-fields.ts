/**
 * @module app:lowcode/resources/structured-config/workflow-definition/fields/query-computed-fields
 * 职责：工作流计算字段只暂存到原DataView。
 * 边界：保存、取消与输出同步交同一查询字段命令，不执行函数或另建草稿。
 */
import type {DataSet,DataRow} from '@spark-appworks/spark-data'
import {workflowQueryFieldScope,workflowQueryDraftSignature,readWorkflowFieldValue as read} from './query-field-context'
import {validateWorkflowQueryInputChanges} from './query-inputs'
import {buildComputedFieldDefinition,createComputedFieldDraft} from '@/lowcode/data-space/model-source/field/computed-field-definition'
import {assertWorkflowFieldStructureChanges} from './query-field-references'
type Values=Readonly<{Name:string;description:string;ValueFun:string;IsOutput?:0|1}>
/** 校验实际新增内容，不能把来源字段伪装为新计算字段或覆盖既有输出。 */
export function validateWorkflowComputedField(parameters:Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;row:DataRow;ownId?:string|undefined}>):void{
 const {dataSet,workflowId,nodeId,row,ownId}=parameters

 const {fields,modelId}=workflowQueryFieldScope(dataSet,workflowId,nodeId)
 if(row['dataSetId']!==workflowId||row['dataModelId']!==modelId||row['type']!=='dataModel'||row['FieldType']!=='计算字段'||row['IsPKey']!==0)throw Error('新增计算字段身份或用途不符')
 buildComputedFieldDefinition({targetId:workflowId,modelId},row)
 for(const key of ['Name','AsName']){
  const value=row[key]
  if(typeof value!=='string'||value.includes('.'))throw Error('计算字段名称或别名不能含点路径')
 }
 const creating=ownId===undefined||fields.dirtyTracking.isPendingCreate(ownId)
 if(typeof row['ValueFun']!=='string'||creating&&(row['Expression']!==''||row['allowAIAdd']!==0))throw Error('计算字段函数或新增固定属性格式无效')
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
 validateWorkflowQueryInputChanges({dataSet,workflowId,nodeId,input:{values:[row['ValueFun']]}})
}
export class WorkflowComputedFields{
 /** 明确删除计算字段；未保存新增直接撤销，正式记录先检查本工作流引用，再由原视图跟踪删除。 */
 static async remove(parameters:Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;fieldId:string}>):Promise<void>{
 const {dataSet,workflowId,nodeId,fieldId}=parameters

  const {fields,modelId}=workflowQueryFieldScope(dataSet,workflowId,nodeId),row=fields.rows.find(item=>fields.getPkKey(item)===fieldId)
  if(!row||read(fields,row,'dataSetId')!==workflowId||read(fields,row,'dataModelId')!==modelId||read(fields,row,'FieldType')!=='计算字段'
   ||Number(read(fields,row,'IsPKey'))!==0||fields.commitMode!=='staged'||fields.deleteActionState(row)!=='enabled')throw Error('当前查询不允许删除该计算字段')
  if(fields.hasUnconfirmedSave||fields.hasEditingChanges(fieldId)||fields.dirtyTracking.dirtyRowIds.has(fieldId))throw Error('请先保存或取消该计算字段的原修改')
  const draft=workflowQueryDraftSignature([fields])
  if(!fields.dirtyTracking.isPendingCreate(fieldId))await assertWorkflowFieldStructureChanges({dataSet,workflowId,nodeId,changes:[{before:row}]})
  const current=workflowQueryFieldScope(dataSet,workflowId,nodeId)
  if(current.fields!==fields||fields.rows.find(item=>fields.getPkKey(item)===fieldId)!==row||workflowQueryDraftSignature([fields])!==draft)throw Error('计算字段删除目标或草稿已变化；保留当前修改')
  await fields.removeRow(fieldId)
 }
 /** 确认原行编辑覆盖但不提交服务；所属查询配置仍由宿主统一保存。 */
 static async confirm(parameters:Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;fieldId:string}>):Promise<void>{
 const {dataSet,workflowId,nodeId,fieldId}=parameters

  const {fields}=workflowQueryFieldScope(dataSet,workflowId,nodeId)
  const row=fields.getEditingRow(fieldId)
  if(!row||fields.commitMode!=='staged'||fields.hasUnconfirmedSave)throw Error('计算字段原编辑身份或提交状态已变化')
  const next={...row,Name:typeof row['Name']==='string'?row['Name'].trim():row['Name'],description:typeof row['description']==='string'?row['description'].trim():row['description']}
  validateWorkflowComputedField({dataSet,workflowId,nodeId,row:next,ownId:fieldId})
  for(const key of ['Name','description'] as const)if(row[key]!==next[key])fields.updateEditingValue(fieldId,key,next[key])
  const result=await fields.applyEditingRows([fieldId])
  if(!result.success)throw Error(result.message??'计算字段编辑未确认')
 }
 /** 对话框从原视图的空白新增行开始，不生成临时名称或另一份表单真源。 */
 static begin(dataSet:DataSet,workflowId:string,nodeId:string):Promise<string>{
  const {modelId}=workflowQueryFieldScope(dataSet,workflowId,nodeId)
  return this.stage({dataSet,workflowId,nodeId,values:createComputedFieldDraft({targetId:workflowId,modelId})})
 }
 /** 新身份由原DataView生成；取消沿原视图丢弃，默认与参考一致不参与输出。 */
 static async add(parameters:Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;input:Values}>):Promise<string>{
 const {dataSet,workflowId,nodeId,input}=parameters

  const {modelId}=workflowQueryFieldScope(dataSet,workflowId,nodeId)
  const values=buildComputedFieldDefinition({targetId:workflowId,modelId},{Name:input.Name.trim(),AsName:'',description:input.description.trim(),ValueFun:input.ValueFun,IsOutput:input.IsOutput??0})
  validateWorkflowComputedField({dataSet,workflowId,nodeId,row:values})
  return this.stage({dataSet,workflowId,nodeId,values})
 }
 private static async stage(parameters:Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;values:DataRow}>):Promise<string>{
 const {dataSet,workflowId,nodeId,values}=parameters

  const {fields,nodes,models,edges}=workflowQueryFieldScope(dataSet,workflowId,nodeId)
  if(fields.commitMode!=='staged')throw Error('计算字段必须通过原暂存视图编辑')
  if([fields,nodes,models,edges].some(view=>view.hasUnconfirmedSave))throw Error('请先核验原查询配置提交')
  if(fields.addActionState()!=='enabled')throw Error('当前查询不允许新增计算字段')
  for(const key of Object.keys(values))if(fields.newRowFieldAccess(key).write!=='allowed')throw Error(`当前查询不允许新增字段属性: ${key}`)
  const row=await fields.addRow(values),id=fields.getPkKey(row)
  if(typeof id!=='string'||!id)throw Error('计算字段缺少原生新增身份')
  return id
 }
}
