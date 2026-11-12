/** Application Path Scope 的语义模型。 */
export type ApplicationPathScope = { projectId: string }

/** 未选中具体应用时的应用目录作用域项目 ID。 */
export const APPLICATION_CATALOG_PROJECT_ID = 'homepage'

/** 平台级工作台路由前缀；平台页与企业级页面同样以目录作用域执行。 */
export const PLATFORM_PATH_PREFIX = '/platform'

const APP_SCOPE_PREFIX_RE = /^\/apps\/([^/]+)(?:\/|$)/
const APP_SCOPE_STRIP_RE = /^\/apps\/[^/]+/

export function parseApplicationPathScope(path: string): ApplicationPathScope | null {
  const match = APP_SCOPE_PREFIX_RE.exec(path)
  return match?.[1] ? { projectId: match[1] } : null
}

/** 路由对应的执行项目：应用路径取其应用，平台路径取目录作用域；其它路径没有执行项目。 */
export function resolveExecutionProjectId(path: string): string | undefined {
  if (path === PLATFORM_PATH_PREFIX || path.startsWith(`${PLATFORM_PATH_PREFIX}/`)) return APPLICATION_CATALOG_PROJECT_ID
  return parseApplicationPathScope(path)?.projectId
}

function normalizeRouteSubPath(path: string): string {
  const trimmed = path.trim()
  if (trimmed.length === 0) return '/'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function stripApplicationPath(path: string): string {
  return path.replace(APP_SCOPE_STRIP_RE, '') || ''
}

export function buildApplicationRootPath(scope: ApplicationPathScope): string {
  return `/apps/${scope.projectId}`
}

export function buildApplicationPath(scope: ApplicationPathScope, subPath: string): string {
  const normalized = normalizeRouteSubPath(subPath)
  if (parseApplicationPathScope(normalized) !== null) return normalized
  return `${buildApplicationRootPath(scope)}${normalized}`
}

export function buildConfigPageNavigationPath(nodeId: string, scenarioId?: string): string {
  const query = new URLSearchParams()
  if (scenarioId) query.set('scenarioId', scenarioId)
  const parameters = query.toString()
  return `/__page/${encodeURIComponent(nodeId)}${parameters ? `?${parameters}` : ''}`
}
