/**
 * @module app:lowcode/resources/database/database-catalog-field-metadata
 * 职责：字段目录专题列与标准子组件（选项均经同一 DataSet 的正式模型 DataView）。
 */
import {buildDataViewKey, type DataSet, type SparkNode} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL,
  DATABASE_CATALOG_ENCRYPTION_DICT_MODEL,
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL,
} from './lowcode-database-table-view'

const FIELD_OPTIONAL_COLUMNS = [
  {name: 'DesenID', label: '脱敏'},
  {name: 'encryption_rule', label: '加密规则'},
] as const

export function databaseCatalogHasDesensitizationRules(dataSet: DataSet): boolean {
  return Boolean(dataSet.getView(DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL, 'default'))
}

export function databaseCatalogHasEncryptionDictionary(dataSet: DataSet): boolean {
  return Boolean(dataSet.getView(DATABASE_CATALOG_ENCRYPTION_DICT_MODEL, 'default'))
}

export function databaseCatalogHasFieldTypeDictionary(dataSet: DataSet): boolean {
  return Boolean(dataSet.getView(DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL, 'default'))
}

function catalogOptionViewKey(dataSet: DataSet, tableName: string): string | undefined {
  if (!dataSet.getView(tableName, 'default')) return undefined
  const scenarioId = dataSet.scenarioId?.trim()
  if (!scenarioId) return undefined
  return buildDataViewKey(tableName, 'default', scenarioId)
}

type CatalogOptionSelectFieldInput = Readonly<{
  dataSet: DataSet
  tableName: string
  field: string
  label: string
  width: number
  labelField: string
  valueField: string
}>

function buildOptionSelectField(input: CatalogOptionSelectFieldInput): SparkNode {
  const optionKey = catalogOptionViewKey(input.dataSet, input.tableName)
  if (!optionKey) return {type: 'r-text', props: {field: input.field, label: input.label, width: input.width}}
  return {
    type: 'r-select',
    props: {
      field: input.field,
      label: input.label,
      width: input.width,
      showCellControl: true,
      filterable: true,
      clearable: true,
      optionDataViewKey: optionKey,
      optionDataMember: 'rows',
      optionLabelField: input.labelField,
      optionValueField: input.valueField,
    },
  }
}

/** 表/视图字段网格：显式标准子组件，选项列绑定同 DataSet 内 DataView。 */
export function buildDatabaseCatalogFieldGridChildren(dataSet: DataSet): SparkNode[] {
  return [
    {type: 'r-text', props: {field: 'enname', label: '英文名', width: 140, sortable: true, editOnDblclick: true}},
    {type: 'r-text', props: {field: 'cnname', label: '中文名', width: 140, showCellControl: true}},
    buildOptionSelectField({dataSet, tableName: DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL, field: 'DataTypeName', label: '类型', width: 120, labelField: 'txt', valueField: 'val'}),
    {type: 'r-text', props: {field: 'DataLen', label: '长度', width: 80, editOnDblclick: true}},
    {type: 'r-text', props: {field: 'IsPKey', label: '主键', width: 72, editOnDblclick: true}},
    {type: 'r-text', props: {field: 'IsNill', label: '可空', width: 72, editOnDblclick: true}},
    {type: 'r-text', props: {field: 'IsUQ', label: '唯一', width: 72, editOnDblclick: true}},
    {type: 'r-text', props: {field: 'DefaultValue', label: '默认值', width: 120, editOnDblclick: true}},
    buildOptionSelectField({dataSet, tableName: DATABASE_CATALOG_ENCRYPTION_DICT_MODEL, field: 'encryption_rule', label: '加密', width: 120, labelField: 'txt', valueField: 'val'}),
    buildOptionSelectField({dataSet, tableName: DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL, field: 'DesenID', label: '脱敏', width: 160, labelField: 'name', valueField: 'rowid'}),
    {type: 'r-text', props: {field: 'Memo', label: '备注', width: 160, editOnDblclick: true}},
  ]
}

/** 装配后补列元数据、选项视图 value/label。 */
export function applyDatabaseCatalogFieldMetadata(dataSet: DataSet): void {
  const fieldTable = dataSet.getTable(DATABASE_CATALOG_FIELD_MODEL)
  if (fieldTable) {
    for (const column of FIELD_OPTIONAL_COLUMNS) {
      if (!fieldTable.columns.some(entry => entry.name === column.name)) {
        fieldTable.columns.push({name: column.name, type: 'string', label: column.label})
      }
    }
  }
  const rulesView = dataSet.getView(DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL, 'default')
  if (rulesView) {
    rulesView.labelField = 'name'
    rulesView.valueField = 'rowid'
  }
  for (const tableName of [DATABASE_CATALOG_ENCRYPTION_DICT_MODEL, DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL]) {
    const dictView = dataSet.getView(tableName, 'default')
    if (dictView) {
      dictView.labelField = 'txt'
      dictView.valueField = 'val'
    }
  }
}
