/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/input/user-selection
 * 职责：从原候选DataView捕获人数、值及读取证明；不维护可编辑候选副本。
 */
import type {DataView} from '@spark-appworks/spark-data'

export function captureWorkflowUserSelection({view, input, min, max, label}: Readonly<{view: DataView; input: unknown; min: number; max: number; label: string}>): Readonly<{values: string[]; assertCurrent: () => void}> {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) throw Error('办理人数范围无效')
  if (!Array.isArray(input) || input.some((value: unknown) => typeof value !== 'string') || new Set(input).size !== input.length) throw Error('办理人员选择无效或重复')
  if (input.length > max) throw Error(`${label}人数超过${max}`)
  if (input.length < min) throw Error(`${label}人数少于${min}`)
  const assertResult = view.captureReadResult()
  const values = input.map(String), proofs = values.map(value => {
    const rows = view.rows.filter(row => row['value'] === value), row = rows[0]
    if (rows.length !== 1 || !row) throw Error('办理人员不在原候选范围')
    return view.captureReadRow(row, ['id', 'name', 'value', 'nodeId'])
  })
  return {values, assertCurrent: () => {assertResult(); proofs.forEach(proof => proof())}}
}
