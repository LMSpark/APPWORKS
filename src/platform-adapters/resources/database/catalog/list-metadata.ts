/**
 * @module app:lowcode/resources/database/catalog/list-metadata
 * 职责：库/表/视图目录的显式列与常用筛选（对齐参考页，不展示全部 autoColumns）。
 */
import type {SparkNode} from '@spark-appworks/spark-data'

export const DATABASE_CATALOG_DB_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'Name', label: '数据库名称'}},
  {type: 'r-text', props: {field: 'Remark', label: '描述'}},
]

export const DATABASE_CATALOG_DB_FILTER_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'Name', label: '数据库名称', placeholder: '搜索数据库'}},
]

export const DATABASE_CATALOG_TABLE_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'tblname', label: '表名'}},
  {type: 'r-text', props: {field: 'tbldesc', label: '中文名'}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人'}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间'}},
]

export const DATABASE_CATALOG_TABLE_FILTER_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'tblname', label: '表名', placeholder: '请输入表名'}},
  {type: 'r-text', props: {field: 'tbldesc', label: '中文名', placeholder: '请输入中文名'}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人', placeholder: '请输入创建人'}},
]

export const DATABASE_CATALOG_VIEW_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'vewname', label: '视图名'}},
  {type: 'r-text', props: {field: 'vewdesc', label: '中文名'}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人'}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间'}},
]

export const DATABASE_CATALOG_VIEW_FILTER_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'vewname', label: '视图名', placeholder: '请输入视图名'}},
  {type: 'r-text', props: {field: 'vewdesc', label: '中文名', placeholder: '请输入中文名'}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人', placeholder: '请输入创建人'}},
]
