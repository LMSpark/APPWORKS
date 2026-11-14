/**
 * @module app:lowcode/resources/system/workflow/manage/flow-runtime-client
 * 职责：流程运行、运行详情、加签等运行态操作的 lowcode 入口占位。
 * 边界：运行命令与查询统一由此导出，Vue 不直接调用 HTTP 或 lowcodeApi。
 */
import {isRecord} from '@spark-appworks/spark-utils'

export type FlowRuntimeRouteQuery = Readonly<{
  wfid?: string
  flowid?: string
}>

function queryBag(query: unknown): Readonly<Record<string, unknown>> {
  return isRecord(query) ? query : {}
}

/** 解析流程监控/待办跳转的运行详情路由查询参数。 */
export function readFlowRuntimeRouteQuery(query: unknown): Required<FlowRuntimeRouteQuery> {
  const bag = queryBag(query)
  const wfid = String(bag['wfid'] ?? bag['Wfid'] ?? '').trim()
  const flowid = String(bag['flowid'] ?? bag['FlowID'] ?? bag['WFMID'] ?? '').trim()
  if (!wfid) throw new Error('缺少流程实例标识 wfid')
  if (!flowid) throw new Error('缺少流程模型标识 flowid')
  return {wfid, flowid}
}