/**
 * @module app:lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-filters
 * 职责：流程工作台各页签过滤语义（对齐参考 flow-workbench-filters.ts），供 pagedata 与测试核对。
 */
export type FlowWorkbenchTab = 'pending' | 'processed' | 'shared' | 'started'

export const FLOW_WORKBENCH_WAITING_META = 'WFOBJ_FLOW_Waiting'
export const FLOW_WORKBENCH_PROCESSED_META = 'WFOBJ_FLOW_RELATIONLINE_STEP'
export const FLOW_WORKBENCH_FLOW_META = 'WFOBJ_FLOW'

export type FlowWorkbenchTabBinding = Readonly<{
  tab: FlowWorkbenchTab
  modelName: string
  viewId: string
}>

export type FlowWorkbenchFilterLeaf = Readonly<{
  field: string
  operator: string
  value: unknown
}>

export type FlowWorkbenchFilterExpression = Readonly<{
  logic: 'and' | 'or'
  filters: ReadonlyArray<FlowWorkbenchFilterLeaf | FlowWorkbenchFilterExpression>
}>

const CURRENT_USER_PARAM = Object.freeze({Type: 'GetInputParam', ParamName: 'currentUserId'})

export function flowWorkbenchMetaName(tab: FlowWorkbenchTab): string {
  if (tab === 'pending') return FLOW_WORKBENCH_WAITING_META
  if (tab === 'processed' || tab === 'shared') return FLOW_WORKBENCH_PROCESSED_META
  return FLOW_WORKBENCH_FLOW_META
}

export function flowWorkbenchTabViewId(tab: FlowWorkbenchTab): string {
  if (tab === 'pending') return 'workbenchPending'
  if (tab === 'processed') return 'workbenchProcessed'
  if (tab === 'shared') return 'workbenchShared'
  return 'workbenchStarted'
}

export function flowWorkbenchTabBinding(tab: FlowWorkbenchTab): FlowWorkbenchTabBinding {
  return {
    tab,
    modelName: flowWorkbenchMetaName(tab),
    viewId: flowWorkbenchTabViewId(tab),
  }
}

function eq(field: string, value: unknown): FlowWorkbenchFilterLeaf {
  return {field, operator: 'eq', value}
}

function orEq(field: string, values: readonly string[]): FlowWorkbenchFilterExpression {
  return {
    logic: 'or',
    filters: values.map(value => eq(field, value)),
  }
}

function andFilters(
  filters: ReadonlyArray<FlowWorkbenchFilterLeaf | FlowWorkbenchFilterExpression>,
): FlowWorkbenchFilterExpression {
  return {logic: 'and', filters}
}

/** 输出本仓 pagedata 可用的 filterExpression（用户维度用 GetInputParam）。 */
export function buildFlowWorkbenchTabFilterExpression(tab: FlowWorkbenchTab): FlowWorkbenchFilterExpression | FlowWorkbenchFilterLeaf {
  if (tab === 'pending') return eq('UserID', CURRENT_USER_PARAM)
  if (tab === 'started') return eq('createuser', CURRENT_USER_PARAM)
  if (tab === 'shared') {
    return andFilters([eq('ReceiveUserId', CURRENT_USER_PARAM), eq('STEPTYPE', '4')])
  }
  return andFilters([
    eq('SendUserId', CURRENT_USER_PARAM),
    orEq('STEPTYPE', ['0', '3', '9']),
    orEq('StepState', ['0', '1', '9']),
  ])
}
