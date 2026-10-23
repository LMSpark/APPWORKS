/**
 * @module app:lowcode/resources/database/database-catalog-relation-metadata
 * 职责：Base_TblRln 关系列表标准子组件（同 DataSet 查询/删除/暂存保存）。
 */
import type {SparkNode} from '@spark-appworks/spark-data'

export const DATABASE_CATALOG_RELATION_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'pktable', label: '主表', width: 140, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'fktable', label: '从表', width: 140, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'rlname', label: '关系表达式', width: 220, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'IsCascadeDeletion', label: '级联删除', width: 96}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人', width: 120}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间', width: 160}},
]
