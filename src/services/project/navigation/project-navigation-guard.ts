import { getDynamicRouter, getNavHomePath } from '@spark-appworks/spark-app'
import { START_LOCATION, type RouteLocationNormalized, type NavigationGuardReturn, type RouteLocationRaw, type Router } from 'vue-router'
import {
  activateLowcodeApplication,
  enterLowcodeApplicationCatalog,
  hasLowcodeSession,
  lowcodeApi,
  readLowcodePrincipal,
} from '@/platform-adapters/lowcode-runtime'
import {
  APPLICATION_CATALOG_PROJECT_ID,
  buildApplicationPath,
  buildApplicationRootPath,
  parseApplicationPathScope,
  resolveExecutionProjectId,
  stripApplicationPath,
} from '@/services/application-scope'

type ProjectNavigationGuardOptions = {
  /** 在当前路由注册表解析恢复目标，确认其仍有实际匹配记录。 */
  router: Pick<Router, 'resolve'>
  publicPaths: ReadonlySet<string>
  publicHomePath: string
  isPlatformWorkspacePath: (path: string) => boolean
  /** 由仍有效的切换报告原始失败，供界面展示恢复原因。 */
  reportRecovery: (cause: unknown) => void
}

type DynamicRouter = NonNullable<ReturnType<typeof getDynamicRouter>>
type NavigationLocation = { location: RouteLocationRaw; assertCurrent: () => void; recovery?: { cause: unknown } }

type NavigationIntent = {
  signal: AbortSignal
  isCurrent: () => boolean
  assertCurrent: () => void
}

const catalogHome = buildApplicationPath({ projectId: APPLICATION_CATALOG_PROJECT_ID }, '/app-list')

export class ProjectNavigationGuard {
  private activeNavigation: AbortController | null = null
  private readonly prepared = new WeakMap<RouteLocationNormalized, NavigationLocation & { isCurrent: () => boolean }>()

  public constructor(private readonly options: ProjectNavigationGuardOptions) {}

  /** Runs only after Vue Router has checked that earlier navigation steps were not superseded. */
  public commit(to: RouteLocationNormalized): NavigationGuardReturn {
    const prepared = this.prepared.get(to)
    if (prepared === undefined) return undefined
    this.prepared.delete(to)
    if (!prepared.isCurrent()) return false
    prepared.assertCurrent()
    if (prepared.recovery !== undefined) this.options.reportRecovery(prepared.recovery.cause)
    return prepared.location
  }

  public async resolve(to: RouteLocationNormalized, from: RouteLocationNormalized): Promise<NavigationGuardReturn> {
    this.activeNavigation?.abort()
    const controller = new AbortController()
    this.activeNavigation = controller
    lowcodeApi.platform.cancelPendingApplicationSelection()

    const { publicPaths, publicHomePath, isPlatformWorkspacePath } = this.options
    const isPublicPath = publicPaths.has(to.path)
    if (!hasLowcodeSession()) {
      if (to.path.startsWith('/apps/') || isPlatformWorkspacePath(to.path)) return publicHomePath
      return isPublicPath ? undefined : publicHomePath
    }

    const principal = readLowcodePrincipal()
    if (!principal) return '/login'
    if (isPublicPath && to.path !== publicHomePath && to.path !== '/login') return undefined

    const authenticationIsCurrent = lowcodeApi.platform.captureAuthenticationScope()
    const isCurrent = (): boolean => !controller.signal.aborted && authenticationIsCurrent()
    const intent: NavigationIntent = {
      signal: controller.signal,
      isCurrent,
      assertCurrent() {
        if (!isCurrent()) throw new Error('应用导航意图已失效')
      },
    }
    const selectedProject = principal.applicationId ?? APPLICATION_CATALOG_PROJECT_ID
    const projectId = resolveExecutionProjectId(to.path)
    if (projectId === undefined) return buildApplicationRootPath({ projectId: selectedProject })
    const dynamic = getDynamicRouter()
    if (dynamic === null) throw new Error('当前应用路由缺少动态路由宿主，无法装配目标应用。')

    try {
      if (selectedProject !== projectId || dynamic.getApplicationNavTree()?.projectId !== projectId) {
        const prepared = await this.select(to, from, { projectId, dynamic, intent })
        if (!isCurrent()) return false
        this.prepared.set(to, { ...prepared, isCurrent })
        return undefined
      }
      return this.applicationHome(to, projectId, dynamic)
    } catch (cause: unknown) {
      if (!isCurrent()) return false
      throw cause
    }
  }

  private applicationHome(to: RouteLocationNormalized, projectId: string, dynamic: DynamicRouter): RouteLocationRaw | undefined {
    if (!parseApplicationPathScope(to.path) || stripApplicationPath(to.path).replace(/\//g, '') !== '') return undefined
    const path = dynamic.getApplicationNavTree()?.homePath ?? getNavHomePath()
    const home = this.options.router.resolve(buildApplicationPath({ projectId }, path))
    if (home.path === to.path || resolveExecutionProjectId(home.path) !== projectId || !this.isManagedLocation(home, dynamic)) {
      throw new Error('当前应用没有已登记的可用首页')
    }
    return { path: home.path, query: { ...to.query, ...home.query }, hash: home.hash || to.hash, replace: true }
  }

  private chooseProject(projectId: string, dynamic: DynamicRouter, intent: NavigationIntent) {
    const beforeCommit = (): void => {
      intent.assertCurrent()
      dynamic.assertPageRuntimesClean()
    }
    beforeCommit()
    if (projectId === APPLICATION_CATALOG_PROJECT_ID) return enterLowcodeApplicationCatalog()
    return activateLowcodeApplication(projectId, intent.signal, beforeCommit)
  }

  private async registerProject(projectId: string, dynamic: DynamicRouter, assertCurrent: () => void): Promise<void> {
    assertCurrent()
    dynamic.assertPageRuntimesClean()
    dynamic.resetSystemPageInstances()
    dynamic.disposePageRuntimes()
    await dynamic.refreshRoutes({ projectId, assertCurrent })
    assertCurrent()
    if (dynamic.getApplicationNavTree()?.projectId !== projectId) throw new Error('正式导航和应用选择的归属不一致')
  }

  private isManagedLocation(location: RouteLocationRaw, dynamic: DynamicRouter): boolean {
    const target = this.options.router.resolve(location)
    return target.matched.some(record => dynamic.getRegisteredRoutes().includes(record.path))
      && target.meta['type'] !== 'invalid-system-page' && target.meta['type'] !== 'invalid-config-page'
  }

  private async select(
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
    input: { projectId: string; dynamic: DynamicRouter; intent: NavigationIntent },
  ): Promise<NavigationLocation> {
    const { projectId, dynamic, intent } = input
    const starting = from === START_LOCATION && dynamic.getApplicationNavTree() === null
    let assertTargetCurrent: (() => void) | undefined
    try {
      const receipt = await this.chooseProject(projectId, dynamic, intent)
      assertTargetCurrent = (): void => {
        intent.assertCurrent()
        receipt.assertCurrent()
      }
      await this.registerProject(projectId, dynamic, assertTargetCurrent)
      const target = this.applicationHome(to, projectId, dynamic)
        ?? { path: to.path, query: to.query, hash: to.hash, replace: true }
      if (!this.isManagedLocation(target, dynamic)) throw new Error('目标页面未在当前人的正式导航中登记')
      return { location: target, assertCurrent: assertTargetCurrent }
    } catch (cause: unknown) {
      intent.assertCurrent()
      const sourceProject = resolveExecutionProjectId(from.path)
      if (assertTargetCurrent === undefined && !starting) {
        const principal = readLowcodePrincipal()
        // A superseded intent can select another application before replacing the source route.
        const sourceIsCurrent = principal !== null
          && (principal.applicationId ?? APPLICATION_CATALOG_PROJECT_ID) === sourceProject
          && dynamic.getApplicationNavTree()?.projectId === sourceProject
        if (sourceProject === undefined || sourceIsCurrent) throw cause
      }
      assertTargetCurrent?.()
      const failures = [cause]
      if (sourceProject !== undefined && from.matched.length > 0) {
        try {
          const assertCurrent = await this.restoreProject(sourceProject, dynamic, intent)
          const source = this.options.router.resolve(from.fullPath)
          if (this.isManagedLocation(source, dynamic) && source.matched.some((record, index) => record !== from.matched[index])) {
            return { location: { path: source.path, query: source.query, hash: source.hash, replace: true }, assertCurrent, recovery: { cause } }
          }
        } catch (sourceFailure: unknown) {
          intent.assertCurrent()
          failures.push(sourceFailure)
        }
      }
      const catalogLoaded = projectId === APPLICATION_CATALOG_PROJECT_ID && dynamic.getApplicationNavTree()?.projectId === projectId
      if (starting && projectId === APPLICATION_CATALOG_PROJECT_ID && !catalogLoaded) throw cause
      try {
        const assertCurrent = catalogLoaded && assertTargetCurrent
          ? assertTargetCurrent
          : await this.restoreProject(APPLICATION_CATALOG_PROJECT_ID, dynamic, intent)
        if (!this.isManagedLocation(catalogHome, dynamic)) throw new Error('应用目录入口未登记')
        return { location: { path: catalogHome, replace: true }, assertCurrent, recovery: { cause } }
      } catch (recovery: unknown) {
        intent.assertCurrent()
        const originalError = cause instanceof Error ? cause.message : String(cause)
        throw new AggregateError([...failures, recovery], `${originalError}，且无法重新装配应用目录`)
      }
    }
  }

  private async restoreProject(projectId: string, dynamic: DynamicRouter, intent: NavigationIntent): Promise<() => void> {
    const receipt = await this.chooseProject(projectId, dynamic, intent)
    const assertCurrent = (): void => {
      intent.assertCurrent()
      receipt.assertCurrent()
    }
    await this.registerProject(projectId, dynamic, assertCurrent)
    return assertCurrent
  }
}
