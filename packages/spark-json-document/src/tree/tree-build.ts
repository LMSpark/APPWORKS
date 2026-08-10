/**
 * @module @spark-appworks/spark-json-document:tree/tree-build
 * 职责：提供 JSON Document/schema 处理中的 tree build 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * tree/tree-build.ts — TreeModel 构建 / 导出 / 显示行
 * ═══════════════════════════════════════════════════════════════
 */

import type { JsonDocument } from '../core/json-types'
import { isJsonObject } from '../core/json-types'
import type { JsonPath } from '../core/json-path'
import type { TreeModel, JsonTreeNode, TreeDisplayNode, JsonTreePolicy } from './tree-types'
import { resolvePolicy } from './tree-policy'
import { addNodeToMap, toJsonValue, getChildIds, rootOf } from './tree-utils'

// ═══════════════════════════════════════════════════════════════
// 构建
// ═══════════════════════════════════════════════════════════════

/** 从 JSON 文档构建内部树模型 */
export function buildTreeModel(doc: JsonDocument, policy?: Partial<JsonTreePolicy>): TreeModel {
  const nodes = new Map<string, JsonTreeNode>()
  addNodeToMap({
    nodes,
    value: doc,
    parentId: null,
    segment: resolvePolicy(policy).rootLabel,
    order: 0,
  })
  return nodes
}

// ═══════════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════════

/** 从 TreeModel 重建 JSON 文档 */
export function exportJsonDocument(model: TreeModel): JsonDocument {
  const value = toJsonValue(model, rootOf(model))
  if (Array.isArray(value) || isJsonObject(value)) return value
  throw new Error('文档根节点必须是对象或数组')
}

// ═══════════════════════════════════════════════════════════════
// 显示行
// ═══════════════════════════════════════════════════════════════

/** 将 TreeModel 展开为平坦行数组（深度优先序） */
export function toDisplayRows(model: TreeModel, policy?: Partial<JsonTreePolicy>): TreeDisplayNode[] {
  const p = resolvePolicy(policy)
  const rows: TreeDisplayNode[] = []

  function walk(uid: string, depth: number, path: JsonPath): void {
    const node = model.get(uid)
    if (!node) return
    const children = getChildIds(model, uid)
    rows.push({
      ...node, depth, path,
      childCount: children.length,
      keyEditable: p.canEditKey(path),
      typeEditable: p.canEditType(path),
      deletable: depth > 0 && !p.isProtected(path),
    })
    for (const childId of children) {
      const ch = model.get(childId)
      if (ch) walk(childId, depth + 1, [...path, ch.segment])
    }
  }

  walk(rootOf(model), 0, [])
  return rows
}

/**
 * 便捷入口：直接将对象/数组文档展开为平坦树行。
 */
export function buildJsonTreeRows(doc: JsonDocument, policy?: Partial<JsonTreePolicy>): TreeDisplayNode[] {
  return toDisplayRows(buildTreeModel(doc, policy), policy)
}

// ═══════════════════════════════════════════════════════════════
// 路径
// ═══════════════════════════════════════════════════════════════

/** 从根到目标节点重建 JsonPath */
export function getNodePath(model: TreeModel, uid: string): JsonPath {
  const segments: Array<string | number> = []
  let current = model.get(uid)
  while (current?.parentId !== undefined && current.parentId !== null) {
    segments.unshift(current.segment)
    current = model.get(current.parentId)
  }
  return segments
}

// ═══════════════════════════════════════════════════════════════
// 过滤
// ═══════════════════════════════════════════════════════════════

/** 过滤树行，保留命中行及其所有祖先 */
export function filterJsonTreeNodes<T extends Pick<JsonTreeNode, 'id' | 'parentId'>>(
  rows: T[],
  predicate: (row: T) => boolean,
): T[] {
  const parentMap = new Map<string, string | null>()
  for (const row of rows) {
    parentMap.set(row.id, row.parentId)
  }

  const matchedIds = new Set<string>()
  for (const row of rows) {
    if (!predicate(row)) continue
    let currentId: string | null = row.id
    while (currentId !== null && !matchedIds.has(currentId)) {
      matchedIds.add(currentId)
      currentId = parentMap.get(currentId) ?? null
    }
  }

  return rows.filter((r) => matchedIds.has(r.id))
}
