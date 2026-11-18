/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/query/candidates-binding
 * 职责：从原办理选项查询按节点投影人员候选，供标准字段绑定消费。
 * 边界：仅明确允许扩选时消费宿主已查询的正式目录；不复制可编辑人员草稿或派发审批。
 */
import type {BindReadonlyCommandQueryOptions, DataRow, DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {parseFlowRunExecUsers} from '../flow-run-exec-users'
import {parseFlowRunHandleNodeOptions} from '../flow-run-handle-options'

export function createFlowRunCandidatesBinding({view, source, guard, userDirectory, assigned, resourceId = 'workflow:approval-candidates'}: Readonly<{view: DataView; source: DataView; guard: () => void; userDirectory?: () => DataView; assigned?: DataView; resourceId?: 'workflow:approval-candidates' | 'workflow:append-candidates'}>): BindReadonlyCommandQueryOptions {
  const captures = new WeakMap<object, () => DataRow[]>()
  const assertOwner = () => {
    guard()
    if (view.destroyed || source.destroyed || !view.dataSet || view.dataSet !== source.dataSet || view.dataSet.destroyed) throw Error('审批人员候选来源已失效')
    if (assigned && (assigned.destroyed || assigned.dataSet !== view.dataSet)) throw Error('已有办理人来源已失效')
  }
  return {
    resource: {resourceType: 'logical-view', resourceId},
    guard: assertOwner,
    derivedQueries: 'bound-view-only',
    captureQueryInputs: (target, params) => {
      assertOwner()
      const nodeId = view.queryContext['nodeId']
      if (target !== view || typeof nodeId !== 'string' || !nodeId.trim()) throw Error('审批人员候选缺少原节点')
      const row = source.rows[0]
      if (source.rows.length !== 1 || !row) throw Error('审批人员候选缺少唯一原选项结果')
      const assertSource = source.captureReadRow(row, ['payload'])
      if (!isRecord(row['payload'])) throw Error('审批人员候选配置无效')
      const config = parseFlowRunExecUsers(row['payload']).find(item => item.nodeId === nodeId)
      const directory = config?.allowChange === true && (config.maxNum ?? 0) > 0 ? userDirectory?.() : undefined
      if (config?.allowChange === true && (config.maxNum ?? 0) > 0 && !directory) throw Error('允许扩选的节点缺少正式人员目录')
      const assertDirectory = directory?.captureReadResult()
      if (directory && (directory.queryConfig.allPages !== true || directory.queryConfig.maxRows !== undefined
        || directory.nextPageAvailable === true || directory.countReported === true && directory.total !== directory.rows.length)) throw Error('人员目录不是完整查询结果')
      const readable = directory?.rows.filter(user => ['rowid', 'UserName'].every(field => directory.fieldAccess(user, field).read === 'visible'))
      const proofs = directory && readable ? readable.map(user => directory.captureReadRow(user, ['rowid', 'UserName'])) : []
      const assertAssigned = assigned?.captureReadResult()
      const assignedRows = assigned?.rows ?? []
      if (assigned?.rows.some(item => assigned.fieldAccess(item, 'ReceiveUserId').read !== 'visible')) {
        throw Error('已有办理人身份不可读，无法安全追加办理人')
      }
      const assignedProofs = assigned ? assignedRows.map(item => assigned.captureReadRow(item, ['ReceiveUserId'])) : []
      const excluded = new Set(assignedRows.flatMap(item => {
        const id = item['ReceiveUserId']
        if (id === undefined || id === null || id === '') return []
        if (typeof id !== 'string') throw Error('已有办理人身份无效')
        return [id]
      }))
      const assertCurrent = () => {
        assertOwner(); assertSource()
        assertDirectory?.(); proofs.forEach(proof => proof())
        assertAssigned?.(); assignedProofs.forEach(proof => proof())
        if (directory && userDirectory?.() !== directory) throw Error('原人员目录实例已变化')
        if (view.queryContext['nodeId'] !== nodeId) throw Error('审批人员候选节点已变化')
      }
      const read = () => {
        assertCurrent()
        const payload = row['payload']
        if (!isRecord(payload)) throw Error('审批人员候选来源无效')
        if (!config) {
          if (parseFlowRunHandleNodeOptions(payload, ['nextNodes', 'NextNodeList', 'nextNodeList', 'nodes']).some(node => node.id === nodeId)) return []
          throw Error('审批节点未声明人员候选范围')
        }
        if ((config.maxNum ?? 0) < 1) return []
        const candidates = new Map<string, DataRow>(config.users.filter(user => !excluded.has(user.id)).map(user => {
          if (user.id.includes(':')) throw Error('办理人身份不能包含协议分隔符')
          return [user.id, {id: user.id, name: user.name, value: `${user.id}:${user.name || user.id}`, nodeId, isDefault: true}] as const
        }))
        if (readable) {
          const ids = new Set<string>()
          for (const user of readable) {
            const id = user['rowid'], name = user['UserName']
            if (typeof id !== 'string' || !id.trim() || id.includes(':') || ids.has(id)
              || typeof name !== 'string' || !name.trim()) throw Error('人员目录身份或姓名无效')
            ids.add(id)
            if (!candidates.has(id) && !excluded.has(id)) candidates.set(id, {id, name, value: `${id}:${name}`, nodeId, isDefault: false})
          }
        }
        return [...candidates.values()]
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
