/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/flow-run-exec-users
 * 职责：保留服务端办理人候选范围和明确声明的选择约束，不扩大空候选。
 */
import {isRecord} from '@spark-appworks/spark-utils'
export type FlowRunExecUsers = Readonly<{nodeId: string; minNum?: number; maxNum?: number; allowChange?: boolean; users: ReadonlyArray<Readonly<{id: string; name: string}>>}>
function limit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'number' && typeof value !== 'string' || typeof value === 'string' && !value.trim()) throw Error('审批办理人数限制无效')
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) throw Error('审批办理人数限制无效')
  return number
}
export function parseFlowRunExecUsers(source: Readonly<Record<string, unknown>>): readonly FlowRunExecUsers[] {
  const raw = source['execUser']
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw Error('审批办理人配置须为数组')
  const ids = new Set<string>()
  return raw.map((item: unknown) => {
    if (!isRecord(item)) throw Error('审批办理人配置无效')
    const nodeId = String(item['nodeId'] ?? item['NodeId'] ?? '').trim()
    if (!nodeId || ids.has(nodeId)) throw Error('审批办理节点身份缺失或重复')
    ids.add(nodeId)
    const minNum = limit(item['minNum']), maxNum = limit(item['maxNum'])
    if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) throw Error('审批办理人数范围冲突')
    const list = item['userList']
    if (!Array.isArray(list)) throw Error('审批办理人候选范围缺失')
    const users = list.map((user: unknown) => {
      if (!isRecord(user) || typeof user['UserId'] !== 'string' || !user['UserId'].trim()) throw Error('审批办理人身份无效')
      return {id: user['UserId'], name: String(user['UserName'] ?? '')}
    })
    if (new Set(users.map(user => user.id)).size !== users.length) throw Error('审批办理人身份重复')
    const change = item['allowChange'] ?? item['AllowChange']
    if (change !== undefined && change !== true && change !== false && change !== '0' && change !== '1' && change !== 0 && change !== 1) throw Error('审批办理人变更标志无效')
    return {nodeId, ...(minNum === undefined ? {} : {minNum}), ...(maxNum === undefined ? {} : {maxNum}),
      ...(change === undefined ? {} : {allowChange: change === true || change === '1' || change === 1}), users}
  })
}
