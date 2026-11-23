/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-list
 * 职责：从宿主原步骤查询定位追加参与人的正式命名视图。
 * 边界：由同一查询owner执行关系过滤；不替换历史视图、不复制列表或授予写权限。
 */
import {buildDataViewKey, resolveDataViewKey, type DataView} from '@spark-appworks/spark-data'
import {normalizeFlowAppendUserContext, type FlowAppendUserContext} from './flow-append-user-records'

/** 捕获宿主原步骤及关系的只读证明；查询和命令共用，不复制权限或可编辑数据。 */
export function captureFlowAppendStep(source: DataView, input: Partial<FlowAppendUserContext>): () => void {
  const context = normalizeFlowAppendUserContext(input), dataSet = source.dataSet, table = source.dataTable
  if (!context.rowid || !context.WFOBJID || !context.SendNodeModelId || !context.ReceiveNodeModelId
    || !dataSet || dataSet.destroyed || source.destroyed || !table || dataSet.getView(source.tableName, source.viewId) !== source) throw Error('追加参与人缺少原步骤查询身份')
  if (!dataSet.scenarioId || resolveDataViewKey(buildDataViewKey('WFOBJ_FLOW_RELATIONLINE_STEP', source.viewId, dataSet.scenarioId), dataSet) !== source) throw Error('追加参与人原视图不是正式步骤模型')
  const matches = source.rows.filter(row => row['rowid'] === context.rowid), row = matches[0]
  const fields = ['rowid', 'WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID'] as const
  if (matches.length !== 1 || !row) throw Error('追加参与人缺少唯一原步骤')
  const assertSource = source.captureReadRow(row, fields)
  if (fields.some(field => row[field] !== context[field])) throw Error('追加参与人上下文与原步骤不符')
  return () => {
    assertSource()
    if (source.dataSet !== dataSet || resolveDataViewKey(buildDataViewKey('WFOBJ_FLOW_RELATIONLINE_STEP', source.viewId, dataSet.scenarioId), dataSet) !== source) throw Error('原追加参与人步骤实例已变化')
  }
}

export async function queryFlowAppendParticipants(source: DataView, input: Partial<FlowAppendUserContext>, assertCurrent: () => void): Promise<DataView> {
  assertCurrent()
  const context = normalizeFlowAppendUserContext(input), assertSource = captureFlowAppendStep(source, context), table = source.dataTable
  if (!table) throw Error('追加参与人原步骤模型已释放')
  const view = table.getView('appendParticipants')
  if (!view || view === source) throw Error('追加参与人正式列表视图未装配')
  view.queryContext = Object.fromEntries((['WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID'] as const).map(field => [field, context[field]]))
  await view.refresh(); assertCurrent(); assertSource()
  if (view.destroyed || table.getView('appendParticipants') !== view || source.dataTable !== table) throw Error('追加参与人列表实例已变化')
  if (view.loadingError) throw view.loadingError
  view.captureReadResult()()
  return view
}
