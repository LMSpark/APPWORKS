/**
 * @module app:lowcode/resources/database/database-catalog-list-metadata
 * 职责：表/视图目录列表显式列子组件（对齐参考页主要列，不展示全部 autoColumns）。
 */
import type {SparkNode} from '@spark-appworks/spark-data'

export const DATABASE_CATALOG_TABLE_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'tblname', label: '表名'}},
  {type: 'r-text', props: {field: 'tbldesc', label: '中文名'}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人'}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间'}},
]

export const DATABASE_CATALOG_VIEW_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'vewname', label: '视图名'}},
  {type: 'r-text', props: {field: 'vewdesc', label: '中文名'}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人'}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间'}},
]
