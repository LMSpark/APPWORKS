/**
 * @module app:lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-row
 * 职责：从工作台待办行解析办理/详情路由参数。
 */
import type {DataRow} from '@spark-appworks/spark-data'

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

export function readFlowWorkbenchRowRoute(row: DataRow): FlowWorkbenchRowRoute | null {
  const wfid = textValue(row, ['wfid', 'WFOBJID', 'WfObjId', 'rowid'])
  const flowid = textValue(row, ['FlowID', 'FLOWID', 'WFMID', 'flowid'])
  const stepId = textValue(row, ['StepID', 'rowid'])
  if (!wfid || !flowid) return null
  return {wfid, flowid, stepId}
}