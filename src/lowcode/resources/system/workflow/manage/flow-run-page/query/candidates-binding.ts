/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/query/candidates-binding
 * 职责：从原办理选项查询按节点投影人员候选，供标准字段绑定消费。
 * 边界：不扩展空范围，不复制可编辑人员草稿，不查询人员目录或派发审批。
 */
import type {BindReadonlyCommandQueryOptions, DataRow, DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {parseFlowRunExecUsers} from '../flow-run-exec-users'
import {parseFlowRunHandleNodeOptions} from '../flow-run-handle-options'

export function createFlowRunCandidatesBinding({view, source, guard}: Readonly<{view: DataView; source: DataView; guard: () => void}>): BindReadonlyCommandQueryOptions {
  const captures = new WeakMap<object, () => DataRow[]>()
  const assertOwner = () => {
    guard()
    if (view.destroyed || source.destroyed || !view.dataSet || view.dataSet !== source.dataSet || view.dataSet.destroyed) throw Error('审批人员候选来源已失效')
  }
  return {
    resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'},
    guard: assertOwner,
    derivedQueries: 'bound-view-only',
    captureQueryInputs: (target, params) => {
      assertOwner()
      const nodeId = view.queryContext['nodeId']
      if (target !== view || typeof nodeId !== 'string' || !nodeId.trim()) throw Error('审批人员候选缺少原节点')
      const row = source.rows[0]
      if (source.rows.length !== 1 || !row || !isRecord(row['payload'])) throw Error('审批人员候选缺少唯一原选项结果')
      const assertSource = source.captureReadRow(row, ['payload'])
      const assertCurrent = () => {
        assertOwner(); assertSource()
        if (view.queryContext['nodeId'] !== nodeId) throw Error('审批人员候选节点已变化')
      }
      const read = () => {
        assertCurrent()
        const payload = row['payload']
        if (!isRecord(payload)) throw Error('审批人员候选来源无效')
        const config = parseFlowRunExecUsers(payload).find(item => item.nodeId === nodeId)
        if (!config) {
          if (parseFlowRunHandleNodeOptions(payload, ['nextNodes', 'NextNodeList', 'nextNodeList', 'nodes']).some(node => node.id === nodeId)) return []
          throw Error('审批节点未声明人员候选范围')
        }
        return config.users.map(user => ({id: user.id, name: user.name, value: `${user.id}:${user.name || user.id}`, nodeId}))
      }
      captures.set(params, read)
      assertCurrent()
      return assertCurrent
    },
    loadRows: (_target, params) => {
      const read = captures.get(params)
      if (!read) throw Error('审批人员候选缺少原查询捕获')
      return Promise.resolve(read())
    },
  }
}
