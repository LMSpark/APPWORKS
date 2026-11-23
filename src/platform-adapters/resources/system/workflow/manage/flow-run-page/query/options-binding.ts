/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/query/options-binding
 * 职责：将本次办理选项响应交给同DataView只读查询，不复制候选缓存。
 */
import type {BindReadonlyCommandQueryOptions, DataView} from '@spark-appworks/spark-data'
import type {FlowRunPageClient, FlowRunHandleOptionParams} from '../flow-run-page-client'
import {isRecord} from '@spark-appworks/spark-utils'

type TargetCapture = (params: FlowRunHandleOptionParams) => () => void
function inputs(value: unknown): FlowRunHandleOptionParams {
  if (!isRecord(value)) throw Error('办理选项查询缺少输入')
  const result: Record<string, string> = {}
  for (const field of ['modelId', 'stepId', 'busRowId', 'formid']) {
    const item = value[field]
    if (typeof item !== 'string') throw Error(`办理选项输入${field}须为文本`)
    result[field] = item
  }
  if (!result['modelId']?.trim() || !result['stepId']?.trim()) throw Error('办理选项缺少正式模型或步骤')
  return result
}
export function createFlowRunOptionsBinding({view, client, guard, captureTarget}: Readonly<{view: DataView; client: Pick<FlowRunPageClient, 'getHandleOptionData'>; guard: () => void; captureTarget: TargetCapture}>): BindReadonlyCommandQueryOptions {
  const captures = new WeakMap<object, FlowRunHandleOptionParams>()
  return {
    resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'},
    derivedQueries: 'bound-view-only', guard,
    captureQueryInputs: (_view, params) => {
      guard()
      if (_view !== view) throw Error('办理选项不允许借用其它视图')
      const captured = inputs(view.queryContext)
      captures.set(params, captured)
      const assertTarget = captureTarget(captured)
      assertTarget()
      return () => {guard(); assertTarget(); const current = inputs(view.queryContext); if (Object.keys(captured).some(key => Reflect.get(captured, key) !== Reflect.get(current, key))) throw Error('办理选项查询输入已变化')}
    },
    loadRows: async (_view, params) => {
      const captured = captures.get(params)
      if (!captured) throw Error('办理选项缺少原查询捕获')
      const payload = await client.getHandleOptionData(captured)
      guard()
      return [{id: 'current', payload}]
    },
  }
}
