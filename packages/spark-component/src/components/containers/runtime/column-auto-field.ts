/**
 * @module @spark-appworks/spark-component:components/containers/runtime/column-auto-field
 * 职责：DataColumn → 标准字段 SparkNode（表单/表格 autoColumns 共用）。
 */
import type {DataColumn, SparkNode} from '@spark-appworks/spark-data'

export type ColumnAutoFieldTarget = 'form' | 'table'

export function sparkColumnToAutoFieldNode(column: DataColumn, target: ColumnAutoFieldTarget): SparkNode {
  const common = target === 'form'
    ? {field: column.name, label: column.label ?? column.name, colSpan: 6}
    : {field: column.name, label: column.label ?? column.name, width: 200, sortable: true}
  if (column.type === 'enum' && column.enumOptions?.length) {
    return {
      type: 'r-select',
      props: {
        ...common,
        options: column.enumOptions.map(option => ({value: option.value, label: option.label})),
      },
    }
  }
  switch (column.type) {
    case 'string': case 'varchar': case 'text': case 'time':
      return {type: 'r-text', props: common}
    case 'number': case 'int': case 'integer': case 'decimal': case 'float': case 'double':
      return {type: 'r-number', props: common}
    case 'boolean': case 'bool':
      return {type: 'r-switch', props: common}
    case 'date': case 'datetime':
      return {type: 'r-date', props: {...common, dateType: column.type}}
    case 'object': case 'array': case 'enum':
      break
  }
  return {
    type: 'r-text',
    props: {...common, readonly: true},
  }
}
