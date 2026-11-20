/**
 * @module @spark-appworks/spark-component:components/containers/data-views/data-row-utils
 * 职责：支撑 data-row-utils（未注册组件类型）在 table-level/data-view-container 中的运行时协作，补齐配置、状态或渲染器之间的连接逻辑。
 * 边界：只覆盖当前组件目录 containers/data-views 的局部能力，不定义全局页面模型，也不越级操作业务数据源。
 * AI用途：需要判断 data row utils 的组件分层、辅助类型或内部接线时，用本模块作为局部语义入口。
 */
import { isDataRow, type DataRow } from '@spark-appworks/spark-data'

const TREE_LABEL_FALLBACK_FIELDS: readonly ['label', 'name', 'title'] = ['label', 'name', 'title']

export function isDataRecord(value: unknown): value is Record<string, unknown> {
  return isDataRow(value)
}

export function toDataRecord(value: unknown): Record<string, unknown> | null {
  return isDataRecord(value) ? value : null
}

export function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

export function toMutableRows(rows: readonly DataRow[]): DataRow[] {
  return [...rows]
}

export function resolveTreeNodeText(
  record: Record<string, unknown>,
  preferredField: string,
  fallback: string,
): string {
  const preferred = readStringField(record, preferredField)
  if (preferred) return preferred
  for (const field of TREE_LABEL_FALLBACK_FIELDS) {
    const value = readStringField(record, field)
    if (value) return value
  }
  return fallback
}
