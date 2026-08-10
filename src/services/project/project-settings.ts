/**
 * @module app:services/project/project-settings
 * 职责：项目运行时设置（HTTP）与壳层 UI 偏好（localStorage）。
 * 边界：只处理 app 层配置读写，不修改 spark-project-model 协议。
 * AI用途：调整项目布局偏好或读取项目详情/导航元数据时，用本模块定位 HTTP 与 localStorage 接线。
 */
import type { PageMode } from '@spark-appworks/spark-app'
import type { RuntimeNavigation, RuntimeNavigationItem } from '@spark-appworks/spark-app'
import { isRecord, type NavigationRootPlacement } from '@spark-appworks/spark-utils'
import {
  lowcodeApi,
  readLowcodeRuntimeNavigation,
} from '@/lowcode/lowcode-runtime'

/** 项目详情：从后端 API 读取的项目元数据投影 */
export type ProjectDetail = {
  /** 租户 ID，多租户隔离标识 */
  tenantId: string
  /** 项目 ID，项目唯一标识 */
  projectId: string
  /** 项目名称 */
  name: string
  /** 项目类型（如 lowcode / procode 等） */
  projectType: string
  /** 项目图标资源标识 */
  icon: string
  /** 项目描述 */
  description: string
  /** 首页节点 ID，null 表示未配置首页 */
  homeNodeId: string | null
  /** 项目排序权重，数值越小越靠前 */
  order: number
}

/** 首页节点候选项，从导航树中筛选可配置为首页的节点 */
export type ProjectHomeNodeOption = {
  /** 节点 ID */
  id: string
  /** 节点标题 */
  title: string
  /** 节点路由路径 */
  path: string
  /** 组合标签："{title} — {path}"，用于下拉选择器展示 */
  label: string
}

/** 项目运行时设置：聚合项目详情、导航布局与首页候选列表，供 Shell 初始化使用 */
export type ProjectRuntimeSettings = {
  /** 项目详情元数据 */
  project: ProjectDetail
  /** 子页面放置位置：header=顶部标签栏 / sidebar=侧边栏 */
  childPlacement: NavigationRootPlacement
  /** 导航根模块 ID，null 表示导航未加载；用于保存布局时定位后端节点 */
  rootModuleId: string | null
  /** 可配置为首页的节点候选列表 */
  homeNodeOptions: ProjectHomeNodeOption[]
}

/** 保存项目运行时设置的输入参数，只包含用户可修改的字段 */
export type ProjectRuntimeSettingsInput = {
  /** 子页面放置位置 */
  childPlacement: NavigationRootPlacement
  /** 首页节点 ID，null 表示清除首页配置 */
  homeNodeId: string | null
}

const HOME_NODE_KINDS = new Set(['page', 'system-page', 'link'])

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function collectHomeNodeOptions(nodes: readonly RuntimeNavigationItem[]): ProjectHomeNodeOption[] {
  const rows: ProjectHomeNodeOption[] = []
  const walk = (list: readonly RuntimeNavigationItem[]): void => {
    for (const node of list) {
      const kind = node.itemKind ?? 'page'
      const path = node.path?.trim() ?? ''
      if (HOME_NODE_KINDS.has(kind) && path) {
        rows.push({
          id: node.id,
          title: node.title,
          path,
          label: `${node.title} — ${path}`,
        })
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return rows
}

function resolveRootModuleId(nav: RuntimeNavigation): string | null {
  const rootId = nav.id?.trim()
  if (!rootId) return null
  return rootId
}

export async function loadProjectRuntimeSettings(
  tenantId: string,
  projectId: string,
): Promise<ProjectRuntimeSettings> {
  const session = lowcodeApi.session.get()
  if (session?.enterprise.shortName !== tenantId) {
    throw new Error('lowcode 当前会话无权读取该企业应用设置')
  }
  const applications = await lowcodeApi.platform.listApplications()
  const application = applications.find((item) => item.id === projectId)
  if (application === undefined) throw new Error(`lowcode 应用不存在或无权访问：${projectId}`)
  const nav = await readLowcodeRuntimeNavigation(projectId)
  const project: ProjectDetail = {
    tenantId,
    projectId,
    name: application.name,
    projectType: application.isDefault ? 'homepage' : 'application',
    icon: '',
    description: application.description,
    homeNodeId: readOptionalString(nav.homePath),
    order: 0,
  }
  const placement = nav.childPlacement === 'sidebar' ? 'sidebar' : 'header'
  return {
    project,
    childPlacement: placement,
    rootModuleId: resolveRootModuleId(nav),
    homeNodeOptions: collectHomeNodeOptions(nav.items),
  }
}

/** 保存项目运行时设置的命令参数 */
export type SaveProjectRuntimeSettingsCommand = Readonly<{
  /** 租户 ID */
  tenantId: string
  /** 项目 ID */
  projectId: string
  /** 当前生效的运行时设置（用于 diff 判断哪些字段需要保存） */
  current: ProjectRuntimeSettings
  /** 用户修改后的输入参数 */
  input: ProjectRuntimeSettingsInput
}>

export function saveProjectRuntimeSettings(command: SaveProjectRuntimeSettingsCommand): Promise<void> {
  const { current, input } = command
  const homeChanged = (current.project.homeNodeId ?? '') !== (input.homeNodeId ?? '')
  const layoutChanged = current.childPlacement !== input.childPlacement

  if (homeChanged || layoutChanged) {
    return Promise.reject(new Error('lowcode 应用与导航写接口不满足写前镜像、journal、readback 与补偿门禁'))
  }
  return Promise.resolve()
}

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
