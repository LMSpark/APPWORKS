/**
 * @module app:lowcode/resources/structured-config/data-code/rule-target
 * 职责：核当前编码主/分段归属，并读取原主DataView的有效业务表身份。
 * 边界：不查询、不复制草稿、不更改权限；规则入口及持续目标校验共用。
 */
import {RequestState,type DataSet} from '@spark-appworks/spark-data'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'

/** @param dataSet 当前编码设计实例。 @param nodeId 本次规则节点。 @returns 已核身份与可读性的当前有效业务表ID。 */
export function readCodeRuleBusinessTable(dataSet:DataSet,nodeId:string|number):string{
  const main=dataSet.getView('Base_CodeDesign'),nodes=dataSet.getView('Base_CodeNodeDesign'),owner=main?.currentRow
  if(dataSet.destroyed||dataSet.scenarioId!==getBuiltinScenarioResource('dataCodeEditor').scenarioId||!main||!nodes||!owner||main.rows.length!==1
    ||main.dataTable?.modelBinding?.modelName!=='Base_CodeDesign'||nodes.dataTable?.modelBinding?.modelName!=='Base_CodeNodeDesign')throw new Error('编码规则所属设计已改变')
  if([main,nodes].some(view=>view.hasUnconfirmedSave||view.mutating||view.requestState!==RequestState.Loaded))throw new Error('编码规则目标正在读取、保存或结果未确认')
  const id=main.getPkKey(owner),node=nodes.rows.find(row=>nodes.getPkKey(row)===nodeId)
  if(id===undefined||!node||main.fieldAccess(owner,'AppID').read!=='visible'||main.fieldAccess(owner,'BusTableRowid').read!=='visible'
    ||nodes.fieldAccess(node,'CodeDesignID').read!=='visible')throw new Error('编码规则身份或业务表不可读')
  const effective=main.getEditingRow(id)??owner,applicationId=effective['AppID'],tableId=effective['BusTableRowid']
  if(applicationId!==owner['AppID']||applicationId!==main.queryContext['applicationId']||id!==main.queryContext['codeDesignId']
    ||(nodes.getEditingRow(nodeId)??node)['CodeDesignID']!==id)throw new Error('编码规则所属设计已改变')
  if(typeof tableId!=='string'||!tableId.trim())throw new Error('当前设计未选择业务表')
  return tableId.trim()
}
