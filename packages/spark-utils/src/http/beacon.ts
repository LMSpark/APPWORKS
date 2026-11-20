/**
 * @module @spark-appworks/spark-utils:http/beacon
 * 职责：提供框架无关基础设施 beacon 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑 capability、HTTP、日志、脚本类型或历史快照。
 * 边界：保持底层工具包纯净，不依赖 Vue、spark-data 或应用壳层，也不承载业务配置。
 * AI用途：需要跨包复用基础能力或确认底层协议时，用本模块理解 http/beacon。
 */
/**
 * sendBeacon — 页面卸载期日志/埋点上报。
 *
 * 优先使用 navigator.sendBeacon，不可用时降级为 fetch + keepalive。
 */

export function sendBeacon(url: string, data: unknown, baseURL?: string): boolean {
  const fullUrl = baseURL !== undefined
    ? `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
    : url
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  const blob = new Blob([payload], { type: 'application/json' })

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const sent = navigator.sendBeacon(fullUrl, blob)
    if (sent) return true
  }

  if (typeof fetch !== 'function') {
    return false
  }

  void fetch(fullUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => undefined)
  return true
}
