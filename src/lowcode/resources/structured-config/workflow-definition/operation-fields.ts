/**
 * @module app:lowcode/resources/structured-config/workflow-definition/operation-fields
 * 职责：操作目标的输入值和条件沿原DataView编辑、取消并由DataSet按修改范围提交。
 * 边界：不执行CRUD、不推导未核定输出，不改字段结构或共享模型归属。
 * AI用途：操作字段工作区沿原绑定视图调用保存或取消，不另设运行数据入口。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {workflowOperationFieldScope,readWorkflowFieldValue as read,workflowFieldChanges as changes} from './query-field-context'
import {validateWorkflowQueryInputChanges} from './query-inputs'
function scope(dataSet:DataSet,workflowId:string,nodeId:string){
 const state=workflowOperationFieldScope(dataSet,workflowId,nodeId)
 if(read(state.models,state.model,'Type')!=='数据库表')throw Error('操作目标来源执行合同尚未核定')
 for(const row of state.fields.rows)if(read(state.fields,row,'dataSetId')!==workflowId||read(state.fields,row,'dataModelId')!==state.modelId||read(state.fields,row,'type')!=='inputParams')throw Error('操作输入字段归属或用途不符')
 return state
}
/** 保存实际修改的输入函数、说明与模型条件；保留节点输出和其他视图草稿。 */
export async function saveWorkflowOperationFields(dataSet:DataSet,workflowId:string,nodeId:string){
 const {models,fields,model,modelId}=scope(dataSet,workflowId,nodeId)
 if(models.hasUnconfirmedSave||fields.hasUnconfirmedSave)return dataSet.saveChanges({views:[fields,models].map(view=>({tableName:view.tableName,viewId:view.viewId}))})
 if(fields.dirtyTracking.pendingCreateIds.size||fields.dirtyTracking.pendingDeleteIds.size)throw Error('操作字段不支持在此入口新增或删除')
 const selected=fields.rows.flatMap(row=>{const id=fields.getPkKey(row);if(typeof id!=='string')throw Error('操作字段身份无效');const patch=changes(fields,row,id)
  for(const key of Object.keys(patch))if(!['ValueFun','description'].includes(key))throw Error(`操作字段不支持修改: ${key}`)
  return Object.keys(patch).length?[{id,patch,value:fields.getEditingRow(id)?.['ValueFun']}]:[]
 })
 const patch=changes(models,model,modelId)
 for(const key of Object.keys(patch))if(!['Filter','description'].includes(key))throw Error(`操作模型不支持修改: ${key}`)
 if(Object.hasOwn(patch,'Filter')&&read(models,model,'requestType')==='add')throw Error('新增操作不使用过滤条件；不能保存无执行效果的条件修改')
 const values=selected.filter(item=>Object.hasOwn(item.patch,'ValueFun')).map(item=>item.value)
 if(values.length||Object.hasOwn(patch,'Filter'))validateWorkflowQueryInputChanges({dataSet,workflowId,nodeId,input:{values,...Object.hasOwn(patch,'Filter')?{filter:models.getEditingRow(modelId)?.['Filter']}:{}}})
 return dataSet.saveChanges({views:[{tableName:fields.tableName,viewId:fields.viewId,ids:selected.map(item=>item.id)},
  {tableName:models.tableName,viewId:models.viewId,ids:Object.keys(patch).length?[modelId]:[]}]})
}
/** 全部取消本目标的输入与条件；未知结果仍由原批次核验，不视为可取消草稿。 */
export function cancelWorkflowOperationFields(dataSet:DataSet,workflowId:string,nodeId:string):void{
 const {models,fields,model,modelId}=scope(dataSet,workflowId,nodeId)
 if(models.hasUnconfirmedSave||fields.hasUnconfirmedSave)throw Error('操作定义保存结果未知，请核验原批次')
 if(fields.dirtyTracking.pendingCreateIds.size||fields.dirtyTracking.pendingDeleteIds.size)throw Error('操作取消包含范围外字段结构修改')
 for(const row of fields.rows){const id=fields.getPkKey(row);if(typeof id!=='string'||Object.keys(changes(fields,row,id)).some(key=>!['ValueFun','description'].includes(key)))throw Error('操作取消包含范围外字段修改')}
 if(Object.keys(changes(models,model,modelId)).some(key=>!['Filter','description'].includes(key)))throw Error('操作取消包含范围外模型修改')
 const ids=fields.rows.map(row=>{const id=fields.getPkKey(row);if(id===undefined)throw Error('操作字段身份缺失');return id})
 fields.discardPendingChanges(ids);models.discardPendingChanges([modelId])
}
