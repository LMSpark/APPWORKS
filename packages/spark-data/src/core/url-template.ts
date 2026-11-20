/**
 * @module @spark-appworks/spark-data:core/url-template
 * 职责：提供数据层 url-template 能力，围绕 ResolvedUrl 描述 DataSet、DataTable、DataView、策略委托或数据绑定键。
 * 边界：保持框架无关，只处理数据模型、校验和本地策略，不依赖 Vue、路由或 Element Plus。
 * AI用途：生成页面数据绑定、DataViewKey 或数据策略调用时，用本模块确认 core/url-template 的数据语义。
 */
/**
 * URL 模板解析工具
 *
 * 统一支持两种路径参数风格：
 * - Express 风格：`/users/:id/orders/:orderId`
 * - 花括号风格：`/users/{id}/orders/{orderId}`
 *
 * 解析后返回替换后的 URL 及未被模板消费的剩余参数。
 */

/** 匹配 `:param` 或 `{param}` 路径变量 */
const URL_PARAM_RE = /:(\w+)|\{(\w+)\}/g

export type ResolvedUrl = {
  /** 替换路径参数后的 URL */
  url: string
  /** 未被 URL 模板消费的剩余参数（可用于 query/body） */
  rest: Record<string, unknown>}

/**
 * 解析 URL 模板中的路径参数
 *
 * @param urlTemplate URL 模板（如 `/api/users/:id` 或 `/api/users/{id}`）
 * @param params      键值对，匹配的键会替换到 URL 中，未匹配的放入 `rest`
 * @returns 解析结果
 *
 * @example
 * ```ts
 * resolveUrlTemplate('/api/users/:id', { id: 42, name: 'Alice' })
 * // => { url: '/api/users/42', rest: { name: 'Alice' } }
 *
 * resolveUrlTemplate('/api/tree/{parentId}/children', { parentId: 'root', page: 1 })
 * // => { url: '/api/tree/root/children', rest: { page: 1 } }
 * ```
 */
export function resolveUrlTemplate(
  urlTemplate: string,
  params: Record<string, unknown> = {}
): ResolvedUrl {
  const usedKeys = new Set<string>()

  const url = urlTemplate.replace(URL_PARAM_RE, (match, colonKey?: string, braceKey?: string) => {
    const key = colonKey ?? braceKey ?? ''
    if (!key) return match
    const value = params[key]
    if (value !== undefined) {
      usedKeys.add(key)
      return encodeURIComponent(String(value))
    }
    // 参数未提供时保留原占位符（或返回空字符串，按业务约定）
    return match
  })

  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (!usedKeys.has(k) && v !== undefined) rest[k] = v
  }

  return { url, rest }
}
