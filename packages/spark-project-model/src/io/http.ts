/**
 * @module @spark-appworks/spark-project-model:io/http
 * 职责：提供项目模型和页面配置域中的 http 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/** HTTP 客户端辅助：路径归一化、请求头拦截器。 */

import type { HttpClientBase, RequestInterceptor } from '@spark-appworks/spark-utils'

/** 去除 URL/路径尾部斜杠。 */
export function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

export function installHeaderInterceptor(
  http: HttpClientBase,
  getHeaders: (() => Record<string, string>) | undefined,
): void {
  if (getHeaders === undefined) return
  const interceptor: RequestInterceptor = {
    onRequest: (config) => {
      config.headers = { ...config.headers, ...getHeaders() }
      return config
    },
  }
  http.interceptors.request.use(interceptor)
}
