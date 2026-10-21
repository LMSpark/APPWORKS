/**
 * @module app:lowcode/resources/database/database-catalog-context
 * 职责：Hub 与子页共享目录 DataSet 身份（Base_DataSet.rowid）；子页 inject 优先于 route.meta。
 */
import {computed, inject, type ComputedRef, type InjectionKey, type Ref} from 'vue'
import {useRoute} from 'vue-router'
import type {DatabaseCatalogFormalTier, DatabaseCatalogLoadOptions} from './database-catalog-scenario'

export type DatabaseCatalogContext = Readonly<{
  /** 导航 blueprintScenarioId（可能误绑 nodeId，须经 resolve）。 */
  preferredScenarioId: Ref<string>
  navigationNodeId: Ref<string | undefined>
  /** Hub 解析后的正式 dataSpaceId；未就绪时为 undefined。 */
  resolvedScenarioId: Ref<string | undefined>
  /** Hub 解析失败时的诊断文案；serverOnly 时为五表缺口警告。 */
  resolveError: Ref<string>
  /** Hub 正式模型档位；未解析完为 undefined。 */
  catalogFormalTier: Ref<DatabaseCatalogFormalTier | undefined>
}>

export const DATABASE_CATALOG_CONTEXT: InjectionKey<DatabaseCatalogContext> = Symbol('databaseCatalogContext')

/** 子页：Hub inject 的 resolved/preferred 优先于本组件 useRoute().meta。 */
export function useDatabaseCatalogRouteScenario(): Readonly<{
  scenarioId: ComputedRef<string>
  navigationNodeId: ComputedRef<string | undefined>
  catalogLoadOptions: ComputedRef<DatabaseCatalogLoadOptions>
  /** 在 Hub 内且身份解析尚未结束（无 resolved、无 resolveError）。 */
  catalogAwaitingHubResolve: ComputedRef<boolean>
  /** Hub 已报解析失败；子页勿再用 preferred 重试 resolve。 */
  catalogHubResolveFailed: ComputedRef<boolean>
  /** Hub 内表和视图目录因五表未齐被阻断（serverOnly）。 */
  catalogHubCatalogBlocked: ComputedRef<boolean>
  catalogFormalTier: ComputedRef<DatabaseCatalogFormalTier | undefined>
}> {
  const route = useRoute()
  const catalogContext = inject(DATABASE_CATALOG_CONTEXT, undefined)
  const catalogAwaitingHubResolve = computed(() => {
    if (!catalogContext) return false
    if (catalogContext.resolvedScenarioId.value?.trim()) return false
    if (catalogContext.resolveError.value) return false
    return Boolean(catalogContext.preferredScenarioId.value.trim())
  })
  const catalogHubResolveFailed = computed(() =>
    Boolean(catalogContext?.resolveError.value && !catalogContext.resolvedScenarioId.value?.trim()))
  const catalogHubCatalogBlocked = computed(() => {
    if (!catalogContext) return false
    const tier = catalogContext.catalogFormalTier.value
    if (tier === undefined) return Boolean(catalogContext.resolvedScenarioId.value?.trim())
    return tier !== 'full'
  })
  const scenarioId = computed(() => {
    if (catalogContext) {
      const resolved = catalogContext.resolvedScenarioId.value?.trim()
      if (resolved) return resolved
      if (catalogContext.resolveError.value) return ''
      return ''
    }
    return typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : ''
  })
  const navigationNodeId = computed(() => {
    const fromContext = catalogContext?.navigationNodeId.value
    if (fromContext !== undefined) return fromContext
    return typeof route.meta['nodeId'] === 'string' ? route.meta['nodeId'] : undefined
  })
  const catalogLoadOptions = computed((): DatabaseCatalogLoadOptions => {
    const resolved = catalogContext?.resolvedScenarioId.value?.trim()
    const nav = navigationNodeId.value
    if (resolved && nav !== undefined) return {navigationNodeId: nav, resolvedDataSpaceId: resolved}
    if (resolved) return {resolvedDataSpaceId: resolved}
    if (nav !== undefined) return {navigationNodeId: nav}
    return {}
  })
  const catalogFormalTier = computed(() => catalogContext?.catalogFormalTier.value)
  return {
    scenarioId,
    navigationNodeId,
    catalogLoadOptions,
    catalogAwaitingHubResolve,
    catalogHubResolveFailed,
    catalogHubCatalogBlocked,
    catalogFormalTier,
  }
}
