/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-records
 * 职责：规范化宿主步骤上下文并维护撤回业务前置条件；不复制记录、执行列表查询或过滤。
 */
export type FlowAppendUserContext = Readonly<{
  rowid: string
  WFOBJID: string
  SendNodeModelId: string
  ReceiveNodeModelId: string
  LastStepID: string
  TITLE: string
}>

/** 仅收窄业务可用性；查询身份、数据权限及命令提交仍由原DataView执行。 */
export function canRevokeFlowAppendRecord(record: Readonly<{STATUS: unknown; StepState: unknown}>): boolean {
  const stepState = normalizeText(record.StepState)
  return normalizeText(record.STATUS) === '0' && (stepState === '0' || stepState === '1')
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

export function normalizeFlowAppendUserContext(
  context: Partial<FlowAppendUserContext> | null | undefined,
): FlowAppendUserContext {
  return {
    rowid: normalizeText(context?.rowid),
    WFOBJID: normalizeText(context?.WFOBJID),
    SendNodeModelId: normalizeText(context?.SendNodeModelId),
    ReceiveNodeModelId: normalizeText(context?.ReceiveNodeModelId),
    LastStepID: normalizeText(context?.LastStepID),
    TITLE: normalizeText(context?.TITLE),
  }
}
