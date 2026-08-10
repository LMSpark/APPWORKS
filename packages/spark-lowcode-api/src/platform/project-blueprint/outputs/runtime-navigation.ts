/**
 * 运行导航投影：将蓝图节点与 GetNavigationMenus 授权证据合成为前端可消费的导航树。
 * 仅包含 runtimeNavigationCandidate 且在授权证据中的节点；Vue 目标格式非法时 fail-fast。
 */
import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import type {
  RuntimeNavigationAuthorizationContext,
  RuntimeNavigationAuthorizationEvidence,
  RuntimeNavigationAuthorizationItem,
  RuntimeNavigationTargetKind,
} from '../../lowcode-navigation.js'
import type { ProjectBlueprintNode } from '../project-blueprint.js'

/** 运行导航项语义分类；有子节点时为 module，无目标时为 action。 */
export type RuntimeNavigationItemKind = 'module' | 'page' | 'external' | 'action'

/** 单条运行导航项；children 已按 order/id 排序，disabled 由 status=maintenance 推导。 */
export type RuntimeNavigationItem = Readonly<{
  id: string
  parentId: string
  title: string
  description: string
  target: string
  targetKind: RuntimeNavigationTargetKind
  itemKind: RuntimeNavigationItemKind
  componentKey: string
  formKey: string | null
  icon: string
  order: number
  disabled: boolean
  children: readonly RuntimeNavigationItem[]
}>

/** 运行导航投影结果；contexts 仅保留与输出节点 id 匹配的授权上下文。 */
export type RuntimeNavigation = Readonly<{
  projectId: string
  items: readonly RuntimeNavigationItem[]
  contexts: readonly RuntimeNavigationAuthorizationContext[]
}>

function flattenEvidence(
  items: readonly RuntimeNavigationAuthorizationItem[],
  target: Map<string, RuntimeNavigationAuthorizationItem>,
): void {
  for (const item of items) {
    target.set(item.id, item)
    flattenEvidence(item.children, target)
  }
}

function text(source: Readonly<Record<string, unknown>>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function projectedTarget(node: ProjectBlueprintNode, authorizedFormKey: string | null): Readonly<{
  target: string
  targetKind: RuntimeNavigationTargetKind
  componentKey: string
  formKey: string | null
}> {
  const target = node.runtimeTarget
  const targetKind: RuntimeNavigationTargetKind = !target
    ? 'empty'
    : target.startsWith('vue:')
      ? 'vue'
      : /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)
        ? 'external'
        : 'route'
  if (targetKind === 'vue') {
    const component = target.slice(4).replace(/[?#].*$/, '')
    if (!component || component.endsWith('.vue') || component.includes('\\') || component.includes('//')) {
      throw new LowcodeApiError(0, `蓝图节点 ${node.id} 的 Vue 目标无效：${target}`)
    }
  }
  return {
    target,
    targetKind,
    componentKey: targetKind === 'vue' ? target : '',
    formKey: targetKind === 'route' || targetKind === 'vue'
      ? (authorizedFormKey ?? node.legacyContentId) || null
      : null,
  }
}

/** 将蓝图候选节点与授权证据投影为运行导航树；未授权节点静默排除。 */
export function projectRuntimeNavigation(
  projectId: string,
  nodes: readonly ProjectBlueprintNode[],
  evidence: RuntimeNavigationAuthorizationEvidence,
): RuntimeNavigation {
  const authorized = new Map<string, RuntimeNavigationAuthorizationItem>()
  flattenEvidence(evidence.items, authorized)
  const candidates = nodes.filter((node) => node.runtimeNavigationCandidate && authorized.has(node.id))
  const candidateIds = new Set(candidates.map((node) => node.id))
  const childrenByParent = new Map<string, ProjectBlueprintNode[]>()
  for (const node of candidates) {
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  }
  const build = (node: ProjectBlueprintNode): RuntimeNavigationItem => {
    const children = [...(childrenByParent.get(node.id) ?? [])]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map(build)
    const runtime = projectedTarget(node, authorized.get(node.id)?.formKey ?? null)
    const itemKind: RuntimeNavigationItemKind = children.length > 0
      ? 'module'
      : runtime.targetKind === 'external'
        ? 'external'
        : runtime.targetKind === 'empty'
          ? 'action'
          : 'page'
    return {
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      description: node.description,
      ...runtime,
      itemKind,
      icon: text(node.source, ['iconCss', 'IconCss', 'icon']),
      order: node.order,
      disabled: text(node.source, ['status', 'Status']).toLowerCase() === 'maintenance',
      children,
    }
  }
  const items = candidates
    .filter((node) => !candidateIds.has(node.parentId))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map(build)
  const outputIds = new Set(candidates.map((node) => node.id))
  return {
    projectId,
    items,
    contexts: evidence.contexts.filter((context) => outputIds.has(context.navigationId)),
  }
}
