/**
 * @module app:lowcode/resources/structured-config/data-code/example-plan
 * 职责：按正式主/分段DataView当前编辑覆盖编译示例输入，不修改节点或保存记录。
 * 边界：名称、来源、节点归属、规则与结果字段沿原查询权限核定。
 */
import {RequestState,type DataRow,type DataSet,type DataView} from '@spark-appworks/spark-data'
import type {CodeExampleInput,CodeExampleNode} from '@spark-appworks/spark-lowcode-api'
import {isRecord} from '@spark-appworks/spark-utils'
import {codeNodeTypeLabel,isFixedCodeNode} from './design-ops'

const scene='868E62F90DB8118C74CDC9F6BCA61157'
const read=(view:DataView,row:DataRow,field:string):unknown=>{
  if(view.fieldAccess(row,field).read!=='visible')throw new Error('编码示例所需字段不可读')
  const id=view.getPkKey(row);return(id===undefined?row:view.getEditingRow(id)??row)[field]
}
const integer=(value:unknown):number=>typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number(value):Number.NaN
export type CodeExamplePlan=Readonly<{id:string;input:CodeExampleInput;signature:string;previous:unknown}>
/** @param dataSet 当前原生编码设计实例。 @returns 完整有效输入及用于异步核验的业务签名。 */
export function getCodeExamplePlan(dataSet:DataSet):CodeExamplePlan{
  const main=dataSet.getView('Base_CodeDesign'),nodes=dataSet.getView('Base_CodeNodeDesign')
  if(dataSet.destroyed||dataSet.scenarioId!==scene||!main||!nodes||main.rows.length!==1||!nodes.rows.length)throw new Error('请先维护编码主定义及分段设计数据')
  for(const view of [main,nodes])if(view.hasUnconfirmedSave||view.mutating||view.requestState!==RequestState.Loaded)throw new Error('编码设计正在读取、保存或结果未确认')
  const owner=main.rows[0];if(!owner)throw new Error('编码主定义不存在')
  const id=main.getPkKey(owner),applicationId=read(main,owner,'AppID'),name=read(main,owner,'Name'),busTableId=read(main,owner,'BusTableRowid')
  if(typeof id!=='string'||!id||main.currentRow!==owner||typeof applicationId!=='string'||!applicationId||main.queryContext['applicationId']!==applicationId||main.queryContext['codeDesignId']!==id)throw new Error('编码示例主定义身份不匹配')
  if(typeof name!=='string'||!name.trim()||typeof busTableId!=='string'||!busTableId.trim())throw new Error('请填写编码名称并选择业务表')
  const previous=read(main,owner,'CodeExample')
  if(main.fieldAccess(owner,'CodeExample').write!=='allowed')throw new Error('编码示例字段不可写')
  const numbers=new Set<number>(),list:CodeExampleNode[]=nodes.rows.map(row=>{
    if(read(nodes,row,'CodeDesignID')!==id)throw new Error('编码示例节点不属于当前主定义')
    const number=integer(read(nodes,row,'NodeNo')),type=integer(read(nodes,row,'NodeType')),raw=read(nodes,row,'CodeNodeDesignJson')
    if(!Number.isSafeInteger(number)||number<0||numbers.has(number)||!Number.isSafeInteger(type)||!codeNodeTypeLabel(dataSet,type))throw new Error('编码分段序号或类型无效')
    numbers.add(number)
    if(typeof raw!=='string')throw new Error('编码节点规则必须是JSON对象')
    const rule:unknown=raw?JSON.parse(raw):{};if(!isRecord(rule))throw new Error('编码节点规则必须是JSON对象')
    const value=isFixedCodeNode(dataSet,{NodeType:type})?{...rule,ConstString:String(read(nodes,row,'ParameterName')??'').trim()}:rule
    return {NodeNo:number,NodeType:type,CodeNodeDesignJson:JSON.stringify(value)}
  }).sort((a,b)=>a.NodeNo-b.NodeNo)
  const input={busTableId:busTableId.trim(),nodes:list}
  return{id,input,previous,signature:JSON.stringify([id,applicationId,name,input,main.queryContext,nodes.queryContext])}
}
