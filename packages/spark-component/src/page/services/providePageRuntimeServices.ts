/**
 * @module @spark-appworks/spark-component:page/services/providePageRuntimeServices
 * 职责：提供 provide Page Runtime Services 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 构造页面运行时服务能力 payload 的工厂函数。
 *
 * 被 SparkPageRenderer 的 useRendererSetup 使用，避免重复构造相同对象。
 */

import type { RouteLocationRaw, Router } from 'vue-router'
import type { PageRuntimeServicesCapability } from '../../runtime'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import { stringifyPageRouteQuery } from './page-route-query'

type AppRouteObjectTarget = {
  path: string
  query?: Record<string, unknown>}

/**
 * 将页面运行时的轻量跳转参数转换为 vue-router 原生 RouteLocationRaw。
 *
 * 支持两条路径：
 * 1. 直接字符串：交给 router 解析完整路径。
 * 2. path + query 对象：先清洗 query，再构造标准路由位置对象。
 */
function toRouteLocation(to: string | AppRouteObjectTarget): RouteLocationRaw {
  if (typeof to === 'string') return to
  return {
    path: to.path,
    ...(to.query !== undefined ? { query: stringifyPageRouteQuery(to.query) } : {}),
  }
}

/**
 * 根据 vue-router 实例和 Logger 构建页面运行时服务 payload。
 */
export function buildPageRuntimeServices(
  router: Router,
  logger: LoggerApi
): PageRuntimeServicesCapability {
  return {
    router: {
      push: async (to) => await router.push(toRouteLocation(to)),
      replace: async (to) => await router.replace(toRouteLocation(to)),
      back: () => router.back(),
      get currentRoute() { return router.currentRoute.value },
    },
    logger
  }
}
