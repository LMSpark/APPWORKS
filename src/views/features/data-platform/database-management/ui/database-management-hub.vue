<!--
@module app:views/features/data-platform/database-management/ui/database-management-hub
职责：数据库管理组合入口；一次解析目录 DataSet 身份并 provide，子页 inject 后走同一 spark-data 链。
-->
<template>
  <section class="database-management-hub">
    <header class="database-management-hub__header">
      <h2>数据库管理</h2>
      <p>服务器注册与库表视图目录均经 spark-data（FormKey = Base_DataSet.rowid）。</p>
      <p v-if="resolvePending" class="database-management-hub__resolve-status" role="status">正在解析数据空间身份（FormKey = Base_DataSet.rowid）…</p>
      <p v-else-if="resolveError" class="database-management-hub__resolve-status" role="status">{{ resolveError }}</p>
      <p v-else-if="catalogFormalTier === 'full' && resolvedScenarioId" class="database-management-hub__resolve-ok" role="status">
        FormKey 已解析（五表正式模型齐）。
      </p>
    </header>
    <nav class="database-management-hub__tabs" role="tablist" aria-label="数据库管理分区">
      <button type="button" role="tab" :aria-selected="tab === 'server'" :class="{active: tab === 'server'}" @click="tab = 'server'">服务器</button>
      <button type="button" role="tab" :aria-selected="tab === 'catalog'" :class="{active: tab === 'catalog'}" @click="tab = 'catalog'">表和视图</button>
    </nav>
    <div class="database-management-hub__panel" role="tabpanel">
      <KeepAlive>
        <ServiceManagementPage v-if="tab === 'server'" key="server" />
        <TableAndViewPage v-else key="catalog" />
      </KeepAlive>
    </div>
  </section>
</template>

<script setup lang="ts">
import {computed, KeepAlive, onBeforeUnmount, provide, ref, shallowRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import {DATABASE_CATALOG_CONTEXT} from '@/lowcode/resources/database/database-catalog-context'
import {
  DATABASE_CATALOG_SERVER_ONLY_NOTICE,
  resolveDatabaseCatalogScenarioTiered,
  type DatabaseCatalogFormalTier,
} from '@/lowcode/resources/database/database-catalog-scenario'
import {DATABASE_SERVER_MODEL} from '@/lowcode/resources/database/lowcode-database-server'
import {DATABASE_CATALOG_SCENARIO_META_NAMES} from '@/lowcode/resources/database/lowcode-database-table-view'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import ServiceManagementPage from './service-management-page.vue'
import TableAndViewPage from '../table-and-view/ui/table-and-view-page.vue'

const route = useRoute()
const tab = ref<'server' | 'catalog'>('catalog')
const preferredScenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const navigationNodeId = computed(() => typeof route.meta['nodeId'] === 'string' ? route.meta['nodeId'] : undefined)
const resolvedScenarioId = shallowRef<string>()
const resolveError = ref('')
const catalogFormalTier = shallowRef<DatabaseCatalogFormalTier>()
const resolvePending = computed(() => {
  const preferred = preferredScenarioId.value.trim()
  return Boolean(preferred && !resolvedScenarioId.value?.trim() && !resolveError.value)
})
const requestScopeFingerprint = computed(() => {
  const scope = lowcodeApi.readRequestScope()
  return `${scope.token}:${scope.headers['X-AppId'] ?? ''}`
})
provide(DATABASE_CATALOG_CONTEXT, {preferredScenarioId, navigationNodeId, resolvedScenarioId, resolveError, catalogFormalTier})

let resolveGeneration = 0
let scopeToken = ''
const stopResolve = watch([preferredScenarioId, navigationNodeId, requestScopeFingerprint], async () => {
  const preferred = preferredScenarioId.value.trim()
  const own = ++resolveGeneration
  resolvedScenarioId.value = undefined
  resolveError.value = ''
  catalogFormalTier.value = undefined
  if (!preferred) return
  const scope = lowcodeApi.readRequestScope()
  scopeToken = scope.token
  const assertCurrent = (): void => {
    if (lowcodeApi.readRequestScope().token !== scopeToken) throw new Error('数据库目录身份解析所属应用或登录身份已变化')
  }
  try {
    const {dataSpaceId, tier} = await resolveDatabaseCatalogScenarioTiered({
      preferredScenarioId: preferred,
      fullMetaNames: DATABASE_CATALOG_SCENARIO_META_NAMES,
      serverMetaNames: [DATABASE_SERVER_MODEL],
      assertCurrent,
      ...(navigationNodeId.value === undefined ? {} : {navigationNodeId: navigationNodeId.value}),
    })
    if (own !== resolveGeneration) return
    resolvedScenarioId.value = dataSpaceId
    catalogFormalTier.value = tier
    if (tier === 'serverOnly') resolveError.value = DATABASE_CATALOG_SERVER_ONLY_NOTICE
  } catch (cause) {
    if (own === resolveGeneration) {
      resolvedScenarioId.value = undefined
      catalogFormalTier.value = undefined
      resolveError.value = cause instanceof Error ? cause.message : String(cause)
    }
  }
}, {immediate: true})

onBeforeUnmount(() => {
  resolveGeneration++
  stopResolve()
})
</script>

<style scoped>
.database-management-hub { display: grid; gap: 0; min-height: 100%; background: var(--el-bg-color); }
.database-management-hub__header { padding: 16px 24px 0; }
.database-management-hub__header h2 { margin: 0 0 4px; font-size: 18px; }
.database-management-hub__header p { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }
.database-management-hub__resolve-status { margin-top: 8px !important; color: var(--el-color-warning); font-size: 12px; max-width: 72rem; }
.database-management-hub__resolve-ok { margin-top: 8px !important; color: var(--el-color-success); font-size: 12px; }
.database-management-hub__tabs { display: flex; gap: 8px; padding: 12px 24px; border-bottom: 1px solid var(--el-border-color-lighter); }
.database-management-hub__tabs button {
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  border-radius: 4px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
}
.database-management-hub__tabs button.active { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.database-management-hub__panel :deep(.database-server-page),
.database-management-hub__panel :deep(.table-and-view-page) { padding-top: 8px; }
.database-management-hub__panel :deep(h1) { display: none; }
</style>
