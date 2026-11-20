/**
 * @module @spark-appworks/spark-component:page/services/page-route-query
 * 职责：统一页面服务和运行服务的路由查询参数转换。
 * 边界：仅处理 URL 标量和数组，不解析业务数据或推断空间身份。
 * AI用途：核查多空间跳转参数序列化及非法值时复用本模块。
 */
import type { LocationQueryRaw } from 'vue-router'

function queryValue(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  throw new Error('页面调用参数必须是标量或标量数组')
}

/** 转换页面路由参数，保留标量数组和空值，拒绝未序列化的对象。 */
export function stringifyPageRouteQuery(params: Record<string, unknown>): LocationQueryRaw {
  const query: LocationQueryRaw = {}
  for (const [key, value] of Object.entries(params)) {
    query[key] = Array.isArray(value) ? value.map((item: unknown) => queryValue(item)) : queryValue(value)
  }
  return query
}
