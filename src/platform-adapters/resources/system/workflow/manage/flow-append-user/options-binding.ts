/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/options-binding
 * 职责：通过原步骤证明查询追加候选配置，保留原响应并匹配明确节点。
 * 边界：只读语义资源；不猜首配置、权限、节点或人数，不派发写命令。
 */
import type {BindReadonlyCommandQueryOptions, DataRow, DataView} from '@spark-appworks/spark-data'
import {captureFlowAppendStep} from './flow-append-user-list'
import type {FlowAppendUserContext} from './flow-append-user-records'
import {parseFlowRunExecUsers} from '../flow-run-page/flow-run-exec-users'

export function createFlowAppendOptionsBinding({view, source, guard, client}: Readonly<{
  view: DataView; source: DataView; guard: () => void
  client: Readonly<{getExecutionUsers: (context: FlowAppendUserContext) => Promise<readonly unknown[]>}>
}>): BindReadonlyCommandQueryOptions {
  const captures = new WeakMap<object, () => Promise<DataRow[]>>()
  return {resource: {resourceType: 'logical-view', resourceId: 'workflow:append-options'}, guard, derivedQueries: 'bound-view-only',
    captureQueryInputs: (target, params) => {
      guard()
      const keys = ['stepId', 'flowObjectId', 'upNodeId', 'nodeId', 'lastStepId'] as const
      const context = Object.fromEntries(keys.map(key => [key, view.queryContext[key]]))
      if (target !== view || view.dataSet !== source.dataSet || keys.some(key => typeof context[key] !== 'string' || key !== 'lastStepId' && !String(context[key]).trim())) throw Error('追加候选缺少完整原目标')
      const input = {rowid: String(context['stepId']), WFOBJID: String(context['flowObjectId']), SendNodeModelId: String(context['upNodeId']), ReceiveNodeModelId: String(context['nodeId']), LastStepID: String(context['lastStepId']), TITLE: ''}
      const assertParent = captureFlowAppendStep(source, input)
      const assertCurrent = () => {
        guard(); assertParent()
        if (view.destroyed || keys.some(key => view.queryContext[key] !== context[key])) throw Error('原追加候选目标已变化')
      }
      captures.set(params, async () => {
        assertCurrent()
        const payload = {execUser: await client.getExecutionUsers(input)}
        assertCurrent()
        const config = parseFlowRunExecUsers(payload).find(item => item.nodeId === input.ReceiveNodeModelId)
        if (!config) throw Error('服务未返回当前节点的追加配置')
        return [{id: 'current', payload, nodeId: config.nodeId, minNum: config.minNum ?? 0, maxNum: config.maxNum ?? 0, allowChange: config.allowChange === true}]
      })
      return assertCurrent
    }, loadRows: (_target, params) => {
      const read = captures.get(params)
      if (!read) throw Error('追加候选缺少原查询捕获')
      return read()
    }}
}
