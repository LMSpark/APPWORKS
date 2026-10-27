import { deepClone, isProjectBlueprintNodeKind } from '@spark-appworks/spark-utils'
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
import { createLowcodeProjectBlueprintRecord, lowcodeProjectBlueprintFields } from '@spark-appworks/spark-lowcode-api'

type WireFields = Record<string, string | number>

export type ProjectBlueprintReplacementCommand = Readonly<{
  kind: 'create' | 'update' | 'move' | 'reorder' | 'delete'
  nodeId: string
  parentNodeId: string
  previousParentNodeId?: string
  depth: number
  siblingIndex: number
  fields: Readonly<WireFields>
}>

export type ProjectBlueprintReplacementPlan = Readonly<{
  projectId: string
  rootNodeId: string
  commands: readonly ProjectBlueprintReplacementCommand[]
  expectedTree: ProjectBlueprintTreeData
}>

type PlanOptions = Readonly<{
  projectId: string
  /** Fields output by the current formal DataView query; omit for structural-only planning. */
  availableFields?: readonly string[]
}>

type FlatNode = Readonly<{
  node: ProjectBlueprintTreeNodeData
  parentNodeId: string
  depth: number
  siblingIndex: number
}>

const NODE_KEYS = ['nodeId', 'parentNodeId', 'projectId', 'kind', 'capability', 'navigation', 'dataSpace', 'prototype', 'source', 'children']
const CAPABILITY_KEYS = ['name', 'description', 'code', 'ownerId', 'deliveryStatus']
const NAVIGATION_KEYS = ['title', 'icon', 'order', 'placement', 'target', 'mobileTarget', 'openMode', 'displayMode', 'horizontalAlignment', 'publishInMenu', 'showChildren', 'beginGroup']

/**
 * Build a complete, side-effect-free diff for replacing the children of the
 * existing root. This only describes a command plan; it does not authorize or
 * execute any DataView changes.
 */
export function planProjectBlueprintReplacement(
  currentRoot: ProjectBlueprintTreeData,
  requestedChildren: readonly ProjectBlueprintTreeNodeData[],
  options: PlanOptions,
): ProjectBlueprintReplacementPlan {
  const projectId = requiredText(options.projectId, 'projectId')
  validateRoot(currentRoot, projectId)

  const current = flattenChildren(currentRoot.children, { parentNodeId: currentRoot.nodeId, projectId, depth: 1, ancestors: new Set([currentRoot.nodeId]) })
  const target = flattenChildren(requestedChildren, { parentNodeId: currentRoot.nodeId, projectId, depth: 1, ancestors: new Set([currentRoot.nodeId]) })
  assertWireSiblingOrder(target)
  const currentById = new Map(current.map(item => [item.node.nodeId, item]))
  const targetById = new Map(target.map(item => [item.node.nodeId, item]))

  for (const item of target) {
    const previous = currentById.get(item.node.nodeId)
    assertWireRepresentable(item.node, previous?.node)
  }

  const creates: ProjectBlueprintReplacementCommand[] = []
  const updates: ProjectBlueprintReplacementCommand[] = []
  const deletes: ProjectBlueprintReplacementCommand[] = []
  for (const item of target) {
    const before = currentById.get(item.node.nodeId)
    if (!before) {
      const fields = {...toWireFields(item.node), prowid: item.parentNodeId}
      assertAvailableFields(fields, { availableFields: options.availableFields, allowDefaults: true, nodeId: item.node.nodeId })
      creates.push(command({ kind: 'create', item, fields }))
      continue
    }

    const fields = changedWireFields(before.node, item.node)
    const moved = before.parentNodeId !== item.parentNodeId
    const previousSiblingPosition = retainedSiblingPosition({ source: current, counterpart: target, nodeId: item.node.nodeId, parentNodeId: before.parentNodeId })
    const targetSiblingPosition = retainedSiblingPosition({ source: target, counterpart: current, nodeId: item.node.nodeId, parentNodeId: item.parentNodeId })
    const relativeSiblingOrderChanged = !moved && previousSiblingPosition !== targetSiblingPosition
    if (moved) fields['prowid'] = item.parentNodeId
    if (relativeSiblingOrderChanged || numericWireValue(fields['FunOrderValue']) !== undefined) {
      const order = toWireFields(item.node)['FunOrderValue']
      if ((typeof order !== 'string' && typeof order !== 'number') || numericWireValue(order) === undefined) {
        throw new Error(`蓝图节点 ${item.node.nodeId} 的重排缺少正式 FunOrderValue`)
      }
      if (relativeSiblingOrderChanged && String(toWireFields(before.node)['FunOrderValue']) === String(order)) {
        throw new Error(`蓝图节点 ${item.node.nodeId} 的兄弟顺序变化没有对应的正式 FunOrderValue 变化，拒绝推测排序值`)
      }
      fields['FunOrderValue'] = order
    }
    if (Object.keys(fields).length === 0) continue
    assertAvailableFields(fields, { availableFields: options.availableFields, allowDefaults: false, nodeId: item.node.nodeId })
    const kind = moved ? 'move' : relativeSiblingOrderChanged || Object.hasOwn(fields, 'FunOrderValue') ? 'reorder' : 'update'
    updates.push(command({ kind, item, fields, previousParentNodeId: before.parentNodeId }))
  }

  for (const item of current) {
    if (targetById.has(item.node.nodeId)) continue
    deletes.push(command({ kind: 'delete', item, fields: {} }))
  }
  creates.sort((left, right) => left.depth - right.depth || left.siblingIndex - right.siblingIndex)
  deletes.sort((left, right) => right.depth - left.depth || left.siblingIndex - right.siblingIndex)
  const expectedTree = freeze(deepClone({ ...currentRoot, children: [...requestedChildren] }))
  const commands = freeze([...creates, ...updates, ...deletes])
  return freeze({ projectId, rootNodeId: currentRoot.nodeId, commands, expectedTree })
}

function validateRoot(root: ProjectBlueprintTreeData, projectId: string): void {
  validateNodeShape(root, projectId)
  if (!root.nodeId.trim() || root.nodeId !== root.nodeId.trim()) throw new Error('项目蓝图根节点身份无效')
  if (root.parentNodeId !== '') throw new Error('项目蓝图根节点不能被移动或重挂')
}

type FlattenChildrenOptions = {
  parentNodeId: string
  projectId: string
  depth: number
  ancestors: ReadonlySet<string>
  output?: FlatNode[]
  seenObjects?: WeakSet<object>
  seenIds?: Set<string>
}

function flattenChildren(nodes: readonly ProjectBlueprintTreeNodeData[], options: FlattenChildrenOptions): FlatNode[] {
  const { parentNodeId, projectId, depth, ancestors } = options
  const output = options.output ?? []
  const seenObjects = options.seenObjects ?? new WeakSet<object>()
  const seenIds = options.seenIds ?? new Set(ancestors)
  nodes.forEach((node, siblingIndex) => {
    if (seenObjects.has(node)) throw new Error('项目蓝图树存在重复 nodeId 或循环引用')
    seenObjects.add(node)
    validateNodeShape(node, projectId)
    const id = requiredText(node.nodeId, 'nodeId')
    if (node.nodeId !== id) throw new Error(`项目蓝图节点身份不能含首尾空格：${id}`)
    if (seenIds.has(id)) throw new Error(`项目蓝图树存在重复 nodeId 或循环引用：${id}`)
    if (node.parentNodeId !== parentNodeId) throw new Error(`项目蓝图节点 ${id} 的 parentNodeId 与树父节点不一致`)
    output.push({node, parentNodeId, depth, siblingIndex})
    seenIds.add(id)
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(id)
    flattenChildren(node.children ?? [], { ...options, parentNodeId: id, depth: depth + 1, ancestors: nextAncestors, output, seenObjects, seenIds })
  })
  return output
}

function validateNodeShape(node: ProjectBlueprintTreeNodeData, projectId: string): void {
  assertOnlyKeys(node, NODE_KEYS, '节点')
  requiredText(node.nodeId, 'nodeId')
  requiredText(node.projectId, '节点 projectId')
  if (node.projectId !== projectId) throw new Error(`蓝图节点 ${node.nodeId} 属于其他项目 ${node.projectId}`)
  if (!isProjectBlueprintNodeKind(node.kind)) throw new Error(`蓝图节点 ${node.nodeId} kind 不是正式种类`)
  assertOnlyKeys(node.capability, CAPABILITY_KEYS, `节点 ${node.nodeId} capability`)
  requiredText(node.capability.name, `节点 ${node.nodeId} capability.name`)
  for (const field of ['name', 'description', 'code', 'ownerId', 'deliveryStatus'] as const) {
    const value = node.capability[field]
    if (value !== undefined && typeof value !== 'string') throw new Error(`蓝图节点 ${node.nodeId} capability.${field} 必须是文本`)
  }
  if (node.navigation !== undefined) {
    assertOnlyKeys(node.navigation, NAVIGATION_KEYS, `节点 ${node.nodeId} navigation`)
    if (!Number.isFinite(node.navigation.order)) throw new Error(`蓝图节点 ${node.nodeId} navigation.order 必须是有限数值`)
    if (typeof node.navigation.title !== 'string') throw new Error(`蓝图节点 ${node.nodeId} navigation.title 必须是文本`)
    for (const field of ['icon', 'target', 'mobileTarget', 'displayMode', 'horizontalAlignment'] as const) {
      const value = node.navigation[field]
      if (value !== undefined && typeof value !== 'string') throw new Error(`蓝图节点 ${node.nodeId} navigation.${field} 必须是文本`)
    }
    for (const field of ['publishInMenu', 'showChildren', 'beginGroup'] as const) {
      if (typeof node.navigation[field] !== 'boolean') throw new Error(`蓝图节点 ${node.nodeId} navigation.${field} 必须是布尔值`)
    }
    if (node.navigation.openMode !== undefined && !['subsystem', 'current', 'new-window', 'modal', 'embedded'].includes(node.navigation.openMode)) {
      throw new Error(`蓝图节点 ${node.nodeId} navigation.openMode 不是正式 wire 值`)
    }
    if (node.navigation.placement !== undefined && !['top', 'left', 'right', 'parent', 'tabs', 'popup'].includes(node.navigation.placement)) {
      throw new Error(`蓝图节点 ${node.nodeId} navigation.placement 不是正式 wire 值`)
    }
  }
  if (node.dataSpace !== undefined) {
    assertOnlyKeys(node.dataSpace, ['scenarioId', 'models'], `节点 ${node.nodeId} dataSpace`)
    requiredText(node.dataSpace.scenarioId, `节点 ${node.nodeId} dataSpace.scenarioId`)
    if (!Array.isArray(node.dataSpace.models)) throw new Error(`蓝图节点 ${node.nodeId} dataSpace.models 必须是数组`)
    if (node.dataSpace.models.length > 0) throw new Error(`Base_NavigationInfo DataView wire 不承接节点 ${node.nodeId} 的 dataSpace.models`)
    for (const model of node.dataSpace.models) {
      assertOnlyKeys(model, ['metaName'], `节点 ${node.nodeId} dataSpace.models`)
      requiredText(model['metaName'], `节点 ${node.nodeId} dataSpace.models.metaName`)
    }
  }
  if (node.prototype !== undefined) {
    assertOnlyKeys(node.prototype, ['htmlDescription'], `节点 ${node.nodeId} prototype`)
    if (node.prototype.htmlDescription !== undefined && typeof node.prototype.htmlDescription !== 'string') {
      throw new Error(`蓝图节点 ${node.nodeId} prototype.htmlDescription 必须是文本`)
    }
  }
  assertOnlyKeys(node.source, Object.keys(node.source), `节点 ${node.nodeId} source`)
  if (node.children !== undefined && !Array.isArray(node.children)) throw new Error(`蓝图节点 ${node.nodeId} children 必须是数组`)
}

function assertWireRepresentable(node: ProjectBlueprintTreeNodeData, previous?: ProjectBlueprintTreeNodeData): void {
  if (!previous && Object.keys(node.source).length > 0) {
    throw new Error(`当前 Base_NavigationInfo DataView wire 不承接新增节点 ${node.nodeId} 的 source 字段`)
  }
  if (previous && stableValue(node.source) !== stableValue(previous.source)) {
    throw new Error(`当前 Base_NavigationInfo DataView wire 不承接节点 ${node.nodeId} 的 source 字段修改`)
  }
  toWireFields(node)
}

function toWireFields(node: ProjectBlueprintTreeNodeData): WireFields {
  const record = createLowcodeProjectBlueprintRecord({
    nodeId: node.nodeId, parentNodeId: node.parentNodeId, projectId: node.projectId, kind: node.kind,
    capability: node.capability, ...(node.navigation === undefined ? {} : {navigation: node.navigation}),
    ...(node.dataSpace === undefined ? {} : {dataSpace: node.dataSpace}),
    ...(node.prototype === undefined ? {} : {prototype: node.prototype}), source: node.source,
  })
  return lowcodeProjectBlueprintFields(record)
}

function changedWireFields(before: ProjectBlueprintTreeNodeData, after: ProjectBlueprintTreeNodeData): WireFields {
  const previousFields = toWireFields(before)
  const nextFields = toWireFields(after)
  return Object.fromEntries(Object.entries(nextFields).filter(([field, value]) => String(previousFields[field]) !== String(value)))
}

function assertWireSiblingOrder(nodes: readonly FlatNode[]): void {
  const parents = new Set(nodes.map(item => item.parentNodeId))
  for (const parentNodeId of parents) {
    const siblings = nodes.filter(item => item.parentNodeId === parentNodeId)
      .sort((left, right) => left.siblingIndex - right.siblingIndex)
    const persisted = [...siblings].sort((left, right) => {
      const orderDifference = Number(toWireFields(left.node)['FunOrderValue'] ?? 0)
        - Number(toWireFields(right.node)['FunOrderValue'] ?? 0)
      return orderDifference || left.node.nodeId.localeCompare(right.node.nodeId)
    })
    if (siblings.some((item, index) => item.node.nodeId !== persisted[index]?.node.nodeId)) {
      throw new Error(`项目蓝图目标兄弟顺序与正式 FunOrderValue/rowid 排序不一致，父节点 ${parentNodeId}`)
    }
  }
}

function retainedSiblingPosition(input: {
  source: readonly FlatNode[]
  counterpart: readonly FlatNode[]
  nodeId: string
  parentNodeId: string
}): number | undefined {
  const { source, counterpart, nodeId, parentNodeId } = input
  const counterpartParentById = new Map(counterpart.map(item => [item.node.nodeId, item.parentNodeId]))
  const shared = source.filter(item => item.parentNodeId === parentNodeId
    && counterpartParentById.get(item.node.nodeId) === parentNodeId)
    .sort((left, right) => left.siblingIndex - right.siblingIndex)
  const index = shared.findIndex(item => item.node.nodeId === nodeId)
  return index < 0 ? undefined : index
}

function assertAvailableFields(fields: WireFields, options: { availableFields: readonly string[] | undefined; allowDefaults: boolean; nodeId: string }): void {
  const { availableFields, allowDefaults, nodeId } = options
  if (availableFields === undefined) return
  const available = new Set(availableFields)
  const missing = Object.entries(fields).filter(([field, value]) => !available.has(field)
    && !(allowDefaults && (value === '' || value === 0)))
  if (missing.length > 0) throw new Error(`当前蓝图 DataView 未正式输出节点 ${nodeId} 的字段：${missing.map(([field]) => field).join(', ')}`)
}

function command(input: {
  kind: ProjectBlueprintReplacementCommand['kind']
  item: FlatNode
  fields: WireFields
  previousParentNodeId?: string
}): ProjectBlueprintReplacementCommand {
  const { kind, item, fields, previousParentNodeId } = input
  return freeze({
    kind, nodeId: item.node.nodeId, parentNodeId: item.parentNodeId,
    ...(previousParentNodeId === undefined ? {} : {previousParentNodeId}),
    depth: item.depth, siblingIndex: item.siblingIndex, fields,
  })
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableValue(Reflect.get(value, key))}`).join(',')}}`
  }
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

function numericWireValue(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`项目蓝图 ${label} 不能为空`)
  return value
}

function assertOnlyKeys(value: unknown, allowed: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`)
  const unsupported = Object.keys(value).filter(key => !allowed.includes(key))
  if (unsupported.length > 0) throw new Error(`${label}包含 DataView wire 未承接字段：${unsupported.join(', ')}`)
}

function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return value
    seen.add(value)
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor && 'value' in descriptor) freeze(descriptor.value, seen)
    }
    Object.freeze(value)
  }
  return value
}
