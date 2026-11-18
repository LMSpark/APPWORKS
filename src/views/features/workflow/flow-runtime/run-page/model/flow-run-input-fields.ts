/**
 * @module app:views/features/workflow/flow-runtime/run-page/model/flow-run-input-fields
 * 职责：用标准字段子组件声明节点人员选择。
 * 边界：只编排绑定，不持有参数或候选值，不执行查询和保存。
 */
import type {SparkNode} from '@spark-appworks/spark-data'

export function flowRunNodeFields(locked: boolean): SparkNode[] {
  const fields: SparkNode[] = [
    {type: 'r-checkbox', props: {field: 'selected', label: '选择', readonly: locked, saveOnCellExit: false}},
    {type: 'r-text', props: {field: 'title', label: '下一节点', readonly: true}},
    {type: 'r-user-picker', props: {field: 'ExecUserList', label: '办理人', multiple: true, valueMode: 'array', readonly: locked ? true : '$[peopleReadonly]', optionDataViewKey: '$[candidateViewKey]', optionValueField: 'value', optionLabelField: 'name', editOnDblclick: false, saveOnCellExit: false}},
    {type: 'r-checkbox', props: {field: 'checkedReturn', label: '返回原办理人', readonly: locked ? true : '$[returnReadonly]', saveOnCellExit: false}},
  ]
  return fields.map(field => field.type === 'r-text' ? field : {type: 'r-column-group', props: {title: field.props?.['label']}, children: [{...field, props: {...field.props, label: ''}}]})
}
