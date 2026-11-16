/**
 * @module app:views/features/workflow/flow-runtime/run-page/model/flow-run-input-fields
 * 职责：用标准字段子组件声明办理参数与节点人员选择。
 * 边界：只编排绑定，不持有参数或候选值，不执行查询和保存。
 */
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'

export function flowRunInputFields({scope, locked, force}: Readonly<{scope: string; locked: boolean; force: boolean}>): SparkNode[] {
  const targets = (field: string, label: string, table: string): SparkNode => ({type: 'r-select', props: {field, label, readonly: locked, optionDataViewKey: buildDataViewKey(table, 'default', scope), optionValueField: 'id', optionLabelField: 'title'}})
  return [
    {type: 'r-textarea', props: {field: 'idea', label: '办理意见', readonly: locked, rows: 4}},
    ...(force ? [targets('forceNodeId', '强制退回目标', 'ApprovalForceTargets')] : []),
    ...[['notifySms', '短信通知'], ['notifyQywx', '企业微信通知'], ['notifyDingTalk', '钉钉通知'], ['notifyWechat', '微信通知']].map(([field, label]): SparkNode => ({type: 'r-checkbox', props: {field, label, readonly: locked}})),
  ]
}

export function flowRunNodeFields(locked: boolean): SparkNode[] {
  const fields: SparkNode[] = [
    {type: 'r-checkbox', props: {field: 'selected', label: '选择', readonly: locked, saveOnCellExit: false}},
    {type: 'r-text', props: {field: 'title', label: '下一节点', readonly: true}},
    {type: 'r-user-picker', props: {field: 'ExecUserList', label: '办理人', multiple: true, valueMode: 'array', readonly: locked ? true : '$[peopleReadonly]', optionDataViewKey: '$[candidateViewKey]', optionValueField: 'value', optionLabelField: 'name', editOnDblclick: false, saveOnCellExit: false}},
    {type: 'r-checkbox', props: {field: 'checkedReturn', label: '返回原办理人', readonly: locked ? true : '$[returnReadonly]', saveOnCellExit: false}},
  ]
  return fields.map(field => field.type === 'r-text' ? field : {type: 'r-column-group', props: {title: field.props?.['label']}, children: [{...field, props: {...field.props, label: ''}}]})
}
