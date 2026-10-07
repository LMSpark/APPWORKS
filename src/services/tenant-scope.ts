/**
 * @module app:services/tenant-scope
 * 职责：提供主应用 tenant-scope 能力，围绕 TenantProjectScope 连接视图、服务、布局、路由或平台租户流程。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 services/tenant-scope。
 */
/** Tenant Project Scope 的语义模型。 */
export type TenantProjectScope = {
    /** tenant Id 标识。 */
tenantId: string
    /** project Id 标识。 */
projectId: string}

/** 未选中具体应用时的"应用目录/工场"作用域项目 ID，出现在 /t/{tenantId}/homepage 路径中。 */
export const APPLICATION_CATALOG_PROJECT_ID = 'homepage'

const TENANT_SCOPE_PREFIX_RE = /^\/t\/([^/]+)\/([^/]+)(?:\/|$)/
const TENANT_SCOPE_STRIP_RE = /^\/t\/[^/]+\/[^/]+/

export function parseTenantScope(path: string): TenantProjectScope | null {
  const match = TENANT_SCOPE_PREFIX_RE.exec(path)
  if (!match?.[1] || !match[2]) return null
  return {
    tenantId: match[1],
    projectId: match[2],
  }
}

function normalizeRouteSubPath(path: string): string {
  const trimmed = path.trim()
  if (trimmed.length === 0) return '/'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function stripTenantScope(path: string): string {
  return path.replace(TENANT_SCOPE_STRIP_RE, '') || ''
}

export function buildTenantRootPath(scope: TenantProjectScope): string {
  return `/t/${scope.tenantId}/${scope.projectId}`
}

export function buildTenantPath(scope: TenantProjectScope, subPath: string): string {
  const normalized = normalizeRouteSubPath(subPath)
  if (parseTenantScope(normalized) !== null) return normalized
  return `${buildTenantRootPath(scope)}${normalized}`
}
