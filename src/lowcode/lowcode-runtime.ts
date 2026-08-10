import {
  LowcodeApi,
  type LowcodeApplication,
  type LowcodeEnterprise,
  type ProjectBlueprint,
  type ProjectBlueprintTreeNode,
  type RuntimeNavigationItem as LowcodeRuntimeNavigationItem,
} from '@spark-appworks/spark-lowcode-api'
import type {
  RuntimeNavigation,
  RuntimeNavigationItem,
} from '@spark-appworks/spark-app'
import type {
  PageFileReadCommand,
  ProjectBlueprintGateway,
  ProjectPageFileGateway,
  ProjectReferenceGateway,
  ProjectBlueprintTreeData,
  ProjectBlueprintTreeNodeData,
} from '@spark-appworks/spark-project-model'
import { createRequest } from '@spark-appworks/spark-utils'
import { getVuePageOptions } from '@/registries/vue-page-registry'

export type LowcodePrincipal = Readonly<{
  userId: string
  username: string
  displayName: string
  roles: readonly string[]
  enterpriseName: string
  applicationId: string | null
}>

export const lowcodeHttp = createRequest({ timeout: 30_000 })
export const lowcodeApi = new LowcodeApi({
  http: lowcodeHttp,
  ...(typeof window === 'undefined' ? {} : { sessionStorage: window.sessionStorage }),
})

lowcodeHttp.interceptors.response.use({
  onResponseError: (error) => {
    if (error.status === 401) {
      lowcodeApi.application.clear()
      lowcodeApi.session.clear()
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/'
      }
    }
    throw error
  },
})

export function readLowcodePrincipal(): LowcodePrincipal | null {
  const session = lowcodeApi.session.get()
  if (session === null) return null
  return {
    userId: session.identity.userId,
    username: session.identity.account,
    displayName: session.identity.displayName,
    roles: session.identity.role === null ? [] : [session.identity.role],
    enterpriseName: session.enterprise.shortName,
    applicationId: lowcodeApi.application.get()?.application.id ?? null,
  }
}

export function lowcodeEnterpriseDisplayName(enterprise: LowcodeEnterprise): string {
  return enterprise.shortCode
    ?? enterprise.code
    ?? enterprise.name
    ?? enterprise.shortName
}

export function hasLowcodeSession(): boolean {
  return lowcodeApi.session.isAuthenticated()
}

export function isLowcodePlatformAdministrator(principal = readLowcodePrincipal()): boolean {
  return principal?.roles.includes('SUPER_ADMIN') === true
}

export function lowcodeRequestHeaders(): Record<string, string> {
  const session = lowcodeApi.session.get()
  return session === null ? {} : { Authorization: `Bearer ${session.accessToken}` }
}

export async function readLowcodePageFile(command: PageFileReadCommand): Promise<string> {
  return lowcodeApi.design.readTextFile({
    appType: 'designfile',
    customPath: `${command.projectId}/${command.pageId}`,
    fileName: command.fileName,
  })
}

export function lowcodeApplicationCatalogNavigation(): RuntimeNavigation {
  const items = getVuePageOptions()
    .filter((page) => page.scope === 'tenant')
    .map((page) => ({
      id: `appworks-tenant-${page.path.slice(1)}`,
      title: page.title,
      itemKind: 'system-page' as const,
      path: page.path,
      ...(page.icon === undefined ? {} : { icon: page.icon }),
    }))
  return {
    title: 'SPARK 应用工场',
    childPlacement: 'header',
    homePath: '/app-list',
    items,
  }
}

export type LowcodeRuntimeNavigationProjectionInput = Readonly<{
  applicationName: string
  navigationRootId: string
  items: readonly LowcodeRuntimeNavigationItem[]
}>

function firstRuntimePagePath(items: readonly LowcodeRuntimeNavigationItem[]): string | undefined {
  for (const item of items) {
    if (item.itemKind === 'page') {
      const path = runtimeNavigationPath(item)
      if (path !== undefined) return path
    }
    const childPath = firstRuntimePagePath(item.children)
    if (childPath !== undefined) return childPath
  }
  return undefined
}

export function projectRuntimeNavigation(input: LowcodeRuntimeNavigationProjectionInput): RuntimeNavigation {
  const homePath = firstRuntimePagePath(input.items)
  const businessChildren = input.items.map(projectRuntimeNavigationItem)
  const businessPaths = new Set<string>()
  const collectPaths = (nodes: readonly RuntimeNavigationItem[]): void => {
    for (const node of nodes) {
      if (node.path !== undefined) businessPaths.add(node.path)
      collectPaths(node.children ?? [])
    }
  }
  collectPaths(businessChildren)
  const toolChildren = getVuePageOptions()
    .filter((page) => page.scope === 'app' && page.shellTool !== false && !businessPaths.has(page.path))
    .map((page) => ({
      id: `appworks-tool-${page.path.slice(1).replaceAll('/', '-')}`,
      title: page.title,
      itemKind: 'system-page' as const,
      path: page.path,
      ...(page.icon === undefined ? {} : { icon: page.icon }),
    }))
  const items: RuntimeNavigationItem[] = [...businessChildren]
  if (toolChildren.length > 0) {
    items.push({
      id: 'appworks-system-tools',
      title: 'SPARK 工具',
      itemKind: 'module',
      children: toolChildren,
    })
  }
  return {
    id: input.navigationRootId,
    title: input.applicationName,
    childPlacement: 'header',
    ...(homePath === undefined ? {} : { homePath }),
    items,
  }
}

export async function readLowcodeRuntimeNavigation(projectId?: string): Promise<RuntimeNavigation> {
  const explicitProjectId = projectId?.trim()
  const activeContext = lowcodeApi.application.get()
  if (!explicitProjectId && activeContext === null) return lowcodeApplicationCatalogNavigation()
  let application: LowcodeApplication
  let navigationRootId: string
  if (explicitProjectId && activeContext?.application.id !== explicitProjectId) {
    const applications = await lowcodeApi.platform.listApplications()
    const found = applications.find((item) => item.id === explicitProjectId)
    if (found === undefined) throw new Error(`lowcode 应用不存在或无权访问：${explicitProjectId}`)
    application = found
    navigationRootId = await lowcodeApi.platform.resolveNavigationRootId(found.id)
  } else if (activeContext !== null) {
    application = activeContext.application
    navigationRootId = activeContext.navigationRootId
  } else {
    throw new Error('缺少 lowcode 应用上下文')
  }
  const navigation = await lowcodeApi.blueprint.readRuntimeNavigation(application.id, navigationRootId)
  return projectRuntimeNavigation({
    applicationName: application.name,
    navigationRootId,
    items: navigation.items,
  })
}

export async function readLowcodeProjectBlueprint(projectId: string): Promise<ProjectBlueprint> {
  return lowcodeApi.blueprint.read(projectId)
}

async function readLowcodeProjectBlueprintEditorTree(projectId: string): Promise<ProjectBlueprintTreeData> {
  const blueprint = await readLowcodeProjectBlueprint(projectId)
  const roots = blueprint.outputs.structure.snapshot().hierarchy
  const root = roots[0]
  if (root === undefined) throw new Error(`项目蓝图缺少顶层节点：${projectId}`)
  if (roots.length > 1) {
    const activeApplication = lowcodeApi.application.get()?.application
    return {
      id: `project-blueprint:${projectId}`,
      title: activeApplication?.id === projectId ? activeApplication.name : projectId,
      blueprintKind: 'project',
      childPlacement: 'header',
      children: roots.map(projectBlueprintTreeNode),
    }
  }
  const children = root.children.map(projectBlueprintTreeNode)
  return {
    id: root.node.id,
    title: root.node.title,
    description: root.node.description,
    childPlacement: 'header',
    children,
  }
}

export type LowcodeProjectGateways = Readonly<{
  pageFiles: ProjectPageFileGateway
  blueprint: ProjectBlueprintGateway
  projectReferences: ProjectReferenceGateway
}>

export function createLowcodeProjectGateways(projectId: string): LowcodeProjectGateways {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new Error('projectId 不能为空')
  return {
    pageFiles: { readPageFile: readLowcodePageFile },
    blueprint: { loadRoot: () => readLowcodeProjectBlueprintEditorTree(normalizedProjectId) },
    projectReferences: {
      listProjects: async () => (await lowcodeApi.platform.listApplications()).map((application) => ({
        projectId: application.id,
        name: application.name,
        icon: '',
        description: application.description,
      })),
      loadProjectBlueprint: readLowcodeProjectBlueprintEditorTree,
    },
  }
}

function runtimeNavigationPath(item: LowcodeRuntimeNavigationItem): string | undefined {
  if (item.targetKind === 'vue') {
    const resource = item.target.slice(4).replace(/[?#].*$/, '').replace(/^\/+/, '')
    return resource ? `/${resource}` : undefined
  }
  if (item.targetKind === 'route') {
    const path = item.target.replace(/[?#].*$/, '')
    return path.startsWith('/') ? path : `/${path}`
  }
  return item.targetKind === 'external' ? item.target : undefined
}

function projectRuntimeNavigationItem(item: LowcodeRuntimeNavigationItem): RuntimeNavigationItem {
  const path = runtimeNavigationPath(item)
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    itemKind: item.targetKind === 'vue'
      ? 'system-page'
      : item.itemKind === 'module'
      ? 'module'
      : item.itemKind === 'external' ? 'link' : item.itemKind === 'action' ? 'system-action' : 'page',
    ...(path === undefined ? {} : { path }),
    ...(item.formKey === null ? {} : { formKey: item.formKey }),
    ...(item.itemKind === 'external' ? { linkTarget: 'new-tab' as const } : {}),
    icon: item.icon,
    order: item.order,
    disabled: item.disabled,
    children: item.children.map(projectRuntimeNavigationItem),
  }
}

function projectBlueprintTreeNode(tree: ProjectBlueprintTreeNode): ProjectBlueprintTreeNodeData {
  const node = tree.node
  const runtimeTarget = node.runtimeTarget
  const isVue = runtimeTarget.startsWith('vue:')
  const isExternal = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(runtimeTarget) && !isVue
  const path = isVue
    ? `/${runtimeTarget.slice(4).replace(/[?#].*$/, '').replace(/^\/+/, '')}`
    : runtimeTarget
      ? runtimeTarget.startsWith('/') || isExternal ? runtimeTarget : `/${runtimeTarget}`
      : undefined
  const children = tree.children.map(projectBlueprintTreeNode)
  const nodeKind: ProjectBlueprintTreeNodeData['nodeKind'] = node.kind === 'page' || node.kind === 'sub-page'
    ? isVue ? 'system-page' : 'page'
    : node.kind === 'external'
      ? 'link'
      : node.kind === 'action'
        ? 'system-action'
        : 'module'
  return {
    id: node.id,
    title: node.title,
    description: node.description,
    blueprintKind: node.kind,
    nodeKind,
    ...(path === undefined ? {} : { path }),
    ...(isExternal ? { linkTarget: 'new-tab' as const } : {}),
    icon: typeof node.source['iconCss'] === 'string' ? node.source['iconCss'] : '',
    order: node.order,
    children,
  }
}

export async function activateLowcodeApplication(applicationId: string): Promise<LowcodeApplication> {
  const normalizedId = applicationId.trim()
  if (!normalizedId) throw new Error('应用 ID 不能为空')
  const applications = await lowcodeApi.platform.listApplications()
  const application = applications.find((item) => item.id === normalizedId)
  if (application === undefined) throw new Error(`lowcode 应用不存在或无权访问：${normalizedId}`)
  await lowcodeApi.platform.selectApplication(application)
  return application
}

export function enterLowcodeApplicationCatalog(): void {
  lowcodeApi.application.clear()
}
