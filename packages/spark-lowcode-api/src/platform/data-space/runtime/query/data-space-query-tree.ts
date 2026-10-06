/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-tree
 * 职责：规范化显式树查询参数。
 * 边界：SelfRefData 必须带树参数，且不能与其他 outputType 冲突。
 * AI用途：生成明确关系字段、节点和查询方向。
 */
import type { DataSpaceQueryOptions } from '../data-space-runtime-contract'
import type { DataSpaceWireQueryOptions } from '../protocol/data-space-wire-contract'

function requireTreeText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`SPARK 树查询 ${field} 必须是非空字符串`)
  return value.trim()
}

function isTreeRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function encodeDataSpaceQueryTree(options: DataSpaceQueryOptions): Pick<DataSpaceWireQueryOptions, 'tree' | 'outputType'> {
  const tree: unknown = options.tree
  if (tree === undefined) {
    if (options.outputType === 'SelfRefData') throw new TypeError('SPARK 树查询必须显式提供 tree')
    return options.outputType ? { outputType: options.outputType } : {}
  }
  if (!isTreeRecord(tree)) throw new TypeError('SPARK 树查询 tree 必须是对象')
  if (options.outputType !== undefined && options.outputType !== 'SelfRefData') throw new TypeError('SPARK 树查询与指定的 outputType 冲突')
  const mode = tree['mode'] ?? 'child'
  if (mode !== 'child' && mode !== 'parent') throw new TypeError('SPARK 树查询 mode 只支持 child 或 parent')
  return { outputType: 'SelfRefData', tree: {
    keyField: requireTreeText(tree['keyField'], 'keyField'), parentField: requireTreeText(tree['parentField'], 'parentField'),
    nodeid: requireTreeText(tree['nodeId'], 'nodeId'), type: mode,
    hasChildField: tree['hasChildrenField'] === undefined ? 'hasChild' : requireTreeText(tree['hasChildrenField'], 'hasChildrenField'),
  } }
}
