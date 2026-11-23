/**
 * @module app:lowcode/resources/database/catalog/workflow/metadata
 * 职责：Base_WorkflowDefinition 列表标准子组件（同 FormKey 模型查询）。
 */
import {buildDataViewKey, type DataSet, type SparkNode} from '@spark-appworks/spark-data'
import {DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL} from '../table-view'

export const DATABASE_CATALOG_WORKFLOW_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'name', label: '名称', width: 160, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'workflow_key', label: '工作流编码', width: 160, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'description', label: '描述', width: 200, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'status', label: '状态', width: 96}},
  {type: 'r-text', props: {field: 'version', label: '版本号', width: 96}},
]

export function databaseCatalogHasWorkflowStatusDictionary(dataSet: DataSet): boolean {
  return Boolean(dataSet.getView(DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL, 'default'))
}

export function buildDatabaseCatalogWorkflowListFields(dataSet: DataSet): SparkNode[] {
  const scenarioId = dataSet.scenarioId?.trim()
  const statusKey = scenarioId && databaseCatalogHasWorkflowStatusDictionary(dataSet)
    ? buildDataViewKey(DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL, 'default', scenarioId)
    : undefined
  if (!statusKey) return DATABASE_CATALOG_WORKFLOW_LIST_FIELDS
  return DATABASE_CATALOG_WORKFLOW_LIST_FIELDS.map(node => {
    if (node.type !== 'r-text' || node.props?.['field'] !== 'status') return node
    return {
      type: 'r-select',
      props: {
        field: 'status',
        label: '状态',
        width: 96,
        optionDataViewKey: statusKey,
        labelField: 'txt',
        valueField: 'val',
        readonly: true,
      },
    }
  })
}
