/**
 * @module app:lowcode/resources/system/workflow/manage/flow-runtime-client
 * 职责：流程运行、运行详情、加签等运行态操作的 lowcode 入口占位。
 * 边界：运行命令与查询统一由此导出，Vue 不直接调用 HTTP 或 lowcodeApi。
 */
import {SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import {isRecord} from '@spark-appworks/spark-utils'
import {buildApplicationPath, type ApplicationPathScope} from '@/services/application-scope'

export const FLOW_MONITOR_SCENARIO_ID = 'E328FBBF518141973C575D612CD75151'

/** 待办/步骤/实例表单等运行台模型所在正式空间（lingmacn G0 与 E328 监控空间分离）。 */
export const FLOW_WORKBENCH_SCENARIO_ID = 'A5BADCEE11D2438CB9E75C2453A220A6'

export const FLOW_RUN_PAGE_PATH = '/features/workflow/flow-runtime/run-page/ui/flow-run-page'

export const FLOW_RUN_DETAIL_PATH = '/features/workflow/flow-runtime/detail/ui/flow-run-detail-page'

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

export type FlowRunPageRoute = Readonly<{
  path: string
  query: Required<FlowRuntimeRouteQuery> & Readonly<Record<string, string>>
}>

/** 组装办理页路由（监控/详情/工作台共用 wfid+flowid 合同）。 */
export function buildFlowRunPageRoute(query: unknown, scope?: ApplicationPathScope): FlowRunPageRoute {
  const parsed = readFlowRuntimeRouteQuery(query)
  const path = scope ? buildApplicationPath(scope, FLOW_RUN_PAGE_PATH) : FLOW_RUN_PAGE_PATH
  return {
    path,
    query: {
      ...parsed,
      [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: FLOW_MONITOR_SCENARIO_ID,
    },
  }
}

/** 组装运行详情页路由。 */
export function buildFlowRunDetailRoute(query: unknown, scope?: ApplicationPathScope): FlowRunPageRoute {
  const parsed = readFlowRuntimeRouteQuery(query)
  const path = scope ? buildApplicationPath(scope, FLOW_RUN_DETAIL_PATH) : FLOW_RUN_DETAIL_PATH
  return {
    path,
    query: {
      ...parsed,
      [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: FLOW_MONITOR_SCENARIO_ID,
    },
  }
}