/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-edit
 * 职责：蓝图节点表单草稿、补丁生成与提交规则。
 * 边界：只描述配置与项目结构；不渲染 Vue，不直接操作 spark-data 运行态。
 * AI用途：同步或生成页面配置时，用本模块确认草稿字段与 patch 边界。
 */
import type {
  ChildPlacement,
  ProjectBlueprintContextConfig,
  ProjectBlueprintContextItem,
  ProjectBlueprintDeliveryKind,
  ProjectBlueprintNodeKind,
  ProjectBlueprintPermissionMode,
  ProjectBlueprintNodePatch,
  ProjectBlueprintTreeNodeData,
} from './project-blueprint-node'
import { isNestedConfigPageNode } from './project-blueprint-tree'

/** 蓝图节点表单草稿字段；可编辑字段由节点 class 持有，草稿仅在表单边界即时生成。 */
export type BlueprintNodeDraftNode = {
  id: string
  title: string
  /** 蓝图业务类型；与运行交付投影 nodeKind 相互独立。 */
  blueprintKind: ProjectBlueprintNodeKind
  icon: string
  nodeKind: ProjectBlueprintDeliveryKind
  dividerAfter: boolean
  description: string
  planningAttachmentRef: string
  path: string
  linkTarget: NonNullable<ProjectBlueprintTreeNodeData['linkTarget']>
  childPlacement: string
  order: number
  hidden: boolean
  disabled: boolean
  refId: string
  permissionMode: ProjectBlueprintPermissionMode
  implGate?: ProjectBlueprintTreeNodeData['implGate']
  upstreamContractsSatisfied?: boolean
}

export type BlueprintNodePatch = Partial<Omit<BlueprintNodeDraftNode, 'id'>> & {
  context?: string | ProjectBlueprintContextItem[] | ProjectBlueprintContextConfig
}

type NavigationContextEditConfigDto = {
  placeholder: string
  defaultValue: string
  paramName: string
}

type NavigationContextEditDto = {
  hasContext: boolean
  items: Array<{ id: string; title: string }>
  config: NavigationContextEditConfigDto
}

export type BlueprintNodeDraft = {
  node: BlueprintNodeDraftNode
  context: NavigationContextEditDto
}

export type BlueprintNodeDraftApplyResult = {
  patch: BlueprintNodePatch & Pick<ProjectBlueprintTreeNodeData, 'title' | 'nodeKind'>
  warnings: string[]
}

type BlueprintNodePatchTarget = {
  readonly id: string
  /** 应用补丁到目标节点；不改 id 与树结构。 */
  applyBlueprintPatch(patch: ProjectBlueprintNodePatch): void
}

const DEFAULT_NAV_ICON_BY_KIND: Record<ProjectBlueprintDeliveryKind, string> = {
  'system-directory': 'FolderOpened',
  'module': 'FolderOpened',
  'system-page': 'Monitor',
  'system-action': 'Lightning',
  'page': 'Document',
  'link': 'Link',
  'ref': 'Connection',
}

const CHILD_PLACEMENT_VALUES: ReadonlySet<string> = new Set(['header', 'sidebar', 'toolbar', 'user-menu', 'parent', 'flat'])

function emptyContextConfig(): NavigationContextEditConfigDto {
  return { placeholder: '', defaultValue: '', paramName: '' }
}

function isBlueprintContextConfig(value: string | ProjectBlueprintContextItem[] | ProjectBlueprintContextConfig | undefined): value is ProjectBlueprintContextConfig {
  return typeof value === 'object' && !Array.isArray(value) && 'source' in value
}

function isChildPlacement(value: string): value is ChildPlacement {
  return CHILD_PLACEMENT_VALUES.has(value)
}

function normalizeContextItems(items: readonly ProjectBlueprintContextItem[]): Array<{ id: string; title: string }> {
  return items.map(item => ({ id: String(item.id), title: item.title }))
}

export function defaultNavIconByKind(kind: ProjectBlueprintDeliveryKind): string {
  return DEFAULT_NAV_ICON_BY_KIND[kind]
}

/** 比较蓝图草稿内容是否等价（dirty 判定，不含 UI 会话字段）。 */
export function blueprintDraftContentKey(draft: BlueprintNodeDraft): string {
  return JSON.stringify(draft)
}

export function createBlueprintNodeDraft(navNode: ProjectBlueprintTreeNodeData): BlueprintNodeDraft {
  const nodeDto: BlueprintNodeDraftNode = {
    id: navNode.id,
    title: navNode.title,
    blueprintKind: navNode.blueprintKind ?? 'unresolved',
    icon: navNode.icon ?? defaultNavIconByKind(navNode.nodeKind ?? 'page'),
    nodeKind: navNode.nodeKind ?? 'page',
    dividerAfter: navNode.dividerAfter ?? false,
    description: navNode.description ?? '',
    planningAttachmentRef: navNode.planningAttachmentRef ?? '',
    path: navNode.path ?? '',
    linkTarget: navNode.linkTarget === 'new-tab' || navNode.linkTarget === 'self' ? navNode.linkTarget : 'iframe',
    refId: navNode.refId ?? '',
    childPlacement: navNode.childPlacement ?? '',
    order: navNode.order ?? 0,
    hidden: navNode.hidden ?? false,
    disabled: navNode.disabled ?? false,
    permissionMode: navNode.permissionMode ?? 'masked',
    ...(navNode.implGate !== undefined ? { implGate: navNode.implGate } : {}),
    ...(navNode.upstreamContractsSatisfied !== undefined
      ? { upstreamContractsSatisfied: navNode.upstreamContractsSatisfied }
      : {}),
  }

  if (navNode.context === undefined) {
    return {
      node: nodeDto,
      context: { hasContext: false, items: [], config: emptyContextConfig() },
    }
  }

  if (Array.isArray(navNode.context)) {
    return {
      node: nodeDto,
      context: {
        hasContext: true,
        items: normalizeContextItems(navNode.context),
        config: emptyContextConfig(),
      },
    }
  }

  if (isBlueprintContextConfig(navNode.context)) {
    const source = navNode.context.source
    return {
      node: nodeDto,
      context: {
        hasContext: true,
        items: Array.isArray(source) ? normalizeContextItems(source) : [],
        config: {
          placeholder: navNode.context.placeholder ?? '',
          defaultValue: navNode.context.defaultValue !== undefined
            ? String(navNode.context.defaultValue)
            : '',
          paramName: navNode.context.paramName ?? '',
        },
      },
    }
  }

  return {
    node: nodeDto,
    context: { hasContext: false, items: [], config: emptyContextConfig() },
  }
}

export function applyNestedConfigPagePresetToDraft(node: BlueprintNodeDraftNode): BlueprintNodeDraftNode {
  const next = applyNodeKindPresetToDraft(node, 'page')
  next.hidden = true
  next.path = ''
  next.linkTarget = 'iframe'
  return next
}

export function applyNodeKindPresetToDraft(node: BlueprintNodeDraftNode, kind: ProjectBlueprintDeliveryKind): BlueprintNodeDraftNode {
  const next = { ...node }
  const previousKind = next.nodeKind
  next.nodeKind = kind

  const previousDefault = defaultNavIconByKind(previousKind)
  const nextDefault = defaultNavIconByKind(kind)
  if (!next.icon || next.icon === previousDefault) {
    next.icon = nextDefault
  }

  if (kind === 'system-directory') {
    next.hidden = false
    next.path = ''
    next.linkTarget = 'iframe'
    return next
  }
  if (kind === 'module') {
    next.hidden = false
    next.path = ''
    next.linkTarget = 'iframe'
    return next
  }
  if (kind === 'system-page' || kind === 'page') {
    next.hidden = false
    next.linkTarget = 'iframe'
    return next
  }
  if (kind === 'link') {
    next.hidden = false
    next.path = ''
    next.refId = ''
    return next
  }
  if (kind === 'ref') {
    next.hidden = false
    next.path = ''
    next.linkTarget = 'iframe'
    return next
  }

  next.hidden = true
  next.path = ''
  next.linkTarget = 'iframe'
  return next
}

export function createBlueprintNodePatch(input: BlueprintNodeDraft): BlueprintNodeDraftApplyResult {
  const nodeDto = { ...input.node }
  const warnings: string[] = []

  if (isNestedConfigPageNode(nodeDto)) {
    nodeDto.nodeKind = 'page'
    nodeDto.hidden = true
    nodeDto.path = ''
    nodeDto.linkTarget = 'iframe'
  } else if (nodeDto.nodeKind === 'ref') {
    nodeDto.path = ''
    nodeDto.linkTarget = 'iframe'
  } else if (nodeDto.nodeKind === 'system-page' || nodeDto.nodeKind === 'page') {
    nodeDto.linkTarget = 'iframe'
  }

  const patch: BlueprintNodePatch & Pick<ProjectBlueprintTreeNodeData, 'title' | 'nodeKind'> = {
    title: nodeDto.title,
    blueprintKind: nodeDto.blueprintKind,
    nodeKind: nodeDto.nodeKind,
    icon: nodeDto.icon,
    dividerAfter: nodeDto.dividerAfter,
    description: nodeDto.description,
    ...(typeof nodeDto.planningAttachmentRef === 'string' && nodeDto.planningAttachmentRef.trim().length > 0
      ? { planningAttachmentRef: nodeDto.planningAttachmentRef.trim() }
      : {}),
    path: nodeDto.path,
    linkTarget: nodeDto.linkTarget,
    childPlacement: nodeDto.childPlacement,
    order: nodeDto.order,
    hidden: nodeDto.hidden,
    disabled: nodeDto.disabled,
    refId: nodeDto.refId,
    permissionMode: nodeDto.permissionMode,
  }
  Object.assign(patch, {
    implGate: nodeDto.implGate,
    upstreamContractsSatisfied: nodeDto.upstreamContractsSatisfied,
  } satisfies Pick<
    ProjectBlueprintNodePatch,
    'implGate' | 'upstreamContractsSatisfied'
  >)

  if (nodeDto.nodeKind === 'link') patch.linkTarget = nodeDto.linkTarget
  if (nodeDto.nodeKind === 'ref' && nodeDto.refId) {
    if (nodeDto.refId === nodeDto.id) {
      warnings.push('不能引用自身，已忽略 refId')
      patch.refId = ''
    } else {
      patch.refId = nodeDto.refId
    }
  }
  if (nodeDto.childPlacement && !isChildPlacement(nodeDto.childPlacement)) patch.childPlacement = ''

  patch.context = ''
  if (input.context.hasContext && input.context.items.length > 0) {
    const items = input.context.items.filter(item => item.id && item.title)
    if (items.length > 0) {
      if (
        input.context.config.placeholder
        || input.context.config.defaultValue
        || input.context.config.paramName
      ) {
        const ctx: ProjectBlueprintContextConfig = { source: items }
        if (input.context.config.placeholder) ctx.placeholder = input.context.config.placeholder
        if (input.context.config.defaultValue) ctx.defaultValue = input.context.config.defaultValue
        if (input.context.config.paramName) ctx.paramName = input.context.config.paramName
        patch.context = ctx
      } else {
        patch.context = items
      }
    }
  }

  return { patch, warnings }
}

export function applyBlueprintNodeDraftToNode(
  node: BlueprintNodePatchTarget,
  input: BlueprintNodeDraft,
): BlueprintNodeDraftApplyResult {
  const result = createBlueprintNodePatch(input)
  node.applyBlueprintPatch(result.patch)
  return result
}
