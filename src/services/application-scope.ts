/** Application Path Scope 的语义模型。 */
export type ApplicationPathScope = { projectId: string }

/** 未选中具体应用时的应用目录作用域项目 ID。 */
export const APPLICATION_CATALOG_PROJECT_ID = 'homepage'

const APP_SCOPE_PREFIX_RE = /^\/apps\/([^/]+)(?:\/|$)/
const APP_SCOPE_STRIP_RE = /^\/apps\/[^/]+/

export function parseApplicationPathScope(path: string): ApplicationPathScope | null {
  const match = APP_SCOPE_PREFIX_RE.exec(path)
  return match?.[1] ? { projectId: match[1] } : null
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
