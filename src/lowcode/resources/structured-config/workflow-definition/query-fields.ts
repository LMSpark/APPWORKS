/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-fields
 * 职责：查询字段显示与输出配置和引用同一模型的节点输出目录沿原DataSet同步提交。
 * 边界：不持有草稿、不查询全空间、不执行流程；尚未核定的下游输出引用明确阻断结构变更。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {buildWorkflowQueryOutput} from './query-output'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {validateWorkflowQueryInputChanges} from './query-inputs'
import {workflowQueryFieldScope,workflowQueryDraftSignature,readWorkflowFieldValue as read,workflowFieldChanges as changes} from './query-field-context'
import {validateWorkflowComputedField} from './query-computed-fields'
import {assertWorkflowFieldStructureChanges} from './query-field-references'

const allowed=new Set(['description','AsName','IsOutput','OrderType','Order','Group','ValueFun'])
const projectionFields=['rowid','dataSetId','dataModelId','type','Name','AsName','FieldType','description','IsOutput','IsPKey']
/** 保存原字段编辑覆盖和同模型节点输出；未知批次只交原DataSet核验，其他节点草稿保持原位。 */
export async function saveWorkflowQueryFields(dataSet:DataSet,workflowId:string,nodeId:string){
 const result=await updateWorkflowQueryFields(dataSet,workflowId,nodeId,'save')
 if(!result)throw Error('查询字段保存缺少原DataSet回执')
 return result
}
/** 取消本字段批次及可确认属于同一派生结果的节点输出；不撤销已确认提交，不丢弃其他节点编辑。 */
export async function cancelWorkflowQueryFields(dataSet:DataSet,workflowId:string,nodeId:string):Promise<void>{await updateWorkflowQueryFields(dataSet,workflowId,nodeId,'cancel')}
async function updateWorkflowQueryFields(dataSet:DataSet,workflowId:string,nodeId:string,action:'save'|'cancel'){
 const {nodes,fields,models,edges,model,modelId}=workflowQueryFieldScope(dataSet,workflowId,nodeId)
 if([fields,nodes,models].some(view=>view.hasUnconfirmedSave)){
  if(action==='cancel')throw Error('请先核验查询配置原提交')
  return dataSet.saveChanges({views:[fields,nodes,models].map(view=>({tableName:view.tableName,viewId:view.viewId}))})
 }
 const modelPatch=changes(models,model,modelId),modelChanged=Object.keys(modelPatch).length>0
 if(Object.keys(modelPatch).some(field=>!['Filter','description'].includes(field)))throw Error('请先处理查询模型的其他定义修改')
 if(action==='save')for(const field of Object.keys(modelPatch))if(models.fieldAccess(model,field).write!=='allowed')throw Error(`查询模型字段不可修改: ${field}`)
 const deletingIds=[...fields.dirtyTracking.pendingDeleteIds]
 const deletedRows=deletingIds.map(id=>{const row=fields.dirtyTracking.getPendingDeleteSnapshot(id);if(!row)throw Error('字段删除缺少原记录');return row})
 const projected=[...fields.rows,...deletedRows].map(row=>{
  const id=fields.getPkKey(row)
  if(typeof id!=='string')throw Error('查询字段正式身份缺失')
  const patch=changes(fields,row,id)
  const creating=fields.dirtyTracking.isPendingCreate(id)
  const deleting=fields.dirtyTracking.pendingDeleteIds.has(id)
  const computed=read(fields,row,'FieldType')==='计算字段'
  if(deleting&&!computed)throw Error('只能通过本命令删除计算字段')
  if(action==='save'&&creating)validateWorkflowComputedField(dataSet,workflowId,nodeId,fields.getEditingRow(id)??row,id)
  if(action==='save'&&!creating&&!deleting&&computed&&Object.keys(patch).length)validateWorkflowComputedField(dataSet,workflowId,nodeId,fields.getEditingRow(id)??row,id)
  if(action==='save'&&!creating&&Object.keys(patch).some(key=>!allowed.has(key)&&!(key==='Name'&&computed)))throw Error('本次只维护字段说明、输出及排序分组；其他字段须使用相应配置命令')
  if(action==='save')for(const field of Object.keys(patch))if(fields.fieldAccess(row,field).write!=='allowed')throw Error(`查询字段不可修改: ${field}`)
  if(action==='save')for(const field of ['Order','Group'])if(Object.hasOwn(patch,field)&&(!Number.isSafeInteger(patch[field])||Number(patch[field])<0))throw Error('排序顺序和分组标记须为非负整数')
  if(action==='save'&&Object.hasOwn(patch,'OrderType')&&!['','ascending','descending'].includes(String(patch['OrderType'])))throw Error('排序方向无效')
  const effective=deleting?{...row,IsOutput:0}:fields.getEditingRow(id)??row
  const baseline=creating?row:{...row,...Object.fromEntries(Object.entries(fields.dirtyTracking.getDiff(id,row)).map(([key,diff])=>[key,diff.from]))}
  const original=Object.fromEntries(projectionFields.map(field=>{read(fields,row,field);return[field,baseline[field]]}))
  return {id,patch,creating,deleting,computed,row:original,effective:{...original,...effective}}
 })
 const selected=projected.filter(item=>item.creating||item.deleting||Object.keys(item.patch).length>0)
 const affected=nodes.rows.filter(row=>read(nodes,row,'workflow_id')===workflowId&&['query','copy'].includes(String(read(nodes,row,'node_type')))&&read(nodes,row,'node_config')===modelId)
 const nodeIds=affected.map(row=>{
  const id=nodes.getPkKey(row);if(typeof id!=='string')throw Error('查询节点正式身份缺失')
  if(nodes.dirtyTracking.isPendingCreate(id)||nodes.dirtyTracking.isPendingDelete(id))throw Error('请先处理同模型节点的新增或删除')
  return id
 })
 const targets={views:[{tableName:fields.tableName,viewId:fields.viewId,ids:selected.map(item=>item.id)},
  {tableName:nodes.tableName,viewId:nodes.viewId,ids:nodeIds},{tableName:models.tableName,viewId:models.viewId,ids:modelChanged?[modelId]:[]}]}
 const pendingOutputs=affected.some(row=>Object.hasOwn(changes(nodes,row,String(nodes.getPkKey(row))),'output_mapping'))
 if(action==='cancel'&&!pendingOutputs){fields.discardPendingChanges(projected.map(item=>item.id));models.discardPendingChanges([modelId]);return}
 if(!selected.length&&!pendingOutputs&&!modelChanged)return dataSet.saveChanges({views:[{tableName:fields.tableName,viewId:fields.viewId,ids:[]}]})
 const values=selected.filter(item=>Object.hasOwn(item.patch,'ValueFun')).map(item=>item.effective['ValueFun'])
 if(action==='save'&&(values.length||Object.hasOwn(modelPatch,'Filter')))validateWorkflowQueryInputChanges(dataSet,workflowId,nodeId,{values,...Object.hasOwn(modelPatch,'Filter')?{filter:models.getEditingRow(modelId)?.['Filter']}: {}})
 const draft=workflowQueryDraftSignature([fields,nodes,models,edges])
 if(action==='save')await assertWorkflowFieldStructureChanges(dataSet,workflowId,nodeId,selected.filter(item=>!item.creating&&(item.deleting
  ||['Name','AsName'].some(key=>Object.hasOwn(item.patch,key))||Number(item.row['IsOutput'])===1&&Number(item.effective['IsOutput'])!==1)).map(item=>({before:item.row,...item.deleting?{}:{after:item.effective}})))
 if(action==='save'&&workflowQueryDraftSignature([fields,nodes,models,edges])!==draft)throw Error('查询配置草稿已变化；保留当前修改，未提交旧派生结果')
 const outputs=affected.flatMap(row=>{
  const id=String(nodes.getPkKey(row)),original=read(nodes,row,'output_mapping')
  const next=buildWorkflowQueryOutput({workflowId,modelId,fields:projected.map(item=>item.effective),original})
  const output=JSON.stringify(next)
  const patch=changes(nodes,row,id)
  const equal=(left:unknown)=>JSON.stringify(typeof left==='string'?parseJsonDocument(left):left)===output
  if(Object.hasOwn(patch,'output_mapping')&&!equal(patch['output_mapping']))throw Error('节点输出存在独立修改，不能覆盖')
  if(action==='cancel'&&!Object.hasOwn(patch,'output_mapping'))return []
  if(!Object.hasOwn(patch,'output_mapping')&&equal(original))return []
  if(Object.keys(patch).some(field=>field!=='output_mapping'))throw Error('请先处理同模型节点的其他修改')
  if(action==='save'&&nodes.fieldAccess(row,'output_mapping').write!=='allowed')throw Error('当前查询不允许同步节点输出')
  return [{id,output}]
 })
 if(action==='cancel'){nodes.discardPendingChanges(outputs.map(item=>item.id));fields.discardPendingChanges(projected.map(item=>item.id));models.discardPendingChanges([modelId]);return}
 // 原字段覆盖仍由DataSet统一校验应用；先检查所有节点后才暂存派生输出。
 fields.assertQuerySaveColumns({ids:selected.map(item=>item.id),includeEditingRows:true})
 if(modelChanged)models.assertQuerySaveColumns({ids:[modelId],includeEditingRows:true})
 for(const item of outputs)nodes.updateEditingValue(item.id,'output_mapping',item.output)
 return dataSet.saveChanges({views:[{tableName:fields.tableName,viewId:fields.viewId,ids:selected.map(item=>item.id)},
  {tableName:nodes.tableName,viewId:nodes.viewId,ids:outputs.map(item=>item.id)},targets.views[2]??{tableName:models.tableName,viewId:models.viewId,ids:[]}]})
}
