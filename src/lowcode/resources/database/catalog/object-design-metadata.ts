/**
 * @module app:lowcode/resources/database/catalog/object-design-metadata
 * 职责：表/视图设计对话框头信息标准子组件（绑定 _Base_TblList / _Base_ViewList 当前选中行）。
 */
import type {DataSet, SparkNode} from '@spark-appworks/spark-data'
import {DATABASE_CATALOG_TABLE_MODEL, DATABASE_CATALOG_VIEW_MODEL} from './table-view'

const TABLE_HEADER_COLUMNS = [
  {name: 'Expression', label: '摘要表达式'},
  {name: 'IsVisible', label: '可见(自动脱敏)'},
] as const

const VIEW_HEADER_COLUMNS = [
  {name: 'functiondesc', label: '功能描述'},
  {name: 'modid', label: '应用'},
  {name: 'sql', label: '视图SQL'},
  {name: 'IsVisible', label: '可见(自动脱敏)'},
] as const

export function applyDatabaseCatalogObjectDesignMetadata(dataSet: DataSet): void {
  const tableCatalog = dataSet.getTable(DATABASE_CATALOG_TABLE_MODEL)
  if (tableCatalog) {
    for (const column of TABLE_HEADER_COLUMNS) {
      if (!tableCatalog.columns.some(entry => entry.name === column.name)) {
        tableCatalog.columns.push({name: column.name, type: 'string', label: column.label})
      }
    }
  }
  const viewCatalog = dataSet.getTable(DATABASE_CATALOG_VIEW_MODEL)
  if (viewCatalog) {
    for (const column of VIEW_HEADER_COLUMNS) {
      if (!viewCatalog.columns.some(entry => entry.name === column.name)) {
        viewCatalog.columns.push({name: column.name, type: 'string', label: column.label})
      }
    }
  }
}

export const DATABASE_CATALOG_TABLE_DESIGN_HEADER_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'tbldesc', label: '中文名', colSpan: 12}},
  {type: 'r-text', props: {field: 'Expression', label: '摘要表达式', colSpan: 12}},
  {type: 'r-checkbox', props: {field: 'IsVisible', label: '可见(自动脱敏)', colSpan: 12, trueValue: 1, falseValue: 0}},
]

export const DATABASE_CATALOG_VIEW_DESIGN_FORM_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'vewname', label: '名称', colSpan: 12}},
  {type: 'r-text', props: {field: 'vewdesc', label: '中文名', colSpan: 12}},
  {type: 'r-text', props: {field: 'functiondesc', label: '功能描述', colSpan: 12}},
  {type: 'r-checkbox', props: {field: 'IsVisible', label: '可见(自动脱敏)', colSpan: 12, trueValue: 1, falseValue: 0}},
  {type: 'r-textarea', props: {field: 'sql', label: '视图sql', colSpan: 12, rows: 15}},
]

/** 兼容旧引用；与 FORM_FIELDS 相同。 */
export const DATABASE_CATALOG_VIEW_DESIGN_HEADER_FIELDS: SparkNode[] = DATABASE_CATALOG_VIEW_DESIGN_FORM_FIELDS
