/**
 * 运行态导航授权归一化：TopMenus/LeftMenus 树与 Relations 上下文。
 * wire 键大小写敏感：NavigationUrl、conId/conid、prowid、childrowid；vue: 协议须小写。
 */
import { LowcodeApiError } from '../core/lowcode-api-error.js'

/** 导航目标类型；由 NavigationUrl/url 解析得出。 */
export type RuntimeNavigationTargetKind = 'empty' | 'external' | 'route' | 'vue'

/** Relations 上下文；wire 字段 TextParamName、ValParamName、selectValParam 等 PascalCase。 */
export type RuntimeNavigationAuthorizationContext = Readonly<{
  id: string
  navigationId: string
  title: string
  childRowId: string
  textParameterName: string
  valueParameterName: string
  workflowId: string
  flowState: number | null
  valueField: string
  textField: string
  titlePlacement: string
}>

/** 导航授权树节点；route/vue 目标携带 formKey（conId/conid）。 */
export type RuntimeNavigationAuthorizationItem = Readonly<{
  id: string
  target: string
  targetKind: RuntimeNavigationTargetKind
  formKey: string | null
  children: readonly RuntimeNavigationAuthorizationItem[]
}>

/** 导航授权完整证据：菜单树 + Relations 上下文列表。 */
export type RuntimeNavigationAuthorizationEvidence = Readonly<{
  items: readonly RuntimeNavigationAuthorizationItem[]
  contexts: readonly RuntimeNavigationAuthorizationContext[]
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, context: string): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new LowcodeApiError(0, `${context} 不是对象`)
}

function rows(value: unknown, context: string): readonly unknown[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value
  throw new LowcodeApiError(0, `${context} 不是数组`)
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

function targetKind(value: string): RuntimeNavigationTargetKind {
  if (!value) return 'empty'
  if (value.startsWith('vue:')) return 'vue'
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return 'external'
  return 'route'
}

function target(value: unknown): string {
  const normalized = text(value)
  if (!normalized) return ''
  if (/^vue:/i.test(normalized) && !normalized.startsWith('vue:')) {
    throw new LowcodeApiError(0, 'Vue 导航资源协议必须精确使用小写 vue:')
  }
  if (normalized.startsWith('vue:')) {
    const resource = normalized.slice(4).replace(/[?#].*$/, '')
    if (!resource || resource.endsWith('.vue') || resource.includes('\\') || resource.includes('//')) {
      throw new LowcodeApiError(0, `Vue 导航资源目标无效：${normalized}`)
    }
  }
  return normalized
}

function authorizationItem(value: unknown): RuntimeNavigationAuthorizationItem {
  const raw = record(value, '运行导航授权项')
  const id = text(raw['id'])
  if (!id) throw new LowcodeApiError(0, '运行导航授权项缺少 id')
  const normalizedTarget = target(raw['NavigationUrl'] ?? raw['url'])
  const kind = targetKind(normalizedTarget)
  return {
    id,
    target: normalizedTarget,
    targetKind: kind,
    formKey: kind === 'route' || kind === 'vue'
      ? text(raw['conId'] ?? raw['conid']) || null
      : null,
    children: rows(raw['items'], '运行导航授权项 items').map(authorizationItem),
  }
}

function authorizationContext(value: unknown): RuntimeNavigationAuthorizationContext | null {
  const raw = record(value, '运行导航授权 Relations 项')
  const navigationId = text(raw['prowid'])
  const childRowId = text(raw['childrowid'])
  if (!navigationId || !childRowId) return null
  const rawFlowState = raw['flowstate']
  const flowState = rawFlowState === undefined || rawFlowState === null ? null : Number(rawFlowState)
  return {
    id: text(raw['rowid']),
    navigationId,
    title: text(raw['title']),
    childRowId,
    textParameterName: text(raw['TextParamName']),
    valueParameterName: text(raw['ValParamName']),
    workflowId: text(raw['wfid']),
    flowState: flowState !== null && Number.isFinite(flowState) ? flowState : null,
    valueField: text(raw['selectValParam']),
    textField: text(raw['selectTextParam']),
    titlePlacement: text(raw['titleLocation']).toLowerCase(),
  }
}

function collectIds(items: readonly RuntimeNavigationAuthorizationItem[], ids: Set<string>): void {
  for (const item of items) {
    if (ids.has(item.id)) throw new LowcodeApiError(0, `运行导航授权项 id 重复：${item.id}`)
    ids.add(item.id)
    collectIds(item.children, ids)
  }
}

/**
 * 归一化运行导航授权响应；合并 TopMenus 与 LeftMenus，校验 id 全局唯一。
 * Vue 资源须精确小写 vue: 前缀，否则抛错。
 */
export function normalizeRuntimeNavigationAuthorization(value: unknown): RuntimeNavigationAuthorizationEvidence {
  const payload = record(value, '运行导航授权 Result')
  const items = [
    ...rows(payload['TopMenus'], '运行导航授权 TopMenus').map(authorizationItem),
    ...rows(payload['LeftMenus'], '运行导航授权 LeftMenus').map(authorizationItem),
  ]
  collectIds(items, new Set<string>())
  const contexts = rows(payload['Relations'], '运行导航授权 Relations')
    .map(authorizationContext)
    .filter((item): item is RuntimeNavigationAuthorizationContext => item !== null)
  return { items, contexts }
}
