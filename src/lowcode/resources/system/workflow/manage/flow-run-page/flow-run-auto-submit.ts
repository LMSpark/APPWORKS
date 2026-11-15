/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/flow-run-auto-submit
 * 职责：解析 CanAutoSubmitAfter 响应，决定是否链式提交。
 */
import {isRecord} from '@spark-appworks/spark-utils'

export function readCanAutoSubmitAfter(result: unknown): boolean {
  if (result === true) return true
  if (result === false) return false
  if (typeof result === 'string') {
    const text = result.trim().toLowerCase()
    if (text === 'true' || text === '1') return true
    if (text === 'false' || text === '0') return false
  }
  if (!isRecord(result)) return false
  for (const key of ['canAutoSubmit', 'CanAutoSubmit', 'autoSubmit', 'AutoSubmit', 'Result', 'result']) {
    const value = result[key]
    if (value === true) return true
    if (value === false) return false
  }
  return false
}