import { useRoute, useRouter } from 'vue-router'
import { buildApplicationPath, parseApplicationPath } from '@/services/application-scope'

/** Routes registered from the current application's navigation tree. */
export function useProjectRouter() {
  const route = useRoute()
  const router = useRouter()

  function getProjectId(): string {
    const scope = parseApplicationPath(route.path)
    if (!scope) throw new Error(`应用页面路由缺少 projectId：${route.path}`)
    return scope.projectId
  }

  function projectPath(relativePath: string): string {
    return buildApplicationPath({ projectId: getProjectId() }, relativePath)
  }

  function ensureRouteExists(pageId: string, namePrefix = 'page') {
    const appPath = `/apps/:projectId/${pageId}`
    if (!router.getRoutes().some((item) => item.path === appPath)) {
      throw new Error(`页面路由尚未由导航树注册: ${namePrefix}-${pageId}`)
    }
  }

  function navigateToPage(pageId: string, namePrefix = 'page') {
    ensureRouteExists(pageId, namePrefix)
    void router.push(projectPath(`/${pageId}`))
  }

  return { route, router, getProjectId, projectPath, ensureRouteExists, navigateToPage }
}
