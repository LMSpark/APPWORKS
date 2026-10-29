/**
 * @module app:services/project/project-shell
 * 职责：App 层项目壳——committed ProjectWorkspace 缓存、项目蓝图工作区单例、运行菜单同步、项目切换 inject。
 * 边界：不进入 spark-project-model 内核；DevSystem 编辑宿主与 committed 投影分离。
 * AI用途：切换项目、同步运行菜单或获取 committed ProjectWorkspace 单例时，用本模块定位壳层服务。
 */
import type { InjectionKey } from 'vue'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import type { LowcodeApplicationSelectionReceipt } from '@spark-appworks/spark-lowcode-api'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { getNavTree, refreshRoutes } from '@spark-appworks/spark-app'
import {
  createLowcodeProjectGateways,
  readLowcodePrincipal,
} from '@/lowcode/lowcode-runtime'
import { APPLICATION_CATALOG_PROJECT_ID } from '@/services/application-scope'
import {loadLowcodeScenarioDefinitions} from '@/lowcode/data-space/lowcode-data-space-runtime'

// --- project-switch ---

/** Project Switch Service 的语义模型。 */
export type ProjectSwitchService = {
  /** 切换到指定项目并刷新壳层导航；projectId 为目标项目标识，切换后会重新加载路由和 ProjectWorkspace。 */
  switchAndReload(projectId: string): Promise<LowcodeApplicationSelectionReceipt>
}

export const PROJECT_SWITCH_KEY: InjectionKey<ProjectSwitchService> = Symbol('project-switch')

// --- project-workspace ---

/** Project Workspace Scope 的语义模型。 */
export type ProjectWorkspaceScope = {
  /** 应用 ID，标识 ProjectWorkspace 绑定的应用；未提供时回退到用户当前应用或 homepage。 */
  projectId: string
}

type ProjectApiScope = Partial<ProjectWorkspaceScope>

const projectWorkspaces = new Map<string, ProjectWorkspace>()
const projectBlueprintWorkspaces = new Map<string, ProjectWorkspace>()

function resolveProjectScope(scope?: Partial<ProjectApiScope>): ProjectWorkspaceScope {
  const principal = readLowcodePrincipal()
  const scopedProjectId = scope?.projectId?.trim()
  const projectId = scopedProjectId && scopedProjectId.length > 0
    ? scopedProjectId
    : (principal?.applicationId ?? APPLICATION_CATALOG_PROJECT_ID)
  return { projectId }
}

function toScopeKey(scope: ProjectWorkspaceScope): string {
  return scope.projectId
}

function createScopedProjectWorkspace(scope: ProjectWorkspaceScope): ProjectWorkspace {
  const workspace = new ProjectWorkspace({
    projectId: scope.projectId,
    ...createLowcodeProjectGateways(scope.projectId),
    scenarioDefinitions: loadLowcodeScenarioDefinitions,
  })
  workspace.project.replaceProjectInfo({
    projectId: scope.projectId,
  })
  return workspace
}

export function getAppProjectWorkspace(scope?: string | Partial<ProjectApiScope>): ProjectWorkspace {
  const resolvedScope = typeof scope === 'string'
    ? resolveProjectScope({ projectId: scope })
    : resolveProjectScope(scope)
  const key = toScopeKey(resolvedScope)
  let workspace = projectWorkspaces.get(key)
  if (workspace === undefined) {
    workspace = createScopedProjectWorkspace(resolvedScope)
    projectWorkspaces.set(key, workspace)
  }
  return workspace
}

export function getAppProjectBlueprintWorkspace(
  scope?: string | Partial<ProjectApiScope>,
): ProjectWorkspace {
  const resolvedScope = typeof scope === 'string'
    ? resolveProjectScope({ projectId: scope })
    : resolveProjectScope(scope)
  const key = toScopeKey(resolvedScope)
  let workspace = projectBlueprintWorkspaces.get(key)
  if (workspace === undefined) {
    workspace = createScopedProjectWorkspace(resolvedScope)
    projectBlueprintWorkspaces.set(key, workspace)
  }
  return workspace
}

export function resetAppProjectWorkspace(): void {
  for (const workspace of new Set([...projectWorkspaces.values(), ...projectBlueprintWorkspaces.values()])) workspace.dispose()
  projectWorkspaces.clear()
  projectBlueprintWorkspaces.clear()
}

// --- navigation-sync ---

/** Shell Nav Root Listener 的语义模型。 */
export type ShellNavRootListener = (navData: RuntimeNavigation | null) => void

let shellNavRootListener: ShellNavRootListener | null = null

/** App.vue 注册：将已提交导航写入 _navRoot（驱动 useNavigation）。 */
export function registerShellNavRootListener(listener: ShellNavRootListener): () => void {
  shellNavRootListener = listener
  return () => {
    if (shellNavRootListener === listener) {
      shellNavRootListener = null
    }
  }
}

function applyShellNavRoot(navData: RuntimeNavigation | null): void {
  shellNavRootListener?.(navData)
}

/** 将后端授权后的运行导航同步到应用壳，不写入项目蓝图工作区。 */
export function syncCommittedNavigation(navData: RuntimeNavigation | null): void {
  applyShellNavRoot(navData)
}

/** 从路由缓存读取已提交导航并同步（无 HTTP）。 */
export function syncCommittedNavigationFromRouter(): void {
  syncCommittedNavigation(getNavTree())
}

/**
 * 刷新后端授权运行菜单（单次 HTTP GET）并同步应用壳。
 */
export async function reloadAndSyncNavigation(
  receipt?: LowcodeApplicationSelectionReceipt,
): Promise<RuntimeNavigation | null> {
  receipt?.assertCurrent()
  let navTree: RuntimeNavigation | null
  try {
    navTree = await refreshRoutes()
  } catch (error: unknown) {
    receipt?.assertCurrent()
    throw error
  }
  receipt?.assertCurrent()
  syncCommittedNavigation(navTree)
  return navTree
}
