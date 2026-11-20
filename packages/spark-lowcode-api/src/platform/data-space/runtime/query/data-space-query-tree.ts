/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-tree
 * 职责：规范化显式树查询参数。
 * 边界：SelfRefData可只指定集合输出；显式树参数必须完整，且不能与其他outputType冲突。
 * AI用途：生成明确关系字段、节点和查询方向。
 */
import type { DataSpaceQueryOptions } from '../data-space-runtime-contract'
import { DataViewQuery } from '@spark-appworks/spark-data'
import type { DataSpaceWireQueryOptions } from '../protocol/data-space-wire-contract'

export function encodeDataSpaceQueryTree(options: DataSpaceQueryOptions): Pick<DataSpaceWireQueryOptions, 'tree' | 'outputType'> {
  const {tree, outputType} = DataViewQuery.parse({tree: options.tree, outputType: options.outputType})
  if (tree === undefined) return outputType === undefined ? {} : {outputType}
  return { outputType: 'SelfRefData', tree: {
    keyField: tree.keyField.trim(), parentField: tree.parentField.trim(),
    nodeid: tree.nodeId.trim(), type: tree.mode ?? 'child',
    hasChildField: tree.hasChildrenField?.trim() ?? 'hasChild',
  } }
}
