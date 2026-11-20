/**
 * @module app:lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-row
 * 职责：从工作台各页签行解析办理/详情路由参数。
 */
import type {DataRow} from '@spark-appworks/spark-data'
import type {FlowWorkbenchTab} from './flow-workbench-filters'

function textValue(row: DataRow, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim()
      if (text) return text
    }
  }
  return ''
}

export type FlowWorkbenchRowRoute = Readonly<{
  wfid: string
  flowid: string
  stepId: string
}>

export function readFlowWorkbenchRowRoute(row: DataRow, tab: FlowWorkbenchTab = 'pending'): FlowWorkbenchRowRoute | null {
  if (tab === 'started') {
    const wfid = textValue(row, ['rowid', 'ROWID', 'wfid', 'WFOBJID'])
    const flowid = textValue(row, ['WFMID', 'FLOWID', 'FlowID', 'flowid'])
    if (!wfid || !flowid) return null
    return {wfid, flowid, stepId: ''}
  }
  if (tab === 'pending') {
    const wfid = textValue(row, ['wfid', 'WFOBJID', 'WfObjId'])
    const flowid = textValue(row, ['FlowID', 'FLOWID', 'WFMID', 'flowid'])
    const stepId = textValue(row, ['StepID', 'rowid'])
    if (!wfid || !flowid) return null
    return {wfid, flowid, stepId}
  }
  const wfid = textValue(row, ['WFOBJID', 'wfid', 'WfObjId'])
  const flowid = textValue(row, ['FlowID', 'FLOWID', 'WFMID', 'flowid'])
  const stepId = textValue(row, ['rowid', 'StepID'])
  if (!wfid || !flowid) return null
  return {wfid, flowid, stepId}
}