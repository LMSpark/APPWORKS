/**
 * @module app:lowcode/resources/system/workflow/manage/flow-http
 * 职责：Flow 控制器 AjaxResult 请求解包，供运行/加签客户端复用。
 */
import { LowcodeApiError } from '@/platform-adapters/api'
import type {HttpClientBase, Method} from '@spark-appworks/spark-utils'
import {isRecord} from '@spark-appworks/spark-utils'

export type FlowRequestScope = Readonly<{
  token: string
  headers: Readonly<Record<string, string>>
}>

type FlowRequestCommand = Readonly<{
  path: string
  method: Method
  data?: unknown
  params?: Readonly<Record<string, unknown>>
  headers?: Readonly<Record<string, string>>
}>

function unwrapFlowResult(response: unknown): unknown {
  if (!isRecord(response)) throw new LowcodeApiError(0, 'lowcode 响应不是 AjaxResult 对象')
  const code = response['Code']
  if (typeof code !== 'number') throw new LowcodeApiError(0, 'lowcode 响应缺少数字 Code')
  if (code !== 200) {
    const message = response['Message']
    throw new LowcodeApiError(code, typeof message === 'string' && message.trim() !== '' ? message : 'lowcode 请求失败')
  }
  return response['Result']
}

export async function requestFlowResult(http: HttpClientBase, command: FlowRequestCommand): Promise<unknown> {
  const response = await http.request<unknown>({
    url: command.path,
    method: command.method,
    ...(command.data === undefined ? {} : {data: command.data}),
    ...(command.params === undefined ? {} : {params: command.params}),
    ...(command.headers === undefined ? {} : {headers: command.headers}),
  })
  return unwrapFlowResult(response)
}

/** 写操作的显式否定结果不能被当成已确认成功；该响应不证明服务端未产生副作用。 */
export async function requestFlowOperationResult(http: HttpClientBase, command: FlowRequestCommand): Promise<void> {
  const result = await requestFlowResult(http, command)
  if (result === false) throw new Error('审批服务未确认操作成功')
}
