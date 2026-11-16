/**
 * @module app:views/features/workflow/flow-append-user/model/flow-append-user-model
 * 职责：追加办理人选人校验与提交载荷；撤回前置条件归流程资源层。
 */

export type FlowAppendPersonValue = Readonly<{
  UserId: string
  UserName: string
}>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

export function normalizeFlowAppendPeople(values: readonly FlowAppendPersonValue[]): FlowAppendPersonValue[] {
  const userMap = new Map<string, FlowAppendPersonValue>()
  for (const item of values) {
    const userId = normalizeText(item.UserId)
    if (!userId) continue
    userMap.set(userId, {UserId: userId, UserName: normalizeText(item.UserName)})
  }
  return [...userMap.values()]
}

export function validateFlowAppendSelection(selectedCount: number, minNum: number, maxNum: number): string {
  if (selectedCount === 0) return '请选择办理人'
  if (maxNum > 0 && selectedCount > maxNum) return `追加办理人数不能超过 ${maxNum} 人`
  if (minNum > 0 && selectedCount < minNum) return `追加办理人数不能少于 ${minNum} 人`
  return ''
}

export function createFlowAppendReceiveUserList(values: readonly FlowAppendPersonValue[]): string[] {
  return normalizeFlowAppendPeople(values).map(item => `${item.UserId}:${item.UserName || item.UserId}`)
}
