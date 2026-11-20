/**
 * @module @spark-appworks/spark-json-document:tree/tree-utils
 * 职责：提供 JSON Document/schema 处理中的 tree utils 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * tree/tree-utils.ts — 树模型内部工具函数
 * ═══════════════════════════════════════════════════════════════
 */

import type { JsonValue, JsonObject } from '../core/json-types'
import { isJsonObject, toPrimitive } from '../core/json-types'
import type { JsonTreeNode, TreeModel, JsonNodeType, MutationResult } from './tree-types'

// ── UID 生成 ──────────────────────────────────────────────────

/** 基于 crypto.randomUUID 的 UID 生成器，消除全局计数器冲突风险 */
export function generateUid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

// ── 子节点查询 ────────────────────────────────────────────────

/** 按 order 排序返回某父节点的所有子节点 ID */
export function getChildIds(model: ReadonlyMap<string, JsonTreeNode>, parentId: string): string[] {
  const children: Array<{ id: string; order: number }> = []
  for (const node of model.values()) {
    if (node.parentId === parentId) children.push({ id: node.id, order: node.order })
  }
  children.sort((a, b) => a.order - b.order)
  return children.map(c => c.id)
}

// ── 类型推断 ──────────────────────────────────────────────────

export function inferNodeType(value: JsonValue): JsonNodeType {
  if (Array.isArray(value)) return 'array'
  if (isJsonObject(value)) return 'object'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'null'
}

// ── 通用工具 ──────────────────────────────────────────────────

export function objectKeyFromSegment(segment: string | number): string {
  return typeof segment === 'string' ? segment : String(segment)
}

// ── 根节点查找 ────────────────────────────────────────────────

/** 查找根节点 ID（parentId === null 的唯一节点） */
export function rootOf(model: TreeModel): string {
  for (const [id, node] of model) {
    if (node.parentId === null) return id
  }
  throw new Error('TreeModel has no root node')
}

// ── Mutation 辅助 ─────────────────────────────────────────────

export function unchanged(model: TreeModel, uid: string): MutationResult {
  return { model, focusId: uid, expandId: null }
}

export function makeResult(nodes: Map<string, JsonTreeNode>, focusId: string, expandId: string | null = null): MutationResult {
  return { model: nodes, focusId, expandId }
}

/** 递归移除子树 */
export function removeSubtree(nodes: Map<string, JsonTreeNode>, uid: string): void {
  const n = nodes.get(uid)
  if (!n) return
  for (const c of getChildIds(nodes, uid)) removeSubtree(nodes, c)
  nodes.delete(uid)
}

/** 修正数组子节点的 segment 和 order（插入/删除后） */
export function reindexChildren(nodes: Map<string, JsonTreeNode>, parentId: string): void {
  const children = getChildIds(nodes, parentId)
  for (let i = 0; i < children.length; i++) {
    const cid = children[i]
    if (!cid) continue
    const c = nodes.get(cid)
    if (c && (c.segment !== i || c.order !== i)) {
      nodes.set(c.id, { ...c, segment: i, order: i })
    }
  }
}

/** 收集父节点下所有字符串键（供 suggestChildKey 判重） */
export function collectSiblingKeys(model: TreeModel, parentId: string): JsonObject {
  const obj: JsonObject = {}
  for (const c of getChildIds(model, parentId)) {
    const ch = model.get(c)
    if (ch && typeof ch.segment === 'string') obj[ch.segment] = null
  }
  return obj
}

/** 将 JsonValue 子树递归写入 mutable nodes Map，返回节点 id */
export function addNodeToMap(input: {
  nodes: Map<string, JsonTreeNode>
  value: JsonValue
  parentId: string | null
  segment: string | number
  order: number
}): string {
  const { nodes, value, parentId, segment, order } = input
  const id = generateUid()
  const type = inferNodeType(value)
  const isContainer = type === 'object' || type === 'array'

  nodes.set(id, {
    id, parentId, segment, type,
    value: isContainer ? null : toPrimitive(value),
    order,
  })

  if (isContainer && Array.isArray(value)) {
    value.forEach((item, i) => addNodeToMap({ nodes, value: item, parentId: id, segment: i, order: i }))
  } else if (isContainer && isJsonObject(value)) {
    let idx = 0
    for (const [k, v] of Object.entries(value))
      addNodeToMap({ nodes, value: v, parentId: id, segment: k, order: idx++ })
  }

  return id
}

/** 将节点子树递归序列化回 JsonValue */
export function toJsonValue(nodes: ReadonlyMap<string, JsonTreeNode>, uid: string): JsonValue {
  const n = nodes.get(uid)
  if (!n) throw new Error(`toJsonValue: node "${uid}" not found`)
  const children = getChildIds(nodes, uid)
  if (n.type === 'array') return children.map(c => toJsonValue(nodes, c))
  if (n.type === 'object') {
    const obj: JsonObject = {}
    for (const c of children) {
      const ch = nodes.get(c)
      if (ch) obj[objectKeyFromSegment(ch.segment)] = toJsonValue(nodes, c)
    }
    return obj
  }
  return n.value
}

// ── 公共工具 ──────────────────────────────────────────────────

export function formatValuePreview(type: JsonNodeType, value: JsonValue, childCount: number): string {
  if (type === 'object') return `${childCount} 个字段`
  if (type === 'array') return `${childCount} 项`
  if (type === 'null') return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' ? value : ''
}

export function ensureUniqueObjectKey(
  target: JsonObject,
  preferred: string,
  currentKey?: string,
): string {
  const baseKey = preferred.trim() || 'newKey'
  if (baseKey === currentKey) return baseKey
  if (!(baseKey in target)) return baseKey
  let index = 1
  while (`${baseKey}${index}` in target) index += 1
  return `${baseKey}${index}`
}
