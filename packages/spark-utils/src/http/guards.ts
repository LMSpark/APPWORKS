/**
 * @module @spark-appworks/spark-utils:http/guards
 * 职责：提供框架无关基础设施 guards 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑 capability、HTTP、日志、脚本类型或历史快照。
 * 边界：保持底层工具包纯净，不依赖 Vue、spark-data 或应用壳层，也不承载业务配置。
 * AI用途：需要跨包复用基础能力或确认底层协议时，用本模块理解 http/guards。
 */
import { isRecord } from '../internal/guards.js'
import type { RequestError } from './types.js'

export function isRequestError(value: unknown): value is RequestError {
  return value instanceof Error
    && value.name === 'RequestError'
    && isRecord(value)
    && isRecord(value['config'])
}
