/**
 * @module app:services/application-scope
 * App 路由中的应用身份只由 projectId 表达。
 */
export type ApplicationPathScope = Readonly<{ projectId: string }>

/** 应用目录使用的项目 ID。 */
export const APPLICATION_CATALOG_PROJECT_ID = 'homepage'

const APPLICATION_PATH_PREFIX_RE = /^\/apps\/([^/]+)(?:\/|$)/
const APPLICATION_PATH_STRIP_RE = /^\/apps\/[^/]+/

export function parseApplicationPath(path: string): ApplicationPathScope | null {
  const match = APPLICATION_PATH_PREFIX_RE.exec(path)
  if (!match?.[1]) return null
  return { projectId: match[1] }
}

function normalizeSubPath(path: string): string {
  const trimmed = path.trim()
  if (trimmed.length === 0) return '/'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function stripApplicationPath(path: string): string {
  return path.replace(APPLICATION_PATH_STRIP_RE, '') || ''
}

export function buildApplicationRootPath(scope: ApplicationPathScope): string {
  return `/apps/${scope.projectId}`
}

export function buildApplicationPath(scope: ApplicationPathScope, subPath: string): string {
  const normalized = normalizeSubPath(subPath)
  if (parseApplicationPath(normalized) !== null) return normalized
  return `${buildApplicationRootPath(scope)}${normalized}`
}
