/**
 * @module app:lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-filters
 * 职责：流程工作台各页签过滤语义（对齐参考 flow-workbench-filters.ts），供 pagedata 与测试核对。
 */
export type FlowWorkbenchTab = 'pending' | 'processed' | 'shared' | 'started'

export const FLOW_WORKBENCH_WAITING_META = 'WFOBJ_FLOW_Waiting'
export const FLOW_WORKBENCH_PROCESSED_META = 'WFOBJ_FLOW_RELATIONLINE_STEP'
export const FLOW_WORKBENCH_FLOW_META = 'WFOBJ_FLOW'

export function flowWorkbenchMetaName(tab: FlowWorkbenchTab): string {
  if (tab === 'pending') return FLOW_WORKBENCH_WAITING_META
  if (tab === 'processed' || tab === 'shared') return FLOW_WORKBENCH_PROCESSED_META
  return FLOW_WORKBENCH_FLOW_META
}

export type FlowWorkbenchFilterField = Readonly<{
  field: string
  operator: string
  value: unknown
}>

function eq(field: string, value: string): FlowWorkbenchFilterField {
  return {field, operator: 'eq', value}
}

/** 参考仓 pending → Waiting.UserID；其余页签待后续 pagedata 命名视图接入。 */
export function buildFlowWorkbenchTabFilterFields(
  tab: FlowWorkbenchTab,
  userId: string,
): readonly FlowWorkbenchFilterField[] | null {
  const id = String(userId ?? '').trim()
  if (!id) return null
  if (tab === 'pending') return [eq('UserID', id)]
  if (tab === 'started') return [eq('createuser', id)]
  return null
}