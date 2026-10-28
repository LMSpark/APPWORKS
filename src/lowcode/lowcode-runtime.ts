/**
 * @module app:lowcode/lowcode-runtime
 * 职责：将真实请求身份、导航记录与文件 IO 接入应用宿主。
 * 边界：应用 ID 来自请求 scope，租户目录由后端裁决；文件确认不等于发布。
 * AI用途：装配工具、场景与蓝图网关并核对实际读取目标。
 */
import * as LowcodePlatform from '@spark-appworks/spark-lowcode-api'
import type {
  RuntimeNavigation,
  RuntimeNavigationItem,
} from '@spark-appworks/spark-app'
import { SYSTEM_PAGE_NAVIGATION_ID_QUERY } from '@spark-appworks/spark-app'
import * as ProjectModel from '@spark-appworks/spark-project-model'
import { createRequest } from '@spark-appworks/spark-utils'
import { parseQuery } from 'vue-router'
import { getVuePageOptions } from '@/registries/vue-page-registry'
import { APPLICATION_CATALOG_PROJECT_ID } from '@/services/tenant-scope'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { loadLowcodeRuntimeScenario } from './data-space/lowcode-data-space-runtime'
import {readLowcodeApplicationById, readLowcodeApplications, readLowcodeNavigationRootId} from './lowcode-application-catalog'
import { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'

/** 当前真实登录身份与选中应用；未选中应用时 applicationId 为 null。 */
export type LowcodePrincipal = Readonly<{
  userId: string
  username: string
  displayName: string
  roles: readonly string[]
  enterpriseName: string
  applicationId: string | null
}>

export const lowcodeHttp = createRequest({ timeout: 30_000 })
export const lowcodeApi = new LowcodePlatform.LowcodeApi({
  http: lowcodeHttp,
  ...(typeof window === 'undefined' ? {} : { sessionStorage: window.sessionStorage }),
  readApplicationById: (applicationId, assertCurrent) => readLowcodeApplicationById(applicationId, assertCurrent),
  readNavigationRootId: (systemId, assertCurrent) => readLowcodeNavigationRootId(systemId, assertCurrent),
})

const scenarioFileUpload = new LowcodePlatform.LowcodeDesignFileUpload({
  http: lowcodeHttp,
  readScope: () => lowcodeApi.readRequestScope(),
})
export {scenarioFileUpload as lowcodeDesignFileUpload}

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

export function lowcodeEnterpriseDisplayName(enterprise: LowcodePlatform.LowcodeEnterprise): string {
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

export async function readLowcodePageFile(command: ProjectModel.PageFileReadCommand): Promise<string> {
  const versions = command.versionId === undefined ? undefined : LowcodePlatform.parseLowcodeBlueprintFileVersions(command.versionId)
  const key = command.fileName === 'rule.json' ? 'rule' : command.fileName === 'script.js' ? 'script' : 'style'
  const version = versions?.[key]
  if (versions !== undefined && (version === undefined || version === null)) throw new Error(`发布指针缺少 ${command.fileName}`)
  return lowcodeApi.design.readTextFile({
    appType: 'designfile',
    customPath: toolFilePath(command.projectId, command.pageId),
    fileName: versions === undefined ? command.fileName : LowcodePlatform.lowcodeBlueprintVersionedFileName(command.fileName, versions),
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
      ...(page.dataSpaceId === undefined ? {} : {blueprintScenarioId: page.dataSpaceId}),
    }))
  return {
    title: 'SPARK 应用工场',
    projectId: APPLICATION_CATALOG_PROJECT_ID,
    childPlacement: 'header',
    homePath: '/app-list',
    items,
  }
}

/** 正式蓝图记录和后端授权证据，按节点身份投影宿主导航。 */
export type LowcodeRuntimeNavigationAssemblyInput = Readonly<{
  applicationName: string
  projectId: string
  navigationRootId: string
  records: readonly LowcodePlatform.LowcodeProjectBlueprintRecord[]
  authorization: LowcodePlatform.LowcodeNavigationAuthorizationEvidence
}>

type RuntimeTargetProjection = Readonly<{
  targetKind: LowcodePlatform.LowcodeNavigationTargetKind
  path?: string
  linkTarget?: 'new-tab'
}>

function isRootBlueprintParent(parentId: string): boolean {
  return parentId === '' || parentId === '0' || parentId === '000000'
}

function sortBlueprintRecords(records: readonly LowcodePlatform.LowcodeProjectBlueprintRecord[]): LowcodePlatform.LowcodeProjectBlueprintRecord[] {
  return [...records].sort((left, right) => (left.navigation?.order ?? 0) - (right.navigation?.order ?? 0) || left.nodeId.localeCompare(right.nodeId))
}

function flattenAuthorizationItems(
  items: readonly LowcodePlatform.LowcodeNavigationAuthorizationItem[],
  target: Map<string, LowcodePlatform.LowcodeNavigationAuthorizationItem>,
): void {
  for (const item of items) {
    target.set(item.id, item)
    flattenAuthorizationItems(item.children, target)
  }
}

function runtimeTargetProjection(
  record: LowcodePlatform.LowcodeProjectBlueprintRecord,
): RuntimeTargetProjection {
  const target = (record.navigation?.target ?? '')
  if (target.startsWith('cfg:')) {
    const query = new URLSearchParams()
    if (record.dataSpace?.scenarioId) query.set('scenarioId', record.dataSpace.scenarioId)
    const parameters = query.toString()
    return { targetKind: 'route', path: `/__page/${encodeURIComponent(record.nodeId)}${parameters ? `?${parameters}` : ''}` }
  }
  const targetKind: LowcodePlatform.LowcodeNavigationTargetKind = !target
    ? 'empty'
    : target.startsWith('vue:')
      ? 'vue'
      : /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)
        ? 'external'
        : 'route'
  if (targetKind === 'vue') {
    const routeTarget = target.slice(4).replace(/^\/+/, '')
    const resource = routeTarget.replace(/[?#].*$/, '')
    if (!resource || resource.endsWith('.vue') || resource.includes('\\') || resource.includes('//')) {
      throw new Error(`蓝图节点 ${record.nodeId} 的 Vue 目标无效：${target}`)
    }
    return {
      targetKind,
      path: `/${routeTarget}`,
    }
  }
  if (targetKind === 'route') {
    const path = target
    return {
      targetKind,
      path: path.startsWith('/') ? path : `/${path}`,
    }
  }
  if (targetKind === 'external') return { targetKind, path: target, linkTarget: 'new-tab' }
  return { targetKind }
}

function buildRuntimeNavigationItem(
  record: LowcodePlatform.LowcodeProjectBlueprintRecord,
  childrenByParent: ReadonlyMap<string, readonly LowcodePlatform.LowcodeProjectBlueprintRecord[]>,
  authorizationById: ReadonlyMap<string, LowcodePlatform.LowcodeNavigationAuthorizationItem>,
): RuntimeNavigationItem {
  const children = sortBlueprintRecords(childrenByParent.get(record.nodeId) ?? [])
    .map(child => buildRuntimeNavigationItem(child, childrenByParent, authorizationById))
  const target = runtimeTargetProjection(record)
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
    id: record.nodeId,
    title: (record.navigation?.title ?? record.capability.name),
    description: (record.capability.description ?? ''),
    itemKind,
    ...(target.path === undefined ? {} : { path: target.path }),
    ...(record.dataSpace?.scenarioId === undefined ? {} : { blueprintScenarioId: record.dataSpace.scenarioId }),
    ...(record.navigation?.target?.startsWith('cfg:') === true ? { tool: {
      projectId: record.projectId, pageId: record.navigation.target.slice(4),
      ...(typeof record.source['VersionId'] === 'string' && record.source['VersionId'].trim() ? { versionId: record.source['VersionId'] } : {}),
    } } : {}),
    ...(target.linkTarget === undefined ? {} : { linkTarget: target.linkTarget }),
    ...(record.navigation?.icon === undefined ? {} : { icon: record.navigation.icon }),
    order: (record.navigation?.order ?? 0),
    disabled: (record.capability.deliveryStatus ?? '').toLowerCase() === 'maintenance',
    children,
  }
}

function firstRuntimePage(items: readonly RuntimeNavigationItem[]): RuntimeNavigationItem | undefined {
  for (const item of items) {
    if ((item.itemKind === 'page' || item.itemKind === 'system-page') && item.path !== undefined) {
      return item
    }
    const child = firstRuntimePage(item.children ?? [])
    if (child !== undefined) return child
  }
  return undefined
}

function systemPageLandingPath(item: RuntimeNavigationItem): string {
  const path = item.path
  if (path === undefined || item.itemKind !== 'system-page') return path ?? ''
  const hashIndex = path.indexOf('#')
  const routeTarget = path.slice(0, hashIndex < 0 ? undefined : hashIndex)
  const hash = path.slice(hashIndex < 0 ? path.length : hashIndex)
  const queryIndex = routeTarget.indexOf('?')
  const query = queryIndex < 0 ? {} : parseQuery(routeTarget.slice(queryIndex + 1))
  if (Object.prototype.hasOwnProperty.call(query, SYSTEM_PAGE_NAVIGATION_ID_QUERY)) {
    throw new Error(`系统页面 landing target 使用保留身份参数：${item.id}`)
  }
  const separator = queryIndex < 0 ? '?' : '&'
  return `${routeTarget}${separator}${encodeURIComponent(SYSTEM_PAGE_NAVIGATION_ID_QUERY)}=${encodeURIComponent(item.id)}${hash}`
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
  const authorizationById = new Map<string, LowcodePlatform.LowcodeNavigationAuthorizationItem>()
  flattenAuthorizationItems(input.authorization.items, authorizationById)
  const candidates = input.records.filter(record => (
    record.navigation?.publishInMenu && authorizationById.has(record.nodeId)
  ))
  const candidateIds = new Set(candidates.map(record => record.nodeId))
  const childrenByParent = new Map<string, LowcodePlatform.LowcodeProjectBlueprintRecord[]>()
  for (const record of candidates) {
    const siblings = childrenByParent.get(record.parentNodeId) ?? []
    siblings.push(record)
    childrenByParent.set(record.parentNodeId, siblings)
  }
  const businessChildren = sortBlueprintRecords(
    candidates.filter(record => !candidateIds.has(record.parentNodeId)),
  ).map(record => buildRuntimeNavigationItem(record, childrenByParent, authorizationById))
  const landingItem = firstRuntimePage(businessChildren)
  const homePath = landingItem?.itemKind === 'system-page'
    ? systemPageLandingPath(landingItem)
    : landingItem?.path
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
  const executionScope = lowcodeApi.readRequestScope()
  const executionScopeToken = executionScope.token
  const executionProjectId = executionScope.headers['X-AppId']
  if (!executionProjectId) throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: lowcode 启动导航缺少请求应用身份')
  const assertExecutionScope = (): void => {
    let currentScopeToken: string
    try {
      currentScopeToken = lowcodeApi.readRequestScope().token
    } catch {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: lowcode 导航读取期间执行身份或应用上下文已变化')
    }
    if (!lowcodeApi.session.isAuthenticated()
      || currentScopeToken !== executionScopeToken
      || lowcodeApi.readRequestScope().headers['X-AppId'] !== executionProjectId
      || lowcodeApi.application.get()?.navigationRootId !== activeContext?.navigationRootId) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: lowcode 导航读取期间执行身份或应用上下文已变化')
    }
  }
  const readWithinExecutionScope = async <T>(request: Promise<T>): Promise<T> => {
    try {
      const result = await request
      assertExecutionScope()
      return result
    } catch (error) {
      assertExecutionScope()
      throw error
    }
  }
  let application: Pick<LowcodePlatform.LowcodeApplication, 'id' | 'name'>
  let navigationRootId: string
  try {
    if (explicitProjectId && activeContext?.application.id !== explicitProjectId) {
      application = await readWithinExecutionScope(readLowcodeApplicationById(explicitProjectId, assertExecutionScope))
      navigationRootId = await readWithinExecutionScope(readLowcodeNavigationRootId(application.id, assertExecutionScope))
      assertExecutionScope()
    } else if (activeContext !== null) {
      application = activeContext.application
      navigationRootId = activeContext.navigationRootId
    } else {
      throw new Error('缺少 lowcode 应用上下文')
    }
    const runtime = new ProjectModel.PageRuntime({pageId: 'lowcode-runtime-navigation',
      scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY], mainScenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY,
      loadScenario: scenarioId => {
        assertExecutionScope()
        return loadLowcodeRuntimeScenario({projectId: executionProjectId, scenarioId})
      }})
    let owner: BlueprintWorkspaceDataView | undefined
    try {
      await readWithinExecutionScope(runtime.load())
      assertExecutionScope()
      const dataSet = runtime.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)
      if (!dataSet) throw new Error('启动导航运行时缺少正式蓝图 DataSet')
      owner = new BlueprintWorkspaceDataView(dataSet, application.id, assertExecutionScope)
      const [recordsResult, authorizationResult] = await Promise.allSettled([
        readWithinExecutionScope(owner.loadProjectRecords()),
        readWithinExecutionScope(lowcodeApi.blueprint.readNavigationAuthorization(application.id, navigationRootId)),
      ])
      assertExecutionScope()
      if (recordsResult.status === 'rejected') throw recordsResult.reason
      if (authorizationResult.status === 'rejected') throw authorizationResult.reason
      return assembleLowcodeRuntimeNavigation({
        applicationName: application.name,
        projectId: application.id,
        navigationRootId,
        records: recordsResult.value,
        authorization: authorizationResult.value,
      })
    } finally {
      owner?.dispose()
      runtime.dispose()
    }
  } catch (error) {
    assertExecutionScope()
    throw error
  }
}

function projectBlueprintRecordNode(
  record: LowcodePlatform.LowcodeProjectBlueprintRecord,
  childrenByParent: ReadonlyMap<string, readonly LowcodePlatform.LowcodeProjectBlueprintRecord[]>,
): ProjectModel.ProjectBlueprintTreeNodeData {
  const children = sortBlueprintRecords(childrenByParent.get(record.nodeId) ?? [])
    .map(child => projectBlueprintRecordNode(child, childrenByParent))
  return {
    nodeId: record.nodeId,
    parentNodeId: record.parentNodeId,
    projectId: record.projectId,
    kind: record.kind,
    capability: { ...record.capability },
    ...(record.navigation === undefined ? {} : { navigation: { ...record.navigation } }),
    ...(record.dataSpace === undefined ? {} : { dataSpace: { ...record.dataSpace, models: record.dataSpace.models.map(model => ({ ...model })) } }),
    ...(record.prototype === undefined ? {} : { prototype: { ...record.prototype } }),
    source: { ...record.source },
    children,
  }
}

async function readLowcodeProjectBlueprintEditorTree(projectId: string): Promise<ProjectModel.ProjectBlueprintTreeData> {
  const records = await lowcodeApi.blueprint.readRecords(projectId)
  const recordIds = new Set(records.map(record => record.nodeId))
  const childrenByParent = new Map<string, LowcodePlatform.LowcodeProjectBlueprintRecord[]>()
  for (const record of records) {
    const siblings = childrenByParent.get(record.parentNodeId) ?? []
    siblings.push(record)
    childrenByParent.set(record.parentNodeId, siblings)
  }
  const roots = sortBlueprintRecords(records.filter(record => (
    isRootBlueprintParent(record.parentNodeId) || !recordIds.has(record.parentNodeId)
  ))).map(record => projectBlueprintRecordNode(record, childrenByParent))
  const root = roots[0]
  if (root === undefined) throw new Error(`项目蓝图缺少顶层节点：${projectId}`)
  if (roots.length > 1) {
    const activeApplication = lowcodeApi.application.get()?.application
    return {
      nodeId: `project-blueprint:${projectId}`,
      parentNodeId: '',
      projectId,
      kind: 'module',
      capability: { name: activeApplication?.id === projectId ? activeApplication.name : projectId },
      source: {},
      children: roots,
    }
  }
  return {
    ...root,
    children: root.children ?? [],
  }
}

/** 固定应用工作区的工具、场景、蓝图与引用 IO；运行时仍核对当前请求 scope。 */
export type LowcodeProjectGateways = Readonly<{
  pageFiles: ProjectModel.ProjectPageFileGateway
  blueprint: ProjectModel.ProjectBlueprintGateway
  projectReferences: ProjectModel.ProjectReferenceGateway
  scenarioViews: NonNullable<ProjectModel.ProjectWorkspaceOptions['scenarioViews']>
}>

function scenarioViewPath(applicationId: string, scenarioId: string): string {
  if (/[/\\]/.test(applicationId) || applicationId === '.' || applicationId === '..') {
    throw new Error('applicationId 不是合法路径段')
  }
  const id = scenarioId.trim()
  if (!id || /[/\\]/.test(id) || id === '.' || id === '..') throw new Error('scenarioId 不是合法路径段')
  if (lowcodeApi.readRequestScope().headers['X-AppId'] !== applicationId) {
    throw new Error('SPARK_EXECUTION_SCOPE_STALE: 工作区所属应用与当前请求应用不一致')
  }
  return `${applicationId}/SysForm/${id}`
}

function toolFilePath(applicationId: string, pageId: string): string {
  const id = pageId.trim()
  for (const segment of [applicationId, id]) {
    if (!segment || /[/\\]/.test(segment) || segment === '.' || segment === '..') {
      throw new Error('工具文件路径不是合法路径段')
    }
  }
  if (lowcodeApi.readRequestScope().headers['X-AppId'] !== applicationId) {
    throw new Error('SPARK_EXECUTION_SCOPE_STALE: 工作区所属应用与当前请求应用不一致')
  }
  return `${applicationId}/${id}`
}

function assertProjectFilePath(applicationId:string,customPath:string):string {
  const normalized=customPath.trim(),segments=normalized.split('/')
  if(normalized!==customPath||segments[0]!==applicationId||segments.length<2||/[\\%\u0000-\u001f\u007f?#]/.test(normalized)
    ||segments.some(segment=>segment.length===0||segment.trim()!==segment||segment==='.'||segment==='..'))throw new Error('文件快照路径必须属于当前应用')
  if(lowcodeApi.readRequestScope().headers['X-AppId']!==applicationId)throw new Error('SPARK_EXECUTION_SCOPE_STALE: 文件快照所属应用已失效')
  return normalized
}

export function createLowcodeProjectGateways(projectId: string): LowcodeProjectGateways {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new Error('projectId 不能为空')
  return {
    pageFiles: {
      readPageFile: async command => {
        if (command.projectId !== normalizedProjectId) {
          throw new Error('SPARK_EXECUTION_SCOPE_STALE: 工具文件读取不属于当前工作区')
        }
        return readLowcodePageFile(command)
      },
      saveFileContent: async (pageId, fileName, text) => {
        if (!LowcodePlatform.LOWCODE_BLUEPRINT_FILE_NAMES.some(name => name === fileName)) {
          throw new Error('pagedata.json 必须通过场景文件保存')
        }
        await scenarioFileUpload.uploadWorkingText({
          customPath: toolFilePath(normalizedProjectId, pageId), fileName, text,
        })
      },
    },
    scenarioViews: {
      readScope: () => lowcodeApi.readRequestScope().token,
      readText: async scenarioId => {
        const customPath = scenarioViewPath(normalizedProjectId, scenarioId)
        const scope = lowcodeApi.readRequestScope().token
        try {
          return await lowcodeApi.design.readTextFile({ appType: 'designfile', customPath, fileName: 'pagedata.json' })
        } catch (error) {
          if (lowcodeApi.readRequestScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景文件读取身份已失效')
          if (error instanceof LowcodePlatform.LowcodeApiError && error.code === 404) return null
          throw error
        }
      },
      writeText: async (scenarioId, text) => {
        await scenarioFileUpload.uploadWorkingText({
          customPath: scenarioViewPath(normalizedProjectId, scenarioId), fileName: 'pagedata.json', text,
        })
      },
      listVersions: async scenarioId => [...await lowcodeApi.design.listFileVersions({
        appType: 'designfile', customPath: scenarioViewPath(normalizedProjectId, scenarioId), fileName: 'pagedata.json',
      })],
      readVersion: async (scenarioId, version) => {
        if (!Number.isSafeInteger(version) || version < 0) throw new Error('版本号必须为非负安全整数')
        const bytes = await lowcodeApi.design.readFileBytes({ appType: 'designfile',
          customPath: scenarioViewPath(normalizedProjectId, scenarioId), fileName: `${version}__pagedata.json` })
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      },
      createVersion: async (scenarioId, text, assertCurrent) => {
        assertCurrent?.()
        new ProjectModel.ScenarioViewConfig(scenarioId, text)
        const customPath = scenarioViewPath(normalizedProjectId, scenarioId)
        const scope = lowcodeApi.readRequestScope().token
        const versions = await lowcodeApi.design.listFileVersions({ appType: 'designfile', customPath, fileName: 'pagedata.json' })
        assertCurrent?.()
        const version = Math.max(0, ...versions.map(item => item.version)) + 1
        if (!Number.isSafeInteger(version)) throw new Error('快照编号超出安全范围')
        const working = await lowcodeApi.design.readTextFile({ appType: 'designfile', customPath, fileName: 'pagedata.json' })
        assertCurrent?.()
        if (working !== text) throw new Error('SCENARIO_VIEW_CONFLICT: 远端场景配置已改变')
        if (lowcodeApi.readRequestScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 创建场景版本所属应用已失效')
        const fileName = `${version}__pagedata.json`
        await scenarioFileUpload.uploadTextVersion({ customPath: scenarioViewPath(normalizedProjectId, scenarioId), fileName, text })
        assertCurrent?.()
        const actual = await lowcodeApi.design.listFileVersions({ appType: 'designfile',
          customPath: scenarioViewPath(normalizedProjectId, scenarioId), fileName: 'pagedata.json' })
        assertCurrent?.()
        const summary = actual.find(item => item.fileName === fileName && item.version === version)
        if (summary === undefined) throw new Error('SCENARIO_VIEW_VERSION_UNCONFIRMED: 已上传快照未出现在实际列表')
        return summary
      },
    },
    blueprint: {},
    projectReferences: {
      listProjects: async () => {
        const scope = lowcodeApi.readRequestScope()
        const assertCurrent = (): void => {
          let currentScope: ReturnType<typeof lowcodeApi.readRequestScope>
          try {currentScope = lowcodeApi.readRequestScope()}
          catch {throw new Error('SPARK_EXECUTION_SCOPE_STALE: 项目引用目录所属工作区已失效')}
          if (currentScope.token !== scope.token || currentScope.headers['X-AppId'] !== normalizedProjectId) {
            throw new Error('SPARK_EXECUTION_SCOPE_STALE: 项目引用目录所属工作区已失效')
          }
        }
        if (scope.headers['X-AppId'] !== normalizedProjectId) {
          throw new Error('SPARK_EXECUTION_SCOPE_STALE: 项目引用目录所属工作区与请求应用不一致')
        }
        try {
          assertCurrent()
          const applications = await readLowcodeApplications(assertCurrent)
          assertCurrent()
          return applications.map((application) => ({
            projectId: application.id,
            name: application.name,
            icon: '',
            description: application.description ?? '',
          }))
        } catch (error) {
          assertCurrent()
          throw error
        }
      },
      loadProjectBlueprint: readLowcodeProjectBlueprintEditorTree,
    },
  }
}

/** Existing single-file API adapter for the spark-data page-tool-files command owner. */
export function createPageToolFilesIo(projectId:string){
  const appId=projectId.trim()
  return {
    list:async(app:string,page:string)=>{if(app!==appId)throw new Error('FILE_SCOPE: appId 不匹配');return (await lowcodeApi.design.listFiles({appType:'designfile',folderPath:toolFilePath(appId,page)})).map(file=>file.name)},
    read:async(app:string,page:string,name:'rule.json'|'script.js'|'style.css')=>{
      if(app!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      try{return await lowcodeApi.design.readTextFile({appType:'designfile',customPath:toolFilePath(appId,page),fileName:name})}
      catch(error){if(error instanceof LowcodePlatform.LowcodeApiError&&error.code===404)return null;throw error}
    },
    upload:async(command:Readonly<{appId:string;pageId:string;fileName:'rule.json'|'script.js'|'style.css';text:string}>)=>{
      if(command.appId!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      await scenarioFileUpload.uploadTextVersion({customPath:toolFilePath(appId,command.pageId),fileName:command.fileName,text:command.text})
    },
    restoreWorkingFile:async(command:Readonly<{appId:string;pageId:string;fileName:'rule.json'|'script.js'|'style.css';text:string}>)=>{
      if(command.appId!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      await scenarioFileUpload.uploadWorkingText({customPath:toolFilePath(appId,command.pageId),fileName:command.fileName,text:command.text})
    },
    listVersions:async({appId:app,customPath,fileName}:{appId:string;customPath:string;fileName:'rule.json'|'script.js'|'style.css'})=>{
      if(app!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      return [...await lowcodeApi.design.listFileVersions({appType:'designfile',customPath:assertProjectFilePath(appId,customPath),fileName})]
    },
    uploadVersion:async({appId:app,customPath,fileName,version,text}:{appId:string;customPath:string;fileName:'rule.json'|'script.js'|'style.css';version:number;text:string})=>{
      if(app!==appId||!Number.isSafeInteger(version)||version<1)throw new Error('FILE_SCOPE: 快照应用或版本号无效')
      await scenarioFileUpload.uploadTextVersion({customPath:assertProjectFilePath(appId,customPath),fileName:`${version}__${fileName}`,text})
    },
    readVersion:async({appId:app,customPath,fileName,version}:{appId:string;customPath:string;fileName:'rule.json'|'script.js'|'style.css';version:number}):Promise<string|null>=>{
      if(app!==appId||!Number.isSafeInteger(version)||version<0)throw new Error('FILE_SCOPE: 快照应用或版本号无效')
      const path=assertProjectFilePath(appId,customPath)
      try{
        const bytes=await lowcodeApi.design.readFileBytes({appType:'designfile',customPath:path,fileName:`${version}__${fileName}`})
        return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)
      }
      catch(error){if(error instanceof LowcodePlatform.LowcodeApiError&&error.code===404)return null;throw error}
    },
    remove:async(app:string,page:string,name:string)=>{
      if(app!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      await lowcodeApi.design.removeFile({appType:'designfile',customPath:toolFilePath(appId,page),fileName:name})
    },
  }
}

/** 选择低代码应用并返回平台当前性凭据；异步恢复后须先检查凭据再执行后续副作用。 */
export async function activateLowcodeApplication(
  applicationId: string,
  signal?: AbortSignal,
): Promise<LowcodePlatform.LowcodeApplicationSelectionReceipt> {
  const normalizedId = applicationId.trim()
  if (!normalizedId) throw new Error('应用 ID 不能为空')
  const activation = await lowcodeApi.platform.activateApplication(normalizedId, signal)
  activation.assertCurrent()
  return activation
}

/** 开始新的应用目录意图、清空当前应用，并返回平台签发的当前性凭据。 */
export function enterLowcodeApplicationCatalog(): LowcodePlatform.LowcodeApplicationSelectionReceipt {
  return lowcodeApi.platform.enterApplicationCatalog()
}
