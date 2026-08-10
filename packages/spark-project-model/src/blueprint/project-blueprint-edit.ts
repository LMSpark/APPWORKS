/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-edit
 * 职责：提供项目蓝图节点编辑草稿、补丁和提交规则。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * 项目蓝图编辑领域模型。
 *
 * 持有蓝图节点表单草稿和 patch 生成规则。
 * 可编辑字段由 ProjectNode class 持有；草稿只在表单读写边界即时生成。
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

/** Navigation Node Draft Node 的语义模型。 */
export type BlueprintNodeDraftNode = {
    /** 唯一标识。 */
id: string
    /** 显示标题。 */
title: string
    /** 蓝图业务类型；与运行交付投影 nodeKind 相互独立。 */
blueprintKind: ProjectBlueprintNodeKind
    /** icon 字段。 */
icon: string
    /** node Kind 字段。 */
nodeKind: ProjectBlueprintDeliveryKind
    /** divider After 字段。 */
dividerAfter: boolean
    /** description 字段。 */
description: string
    /** planning Attachment Ref 字段。 */
planningAttachmentRef: string
    /** 资源路径。 */
path: string
    /** link Target 字段。 */
linkTarget: NonNullable<ProjectBlueprintTreeNodeData['linkTarget']>
    /** child Placement 字段。 */
childPlacement: string
    /** order 字段。 */
order: number
    /** hidden 字段。 */
hidden: boolean
    /** 是否禁用。 */
disabled: boolean
    /** ref Id 标识。 */
refId: string
    /** permission Mode 字段。 */
permissionMode: ProjectBlueprintPermissionMode
    /** impl Gate 字段。 */
implGate?: ProjectBlueprintTreeNodeData['implGate']
    /** upstream Contracts Satisfied 字段。 */
upstreamContractsSatisfied?: boolean
}

/** Navigation Node Patch 的语义模型。 */
export type BlueprintNodePatch = Partial<Omit<BlueprintNodeDraftNode, 'id'>> & {
    /** 运行上下文。 */
context?: string | ProjectBlueprintContextItem[] | ProjectBlueprintContextConfig
}

/** Navigation Context Edit Config Dto 的语义模型。 */
type NavigationContextEditConfigDto = {
    /** 占位提示文本。 */
placeholder: string
    /** default Value 字段。 */
defaultValue: string
    /** param Name 名称。 */
paramName: string
}

/** Navigation Context Edit Dto 的语义模型。 */
type NavigationContextEditDto = {
    /** 是否 has Context。 */
hasContext: boolean
    /** items 字段。 */
items: Array<{ id: string; title: string }>
    /** 配置对象。 */
config: NavigationContextEditConfigDto
}

/** Navigation Node Draft 的语义模型。 */
export type BlueprintNodeDraft = {
    /** node 字段。 */
node: BlueprintNodeDraftNode
    /** 运行上下文。 */
context: NavigationContextEditDto
}

/** Navigation Node Draft Apply Result 的返回结果。 */
export type BlueprintNodeDraftApplyResult = {
    /** patch 字段。 */
patch: BlueprintNodePatch & Pick<ProjectBlueprintTreeNodeData, 'title' | 'nodeKind'>
    /** warnings 字段。 */
warnings: string[]
}

/** Navigation Node Patch Target 的语义模型。 */
type BlueprintNodePatchTarget = {
    /** 唯一标识。 */
readonly id: string
  /** 将蓝图补丁应用到目标节点；修改节点的可编辑字段，但不改变 id 和树结构。 */
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

/** 比较蓝图草稿内容是否等价（用于 dirty 判定，不含 UI 会话字段）。 */
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
