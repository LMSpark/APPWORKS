/**
 * @module app:lowcode/resources/structured-config/data-code/segment-ops
 * 职责：编码分段新增、类型转换及暂存删除的业务前置检查。
 * 边界：复用原DataView身份、权限、检查点与变更跟踪；不查询、不保存、不放开待新增父记录守卫。
 * AI用途：分段标准控件调用这些命令，保存仍交原编码DataSet。
 */
import type {DataRow, DataSet, DataView} from '@spark-appworks/spark-data'
import {RequestState} from '@spark-appworks/spark-data'
import {codeNodeTypeLabel} from './design-ops'

function scope(dataSet: DataSet) {
  const main = dataSet.getView('Base_CodeDesign'), nodes = dataSet.getView('Base_CodeNodeDesign'), owner = main?.currentRow
  const ownerId = owner ? main.getPkKey(owner) : undefined
  if (dataSet.destroyed || dataSet.scenarioId !== '868E62F90DB8118C74CDC9F6BCA61157' || !main || !nodes || !owner || ownerId === undefined
    || main.dataTable?.modelBinding?.modelName !== 'Base_CodeDesign' || nodes.dataTable?.modelBinding?.modelName !== 'Base_CodeNodeDesign'
    || main.rows.length !== 1 || main.hasUnconfirmedSave || nodes.hasUnconfirmedSave || main.mutating || nodes.mutating
    || nodes.requestState !== RequestState.Loaded || main.fieldAccess(owner, 'AppID').read !== 'visible'
    || (main.getEditingRow(ownerId) ?? owner)['AppID'] !== main.queryContext['applicationId']
    || ownerId !== main.queryContext['codeDesignId']) throw new Error('编码分段目标已改变或保存未确认')
  return {nodes, owner, ownerId}
}
function ownedRow(view: DataView, id: string | number, ownerId: string | number): DataRow {
  const row = view.rows.find(candidate => view.getPkKey(candidate) === id)
  if (!row || view.fieldAccess(row, 'CodeDesignID').read !== 'visible'
    || (view.getEditingRow(id) ?? row)['CodeDesignID'] !== ownerId) throw new Error('分段不属于当前编码设计')
  return row
}
/** @param dataSet 当前编码实例。 @returns 原查询生成身份的待新增分段；不提交。 */
export async function addCodeSegment(dataSet: DataSet): Promise<DataRow> {
  const {nodes, owner, ownerId} = scope(dataSet)
  let maximum = 0
  for (const row of nodes.rows) {
    const id = nodes.getPkKey(row)
    if (id === undefined || nodes.fieldAccess(row, 'NodeNo').read !== 'visible') throw new Error('分段序号不可读')
    ownedRow(nodes, id, ownerId)
    const number = Number((nodes.getEditingRow(id) ?? row)['NodeNo'])
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('请先纠正已有分段序号')
    maximum = Math.max(maximum, number)
  }
  const added = await nodes.addRow({NodeNo: maximum + 1, NodeType: '', ParameterName: '', CodeNodeDesignJson: ''})
  const id = nodes.getPkKey(added)
  if (id === undefined || !nodes.dirtyTracking.pendingCreateIds.has(id)) throw new Error('分段未进入原视图待新增状态')
  try {
    if (scope(dataSet).owner !== owner) throw new Error('编码分段目标已改变')
    ownedRow(nodes, id, ownerId); nodes.setCurrentRow(added); nodes.setSelectedRows([added]); return added
  } catch (cause) {if (!nodes.destroyed) nodes.discardPendingChanges([id]); throw cause}
}
/** @param dataSet 当前编码实例。 @param target 捕获的分段ID及变更前类型。 @param next 原类型字典值；类型改变时清除旧规则，非固定字符串还清空参数。 */
export function changeCodeSegmentType(dataSet: DataSet, target: {id: string | number; previous: unknown}, next: unknown): void {
  const {nodes, ownerId} = scope(dataSet), row = ownedRow(nodes, target.id, ownerId)
  const effective = nodes.getEditingRow(target.id) ?? row
  if (nodes.currentRow !== row || String(effective['NodeType']) !== String(target.previous)) throw new Error('分段类型编辑目标已改变')
  if (typeof next !== 'string' && typeof next !== 'number') throw new Error('分段类型无效')
  const label = codeNodeTypeLabel(dataSet, next)
  if (next !== '' && !label) throw new Error('请选择当前字典中的分段类型')
  if (String(next) === String(target.previous)) return
  const fields = label.includes('固定字符串') ? ['NodeType', 'CodeNodeDesignJson'] : ['NodeType', 'CodeNodeDesignJson', 'ParameterName']
  for (const field of fields) {
    const access = nodes.fieldAccess(row, field)
    if (access.read !== 'visible' || access.write !== 'allowed') throw new Error('分段类型及规则字段不可读写')
  }
  const checkpoint = nodes.createEditingCheckpoint(target.id, fields)
  try {
    nodes.updateEditingValue(target.id, 'NodeType', next); nodes.updateEditingValue(target.id, 'CodeNodeDesignJson', '')
    if (!label.includes('固定字符串')) nodes.updateEditingValue(target.id, 'ParameterName', '')
    checkpoint.release()
  } catch (cause) {checkpoint.restore(); checkpoint.release(); throw cause}
}
/** @param dataSet 当前编码实例。 @param ids 明确选择的分段ID；全部核权后，取消本地新行或暂存正式删除，不保存。 */
export async function removeCodeSegments(dataSet: DataSet, ids: ReadonlyArray<string | number>): Promise<void> {
  const {nodes, ownerId} = scope(dataSet)
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('请选择唯一分段身份')
  for (const id of ids) {
    const row = ownedRow(nodes, id, ownerId)
    if (!nodes.dirtyTracking.pendingCreateIds.has(id) && nodes.deleteActionState(row) !== 'enabled') throw new Error('所选分段不允许删除')
  }
  for (const id of ids) {
    scope(dataSet); const row = ownedRow(nodes, id, ownerId)
    if (nodes.dirtyTracking.pendingCreateIds.has(id)) nodes.discardPendingChanges([id])
    else {
      if (nodes.deleteActionState(row) !== 'enabled') throw new Error('所选分段不允许删除')
      const result = await nodes.removeRow(id)
      if (result === false || typeof result === 'object' && !result.success) throw new Error('分段删除未完成')
    }
  }
}
