/**
 * @module app:services/project/project-settings
 * 职责：按应用作用域把壳层 UI 偏好（头部优先、侧栏折叠、页脚、页面模式）读写到 localStorage。
 * 边界：只存本机偏好，不读写应用或导航的后端数据。
 * AI用途：调整壳层布局偏好的存储键或默认值时，用本模块定位 localStorage 接线。
 */
import type { PageMode } from '@spark-appworks/spark-app'
import { isRecord } from '@spark-appworks/spark-utils'

/** 项目 UI 偏好设置：持久化到 localStorage，不涉及后端 API */
export type ProjectUiSettings = {
  /** 是否优先展示顶部头部（header-first 布局） */
  headerFirst: boolean
  /** 侧边栏是否折叠 */
  sidebarCollapsed: boolean
  /** 是否显示页脚 */
  showFooter: boolean
  /** 页面模式：single=单页 / multi=多页标签 */
  pageMode: PageMode
}

export const PROJECT_UI_SETTINGS_STORAGE_PREFIX = 'spark-ui-settings'

export const DEFAULT_PROJECT_UI_SETTINGS: ProjectUiSettings = {
  headerFirst: false,
  sidebarCollapsed: false,
  showFooter: true,
  pageMode: 'multi',
}

function normalizeScopeKey(scopeKey: string | null | undefined): string | null {
  if (typeof scopeKey !== 'string') return null
  const trimmed = scopeKey.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function getProjectUiSettingsStorageKey(scopeKey: string | null): string {
  const normalized = normalizeScopeKey(scopeKey)
  return normalized === null
    ? PROJECT_UI_SETTINGS_STORAGE_PREFIX
    : `${PROJECT_UI_SETTINGS_STORAGE_PREFIX}:${normalized}`
}

function normalizeUiSettings(raw: unknown): ProjectUiSettings | null {
  if (!isRecord(raw)) return null
  return {
    headerFirst: typeof raw['headerFirst'] === 'boolean'
      ? raw['headerFirst']
      : DEFAULT_PROJECT_UI_SETTINGS.headerFirst,
    sidebarCollapsed: typeof raw['sidebarCollapsed'] === 'boolean'
      ? raw['sidebarCollapsed']
      : DEFAULT_PROJECT_UI_SETTINGS.sidebarCollapsed,
    showFooter: typeof raw['showFooter'] === 'boolean'
      ? raw['showFooter']
      : DEFAULT_PROJECT_UI_SETTINGS.showFooter,
    pageMode: raw['pageMode'] === 'single' || raw['pageMode'] === 'multi'
      ? raw['pageMode']
      : DEFAULT_PROJECT_UI_SETTINGS.pageMode,
  }
}

export function loadProjectUiSettings(scopeKey: string | null): ProjectUiSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_PROJECT_UI_SETTINGS }
    const raw = localStorage.getItem(getProjectUiSettingsStorageKey(scopeKey))
    if (raw === null) return { ...DEFAULT_PROJECT_UI_SETTINGS }
    return normalizeUiSettings(JSON.parse(raw)) ?? { ...DEFAULT_PROJECT_UI_SETTINGS }
  } catch {
    return { ...DEFAULT_PROJECT_UI_SETTINGS }
  }
}

export function saveProjectUiSettings(scopeKey: string | null, settings: ProjectUiSettings): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(getProjectUiSettingsStorageKey(scopeKey), JSON.stringify(settings))
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}
