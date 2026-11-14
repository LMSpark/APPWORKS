/**
 * @module app:views/features/workflow/flow-runtime/run-page/model/flow-run-business-tab
 * 职责：办理页业务页签路由解析与业务组件暴露注册。
 */
import type {RouteLocationResolved} from 'vue-router'

export type FlowRunBusinessTab = Readonly<{
  tabKey: string
  cacheKey: string
  label: string
  sourcePath: string
  routePath: string
  routeFound: boolean
  routeLocation: RouteLocationResolved | null
  routeError: string
}>

export type FlowRunBusinessTabSeed = Readonly<{
  tabKey: string
  label: string
  sourcePath: string
  queryString: string
}>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeRoutePath(sourcePath: string): string {
  const text = normalizeText(sourcePath)
  if (!text) return ''
  if (text.startsWith('/')) return text.replace(/\/+$/, '') || '/'
  const stripped = text.replace(/^\.\//, '').replace(/^src\/views/, '')
  const withSlash = stripped.startsWith('/') ? stripped : `/${stripped.replace(/^views\//, '')}`
  return withSlash.replace(/\.vue$/i, '').replace(/\\/g, '/')
}

function parseQueryString(queryString: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(normalizeText(queryString))) {
    result[key] = value
  }
  return result
}

export function createFlowBusinessTabBuilder(getRegisteredRoutePaths: () => ReadonlySet<string>) {
  return (seed: FlowRunBusinessTabSeed, router: {resolve: (to: {path: string; query?: Record<string, string>}) => RouteLocationResolved}): FlowRunBusinessTab => {
    const sourcePath = normalizeText(seed.sourcePath)
    const routePath = normalizeRoutePath(sourcePath)
    const routeFound = Boolean(routePath && getRegisteredRoutePaths().has(routePath))
  const routeError = routeFound ? '' : `${sourcePath || '（空）'} 未在当前应用注册`
    const routeLocation = routeFound
      ? router.resolve({path: routePath, query: parseQueryString(seed.queryString)})
      : null
    return {
      tabKey: seed.tabKey,
      cacheKey: `${seed.tabKey}:${routePath || sourcePath}?${seed.queryString}`,
      label: seed.label,
      sourcePath,
      routePath,
      routeFound,
      routeLocation,
      routeError,
    }
  }
}

export type FlowRunBusinessPageExpose = Readonly<{
  flowSubmit?: () => boolean | void | string | Promise<boolean | void | string>
  flowSubmitEnd?: (payload: unknown) => boolean | void | string | Promise<boolean | void | string>
  flowSubmitFailed?: (payload: unknown) => void
  flowSubmitSucceeded?: (payload: unknown) => void | Promise<void>
}>

export function createFlowBusinessPageRegistry<T extends FlowRunBusinessPageExpose = FlowRunBusinessPageExpose>() {
  const instances = new Map<string, T | null>()
  return {
    get: (key: string) => instances.get(key) ?? null,
    set: (key: string, instance: T | null) => (instance ? instances.set(key, instance) : instances.delete(key)),
    clear: () => instances.clear(),
  }
}

export function readRegisteredVuePagePaths(pages: readonly {path?: string}[]): Set<string> {
  const paths = new Set<string>()
  for (const page of pages) {
    const text = normalizeText(page.path)
    if (text) paths.add(text)
  }
  return paths
}