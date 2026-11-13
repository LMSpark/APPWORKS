import { getDynamicRouter, getNavHomePath, refreshRoutes } from '@spark-appworks/spark-app'
import type { RouteLocationNormalized, NavigationGuardReturn } from 'vue-router'
import {
  activateLowcodeApplication,
  enterLowcodeApplicationCatalog,
  hasLowcodeSession,
  lowcodeApi,
  readLowcodePrincipal,
} from '@/lowcode/lowcode-runtime'
import {
  APPLICATION_CATALOG_PROJECT_ID,
  buildApplicationPath,
  parseApplicationPathScope,
} from '@/services/application-scope'

type ProjectNavigationGuardOptions = {
  publicPaths: ReadonlySet<string>
  publicHomePath: string
  isPlatformWorkspacePath: (path: string) => boolean
}

export class ProjectNavigationGuard {
  private activeNavigation: AbortController | null = null

  public constructor(private readonly options: ProjectNavigationGuardOptions) {}

  public async resolve(to: RouteLocationNormalized): Promise<NavigationGuardReturn> {
    this.activeNavigation?.abort()
    const controller = new AbortController()
    this.activeNavigation = controller
    lowcodeApi.platform.cancelPendingApplicationSelection()
    const isCurrent = (): boolean => !controller.signal.aborted
    try {
      const { publicPaths, publicHomePath, isPlatformWorkspacePath } = this.options
      const isPublicPath = publicPaths.has(to.path)
      const isPublicUtilityPath = isPublicPath && to.path !== publicHomePath && to.path !== '/login'

      if (!hasLowcodeSession()) {
        if (to.path.startsWith('/apps/') || isPlatformWorkspacePath(to.path)) return publicHomePath
        return isPublicPath ? undefined : publicHomePath
      }

      const principal = readLowcodePrincipal()
      const projectId = principal?.applicationId ?? APPLICATION_CATALOG_PROJECT_ID
      if (!principal || !projectId) return '/login'
      const currentScope = { projectId }
      if (isPublicUtilityPath) return undefined
      if (isPlatformWorkspacePath(to.path)) {
        if (principal.applicationId === null) return undefined
        return await this.select(to, APPLICATION_CATALOG_PROJECT_ID, controller)
      }
      if (!to.path.startsWith('/apps/')) return buildApplicationPath(currentScope, getNavHomePath())

      const urlScope = parseApplicationPathScope(to.path)
      if (urlScope && (urlScope.projectId !== projectId || getDynamicRouter()?.getApplicationNavTree()?.projectId !== urlScope.projectId)) {
        return await this.select(to, urlScope.projectId, controller)
      }
      return undefined
    } catch (error: unknown) {
      if (!isCurrent()) return false
      throw error
    }
  }

  /** 切换到目标应用或应用目录并重装路由，再以原地址（含 query/hash）重新进入。 */
  private async select(to: RouteLocationNormalized, projectId: string, controller: AbortController): Promise<NavigationGuardReturn> {
    const dynamic = getDynamicRouter()
    if (dynamic === null) throw new Error('当前应用路由缺少动态路由宿主，无法装配目标应用。')
    dynamic.assertPageRuntimesClean()
    const isCurrent = (): boolean => !controller.signal.aborted
    const receipt = projectId === APPLICATION_CATALOG_PROJECT_ID
      ? enterLowcodeApplicationCatalog()
      : await activateLowcodeApplication(projectId, controller.signal)
    if (!isCurrent()) return false
    receipt.assertCurrent()
    dynamic.resetSystemPageInstances()
    dynamic.disposePageRuntimes()
    await refreshRoutes()
    if (!isCurrent()) return false
    receipt.assertCurrent()
    const committed = dynamic.getApplicationNavTree()?.projectId
    if (committed !== projectId) {
      throw new Error(`导航归属不一致：目标应用 ${projectId}，当前导航 ${committed ?? '未装配'}`)
    }
    return { path: to.path, query: to.query, hash: to.hash, replace: true }
  }
}
