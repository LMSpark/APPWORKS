import type { DataSpaceQueryOptions, DataSpaceWireQueryOptions } from '../formal-table-contract'
import { DataViewQuery } from '../data-view-query'

export function encodeDataSpaceQueryTree(options: DataSpaceQueryOptions): Pick<DataSpaceWireQueryOptions, 'tree' | 'outputType'> {
  const {tree, outputType} = DataViewQuery.parse({tree: options.tree, outputType: options.outputType})
  if (tree === undefined) return outputType === undefined ? {} : {outputType}
  return {outputType: 'SelfRefData', tree: {
    keyField: tree.keyField.trim(), parentField: tree.parentField.trim(),
    nodeid: tree.nodeId.trim(), type: tree.mode ?? 'child',
    hasChildField: tree.hasChildrenField?.trim() ?? 'hasChild',
  }}
}
