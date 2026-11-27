/**
 * @module app:lowcode/lowcode-runtime
 * 职责：将真实请求身份、导航记录与文件 IO 接入应用宿主。
 * 边界：应用 ID 来自请求 scope，租户目录由后端裁决；文件确认不等于发布。
 * AI用途：装配工具、场景与蓝图网关并核对实际读取目标。
 */
import * as LowcodePlatform from '@/platform-adapters/api'
import type {
  RuntimePageNavigationReceipt,
  RuntimeNavigation,
  RuntimeNavigationItem,
} from '@spark-appworks/spark-app'
import { NativePageRuntimeSession, SYSTEM_PAGE_NAVIGATION_ID_QUERY } from '@spark-appworks/spark-app'
import { LowcodeRealtimeApi } from '@spark-appworks/spark-ai/agent'
import * as ProjectModel from '@spark-appworks/spark-project-model'
import { createRequest } from '@spark-appworks/spark-utils'
import { parseQuery } from 'vue-router'
import { buildConfigPageNavigationPath } from '@/services/application-scope'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@/platform-adapters/api'
import { loadLowcodeRuntimeScenario, readLowcodeExecutionProject } from './data-space/lowcode-data-space-runtime'
import { readPageToolFileText } from '@/services/project/page-tool-file-operations'
import {readLowcodeApplicationById, readLowcodeApplications, readLowcodeNavigationRootId} from './lowcode-application-catalog'
import { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import {resolveSystemScenarioResource} from '@/registries/system-scenario-registry'
import {readRepositoryScenarioText} from './resources/repository/scenarios/resource'
import {createRepositoryScenarioVersion, listRepositoryScenarioVersions, readRepositoryScenarioVersion, writeRepositoryScenarioToHost} from './resources/repository/scenarios/host-client'
import {readNavigationAuthorizationDataView} from './resources/shared/navigation-authorization-resource'
import {
  createNavigationAuthorizationReader,
  type LowcodeNavigationAuthorizationEvidence,
  type LowcodeNavigationAuthorizationItem,
  type LowcodeNavigationTargetKind,
} from './resources/shared/navigation-authorization-wire'
import {applicationDesignItems, lowcodeEnterpriseNavigation, withApplicationDesign} from './system-navigation'
import {invalidateRuntimeFile, readRuntimeFile, type RuntimeFileCacheScope} from './runtime-file-cache'
import {parsePageToolPublicationManifest} from '@/services/project/page-tool-publication'
import {formatFileSnapshotName} from '@/platform-adapters/api/design/lowcode-file-identity'

/** 当前真实登录身份与选中应用；未选中应用时 applicationId 为 null。 */
export type LowcodePrincipal = Readonly<{
  userId: string
  username: string
  displayName: string
  enterpriseName: string
  applicationId: string | null
}>

export const lowcodeHttp = createRequest({ timeout: 30_000 })
export const lowcodeApi = new LowcodePlatform.LowcodeApi({
  http: lowcodeHttp,
  ...(typeof window === 'undefined' ? {} : { sessionStorage: window.sessionStorage }),
  readApplicationById: readLowcodeApplicationById,
  readNavigationRootId: readLowcodeNavigationRootId,
})

/** Runtime and publication reads use the registered blueprint model and existing request owner. */
export const lowcodeBlueprintRecords = ProjectModel.createProjectBlueprintRecordReader({
  owner: lowcodeApi.dataSpace.runtime,
  identity: {scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, metaName: 'Base_NavigationInfo'},
})
export const lowcodeNavigationAuthorization = createNavigationAuthorizationReader(lowcodeHttp)

/** Realtime transport shares the authenticated HTTP client and reads the host's current session on demand. */
export const lowcodeRealtime = new LowcodeRealtimeApi({
  http: lowcodeHttp,
  ...(typeof fetch === 'undefined' ? {} : { fetcher: fetch.bind(globalThis) }),
  readSession: () => {
    const session = lowcodeApi.session.get()
    if (session === null) return null
    return { accessToken: session.accessToken, entShortName: session.identity.enterpriseShortName, userId: session.identity.userId }
  },
})

/** 未进入应用时（企业级、平台级）的数据空间请求入口：只携带登录身份，不带应用头。 */
export const lowcodeCatalogDataSpace = new LowcodePlatform.DataSpaceApi({
  http: lowcodeHttp,
  readScope: () => lowcodeApi.readAuthenticatedRequestScope(),
})

/** 无应用系统页的请求随应用选择代次失效，沿用原认证请求头。 */
export function readLowcodeCatalogRuntimeRequestScope(): ReturnType<typeof lowcodeApi.readAuthenticatedRequestScope> {
  let scope: ReturnType<typeof lowcodeApi.readAuthenticatedRequestScope>
  try { scope = lowcodeApi.readAuthenticatedRequestScope() }
  catch (cause) { throw new Error('SPARK_EXECUTION_SCOPE_STALE: 目录作用域登录会话已失效', {cause}) }
  if (lowcodeApi.application.get() !== null) {
    throw new Error('SPARK_EXECUTION_SCOPE_STALE: 当前已选中应用，目录场景已失效')
  }
  return { ...scope, token: JSON.stringify([scope.token, lowcodeApi.application.revision]) }
}

/** 无应用 PageRuntime 共用正式模型 owner，查询缓存与保存基线沿同一执行代次。 */
export const lowcodeCatalogRuntimeDataSpace = new LowcodePlatform.DataSpaceApi({
  http: lowcodeHttp,
  readScope: readLowcodeCatalogRuntimeRequestScope,
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

export function lowcodeRequestHeaders(): Record<string, string> {
  const session = lowcodeApi.session.get()
  return session === null ? {} : { Authorization: `Bearer ${session.accessToken}` }
}

export async function readLowcodePageFiles(commands: readonly ProjectModel.PageFileReadCommand[]): Promise<string[]> {
  const first = commands[0]
  if (!first) return []
  const execution = readLowcodeExecutionProject()
  if (commands.some(command => command.projectId !== execution.projectId
    || command.pageId !== first.pageId || command.versionId !== first.versionId)
    || new Set(commands.map(command => command.fileName)).size !== commands.length) {
    throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 批量读取必须属于同一应用、工具及版本')
  }
  const dataSet = await loadLowcodeRuntimeScenario({
    projectId: execution.projectId,
    scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY,
  })
  try {
    const results = await Promise.allSettled(commands.map(command => readPageToolFileText({
      ...command, dataSet, appId: execution.projectId, assertCurrent: execution.assertCurrent,
    })))
    execution.assertCurrent()
    return results.map(result => {
      if (result.status === 'rejected') throw result.reason
      return result.value
    })
  } finally {
    dataSet.destroy()
  }
}

export async function readLowcodePageFile(command: ProjectModel.PageFileReadCommand): Promise<string> {
  const [text] = await readLowcodePageFiles([command])
  if (text === undefined) throw new Error('PAGE_TOOL_FILE_MISSING: 未找到指定工具文件')
  return text
}

export async function resolveLowcodePagePublication(command: Readonly<{
  projectId: string
  pageId: string
  nodeId?: string
  scenarioIds: readonly string[]
}>): Promise<Readonly<{
  publicationRef: string
  manifest: Awaited<ReturnType<typeof parsePageToolPublicationManifest>>
  assertCurrent(): void
}> | undefined> {
  const execution = readLowcodeExecutionProject()
  if (execution.projectId !== command.projectId) {
    throw new Error('PAGE_PUBLICATION_SCOPE_STALE: 发布解析所属应用已失效')
  }
  execution.assertCurrent()
  if (!command.nodeId) return undefined
  const records = await lowcodeBlueprintRecords.readRecords(command.projectId)
  execution.assertCurrent()
  const record = records.find(item => item.nodeId === command.nodeId)
  if (record?.projectId !== command.projectId) {
    throw new Error('PAGE_PUBLICATION_POINTER_MISSING: 导航节点发布记录不存在')
  }
  const target = record.navigation?.target
  if (target === undefined || !target.startsWith('cfg:')
    || ProjectModel.parseConfigToolPageId(target) !== command.pageId) {
    throw new Error('PAGE_PUBLICATION_SCOPE_STALE: 导航工具绑定已改变')
  }
  const raw = record.source['VersionId'] ?? record.source['versionId']
  const versionId = typeof raw === 'string' ? raw.trim() : ''
  if (!versionId) throw new Error('PAGE_PUBLICATION_MANIFEST_MISSING: 导航发布缺少 manifest 指针')
  const versions = ProjectModel.parsePageToolPublicationVersions(versionId)
  if (versions.manifest === null) throw new Error('PAGE_PUBLICATION_MANIFEST_MISSING: 发布运行不接受旧三文件指针')
  if (versions.rule === null || versions.script === null || versions.style === null) {
    throw new Error('PAGE_PUBLICATION_POINTER_CONFLICT: manifest 发布指针缺少工具快照')
  }
  const io = createPageToolFilesIo(command.projectId)
  const text = await io.readVersion({
    appId: command.projectId, customPath: toolFilePath(command.projectId, command.pageId),
    fileName: 'publication-manifest.json', version: versions.manifest,
  })
  execution.assertCurrent()
  if (text === null) {
    throw new Error(`PAGE_PUBLICATION_MANIFEST_MISSING: ${ProjectModel.pageToolPublicationVersionedFileName('publication-manifest.json', versions)} 不存在`)
  }
  const manifest = await parsePageToolPublicationManifest(text)
  execution.assertCurrent()
  if (manifest.pageId !== command.pageId
    || manifest.scenarioIds.length !== command.scenarioIds.length
    || manifest.scenarioIds.some(id => !command.scenarioIds.includes(id))) {
    throw new Error('PAGE_PUBLICATION_MANIFEST_CONFLICT: manifest 与当前页面调用不一致')
  }
  for (const file of manifest.files) {
    const expectedVersion = file.fileName === 'rule.json' ? versions.rule
      : file.fileName === 'script.js' ? versions.script
        : versions.style
    if (expectedVersion !== file.version) {
      throw new Error(`PAGE_PUBLICATION_POINTER_CONFLICT: ${file.fileName} manifest 版本冲突`)
    }
  }
  return {publicationRef: versionId, manifest, assertCurrent: execution.assertCurrent}
}

type LowcodePageNavigationReceiptCommand = Readonly<{
  projectId: string
  pageId: string
  nodeId: string
  mainScenarioId?: string
  scenarioIds: readonly string[]
}>

type LowcodeReceiptFileReader = (
  commands: readonly ProjectModel.PageFileReadCommand[],
) => Promise<string[]>

type LowcodePageNavigationReceiptDetails = Readonly<{
  assertCurrent: () => void
  reason: string
  proof?: Pick<RuntimePageNavigationReceipt, 'publication' | 'files'>
}>

function receipt(state: RuntimePageNavigationReceipt['state'], details: LowcodePageNavigationReceiptDetails): RuntimePageNavigationReceipt {
  return {state, reason: details.reason, assertCurrent: details.assertCurrent, ...details.proof}
}

function findAuthorization(
  items: readonly LowcodeNavigationAuthorizationItem[],
  nodeId: string,
): LowcodeNavigationAuthorizationItem | undefined {
  for (const item of items) {
    if (item.id === nodeId) return item
    const child = findAuthorization(item.children, nodeId)
    if (child) return child
  }
  return undefined
}

async function proofDigest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Resolves an authorized menu call, its immutable publication and every runtime file proof
 * into one receipt. Navigation keeps only blueprint identity; VersionId remains a server-side pointer.
 */
export async function resolveLowcodePageNavigationReceipt(
  command: LowcodePageNavigationReceiptCommand,
  readFiles: LowcodeReceiptFileReader = readLowcodePageFiles,
): Promise<RuntimePageNavigationReceipt> {
  if (!lowcodeApi.session.isAuthenticated()) {
    return receipt('AUTH_MISSING', {assertCurrent: () => {
      if (lowcodeApi.session.isAuthenticated()) {
        throw new Error('PAGE_NAVIGATION_RECEIPT_SCOPE_STALE: 原导航调用缺少认证上下文')
      }
    }, reason: '当前会话未通过认证'})
  }
  const active = lowcodeApi.application.get()
  if (active?.application.id !== command.projectId) {
    return receipt('IDENTITY_CONFLICT', {assertCurrent: () => {
      if (lowcodeApi.application.get()?.application.id === command.projectId) {
        throw new Error('PAGE_NAVIGATION_RECEIPT_SCOPE_STALE: 原应用调用身份已变化')
      }
    }, reason: '页面调用应用与当前执行应用不一致'})
  }
  const execution = readLowcodeExecutionProject()
  execution.assertCurrent()
  if (execution.projectId !== command.projectId) {
    throw new Error('PAGE_NAVIGATION_RECEIPT_SCOPE_STALE: 发布解析所属应用已失效')
  }
  const records = await lowcodeBlueprintRecords.readRecords(command.projectId)
  execution.assertCurrent()
  const record = records.find(item => item.nodeId === command.nodeId)
  if (record === undefined) {
    return receipt('IDENTITY_CONFLICT', {assertCurrent: execution.assertCurrent, reason: '导航节点没有匹配的蓝图记录'})
  }
  const authorization = await readNavigationAuthorizationDataView({
    applicationId: command.projectId,
    navigationRootId: active.navigationRootId,
    assertCurrent: execution.assertCurrent,
  })
  execution.assertCurrent()
  const authorizedNode = findAuthorization(authorization.items, record.nodeId)
  if (!record.navigation?.publishInMenu || !authorizedNode) {
    return receipt('BLUEPRINT_ONLY', {assertCurrent: execution.assertCurrent, reason: '蓝图节点未出现在正式授权菜单中'})
  }
  const target = record.navigation.target
  if (record.projectId !== command.projectId || target === undefined || !target.startsWith('cfg:')
    || ProjectModel.parseConfigToolPageId(target) !== command.pageId || authorizedNode.target !== target) {
    return receipt('IDENTITY_CONFLICT', {assertCurrent: execution.assertCurrent, reason: '授权菜单工具身份与页面调用不一致'})
  }
  const blueprintScenarioId = record.dataSpace?.scenarioId
  if (!blueprintScenarioId || !command.mainScenarioId) {
    return receipt('SCENARIO_MISSING', {assertCurrent: execution.assertCurrent, reason: '主场景身份缺失'})
  }
  if (blueprintScenarioId !== command.mainScenarioId || !command.scenarioIds.includes(blueprintScenarioId)) {
    return receipt('IDENTITY_CONFLICT', {assertCurrent: execution.assertCurrent, reason: '蓝图主场景与页面调用场景不一致'})
  }
  const raw = record.source['VersionId'] ?? record.source['versionId']
  const versionId = typeof raw === 'string' ? raw.trim() : ''
  if (!versionId) return receipt('MANIFEST_MISSING', {assertCurrent: execution.assertCurrent, reason: '授权菜单没有可读的发布清单指针'})
  const versions = ProjectModel.parsePageToolPublicationVersions(versionId)
  if (versions.manifest === null || versions.rule === null || versions.script === null || versions.style === null) {
    return receipt('MANIFEST_MISSING', {assertCurrent: execution.assertCurrent, reason: '当前导航发布仅有旧三文件指针或指针不完整'})
  }
  const io = createPageToolFilesIo(command.projectId)
  let manifestText: string | null
  try {
    manifestText = await io.readVersion({
      appId: command.projectId, customPath: toolFilePath(command.projectId, command.pageId),
      fileName: 'publication-manifest.json', version: versions.manifest,
    })
  } catch {
    execution.assertCurrent()
    return receipt('MANIFEST_MISSING', {assertCurrent: execution.assertCurrent, reason: '发布清单不可读'})
  }
  execution.assertCurrent()
  if (manifestText === null) {
    return receipt('MANIFEST_MISSING', {assertCurrent: execution.assertCurrent, reason: '发布清单文件不存在'})
  }
  let manifest: Awaited<ReturnType<typeof parsePageToolPublicationManifest>>
  try {
    manifest = await parsePageToolPublicationManifest(manifestText)
  } catch {
    execution.assertCurrent()
    return receipt('MANIFEST_MISSING', {assertCurrent: execution.assertCurrent, reason: '发布清单格式或内置 proof 不可读'})
  }
  execution.assertCurrent()
  if (manifest.pageId !== command.pageId) {
    return receipt('IDENTITY_CONFLICT', {assertCurrent: execution.assertCurrent, reason: '发布清单工具身份冲突'})
  }
  if (manifest.scenarioIds.length !== command.scenarioIds.length
    || manifest.scenarioIds.some(id => !command.scenarioIds.includes(id))) {
    const missing = command.scenarioIds.some(id => !manifest.scenarioIds.includes(id))
    return receipt(missing ? 'SCENARIO_MISSING' : 'IDENTITY_CONFLICT', {
      assertCurrent: execution.assertCurrent, reason: '发布清单场景集合与调用不一致',
    })
  }
  const expectedVersions = { 'rule.json': versions.rule, 'script.js': versions.script, 'style.css': versions.style } as const
  if (manifest.files.some(file => expectedVersions[file.fileName] !== file.version)) {
    return receipt('IDENTITY_CONFLICT', {assertCurrent: execution.assertCurrent, reason: '发布清单文件版本与蓝图指针冲突'})
  }
  const fileCommands = ProjectModel.PAGE_TOOL_FILE_NAMES.map(fileName => ({
    projectId: command.projectId, pageId: command.pageId, fileName, versionId,
  }))
  let texts: string[]
  try {
    texts = await readFiles(fileCommands)
  } catch {
    execution.assertCurrent()
    return receipt('MANIFEST_MISSING', {assertCurrent: execution.assertCurrent, reason: '发布工具文件不可读'})
  }
  execution.assertCurrent()
  if (texts.length !== fileCommands.length) {
    return receipt('MANIFEST_MISSING', {assertCurrent: execution.assertCurrent, reason: '发布工具文件 proof 不完整'})
  }
  const files: Array<NonNullable<RuntimePageNavigationReceipt['files']>[number]> = []
  for (const [index, fileName] of ProjectModel.PAGE_TOOL_FILE_NAMES.entries()) {
    const text = texts[index]
    const proof = manifest.files.find(file => file.fileName === fileName)
    if (text === undefined || proof === undefined) {
      return receipt('MANIFEST_MISSING', {assertCurrent: execution.assertCurrent, reason: `${fileName} 发布 proof 不完整`})
    }
    if (await proofDigest(text) !== proof.sha256) {
      return receipt('IDENTITY_CONFLICT', {assertCurrent: execution.assertCurrent, reason: `${fileName} 发布 proof 冲突`})
    }
    files.push({fileName, version: proof.version, text})
  }
  execution.assertCurrent()
  return receipt('READY', {
    assertCurrent: execution.assertCurrent,
    reason: '导航发布四文件 proof 已确认',
    proof: {
      publication: {publicationRef: versionId, manifest, assertCurrent: execution.assertCurrent},
      files,
    },
  })
}

/** 正式蓝图记录和后端授权证据，按节点身份投影宿主导航。 */
export type LowcodeRuntimeNavigationAssemblyInput = Readonly<{
  applicationName: string
  projectId: string
  navigationRootId: string
  records: readonly ProjectModel.ProjectBlueprintRecord[]
  authorization: LowcodeNavigationAuthorizationEvidence
}>

type RuntimeTargetProjection = Readonly<{
  targetKind: LowcodeNavigationTargetKind
  path?: string
  linkTarget?: 'new-tab'
}>

function isRootBlueprintParent(parentId: string): boolean {
  return parentId === '' || parentId === '0' || parentId === '000000'
}

function sortBlueprintRecords(records: readonly ProjectModel.ProjectBlueprintRecord[]): ProjectModel.ProjectBlueprintRecord[] {
  return [...records].sort((left, right) => (left.navigation?.order ?? 0) - (right.navigation?.order ?? 0) || left.nodeId.localeCompare(right.nodeId))
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

function runtimeTargetProjection(
  record: ProjectModel.ProjectBlueprintRecord,
): RuntimeTargetProjection {
  const target = (record.navigation?.target ?? '')
  if (target.startsWith('cfg:')) {
    if (!ProjectModel.parseConfigToolPageId(target)) throw new Error(`蓝图节点 ${record.nodeId} 的配置工具目标无效：${target}`)
    return { targetKind: 'route', path: buildConfigPageNavigationPath(record.nodeId, record.dataSpace?.scenarioId, target) }
  }
  const targetKind: LowcodeNavigationTargetKind = !target
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

/** 工作 Plan 必须绑定当前应用正式蓝图与同一次授权菜单中的原生节点。 */
export async function verifyLowcodeNativeApplicationPlan(command: Readonly<{
  projectId: string
  nodeId: string
  routePath: string
  scenarioId: string
  assertCurrent: () => void
}>): Promise<void> {
  command.assertCurrent()
  const active = lowcodeApi.application.get()
  if (active?.application.id !== command.projectId || !active.navigationRootId) {
    throw new Error('NATIVE_DATASET_PLAN_NAVIGATION_UNAUTHORIZED: 当前应用没有正式导航根')
  }
  const records = await lowcodeBlueprintRecords.readRecords(command.projectId)
  command.assertCurrent()
  const leaves = records.filter(record => record.nodeId === command.nodeId)
  const leaf = leaves.length === 1 ? leaves[0] : undefined
  const target = `vue:${command.routePath}`
  if (leaf?.projectId !== command.projectId || leaf.dataSpace?.scenarioId !== command.scenarioId
    || leaf.navigation?.publishInMenu !== true || leaf.navigation.target !== target) {
    throw new Error('NATIVE_DATASET_PLAN_NAVIGATION_UNAUTHORIZED: 原生入口与正式应用蓝图不一致')
  }
  const authorization = await readNavigationAuthorizationDataView({
    applicationId: command.projectId, navigationRootId: active.navigationRootId, assertCurrent: command.assertCurrent,
  })
  command.assertCurrent()
  const granted = findAuthorization(authorization.items, command.nodeId)
  if (lowcodeApi.application.get()?.navigationRootId !== active.navigationRootId || granted?.targetKind !== 'vue'
    || granted.target !== target || granted.formKey !== command.scenarioId) {
    throw new Error('NATIVE_DATASET_PLAN_NAVIGATION_UNAUTHORIZED: 当前人缺少本入口和主场景的正式授权')
  }
}

function buildRuntimeNavigationItem(
  record: ProjectModel.ProjectBlueprintRecord,
  childrenByParent: ReadonlyMap<string, readonly ProjectModel.ProjectBlueprintRecord[]>,
  authorizationById: ReadonlyMap<string, LowcodeNavigationAuthorizationItem>,
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
      projectId: record.projectId, pageId: ProjectModel.parseConfigToolPageId(record.navigation.target),
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
    if (item.disabled) continue
    if ((item.itemKind === 'page' || item.itemKind === 'system-page') && item.path !== undefined) {
      return item
    }
    const child = firstRuntimePage(item.children ?? [])
    if (child !== undefined) return child
  }
  return undefined
}

/** 无业务页的应用落到“应用设计”的首项（项目蓝图），保留其导航身份。 */
function runtimeLanding(
  businessItems: readonly RuntimeNavigationItem[],
  navigationItems: readonly RuntimeNavigationItem[],
): RuntimeNavigationItem | undefined {
  return firstRuntimePage(businessItems) ?? firstRuntimePage(applicationDesignItems(navigationItems))
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

/** 将 lowcode 记录和后端授权证据直接装配为应用壳唯一运行导航合同。 */
export function assembleLowcodeRuntimeNavigation(
  input: LowcodeRuntimeNavigationAssemblyInput,
): RuntimeNavigation {
  const authorizationById = new Map<string, LowcodeNavigationAuthorizationItem>()
  flattenAuthorizationItems(input.authorization.items, authorizationById)
  const candidates = input.records.filter(record => (
    record.navigation?.publishInMenu && authorizationById.has(record.nodeId)
  ))
  const candidateIds = new Set(candidates.map(record => record.nodeId))
  const childrenByParent = new Map<string, ProjectModel.ProjectBlueprintRecord[]>()
  for (const record of candidates) {
    const siblings = childrenByParent.get(record.parentNodeId) ?? []
    siblings.push(record)
    childrenByParent.set(record.parentNodeId, siblings)
  }
  const businessChildren = sortBlueprintRecords(
    candidates.filter(record => !candidateIds.has(record.parentNodeId)),
  ).map(record => buildRuntimeNavigationItem(record, childrenByParent, authorizationById))
  return applicationNavigation(input, businessChildren)
}

/** 系统设计页来自正式页面登记；业务菜单必须由授权后的投影传入。 */
function applicationNavigation(
  input: Pick<LowcodeRuntimeNavigationAssemblyInput, 'applicationName' | 'projectId' | 'navigationRootId'>,
  businessChildren: readonly RuntimeNavigationItem[],
): RuntimeNavigation {
  const navigationItems = withApplicationDesign(businessChildren)
  const landingItem = runtimeLanding(businessChildren, navigationItems)
  const homePath = landingItem?.itemKind === 'system-page'
    ? systemPageLandingPath(landingItem)
    : landingItem?.path
  return {
    id: input.navigationRootId,
    projectId: input.projectId,
    title: input.applicationName,
    childPlacement: 'header',
    ...(homePath === undefined ? {} : { homePath }),
    items: navigationItems,
  }
}

export async function readLowcodeRuntimeNavigation(projectId?: string): Promise<RuntimeNavigation> {
  const explicitProjectId = projectId?.trim()
  const activeContext = lowcodeApi.application.get()
  if (!explicitProjectId && activeContext === null) return lowcodeEnterpriseNavigation()
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
    const runtimeSession = new NativePageRuntimeSession()
    const runtime = runtimeSession.acquire({
      pageId: 'lowcode-runtime-navigation',
      scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY],
      mainScenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY,
      targetId: application.id,
      loadScenario: scenarioId => {
        assertExecutionScope()
        return loadLowcodeRuntimeScenario({projectId: executionProjectId, scenarioId})
      },
    })
    let owner: BlueprintWorkspaceDataView | undefined
    try {
      await readWithinExecutionScope(runtime.load())
      assertExecutionScope()
      const dataSet = runtime.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)
      if (!dataSet) throw new Error('启动导航运行时缺少正式蓝图 DataSet')
      owner = new BlueprintWorkspaceDataView(dataSet, application.id, assertExecutionScope)
      const records = await readWithinExecutionScope(owner.loadProjectRecords())
      const identity = {applicationName: application.name, projectId: application.id, navigationRootId}
      const root = records.find(record => record.nodeId === navigationRootId)
      // 新应用只有无目标的容器根和未发布节点时，尚无业务菜单可授权。
      // 缺少正式根、根本身有目标或有已发布子项仍走原授权查询，不将读取错误解释为空应用。
      const rootTarget = root?.source['NavigationUrl']
      const designOnly = root?.kind === 'module' && isRootBlueprintParent(root.parentNodeId)
        && typeof rootTarget === 'string' && rootTarget.trim() === '' && records.every(record => {
          if (record.nodeId === navigationRootId) return true
          // source 已由原查询权限过滤；只接受正式未发布值，缺字段或未知值不推断为空菜单。
          const flag = record.source['IsShowAtNav']
          return flag === false || flag === 0 || flag === '0'
        })
      assertExecutionScope()
      if (designOnly) return applicationNavigation(identity, [])
      const authorization = await readWithinExecutionScope(readNavigationAuthorizationDataView({applicationId: application.id,
        navigationRootId, assertCurrent: assertExecutionScope}))
      assertExecutionScope()
      return assembleLowcodeRuntimeNavigation({
        ...identity, records, authorization,
      })
    } finally {
      owner?.dispose()
      runtimeSession.dispose()
    }
  } catch (error) {
    assertExecutionScope()
    throw error
  }
}

function projectBlueprintRecordNode(
  record: ProjectModel.ProjectBlueprintRecord,
  childrenByParent: ReadonlyMap<string, readonly ProjectModel.ProjectBlueprintRecord[]>,
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
  const records = await lowcodeBlueprintRecords.readRecords(projectId)
  const recordIds = new Set(records.map(record => record.nodeId))
  const childrenByParent = new Map<string, ProjectModel.ProjectBlueprintRecord[]>()
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

function runtimeFileCacheOwner(projectId:string):string | undefined {
  const session=lowcodeApi.session.get()
  if(!session) return undefined
  return JSON.stringify([session.enterprise.id,session.identity.userId,projectId])
}

type ScopedRuntimeFileReadOptions = Readonly<{
  projectId: string
  locator: LowcodePlatform.LowcodeFileLocator
  staleMessage: string
  scope?: RuntimeFileCacheScope
  readVersion: () => Promise<string>
  readText: () => Promise<string>
}>

async function readScopedRuntimeFile(options: ScopedRuntimeFileReadOptions): Promise<string | null> {
  const captured = lowcodeApi.readRequestScope()
  const assertCurrent = (): void => {
    const current = lowcodeApi.readRequestScope()
    if (current.token !== captured.token || current.headers['X-AppId'] !== options.projectId) {
      throw new Error(`SPARK_EXECUTION_SCOPE_STALE: ${options.staleMessage}`)
    }
  }
  assertCurrent()
  try {
    return await readRuntimeFile({
      owner: runtimeFileCacheOwner(options.projectId),
      locator: options.locator,
      ...(options.scope === undefined ? {} : {scope: options.scope}),
      assertCurrent,
      readVersion: options.readVersion,
      readText: options.readText,
    })
  } catch (error) {
    assertCurrent()
    if (error instanceof LowcodePlatform.LowcodeApiError && error.code === 404) return null
    throw error
  }
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
  const executionScope = lowcodeApi.readRequestScope()
  const assertExecutionScope = (): void => {
    const current = lowcodeApi.readRequestScope()
    if (current.token !== executionScope.token || current.headers['X-AppId'] !== normalizedProjectId) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景历史创建执行身份已失效')
    }

  }
  const captureScenarioReadScope = (): (() => void) => {
    const captured = lowcodeApi.readRequestScope()
    const assertCurrent = (): void => {
      const current = lowcodeApi.readRequestScope()
      if (current.token !== captured.token || current.headers['X-AppId'] !== normalizedProjectId) {
        throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景历史读取身份已失效')
      }
    }
    assertCurrent()
    return assertCurrent
  }
  const submissionJournal = typeof window === 'undefined' ? undefined : (() => {
    const current = () => {
      const session = lowcodeApi.session.get()
      if (!session || lowcodeApi.readRequestScope().headers['X-AppId'] !== normalizedProjectId) throw new Error('SCENARIO_SUBMISSION_OWNER: 恢复记录缺少当前认证身份')
      return ProjectModel.createScenarioSubmissionJournal(window.localStorage,
        JSON.stringify([session.enterprise.id, session.enterprise.shortName, session.identity.userId, normalizedProjectId]))
    }
    return {
      read: (scenarioId: string) => current().read(scenarioId),
      begin: (scenarioId: string, text: string, baseline: string | null) => current().begin(scenarioId, text, baseline),
      settle: (capture: ProjectModel.ScenarioSubmissionCapture, outcome: 'confirmed' | 'not-applied') => current().settle(capture, outcome),
    }
  })()
  return {
    scenarioViews: {
      ...(submissionJournal ? {submissionJournal} : {}),
      readScope: () => lowcodeApi.readRequestScope().token,
      readText: async scenarioId => {
        const resource = resolveSystemScenarioResource(scenarioId)
        if (resource) {
            const scope = lowcodeApi.readRequestScope()
            const assertCurrent = (): void => {
              const current = lowcodeApi.readRequestScope()
              if (current.token !== scope.token || current.headers['X-AppId'] !== normalizedProjectId) {
                throw new Error('SPARK_EXECUTION_SCOPE_STALE: 仓内场景读取身份已失效')
              }
            }
            assertCurrent()
            const text = await readRepositoryScenarioText(resource, assertCurrent)
            assertCurrent()
            return text
        }
        const customPath = scenarioViewPath(normalizedProjectId, scenarioId)
        const locator={appType:'designfile',customPath,fileName:'pagedata.json'} as const
        return await readScopedRuntimeFile({
          projectId: normalizedProjectId, locator, staleMessage: '场景文件读取身份已失效',
          readVersion: () => lowcodeApi.design.readFileLastModified(locator),
          readText: () => lowcodeApi.design.readTextFile(locator),
        })
      },
      writeText: async (scenarioId, text, expectedText) => {
        const resource = resolveSystemScenarioResource(scenarioId)
        if (resource) {
          const currentScope = lowcodeApi.readRequestScope()
          if (currentScope.token !== executionScope.token || currentScope.headers['X-AppId'] !== normalizedProjectId) {
            throw new Error('SPARK_EXECUTION_SCOPE_STALE: 仓内场景保存执行身份已失效')
          }
          if (!import.meta.env.DEV) {
            throw new ProjectModel.ScenarioViewWriteNotAppliedError(resource.resourceId,
              'REPOSITORY_SCENARIO_READ_ONLY', '仓内系统场景只允许开发宿主保存')
          }
          if (typeof expectedText !== 'string') {
            throw new ProjectModel.ScenarioViewWriteNotAppliedError(resource.resourceId,
              'REPOSITORY_SCENARIO_BASELINE_MISSING', '仓内系统场景保存缺少已捕获的原文基线')
          }
          await writeRepositoryScenarioToHost(resource, text, expectedText)
          return
        }
        await scenarioFileUpload.uploadWorkingText({
          customPath: scenarioViewPath(normalizedProjectId, scenarioId), fileName: 'pagedata.json', text,
        })
        invalidateRuntimeFile(runtimeFileCacheOwner(normalizedProjectId),{
          appType:'designfile',customPath:scenarioViewPath(normalizedProjectId,scenarioId),fileName:'pagedata.json',
        })
      },
      listVersions: async scenarioId => {
        const assertCurrent = captureScenarioReadScope()
        const resource = resolveSystemScenarioResource(scenarioId)
        if (resource) {
          if (!import.meta.env.DEV) throw new Error('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE: 构建态不提供仓内场景历史')
          const versions = [...await listRepositoryScenarioVersions(resource)]
          assertCurrent()
          return versions
        }
        const versions = [...await lowcodeApi.design.listFileVersions({
          appType: 'designfile', customPath: scenarioViewPath(normalizedProjectId, scenarioId), fileName: 'pagedata.json',
        })]
        assertCurrent()
        return versions
      },
      readVersion: async (scenarioId, version) => {
        if (!Number.isSafeInteger(version) || version < 0) throw new Error('版本号必须为非负安全整数')
        const assertCurrent = captureScenarioReadScope()
        const resource = resolveSystemScenarioResource(scenarioId)
        if (resource) {
          if (!import.meta.env.DEV) throw new Error('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE: 构建态不提供仓内场景历史')
          const text = await readRepositoryScenarioVersion(resource, version)
          assertCurrent()
          return text
        }
        const bytes = await lowcodeApi.design.readFileBytes({ appType: 'designfile',
          customPath: scenarioViewPath(normalizedProjectId, scenarioId), fileName: formatFileSnapshotName(version, 'pagedata.json') })
        assertCurrent()
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      },
      createVersion: async ({scenarioId, version, text, onAttempt, assertCurrent}) => {
        assertExecutionScope()
        assertCurrent?.()
        new ProjectModel.ScenarioViewConfig(scenarioId, text)
        const customPath = scenarioViewPath(normalizedProjectId, scenarioId)
        const requestScope = lowcodeApi.readRequestScope()
        const scope = requestScope.token
        const resource = resolveSystemScenarioResource(scenarioId)
        if (resource) {
          if (!import.meta.env.DEV) throw new ProjectModel.ScenarioViewVersionNotAppliedError(resource.resourceId,
            scope, version, '构建态不提供仓内场景历史')
          if (requestScope.headers['X-AppId'] !== normalizedProjectId) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 仓内场景历史所属应用已失效')
          assertExecutionScope()
          if (scope !== executionScope.token) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 仓内场景历史执行身份已失效')
          const working = await readRepositoryScenarioText(resource, assertCurrent ?? (() => undefined))
          assertExecutionScope()
          assertCurrent?.()
          if (working !== text) throw new Error('SCENARIO_VIEW_CONFLICT: 仓内场景配置已改变')
          assertExecutionScope()
          await createRepositoryScenarioVersion({resource, scope, version, text, expectedText: working, onAttempt})
          assertExecutionScope()
          assertCurrent?.()
          return {version, fileName: formatFileSnapshotName(version, 'pagedata.json'), lastModified: null}
        }
        assertExecutionScope()
        const versions = await lowcodeApi.design.listFileVersions({ appType: 'designfile', customPath, fileName: 'pagedata.json' })
        assertExecutionScope()
        assertCurrent?.()
        if (versions.some(item => item.version === version
          || item.fileName === formatFileSnapshotName(version, 'pagedata.json'))) {
          throw new ProjectModel.ScenarioViewVersionNotAppliedError(`scenario:${scenarioId}`, scope, version,
            `场景快照编号 ${version} 已存在`)
        }
        assertExecutionScope()
        const working = await lowcodeApi.design.readTextFile({ appType: 'designfile', customPath, fileName: 'pagedata.json' })
        assertExecutionScope()
        assertCurrent?.()
        if (working !== text) throw new Error('SCENARIO_VIEW_CONFLICT: 远端场景配置已改变')
        const fileName = formatFileSnapshotName(version, 'pagedata.json')
        onAttempt({scenarioId, resourceId: `scenario:${scenarioId}`, scope, version, fileName, text})
        assertExecutionScope()
        assertCurrent?.()
        await scenarioFileUpload.uploadTextVersion({ customPath, fileName, text })
        assertExecutionScope()
        assertCurrent?.()
        const actual = await lowcodeApi.design.listFileVersions({ appType: 'designfile',
          customPath, fileName: 'pagedata.json' })
        assertExecutionScope()
        assertCurrent?.()
        const summary = actual.find(item => item.fileName === fileName && item.version === version)
        if (summary === undefined) throw new Error('SCENARIO_VIEW_VERSION_UNCONFIRMED: 已上传快照未出现在实际列表')
        const bytes = await lowcodeApi.design.readFileBytes({appType: 'designfile', customPath, fileName})
        assertExecutionScope()
        assertCurrent?.()
        if (new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes) !== text) {
          throw new Error('SCENARIO_VIEW_VERSION_UNCONFIRMED: 已上传快照原文回读不一致')
        }
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

/** Storage transport used only by the spark-data ProjectToolFile DataView adapter. */
export function createPageToolFilesIo(projectId:string){
  const appId=projectId.trim()
  return {
    list:async(app:string,page:string)=>{
      if(app!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      const folderPath=toolFilePath(appId,page)
      try {
        return (await lowcodeApi.design.listFiles({appType:'designfile',folderPath})).map(file=>file.name)
      } catch (error) {
        // 新工具首次写入前目录尚未生成。只接纳服务明确返回的目录不存在。
        if(error instanceof LowcodePlatform.LowcodeApiError && error.code===1003
          && /^(?:\[1003\]\s*)?文件夹路径不存在$/.test(error.message)) return []
        throw error
      }
    },
    read:async(app:string,page:string,name:string)=>{
      if(app!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      if(name.length===0||name!==name.trim()||name==='.'||name==='..'||/[\\/\u0000-\u001f\u007f]/.test(name))throw new Error('FILE_SCOPE: 文件名无效')
      const customPath=toolFilePath(appId,page),locator={appType:'designfile',customPath,fileName:name} as const
      return await readScopedRuntimeFile({
        projectId: appId, locator, staleMessage: '工具文件请求所属应用已失效',
        readVersion: () => lowcodeApi.design.readFileLastModified(locator),
        readText: () => lowcodeApi.design.readTextFile(locator),
      })
    },
    upload:async(command:Readonly<{appId:string;pageId:string;fileName:string;text:string;replace?:true}>)=>{
      if(command.appId!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      const file = {customPath:toolFilePath(appId,command.pageId),fileName:command.fileName,text:command.text}
      if(command.replace) await scenarioFileUpload.uploadWorkingText(file)
      else await scenarioFileUpload.uploadTextVersion(file)
      invalidateRuntimeFile(runtimeFileCacheOwner(appId),{appType:'designfile',customPath:file.customPath,fileName:file.fileName})
    },
    restoreWorkingFile:async(command:Readonly<{appId:string;pageId:string;fileName:string;text:string}>)=>{
      if(command.appId!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      const file={customPath:toolFilePath(appId,command.pageId),fileName:command.fileName,text:command.text}
      await scenarioFileUpload.uploadWorkingText(file)
      invalidateRuntimeFile(runtimeFileCacheOwner(appId),{appType:'designfile',customPath:file.customPath,fileName:file.fileName})
    },
    listVersions:async({appId:app,customPath,fileName}:{appId:string;customPath:string;fileName:string})=>{
      if(app!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      return [...await lowcodeApi.design.listFileVersions({appType:'designfile',customPath:assertProjectFilePath(appId,customPath),fileName})]
    },
    uploadVersion:async({appId:app,customPath,fileName,version,text}:{appId:string;customPath:string;fileName:string;version:number;text:string})=>{
      if(app!==appId||!Number.isSafeInteger(version)||version<1)throw new Error('FILE_SCOPE: 快照应用或版本号无效')
      await scenarioFileUpload.uploadTextVersion({customPath:assertProjectFilePath(appId,customPath),
        fileName:formatFileSnapshotName(version,fileName),text})
    },
    readVersion:async({appId:app,customPath,fileName,version}:{appId:string;customPath:string;fileName:string;version:number}):Promise<string|null>=>{
      if(app!==appId||!Number.isSafeInteger(version)||version<0)throw new Error('FILE_SCOPE: 快照应用或版本号无效')
      const path=assertProjectFilePath(appId,customPath)
      const versionedName=formatFileSnapshotName(version,fileName)
      const locator={appType:'designfile',customPath:path,fileName:versionedName} as const
      return await readScopedRuntimeFile({
        projectId: appId, locator,
        scope:{mode:'published',sourceRevision:`published:${versionedName}`,publicationRef:`${versionedName}@${fileName}`},
        staleMessage: '文件快照所属应用已失效',
        readVersion:()=>Promise.resolve(`published:${versionedName}`),
        readText:async()=>{
          const bytes=await lowcodeApi.design.readFileBytes(locator)
          return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)
        },
      })
    },
    remove:async(app:string,page:string,name:string)=>{
      if(app!==appId)throw new Error('FILE_SCOPE: appId 不匹配')
      await lowcodeApi.design.removeFile({appType:'designfile',customPath:toolFilePath(appId,page),fileName:name})
      invalidateRuntimeFile(runtimeFileCacheOwner(appId),{appType:'designfile',customPath:toolFilePath(appId,page),fileName:name})
    },
  }
}

/** 选择应用并返回当前性凭据；beforeCommit在应用会话保存前同步核宿主条件，异步恢复后仍须检查凭据。 */
export async function activateLowcodeApplication(
  applicationId: string,
  signal?: AbortSignal,
  beforeCommit?: () => void,
): Promise<LowcodePlatform.LowcodeApplicationSelectionReceipt> {
  const normalizedId = applicationId.trim()
  if (!normalizedId) throw new Error('应用 ID 不能为空')
  const activation = await lowcodeApi.platform.activateApplication(normalizedId, signal, beforeCommit)
  activation.assertCurrent()
  return activation
}

/** 开始新的应用目录意图、清空当前应用，并返回平台签发的当前性凭据。 */
export function enterLowcodeApplicationCatalog(): LowcodePlatform.LowcodeApplicationSelectionReceipt {
  return lowcodeApi.platform.enterApplicationCatalog()
}
