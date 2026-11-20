/**
 * @module app:views/features/integration/report/ui/report-format
 * 职责：业务报表页面的展示格式与应用名称冗余回填。
 * 边界：只读写调用方传入的正式DataView编辑态，不发起查询或保存。
 */
import type {DataRow, DataView} from '@spark-appworks/spark-data'

export const textOf = (row: Readonly<DataRow> | undefined, field: string): string => {
  const raw = row?.[field]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
}

export function formatDay(value: unknown): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  return text ? text.slice(0, 10) : '-'
}

export const isOn = (value: unknown): boolean => value === 1 || value === true || value === '1' || value === 'true'

type AppNameSync = Readonly<{info: DataView; apps: DataView; id: string | number; row: Readonly<DataRow>}>

/** 报表头的 modname 随所选应用系统冗余存储，提交前按当前选项回填；未选应用返回提示。 */
export function syncAppName({info, apps, id, row}: AppNameSync): string | undefined {
  const app = apps.rows.find(item => textOf(item, 'rowid') === textOf(row, 'modid'))
  if (!app) return '请选择应用系统'
  if (textOf(row, 'modname') !== textOf(app, 'AppDesc')) info.updateEditingValue(id, 'modname', textOf(app, 'AppDesc'))
  return undefined
}
