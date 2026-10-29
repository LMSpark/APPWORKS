/**
 * @module app:composables/useApplicationRouter
 * 职责：提供主应用 useApplicationRouter 能力，按应用 projectId 解析和构建前端路由。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 composables/useApplicationRouter。
 */
import { useRoute, useRouter } from 'vue-router'
import { buildApplicationPath, parseApplicationPathScope } from '@/services/application-scope'

/**
 * 应用路由工具 composable
 *
 * 所有路径操作都基于 /apps/:projectId/... 格式，
 * 不支持裸路径回退。
 */
export function useApplicationRouter() {
  const route = useRoute()
  const router = useRouter()

  /** 当前应用路径上下文（从路由参数提取） */
  function getApplicationScope(): { projectId: string } {
    const scope = parseApplicationPathScope(route.path)
    if (!scope) {
      throw new Error(`仅支持应用路径：期望 /apps/{projectId}，当前为 ${route.path}`)
    }
    return scope
  }

  /** 将相对路径转化为应用路径前缀完整路径 */
  function applicationPath(relativePath: string): string {
    return buildApplicationPath(getApplicationScope(), relativePath)
  }

  /** 确保页面路由已注册（应用路径前缀模式） */
  function ensureRouteExists(pid: string, namePrefix = 'page') {
    const applicationPrefixed = `/apps/:projectId/${pid}`
    const exists = router.getRoutes().some((r) => r.path === applicationPrefixed)
    if (!exists) {
      throw new Error(`页面路由尚未由导航树注册: ${namePrefix}-${pid}`)
    }
  }

  /** 导航到页面（自动注册路由 + 应用路径前缀跳转） */
  function navigateToPage(pid: string, namePrefix = 'page') {
    ensureRouteExists(pid, namePrefix)
    void router.push(applicationPath(`/${pid}`))
  }

  return {
    route,
    router,
    getApplicationScope,
    applicationPath,
    ensureRouteExists,
    navigateToPage,
  }
}
