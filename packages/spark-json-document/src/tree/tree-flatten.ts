/**
 * @module @spark-appworks/spark-json-document:tree/tree-flatten
 * 职责：提供 JSON Document/schema 处理中的 tree flatten 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * tree/tree-flatten.ts — 平铺 ↔ 树往返管线
 * ═══════════════════════════════════════════════════════════════
 */

import type { JsonValue, JsonObject, JsonDocument } from '../core/json-types'
import { isJsonObject, toPrimitive } from '../core/json-types'
import type { JsonTreeNode, FlatJsonTreeDocument } from './tree-types'
import { generateUid, inferNodeType } from './tree-utils'

/**
 * 将 JsonDocument 展开为平铺行数组（带 UUID），用于编辑态。
 *
 * 不包含虚拟根节点——顶层条目的 parentId 为 null，根类型由 rootType 字段表达。
 */
export function flattenJsonDocumentForEdit(doc: JsonDocument): FlatJsonTreeDocument {
  const rootType: FlatJsonTreeDocument['rootType'] = Array.isArray(doc) ? 'array' : 'object'
  const rows: JsonTreeNode[] = []

  type JsonDocumentWalkInput = Readonly<{
    value: JsonValue
    parentId: string | null
    segment: string | number
    order: number
  }>

  function walk(input: JsonDocumentWalkInput): void {
    const { value, parentId, segment, order } = input
    const id = generateUid()
    const type = inferNodeType(value)
    const isContainer = type === 'object' || type === 'array'

    rows.push({
      id, parentId, segment, type,
      value: isContainer ? null : toPrimitive(value),
      order,
    })

    if (Array.isArray(value)) {
      value.forEach((item, i) => walk({ value: item, parentId: id, segment: i, order: i }))
    } else if (isJsonObject(value)) {
      let idx = 0
      for (const [k, v] of Object.entries(value)) walk({ value: v, parentId: id, segment: k, order: idx++ })
    }
  }

  if (Array.isArray(doc)) {
    doc.forEach((item, i) => walk({ value: item, parentId: null, segment: i, order: i }))
  } else {
    let idx = 0
    for (const [k, v] of Object.entries(doc)) walk({ value: v, parentId: null, segment: k, order: idx++ })
  }

  return { rootType, rows }
}

/**
 * 从平铺行还原 JsonDocument。按 `order` 字段排序同级子节点。
 *
 * 失败快速：parentId 指向不存在的节点时抛异常。
 */
export function restoreJsonDocumentFromFlat(flat: FlatJsonTreeDocument): JsonDocument {
  const { rows, rootType } = flat
  const idMap = new Map<string, JsonTreeNode>()
  const childrenMap = new Map<string | null, JsonTreeNode[]>()

  for (const row of rows) {
    idMap.set(row.id, row)
    const siblings = childrenMap.get(row.parentId)
    if (siblings) siblings.push(row)
    else childrenMap.set(row.parentId, [row])
  }

  for (const row of rows) {
    if (row.parentId !== null && !idMap.has(row.parentId)) {
      throw new Error(`restoreJsonDocumentFromFlat: missing parent "${row.parentId}"`)
    }
  }

  for (const siblings of childrenMap.values()) {
    siblings.sort((a, b) => a.order - b.order)
  }

  function buildValue(row: JsonTreeNode): JsonValue {
    const children = childrenMap.get(row.id)
    if (row.type === 'array') return (children ?? []).map(c => buildValue(c))
    if (row.type === 'object') {
      const obj: JsonObject = {}
      for (const c of children ?? []) {
        const key = typeof c.segment === 'string' ? c.segment : String(c.segment)
        obj[key] = buildValue(c)
      }
      return obj
    }
    return row.value
  }

  const roots = childrenMap.get(null) ?? []
  if (rootType === 'array') {
    const items: JsonValue[] = roots.map(r => buildValue(r))
    return items
  }
  const obj: JsonObject = {}
  for (const r of roots) {
    const key = typeof r.segment === 'string' ? r.segment : String(r.segment)
    obj[key] = buildValue(r)
  }
  return obj
}

/**
 * 便捷入口：按 originalData 的类型还原（对象 → 对象，数组 → 数组）。
 */
export function restoreJsonDocumentByOriginalType(
  rows: JsonTreeNode[],
  originalData: JsonDocument,
): JsonDocument {
  const rootType: FlatJsonTreeDocument['rootType'] = Array.isArray(originalData) ? 'array' : 'object'
  return restoreJsonDocumentFromFlat({ rootType, rows })
}
