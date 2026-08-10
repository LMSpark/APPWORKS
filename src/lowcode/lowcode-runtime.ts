import {
  LowcodeApi,
  type LowcodeApplication,
  type LowcodeEnterprise,
  type LowcodeProjectBlueprintRecord,
  type LowcodeNavigationAuthorizationEvidence,
  type LowcodeNavigationAuthorizationItem,
  type LowcodeNavigationTargetKind,
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

export type LowcodeRuntimeNavigationAssemblyInput = Readonly<{
  applicationName: string
  projectId: string
  navigationRootId: string
  records: readonly LowcodeProjectBlueprintRecord[]
  authorization: LowcodeNavigationAuthorizationEvidence
}>

type RuntimeTargetProjection = Readonly<{
  targetKind: LowcodeNavigationTargetKind
  path?: string
  formKey?: string
  linkTarget?: 'new-tab'
}>

function isRootBlueprintParent(parentId: string): boolean {
  return parentId === '' || parentId === '0' || parentId === '000000'
}

function sortBlueprintRecords(records: readonly LowcodeProjectBlueprintRecord[]): LowcodeProjectBlueprintRecord[] {
  return [...records].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

function flattenAuthorizationItems(
  items: readonly LowcodeNavigationAuthorizationItem[],
  target: Map<string, LowcodeNavigationAuthorizationItem>,
): void {
  for (const item of items) {
    target.set(item.id, item)
    flattenAuthorizationItems(item.children, target)
  }
}

function recordText(source: Readonly<Record<string, unknown>>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function runtimeTargetProjection(
  record: LowcodeProjectBlueprintRecord,
  authorizedFormKey: string | null,
): RuntimeTargetProjection {
  const target = record.runtimeTarget
  const targetKind: LowcodeNavigationTargetKind = !target
    ? 'empty'
    : target.startsWith('vue:')
      ? 'vue'
      : /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)
        ? 'external'
        : 'route'
  const formKey = (authorizedFormKey ?? record.legacyContentId).trim()
  if (targetKind === 'vue') {
    const resource = target.slice(4).replace(/[?#].*$/, '').replace(/^\/+/, '')
    if (!resource || resource.endsWith('.vue') || resource.includes('\\') || resource.includes('//')) {
      throw new Error(`蓝图节点 ${record.id} 的 Vue 目标无效：${target}`)
    }
    return {
      targetKind,
      path: `/${resource}`,
      ...(formKey ? { formKey } : {}),
    }
  }
  if (targetKind === 'route') {
    const path = target.replace(/[?#].*$/, '')
    return {
      targetKind,
      path: path.startsWith('/') ? path : `/${path}`,
      ...(formKey ? { formKey } : {}),
    }
  }
  if (targetKind === 'external') return { targetKind, path: target, linkTarget: 'new-tab' }
  return { targetKind }
}

function buildRuntimeNavigationItem(
  record: LowcodeProjectBlueprintRecord,
  childrenByParent: ReadonlyMap<string, readonly LowcodeProjectBlueprintRecord[]>,
  authorizationById: ReadonlyMap<string, LowcodeNavigationAuthorizationItem>,
): RuntimeNavigationItem {
  const children = sortBlueprintRecords(childrenByParent.get(record.id) ?? [])
    .map(child => buildRuntimeNavigationItem(child, childrenByParent, authorizationById))
  const target = runtimeTargetProjection(record, authorizationById.get(record.id)?.formKey ?? null)
  const itemKind: RuntimeNavigationItem['itemKind'] = children.length > 0
    ? 'module'
    : target.targetKind === 'vue'
      ? 'system-page'
      : target.targetKind === 'external'
        ? 'link'
        : target.targetKind === 'empty'
          ? 'system-action'
          : 'page'
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    itemKind,
    ...(target.path === undefined ? {} : { path: target.path }),
    ...(target.formKey === undefined ? {} : { formKey: target.formKey }),
    ...(target.linkTarget === undefined ? {} : { linkTarget: target.linkTarget }),
    icon: recordText(record.source, ['iconCss', 'IconCss', 'icon']),
    order: record.order,
    disabled: recordText(record.source, ['status', 'Status']).toLowerCase() === 'maintenance',
    children,
  }
}

function firstRuntimePagePath(items: readonly RuntimeNavigationItem[]): string | undefined {
  for (const item of items) {
    if ((item.itemKind === 'page' || item.itemKind === 'system-page') && item.path !== undefined) {
      return item.path
    }
    const childPath = firstRuntimePagePath(item.children ?? [])
    if (childPath !== undefined) return childPath
  }
  return undefined
}

function withShellSystemTools(businessChildren: readonly RuntimeNavigationItem[]): RuntimeNavigationItem[] {
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
  return items
}

/** 将 lowcode 记录和后端授权证据直接装配为应用壳唯一运行导航合同。 */
export function assembleLowcodeRuntimeNavigation(
  input: LowcodeRuntimeNavigationAssemblyInput,
): RuntimeNavigation {
  const authorizationById = new Map<string, LowcodeNavigationAuthorizationItem>()
  flattenAuthorizationItems(input.authorization.items, authorizationById)
  const candidates = input.records.filter(record => (
    record.runtimeNavigationCandidate && authorizationById.has(record.id)
  ))
  const candidateIds = new Set(candidates.map(record => record.id))
  const childrenByParent = new Map<string, LowcodeProjectBlueprintRecord[]>()
  for (const record of candidates) {
    const siblings = childrenByParent.get(record.parentId) ?? []
    siblings.push(record)
    childrenByParent.set(record.parentId, siblings)
  }
  const businessChildren = sortBlueprintRecords(
    candidates.filter(record => !candidateIds.has(record.parentId)),
  ).map(record => buildRuntimeNavigationItem(record, childrenByParent, authorizationById))
  const homePath = firstRuntimePagePath(businessChildren)
  return {
    id: input.navigationRootId,
    projectId: input.projectId,
    title: input.applicationName,
    childPlacement: 'header',
    ...(homePath === undefined ? {} : { homePath }),
    items: withShellSystemTools(businessChildren),
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
  const [records, authorization] = await Promise.all([
    lowcodeApi.blueprint.readRecords(application.id),
    lowcodeApi.blueprint.readNavigationAuthorization(application.id, navigationRootId),
  ])
  return assembleLowcodeRuntimeNavigation({
    applicationName: application.name,
    projectId: application.id,
    navigationRootId,
    records,
    authorization,
  })
}

function projectBlueprintRecordNode(
  record: LowcodeProjectBlueprintRecord,
  childrenByParent: ReadonlyMap<string, readonly LowcodeProjectBlueprintRecord[]>,
): ProjectBlueprintTreeNodeData {
  const children = sortBlueprintRecords(childrenByParent.get(record.id) ?? [])
    .map(child => projectBlueprintRecordNode(child, childrenByParent))
  const target = runtimeTargetProjection(record, null)
  const nodeKind: ProjectBlueprintTreeNodeData['nodeKind'] = record.kind === 'page' || record.kind === 'sub-page'
    ? target.targetKind === 'vue' ? 'system-page' : 'page'
    : record.kind === 'external'
      ? 'link'
      : record.kind === 'action'
        ? 'system-action'
        : 'module'
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    blueprintKind: record.kind,
    nodeKind,
    ...(target.path === undefined ? {} : { path: target.path }),
    ...(target.linkTarget === undefined ? {} : { linkTarget: target.linkTarget }),
    icon: recordText(record.source, ['iconCss', 'IconCss', 'icon']),
    order: record.order,
    children,
  }
}

async function readLowcodeProjectBlueprintEditorTree(projectId: string): Promise<ProjectBlueprintTreeData> {
  const records = await lowcodeApi.blueprint.readRecords(projectId)
  const recordIds = new Set(records.map(record => record.id))
  const childrenByParent = new Map<string, LowcodeProjectBlueprintRecord[]>()
  for (const record of records) {
    const siblings = childrenByParent.get(record.parentId) ?? []
    siblings.push(record)
    childrenByParent.set(record.parentId, siblings)
  }
  const roots = sortBlueprintRecords(records.filter(record => (
    isRootBlueprintParent(record.parentId) || !recordIds.has(record.parentId)
  ))).map(record => projectBlueprintRecordNode(record, childrenByParent))
  const root = roots[0]
  if (root === undefined) throw new Error(`项目蓝图缺少顶层节点：${projectId}`)
  if (roots.length > 1) {
    const activeApplication = lowcodeApi.application.get()?.application
    return {
      id: `project-blueprint:${projectId}`,
      title: activeApplication?.id === projectId ? activeApplication.name : projectId,
      blueprintKind: 'project',
      childPlacement: 'header',
      children: roots,
    }
  }
  return {
    id: root.id,
    title: root.title,
    description: root.description,
    childPlacement: 'header',
    children: root.children ?? [],
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
