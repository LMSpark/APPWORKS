/**
 * @module @spark-appworks/spark-json-document:tree/tree-mutation
 * 职责：提供 JSON Document/schema 处理中的 tree mutation 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * tree/tree-mutation.ts — 树节点变更操作（纯函数，不可变）
 * ═══════════════════════════════════════════════════════════════
 */

import type { JsonValue, JsonDocument } from '../core/json-types'
import { isJsonObject, toPrimitive } from '../core/json-types'
import type { TreeModel, JsonNodeType, MutationResult, JsonTreePolicy, RenameNodeKeyInput, UpdateNodeTypeInput, AutoPopulateEntry } from './tree-types'
import { resolvePolicy } from './tree-policy'
import {
  unchanged,
  makeResult,
  removeSubtree,
  reindexChildren,
  collectSiblingKeys,
  addNodeToMap,
  getChildIds,
  inferNodeType,
  ensureUniqueObjectKey,
} from './tree-utils'
import { getNodePath } from './tree-build'

// ═══════════════════════════════════════════════════════════════
// 添加
// ═══════════════════════════════════════════════════════════════

/** 在容器节点内添加子项 */
export function addChildNode(model: TreeModel, uid: string, policy?: Partial<JsonTreePolicy>): MutationResult {
  const target = model.get(uid)
  if (!target || (target.type !== 'object' && target.type !== 'array')) return unchanged(model, uid)

  const p = resolvePolicy(policy)
  const path = getNodePath(model, uid)
  if (!p.canAddChild(path)) return unchanged(model, uid)
  const nodes = new Map(model)
  const existingChildren = getChildIds(model, uid)
  const nextOrder = existingChildren.length
  let newId: string

  if (target.type === 'array') {
    newId = addNodeToMap({
      nodes,
      value: p.createDefaultArrayItem(path),
      parentId: uid,
      segment: nextOrder,
      order: nextOrder,
    })
  } else {
    const nextKey = p.suggestChildKey(collectSiblingKeys(model, uid), path)
    newId = addNodeToMap({
      nodes,
      value: p.createDefaultObjectValue(path, nextKey),
      parentId: uid,
      segment: nextKey,
      order: nextOrder,
    })
  }
  return makeResult(nodes, newId, uid)
}

/** 在同级位置（后方）添加兄弟项 */
export function addSiblingNode(model: TreeModel, uid: string, policy?: Partial<JsonTreePolicy>): MutationResult {
  const target = model.get(uid)
  if (target?.parentId === undefined || target.parentId === null) return addChildNode(model, uid, policy)

  const parent = model.get(target.parentId)
  if (!parent) return unchanged(model, uid)
  const p = resolvePolicy(policy)
  const parentPath = getNodePath(model, parent.id)
  if (!p.canAddChild(parentPath)) return unchanged(model, uid)
  const nodes = new Map(model)
  let newId: string

  if (parent.type === 'array') {
    const newOrder = target.order + 1
    // 将 order >= newOrder 的现有兄弟后移
    for (const sibId of getChildIds(model, parent.id)) {
      const sib = nodes.get(sibId)
      if (sib && sib.order >= newOrder) {
        nodes.set(sib.id, { ...sib, order: sib.order + 1 })
      }
    }
    newId = addNodeToMap({
      nodes,
      value: p.createDefaultArrayItem(parentPath),
      parentId: parent.id,
      segment: newOrder,
      order: newOrder,
    })
    reindexChildren(nodes, parent.id)
  } else {
    const siblings = getChildIds(model, parent.id)
    const nextKey = p.suggestChildKey(collectSiblingKeys(model, parent.id), parentPath)
    newId = addNodeToMap({
      nodes,
      value: p.createDefaultObjectValue(parentPath, nextKey),
      parentId: parent.id,
      segment: nextKey,
      order: siblings.length,
    })
  }
  return makeResult(nodes, newId, parent.id)
}

// ═══════════════════════════════════════════════════════════════
// 删除
// ═══════════════════════════════════════════════════════════════

/** 删除节点（根节点和受保护节点不可删除） */
export function deleteNode(model: TreeModel, uid: string, policy?: Partial<JsonTreePolicy>): MutationResult {
  const target = model.get(uid)
  if (target?.parentId === undefined || target.parentId === null) return unchanged(model, uid)
  if (resolvePolicy(policy).isProtected(getNodePath(model, uid))) return unchanged(model, uid)

  const parent = model.get(target.parentId)
  if (!parent) return unchanged(model, uid)
  const nodes = new Map(model)

  removeSubtree(nodes, uid)
  if (parent.type === 'array') reindexChildren(nodes, parent.id)
  return makeResult(nodes, parent.id, parent.id)
}

// ═══════════════════════════════════════════════════════════════
// 重命名
// ═══════════════════════════════════════════════════════════════

/** 重命名对象键 */
export function renameNodeKey(input: RenameNodeKeyInput): MutationResult {
  const { model, uid, nextKeyInput, policy } = input
  const target = model.get(uid)
  if (!target) return unchanged(model, uid)
  if (!resolvePolicy(policy).canEditKey(getNodePath(model, uid))) return unchanged(model, uid)

  const nextKey = nextKeyInput.trim()
  if (nextKey.length === 0 || typeof target.segment !== 'string') return unchanged(model, uid)

  const parent = target.parentId !== null ? (model.get(target.parentId) ?? null) : null
  const uniqueKey = ensureUniqueObjectKey(
    parent ? collectSiblingKeys(model, parent.id) : {},
    nextKey, target.segment,
  )
  if (uniqueKey === target.segment) return unchanged(model, uid)

  const nodes = new Map(model)
  nodes.set(uid, { ...target, segment: uniqueKey })
  return makeResult(nodes, uid, parent?.id ?? null)
}

// ═══════════════════════════════════════════════════════════════
// 类型切换
// ═══════════════════════════════════════════════════════════════

/** 切换节点类型 */
export function updateNodeType(input: UpdateNodeTypeInput): MutationResult {
  const { model, uid, nextType, policy } = input
  const target = model.get(uid)
  if (!target) return unchanged(model, uid)
  if (!resolvePolicy(policy).canEditType(getNodePath(model, uid))) return unchanged(model, uid)

  const nodes = new Map(model)
  for (const c of getChildIds(nodes, uid)) removeSubtree(nodes, c)

  const isContainer = nextType === 'object' || nextType === 'array'
  const defaultValue = createValueByType(nextType)
  nodes.set(uid, {
    ...target, type: nextType,
    value: isContainer ? null : toPrimitive(defaultValue),
  })
  return makeResult(nodes, uid)
}

// ═══════════════════════════════════════════════════════════════
// 值替换
// ═══════════════════════════════════════════════════════════════

/** 直接替换节点值 */
export function updateNodeValue(model: TreeModel, uid: string, nextValue: JsonValue): MutationResult {
  const target = model.get(uid)
  if (!target) return unchanged(model, uid)

  const nodes = new Map(model)
  for (const c of getChildIds(nodes, uid)) removeSubtree(nodes, c)

  const newType = inferNodeType(nextValue)
  const isContainer = newType === 'object' || newType === 'array'
  if (isContainer) {
    // 重建子树
    if (Array.isArray(nextValue)) {
      nextValue.forEach((item, i) => addNodeToMap({ nodes, value: item, parentId: uid, segment: i, order: i }))
    } else if (isJsonObject(nextValue)) {
      let idx = 0
      for (const [k, v] of Object.entries(nextValue))
        addNodeToMap({ nodes, value: v, parentId: uid, segment: k, order: idx++ })
    }
    nodes.set(uid, { ...target, type: newType, value: null })
  } else {
    nodes.set(uid, { ...target, type: newType, value: toPrimitive(nextValue) })
  }
  return makeResult(nodes, uid)
}

// ═══════════════════════════════════════════════════════════════
// 自动填充
// ═══════════════════════════════════════════════════════════════

/**
 * 将 AutoPopulateEntry[] 应用到 JSON 文档上。
 *
 * - 沿 targetPath 导航到目标对象（中间不存在则跳过）
 * - 对 entries 中的每个 key：
 *   - 若不存在 → 直接写入
 *   - 若已存在且新旧值都是 object → 递归一层补缺
 *   - 否则跳过
 *
 * 返回 true 表示有实际变更。
 */
export function applyAutoPopulatePatches(
  doc: JsonDocument,
  patches: AutoPopulateEntry[],
): boolean {
  let modified = false
  for (const { targetPath, entries } of patches) {
    let target: unknown = doc
    for (const seg of targetPath) {
      if (typeof seg === 'number' && Array.isArray(target)) {
        target = target[seg]
      } else if (typeof seg === 'string' && isJsonObject(target)) {
        target = target[seg]
      } else {
        target = undefined
        break
      }
    }
    if (!isJsonObject(target)) continue

    for (const [key, value] of Object.entries(entries)) {
      if (key in target) {
        // 已存在 — 若新旧都是 object 则递归一层补缺
        if (isJsonObject(target[key]) && isJsonObject(value)) {
          const existing = target[key]
          for (const [subKey, subVal] of Object.entries(value)) {
            if (!(subKey in existing)) {
              existing[subKey] = subVal
              modified = true
            }
          }
        }
        continue
      }
      target[key] = value
      modified = true
    }
  }
  return modified
}

// ── 内部辅助 ──────────────────────────────────────────────────

function createValueByType(type: JsonNodeType): JsonValue {
  switch (type) {
    case 'object': return {}
    case 'array': return []
    case 'string': return ''
    case 'number': return 0
    case 'boolean': return false
    case 'null': return null
  }
}
