/**
 * @module app:lowcode/resources/database/database-catalog-scenario
 * 职责：解析数据库目录 FormKey。dataSpaceId = 正式 Base_DataSet.rowid = 运行 DataSet.scenarioId = x-FormKey，不是导航 nodeId。
 * 蓝图 hidden 节点若把 nodeId 写入 dataSpace.scenarioId 则无效；合并蓝图标题与候选后再 readModelBatch。
 * getDatabaseCatalog 仅用于 FormKey 探测（sourceDataSpaces），不参与页面列表/CRUD，不是第二套 DataSet 读链。
 */
import { getNavTree } from '@spark-appworks/spark-app'
import type { RuntimeNavigationItem } from '@spark-appworks/spark-app'
import { DATA_SPACE_DESIGN_FORM_KEY, type LowcodeProjectBlueprintRecord } from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '../../lowcode-runtime'

const DATABASE_NAV_PATH_MARKERS = ['database-management', 'DataBaseManage'] as const

const DATABASE_CATALOG_NAVIGATION_TITLES = new Set(['数据库管理', '数据资源管理', '结构化配置'])

function isDatabaseManagementPath(path: string | undefined): boolean {
  if (!path) return false
  return DATABASE_NAV_PATH_MARKERS.some(marker => path.includes(marker))
}

function walkDatabaseScenarioIds(items: readonly RuntimeNavigationItem[], sink: string[]): void {
  for (const item of items) {
    if (isDatabaseManagementPath(item.path) && typeof item.blueprintScenarioId === 'string') {
      const id = item.blueprintScenarioId.trim()
      if (id && id.toUpperCase() !== item.id.toUpperCase()) sink.push(id)
    }
    if (item.children?.length) walkDatabaseScenarioIds(item.children, sink)
  }
}

function orderCatalogScenarioCandidates(
  preferredScenarioId: string,
  candidates: readonly string[],
  navigationNodeId?: string,
): readonly string[] {
  const preferred = preferredScenarioId.trim()
  const unique = [...new Set(candidates.map(id => id.trim()).filter(Boolean))]
  const nav = navigationNodeId?.trim()
  const misboundPreferred = nav && preferred.toUpperCase() === nav.toUpperCase()
  const withoutNavDuplicate = nav
    ? unique.filter(id => id.toUpperCase() !== nav.toUpperCase())
    : unique
  if (!preferred) return withoutNavDuplicate
  if (misboundPreferred) return [...withoutNavDuplicate.filter(id => id !== preferred), preferred]
  return [preferred, ...withoutNavDuplicate.filter(id => id !== preferred)]
}

export const DATABASE_CATALOG_RESOLVE_HINT =
  'dataSpaceId 须为 Base_DataSet.rowid（= DataSet.scenarioId = x-FormKey），不是导航 nodeId。'
  + ' 见 notes/research-database-catalog-dataset-identity.md 与 notes/evidence/database-management-i5/live-pilot-formal-model-gap.json'

export type DatabaseCatalogLoadOptions = Readonly<{
  /** 当前系统页导航 nodeId；与 blueprintScenarioId 相同时视为误绑，解析时降权。 */
  navigationNodeId?: string
  /** Hub 已 batch 校验的 DataSet rowid；传入则 loadCatalog 跳过二次 resolve。 */
  resolvedDataSpaceId?: string
}>

const CACHE_STORAGE_PREFIX = 'spark:dbCatalogFormKey:'
const memoryResolveCache = new Map<string, string>()

/** 测试或 scope 切换时清空解析缓存。 */
export function clearDatabaseCatalogResolveCache(): void {
  memoryResolveCache.clear()
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
}

export function metaNamesFingerprint(metaNames: readonly string[]): string {
  return [...metaNames].sort().join('|')
}

function cacheMemoryKey(scopeToken: string, applicationId: string, preferred: string, fingerprint: string): string {
  return `${scopeToken}\0${applicationId}\0${preferred}\0${fingerprint}`
}

function readResolveCache(scopeToken: string, applicationId: string, preferred: string, fingerprint: string): string | undefined {
  const mem = memoryResolveCache.get(cacheMemoryKey(scopeToken, applicationId, preferred, fingerprint))
  if (mem) return mem
  if (typeof sessionStorage === 'undefined') return undefined
  try {
    const raw = sessionStorage.getItem(`${CACHE_STORAGE_PREFIX}${applicationId}:${preferred}`)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as {fingerprint?: string; dataSpaceId?: string; scopeToken?: string}
    if (
      parsed.fingerprint !== fingerprint
      || parsed.scopeToken !== scopeToken
      || typeof parsed.dataSpaceId !== 'string'
    ) return undefined
    return parsed.dataSpaceId.trim() || undefined
  } catch {
    return undefined
  }
}

function writeResolveCache(
  scopeToken: string,
  applicationId: string,
  preferred: string,
  fingerprint: string,
  dataSpaceId: string,
): void {
  memoryResolveCache.set(cacheMemoryKey(scopeToken, applicationId, preferred, fingerprint), dataSpaceId)
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(
      `${CACHE_STORAGE_PREFIX}${applicationId}:${preferred}`,
      JSON.stringify({fingerprint, dataSpaceId, scopeToken}),
    )
  } catch {
    /* quota / private mode */
  }
}

export type DatabaseCatalogFormalTier = 'full' | 'serverOnly'

export type DatabaseCatalogTieredResolve = Readonly<{
  dataSpaceId: string
  tier: DatabaseCatalogFormalTier
}>

export type DatabaseCatalogResolveDiagnostics = Readonly<{
  candidateCount?: number
  misboundPreferred?: boolean
}>

export const DATABASE_CATALOG_SERVER_ONLY_NOTICE =
  '当前 FormKey 下仅 Base_serverInfo 正式模型可用，库/表/视图五表 readModelBatch 未齐。'
  + ' 见 notes/evidence/database-management-i5/live-pilot-formal-model-gap.json'

export function formatDatabaseCatalogResolveFailure(
  lastError: unknown,
  diagnostics: DatabaseCatalogResolveDiagnostics = {},
): Error {
  const detail = lastError instanceof Error ? lastError.message : String(lastError)
  const extra: string[] = []
  if (diagnostics.misboundPreferred) extra.push('导航 blueprintScenarioId 与 nodeId 相同，已降权。')
  if (diagnostics.candidateCount !== undefined) extra.push(`已尝试 ${diagnostics.candidateCount} 个候选 FormKey。`)
  const tail = extra.length > 0 ? ` ${extra.join(' ')}` : ''
  return new Error(`${DATABASE_CATALOG_RESOLVE_HINT}${tail} ${detail}`)
}

function resolveDiagnostics(
  preferred: string,
  navigationNodeId: string | undefined,
  candidateCount: number,
): DatabaseCatalogResolveDiagnostics {
  const nav = navigationNodeId?.trim()
  const misboundPreferred = Boolean(nav && preferred.toUpperCase() === nav.toUpperCase())
  return {candidateCount, misboundPreferred}
}

/** 从蓝图 flat 记录收集数据库目录相关 dataSpace.scenarioId（与历史 DBMS 标题集合一致）。 */
export function collectBlueprintDatabaseCatalogScenarioIds(
  records: readonly LowcodeProjectBlueprintRecord[],
): readonly string[] {
  const result: string[] = []
  for (const record of records) {
    const scenarioId = record.dataSpace?.scenarioId?.trim()
    if (!scenarioId) continue
    const title = record.navigation?.title ?? record.capability.name
    const target = record.navigation?.target?.toLowerCase() ?? ''
    if (DATABASE_CATALOG_NAVIGATION_TITLES.has(title) || target.includes('databasecodelist')) result.push(scenarioId)
  }
  return [...new Set(result)]
}

/** 当前路由 FormKey 优先，再合并数据库管理相关导航节点的 blueprintScenarioId。 */
export function collectDatabaseCatalogScenarioCandidates(preferredScenarioId: string): readonly string[] {
  const ordered: string[] = []
  const preferred = preferredScenarioId.trim()
  if (preferred) ordered.push(preferred)
  const root = getNavTree()
  if (root?.items?.length) walkDatabaseScenarioIds(root.items, ordered)
  return [...new Set(ordered)]
}

/** 仅 identity 探测：从 GetBaseData 聚合结果反推有效 FormKey，不返回目录行给 UI。 */
async function collectCatalogProbeScenarioIds(candidates: readonly string[]): Promise<readonly string[]> {
  if (candidates.length === 0) return []
  const readCatalog = lowcodeApi.catalog?.getDatabaseCatalog
  if (!readCatalog) return []
  try {
    const catalog = await readCatalog.call(lowcodeApi.catalog, candidates)
    const keys = Object.values(catalog.sourceDataSpaces)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    return [...new Set(keys)]
  } catch {
    return []
  }
}

async function buildDatabaseCatalogScenarioCandidates(
  preferredScenarioId: string,
  navigationNodeId?: string,
): Promise<readonly string[]> {
  const preferred = preferredScenarioId.trim()
  const nav = collectDatabaseCatalogScenarioCandidates(preferredScenarioId)
  const blueprint: string[] = []
  const application = lowcodeApi.application?.get?.() ?? null
  if (application !== null && lowcodeApi.blueprint?.readRecords) {
    const records = await lowcodeApi.blueprint.readRecords(application.application.id)
    blueprint.push(...collectBlueprintDatabaseCatalogScenarioIds(records))
  }
  const probeSeed = [...new Set([...(preferred ? [preferred] : []), ...blueprint, ...nav])]
  const probe = await collectCatalogProbeScenarioIds(probeSeed)
  const merged = [...new Set([...(preferred ? [preferred] : []), ...blueprint, ...probe, ...nav])]
  return orderCatalogScenarioCandidates(preferred, merged, navigationNodeId)
}

type ResolveDatabaseCatalogScenarioInput = Readonly<{
  preferredScenarioId: string
  metaNames: readonly string[]
  assertCurrent: () => void
  navigationNodeId?: string
}>

async function verifyCatalogDataSpaceId(
  dataSpaceId: string,
  metaNames: readonly string[],
  assertCurrent: () => void,
): Promise<void> {
  assertCurrent()
  await lowcodeApi.dataSpace.design.readModelBatch({
    designScenarioId: DATA_SPACE_DESIGN_FORM_KEY,
    dataSpaceId,
    metaNames,
    assertCurrent,
  })
}

/** 在候选 FormKey 上批量 readModelBatch，返回首个指定 metaNames 均可正式装配的空间 ID。 */
export async function resolveDatabaseCatalogScenarioId(input: ResolveDatabaseCatalogScenarioInput): Promise<string> {
  const preferred = input.preferredScenarioId.trim()
  if (!preferred) throw formatDatabaseCatalogResolveFailure(new Error('数据库目录缺少导航绑定的 dataSpaceId'))
  const fingerprint = metaNamesFingerprint(input.metaNames)
  const scope = lowcodeApi.readRequestScope()
  const applicationId = lowcodeApi.application?.get?.()?.application.id ?? ''
  const cached = applicationId
    ? readResolveCache(scope.token, applicationId, preferred, fingerprint)
    : undefined
  if (cached) {
    try {
      await verifyCatalogDataSpaceId(cached, input.metaNames, input.assertCurrent)
      return cached
    } catch {
      /* 缓存失效，继续候选探测 */
    }
  }
  const candidates = await buildDatabaseCatalogScenarioCandidates(preferred, input.navigationNodeId)
  if (candidates.length === 0) {
    throw formatDatabaseCatalogResolveFailure(
      new Error('无候选 FormKey'),
      resolveDiagnostics(preferred, input.navigationNodeId, 0),
    )
  }
  const diagnostics = resolveDiagnostics(preferred, input.navigationNodeId, candidates.length)
  let lastError: unknown
  for (const dataSpaceId of candidates) {
    try {
      await verifyCatalogDataSpaceId(dataSpaceId, input.metaNames, input.assertCurrent)
      if (applicationId) writeResolveCache(scope.token, applicationId, preferred, fingerprint, dataSpaceId)
      return dataSpaceId
    } catch (error) {
      lastError = error
    }
  }
  throw formatDatabaseCatalogResolveFailure(lastError ?? new Error('候选数据空间均缺少完整正式模型'), diagnostics)
}

type ResolveDatabaseCatalogTieredInput = Readonly<{
  preferredScenarioId: string
  fullMetaNames: readonly string[]
  serverMetaNames: readonly string[]
  assertCurrent: () => void
  navigationNodeId?: string
}>

/** Hub：先五表 batch，失败则在同候选顺序上试 Base_serverInfo，仍是一个 rowid。 */
export async function resolveDatabaseCatalogScenarioTiered(
  input: ResolveDatabaseCatalogTieredInput,
): Promise<DatabaseCatalogTieredResolve> {
  try {
    const dataSpaceId = await resolveDatabaseCatalogScenarioId({
      preferredScenarioId: input.preferredScenarioId,
      metaNames: input.fullMetaNames,
      assertCurrent: input.assertCurrent,
      ...(input.navigationNodeId === undefined ? {} : {navigationNodeId: input.navigationNodeId}),
    })
    return {dataSpaceId, tier: 'full'}
  } catch (fullError) {
    try {
      const dataSpaceId = await resolveDatabaseCatalogScenarioId({
        preferredScenarioId: input.preferredScenarioId,
        metaNames: input.serverMetaNames,
        assertCurrent: input.assertCurrent,
        ...(input.navigationNodeId === undefined ? {} : {navigationNodeId: input.navigationNodeId}),
      })
      return {dataSpaceId, tier: 'serverOnly'}
    } catch {
      throw fullError instanceof Error ? fullError : formatDatabaseCatalogResolveFailure(fullError)
    }
  }
}

/** loadCatalog 统一解析 dataSpaceId；Hub 已 batch 校验的 resolved 不再探测或二次 batch。 */
export async function resolveDatabaseCatalogDataSpaceId(
  preferredScenarioId: string,
  metaNames: readonly string[],
  options: DatabaseCatalogLoadOptions,
  assertCurrent: () => void,
): Promise<string> {
  const preset = options.resolvedDataSpaceId?.trim()
  if (preset) return preset
  return resolveDatabaseCatalogScenarioId({
    preferredScenarioId,
    metaNames,
    assertCurrent,
    ...(options.navigationNodeId === undefined ? {} : {navigationNodeId: options.navigationNodeId}),
  })
}
