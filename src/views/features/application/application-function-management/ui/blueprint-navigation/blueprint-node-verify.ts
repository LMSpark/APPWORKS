/**
 * @module app:views/features/application/application-function-management/ui/blueprint-navigation/blueprint-node-verify
 * 职责：从当前蓝图节点只读核验已保存的子树：能力名称、数据空间身份、导航地址规范及其在交付清单中唯一命中。
 * 边界：纯函数，只消费完整回读的已保存节点行与交付清单；环、不可读字段、子节点未回读均判失败，不以部分结果通过。
 * AI用途：问题码沿参考 blueprint-node-verify；本仓交付清单为 Vue 页面注册表全部页面（单一 SPA，不比对目标 APP 包身份）。
 */
import {blueprintNavigationTargetError} from '@/services/project/blueprint-navigation/blueprint-navigation-rules'
import {blueprintConTypeToAiKind} from '../application-function-page-contract'

export type BlueprintNodeVerifyIssueCode =
  | 'NODE_MISSING'
  | 'NODE_CYCLE'
  | 'FIELD_UNREADABLE'
  | 'CHILDREN_UNREAD'
  | 'CAPABILITY_NAME_REQUIRED'
  | 'DATA_SPACE_ID_REQUIRED'
  | 'PAGE_TARGET_REQUIRED'
  | 'TARGET_INVALID'
  | 'TARGET_NOT_IN_DELIVERY'
  | 'TARGET_NOT_UNIQUE'

export type BlueprintNodeVerifyIssue = Readonly<{nodeId: string; code: BlueprintNodeVerifyIssueCode; message: string}>
export type BlueprintNodeVerifyResult = Readonly<{ok: boolean; visitedNodeIds: readonly string[]; issues: readonly BlueprintNodeVerifyIssue[]}>
/** 一条完整回读的已保存节点行及其不可读字段。 */
export type BlueprintVerifyNode = Readonly<{row: Readonly<Record<string, unknown>>; hidden: readonly string[]}>
export type BlueprintNodeVerifyInput = Readonly<{rootNodeId: string; nodes: readonly BlueprintVerifyNode[]; deliveryResources: readonly string[]}>

/** 核验需要读取的正式字段。 */
export const BLUEPRINT_VERIFY_FIELDS = Object.freeze(['rowid', 'prowid', 'name', 'conid', 'conType', 'NavigationUrl', 'IsShowAtNav', 'hasChild'])
const REQUIRED_READABLE = Object.freeze(['name', 'conid', 'conType', 'NavigationUrl', 'IsShowAtNav'])

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

function flag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['1', 'true', 'yes'].includes(text(value).toLowerCase())
}

/** 从当前节点核验已保存子树；未绑定数据空间、目录节点无地址不失败，发布到菜单的页面节点必须唯一命中交付资源。 */
export function verifyBlueprintNodeTree(input: BlueprintNodeVerifyInput): BlueprintNodeVerifyResult {
  const rootNodeId = text(input.rootNodeId)
  const byId = new Map<string, BlueprintVerifyNode>()
  const byParent = new Map<string, BlueprintVerifyNode[]>()
  for (const node of input.nodes) {
    const nodeId = text(node.row['rowid'])
    if (!nodeId) continue
    byId.set(nodeId, node)
    const parentId = text(node.row['prowid'])
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), node])
  }
  const deliveryCounts = new Map<string, number>()
  for (const resource of input.deliveryResources) {
    const key = text(resource)
    if (key) deliveryCounts.set(key, (deliveryCounts.get(key) ?? 0) + 1)
  }
  const root = byId.get(rootNodeId)
  if (!rootNodeId || !root) {
    const missing: BlueprintNodeVerifyIssue = {nodeId: rootNodeId, code: 'NODE_MISSING', message: '当前节点未出现在蓝图回读结果中'}
    return Object.freeze({ok: false, visitedNodeIds: Object.freeze([]), issues: Object.freeze([missing])})
  }

  const issues: BlueprintNodeVerifyIssue[] = []
  const visited: string[] = []
  const seen = new Set<string>()
  const push = (nodeId: string, code: BlueprintNodeVerifyIssueCode, message: string) => { issues.push({nodeId, code, message}) }
  const stack: BlueprintVerifyNode[] = [root]
  while (stack.length) {
    const node = stack.pop()
    if (!node) break
    const nodeId = text(node.row['rowid'])
    if (seen.has(nodeId)) { push(nodeId, 'NODE_CYCLE', `蓝图节点存在循环父子关系：${nodeId}`); continue }
    seen.add(nodeId)
    visited.push(nodeId)
    const hidden = REQUIRED_READABLE.filter(field => node.hidden.includes(field))
    if (hidden.length) { push(nodeId, 'FIELD_UNREADABLE', `节点字段不可读取，不能核验：${nodeId}（${hidden.join('、')}）`); continue }

    if (!text(node.row['name'])) push(nodeId, 'CAPABILITY_NAME_REQUIRED', `基本信息缺少能力名称：${nodeId}`)
    const conid = node.row['conid']
    if (typeof conid === 'string' && conid !== '' && !conid.trim()) push(nodeId, 'DATA_SPACE_ID_REQUIRED', `已声明数据空间但缺少 scenarioId：${nodeId}`)

    const target = text(node.row['NavigationUrl'])
    const pageDuty = blueprintConTypeToAiKind(text(node.row['conType'])) === 'page' && flag(node.row['IsShowAtNav'])
    if (pageDuty && !target) push(nodeId, 'PAGE_TARGET_REQUIRED', `发布到菜单的页面节点未挂接 vue:/...：${nodeId}`)
    else if (target) {
      if (blueprintNavigationTargetError(target)) push(nodeId, 'TARGET_INVALID', `导航地址不是规范 vue:/...：${nodeId}`)
      else {
        const hits = deliveryCounts.get(target) ?? 0
        if (hits === 0) push(nodeId, 'TARGET_NOT_IN_DELIVERY', `目标 APP 当前交付中不存在该 Vue 资源：${target}`)
        else if (hits !== 1) push(nodeId, 'TARGET_NOT_UNIQUE', `目标 APP 当前交付中该 Vue 资源不唯一：${target}`)
      }
    }

    const children = byParent.get(nodeId) ?? []
    if (flag(node.row['hasChild']) && children.length === 0) { push(nodeId, 'CHILDREN_UNREAD', `子模块未回读，不能只核当前节点：${nodeId}`); continue }
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index]
      if (child) stack.push(child)
    }
  }
  return Object.freeze({ok: issues.length === 0, visitedNodeIds: Object.freeze(visited), issues: Object.freeze(issues)})
}

export function formatBlueprintNodeVerifyFailure(result: BlueprintNodeVerifyResult): string {
  return result.issues.map(issue => issue.message).join('；') || '从当前节点核验失败'
}
