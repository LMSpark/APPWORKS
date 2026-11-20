/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/command-input
 * 职责：核验原追加配置与候选选择，区分正式目标证明和临时输入证明。
 * 边界：不保存业务数据，不生成权限或另建命令状态。
 */
import {parseDataViewKey, resolveDataViewKey, type DataRow, type DataSet} from '@spark-appworks/spark-data'
import {captureWorkflowUserSelection} from '../flow-run-page/input/user-selection'

export function readFlowAppendReceivers(input: unknown): string[] {
  if (!Array.isArray(input) || !input.length) throw Error('请选择办理人')
  const ids = new Set<string>()
  return input.map((value: unknown) => {
    if (typeof value !== 'string' || value.indexOf(':') < 1 || value.indexOf(':') !== value.lastIndexOf(':') || !value.slice(value.indexOf(':') + 1).trim()) throw Error('当前人员数据不符合追加接口格式，未发送')
    const id = value.slice(0, value.indexOf(':'))
    if (ids.has(id)) throw Error('追加办理人重复')
    ids.add(id)
    return value
  })
}

export function captureAppendConfiguration(dataSet: DataSet | undefined, input: Readonly<DataRow>) {
  const view = dataSet?.getView('AppendOptions'), row = view?.rows[0]
  if (!dataSet || !view || !row || view.rows.length !== 1 || view.dataTable?.resourceId !== 'workflow:append-options') throw Error('追加命令缺少原配置查询')
  const assertCurrent = view.captureReadRow(row, ['payload', 'nodeId', 'minNum', 'maxNum', 'allowChange'])
  if (view.queryContext['stepId'] !== input['stepId'] || view.queryContext['flowObjectId'] !== input['flowObjectId'] || view.queryContext['nodeId'] !== row['nodeId']) throw Error('追加配置与原步骤不符')
  const min = row['minNum'], max = row['maxNum'], nodeId = row['nodeId']
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min || typeof nodeId !== 'string') throw Error('原追加人数配置无效')
  return {view, row, min, max, nodeId, assertCurrent}
}

export function captureAppendSelection(dataSet: DataSet | undefined, input: Readonly<DataRow>): () => void {
  const config = captureAppendConfiguration(dataSet, input), key = input['candidateViewKey']
  const descriptor = typeof key === 'string' ? parseDataViewKey(key) : null
  if (!dataSet?.scenarioId || typeof key !== 'string' || descriptor?.scope !== dataSet.scenarioId || descriptor.tableName !== 'AppendCandidates' || descriptor.viewId === 'default') throw Error('追加命令未绑定原候选视图')
  const view = resolveDataViewKey(key, dataSet)
  if (!view || view.dataTable?.resourceId !== 'workflow:append-candidates' || view.queryContext['nodeId'] !== config.nodeId) throw Error('追加候选与原节点不符')
  if (config.max < 1) throw Error('当前节点不可追加办理人')
  const selected = captureWorkflowUserSelection({view, input: readFlowAppendReceivers(input['receiveUsers']), min: Math.max(1, config.min), max: config.max, label: '追加办理'})
  return () => {
    config.assertCurrent(); selected.assertCurrent()
    if (resolveDataViewKey(key, dataSet) !== view) throw Error('原追加候选实例已变化')
  }
}
