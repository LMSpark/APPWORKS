/**
 * @module app:lowcode/resources/structured-config/data-code/initialization-plan
 * 职责：从当前已保存主/节点视图读取初始化命令的完整目标与循环范围。
 * 边界：不改设计、不查询组合、不存草稿；显示标题不替代可执行规则JSON。
 * AI用途：初始化入口和资源目标读取器共用，拒绝新增、修改及未知结果。
 */
import {RequestState,type DataSet,type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {codeNodeTypeLabel} from './design-ops'

export type InitializationNode=Readonly<{id:string;number:number;label:string;rule:Readonly<Record<string,unknown>>;raw:string}>
export type CodeInitializationPlan=Readonly<{codeId:string;applicationId:string;nodeId:string;format:string;increment:number;loopColumns:readonly string[];nodes:readonly InitializationNode[];signature:string}>
/** @param view 原正式节点视图。 @returns 获准读取并按段号排序的保存规则。 */
export function readInitializationNodes(view:DataView):InitializationNode[]{
  return view.rows.map(row=>{
    const read=(field:string):unknown=>{if(view.fieldAccess(row,field).read!=='visible')throw new Error('编码初始化节点字段不可读');return row[field]}
    const id=view.getPkKey(row),storedNumber=read('NodeNo'),type=read('NodeType'),raw=read('CodeNodeDesignJson')
    const number=typeof storedNumber==='number'||typeof storedNumber==='string'&&storedNumber.trim()!==''?Number(storedNumber):Number.NaN
    if(typeof id!=='string'||!id||!Number.isSafeInteger(number)||number<0||typeof raw!=='string')throw new Error('编码初始化节点身份或规则无效')
    const rule:unknown=raw?JSON.parse(raw):{}
    if(!isRecord(rule))throw new Error('编码初始化节点规则须为JSON对象')
    const label=view.dataSet?codeNodeTypeLabel(view.dataSet,type):''
    if(!label)throw new Error('编码初始化节点类型无法解析')
    return {id,number,label,rule,raw}
  }).sort((left,right)=>left.number-right.number)
}
/** @param dataSet 当前编辑器同一运行空间。 @returns 已保存初始化目标；不以临时草稿调用后端。 */
export function getCodeInitializationPlan(dataSet:DataSet):CodeInitializationPlan {
  const main=dataSet.getView('Base_CodeDesign'),nodes=dataSet.getView('Base_CodeNodeDesign'),row=main?.currentRow
  if(dataSet.destroyed||!main||!nodes||!row||main.rows.length!==1||main.requestState!==RequestState.Loaded||nodes.requestState!==RequestState.Loaded)throw new Error('编码初始化尚未读取唯一设计')
  if([main,nodes].some(view=>view.hasUnconfirmedSave||view.mutating||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()))throw new Error('请先保存当前编码设计及分段修改，再设置编码初始值')
  const read=(field:string):unknown=>{if(main.fieldAccess(row,field).read!=='visible')throw new Error('编码初始化主记录字段不可读');return row[field]}
  const codeId=main.getPkKey(row),applicationId=read('AppID'),businessTable=read('BusTableRowid')
  if(typeof codeId!=='string'||!codeId||typeof applicationId!=='string'||applicationId!==main.queryContext['applicationId']||codeId!==main.queryContext['codeDesignId'])throw new Error('编码初始化目标身份已改变')
  for(const node of nodes.rows)if(nodes.fieldAccess(node,'CodeDesignID').read!=='visible'||node['CodeDesignID']!==codeId)throw new Error('初始化节点不属于当前设计')
  const definitions=readInitializationNodes(nodes)
  if(new Set(definitions.map(node=>node.number)).size!==definitions.length)throw new Error('编码初始化段号重复')
  const sequence=definitions.find(node=>node.label==='顺序号串')
  if(!sequence)throw new Error('分段设计中必须包含顺序号串')
  const integer=(field:string):number=>{const value=sequence.rule[field];return typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number(value):Number.NaN}
  const format=sequence.rule['Format'],increment=integer('Incre'),start=integer('StartNo'),end=integer('EndNo')
  if(typeof format!=='string'||!format.trim()||!Number.isSafeInteger(increment)||increment===0||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>sequence.number)throw new Error('顺序号串格式、增量或循环范围无效')
  const loopColumns=definitions.filter(node=>node.number>=start&&node.number<=end).map(node=>String(node.number))
  if(!loopColumns.length)throw new Error('顺序号串没有可用的循环前段')
  return {codeId,applicationId,nodeId:sequence.id,format:format.trim(),increment,loopColumns,nodes:definitions,
    signature:JSON.stringify([codeId,applicationId,businessTable,definitions])}
}
