<!--
@module app:views/DataBaseManage/DataBaseManage/index
职责：数据库目录主列表；服务器与数据库均绑定本页正式 DataView，数据库单行新增通过原 DataSet 保存。
AI用途：数据库列表筛选、分页、明确服务器选择及跳转到正式表视图页面。
-->
<template>
  <section class="database-directory-page">
    <header>
      <h1>数据库管理</h1>
      <p>选择服务器后可新增数据库；数据库列表支持按字段筛选。</p>
    </header>
    <p v-if="loading" role="status">正在读取数据库目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="ready">
      <div class="database-directory-page__layout">
        <section aria-label="服务器选择" class="database-directory-page__servers">
          <h2>服务器</h2>
          <p v-if="serverError" role="alert">{{ serverError }}</p>
          <RendererTable :data-view-key="serverKey" :children="DATABASE_SERVER_LIST_FIELDS"
            :stripe="true" :on-row-click="chooseServer" :highlight-current-row="true"
            :show-pagination="true" :show-data-view-meta="false" />
        </section>
        <section aria-label="数据库列表" class="database-directory-page__databases">
          <h2>数据库</h2>
          <p v-if="databaseError" role="alert">{{ databaseError }}</p>
          <RendererTable :data-view-key="databaseKey" :children="DATABASE_DIRECTORY_LIST_FIELDS"
            :toolbar="toolbar" :filter="listFilter" :stripe="true" :on-row-click="chooseDatabase"
            :highlight-current-row="true" :show-pagination="true" :show-data-view-meta="false" />
        </section>
      </div>
      <RegisterDatabaseDialog v-if="editing" :catalog-key="databaseKey" :server-label="selectedServerLabel"
        :editing="editing" :busy="busy" :action-error="actionError" :unregistered-hint="unregisteredHint"
        :can-load-unregistered="canLoadUnregistered" @cancel="cancelEdit" @save="saveEdit"
        @load-unregistered="loadUnregisteredNames" />
      <p v-if="actionError && !editing" role="alert">{{ actionError }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {normalizeNavRuntimePath, resolveNavNodeRuntimeTarget, useNav, getNavTree,
  type RuntimeNavigationItem} from '@spark-appworks/spark-app'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, useSparkComponent,
  type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {useRoute} from 'vue-router'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {LowcodeDatabaseDirectory, DATABASE_DIRECTORY_COMMAND_INPUT_TABLE, DATABASE_DIRECTORY_LIST_FIELDS,
  DATABASE_DIRECTORY_UNREGISTERED_DATABASES_TABLE} from '@/lowcode/resources/database/lowcode-database-directory'
import {DATABASE_SERVER_MODEL} from '@/lowcode/resources/database/lowcode-database-server'
import {DATABASE_SERVER_LIST_FIELDS} from '@/lowcode/resources/database/database-server-catalog-metadata'
import {
  databaseCatalogDbBeginCreate,
  databaseCatalogDbCanCreate,
  databaseCatalogDbCancelEdit,
  databaseCatalogDbEditing,
  databaseCatalogDbSaveEdit,
  databaseCatalogQueryUnregisteredDbNames,
  databaseCatalogServerSelectedId,
  requireDatabaseCatalogDbView,
  requireDatabaseCatalogServerView,
  type DatabaseCatalogDbEditState,
} from '@/lowcode/resources/database/database-catalog-db-view-ops'
import RegisterDatabaseDialog from '@/views/features/data-platform/database-management/table-and-view/ui/register-database-dialog.vue'

const TABLE_VIEW_PATH = '/features/data-platform/database-management/table-and-view/ui/table-and-view-page'
const route = useRoute()
const nav = useNav()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'].trim() : '')
const scopeFingerprint = computed(() => {
  const scope = lowcodeApi.readRequestScope()
  return `${scope.token}:${scope.headers['X-AppId'] ?? ''}`
})
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'database-directory-page'})
const dataSet = shallowRef<DataSet>()
const serverView = shallowRef<DataView>()
const databaseView = shallowRef<DataView>()
const edit = shallowRef<DatabaseCatalogDbEditState>()
const ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0)
const busy = ref(false), actionError = ref(''), message = ref(''), unregisteredHint = ref('')
let runtime: PageRuntime | undefined
let unsubscribe: (() => void) | undefined
let generation = 0
let actionGeneration = 0
let active = true

const databaseKey = computed(() => buildDataViewKey('_base_dbInfo', 'default', dataSet.value?.scenarioId ?? scenarioId.value))
const serverKey = computed(() => buildDataViewKey(DATABASE_SERVER_MODEL, 'default', dataSet.value?.scenarioId ?? scenarioId.value))
const listFilter = computed<RFilterProps>(() => ({autoQuery: true, collapsible: true, defaultCollapsed: true}))
const databaseError = computed(() => {revision.value; return databaseView.value?.loadingError?.message ?? ''})
const serverError = computed(() => {revision.value; return serverView.value?.loadingError?.message ?? ''})
const editing = computed(() => {revision.value; const view = databaseView.value; return view ? databaseCatalogDbEditing(view, edit.value) : undefined})
const selectedServerLabel = computed(() => {
  revision.value
  const view = serverView.value
  if (!view) return ''
  const id = databaseCatalogServerSelectedId(view)
  const row = view.rows.find(item => String(view.getPkKey(item) ?? '') === id)
  return typeof row?.['ServerName'] === 'string' ? row['ServerName'] : id
})
const canLoadUnregistered = computed(() => Boolean(serverView.value && databaseCatalogServerSelectedId(serverView.value) && !busy.value))
const toolbar = computed<RToolbarProps>(() => {
  revision.value
  const databases = databaseView.value
  const servers = serverView.value
  return {children: [
    {type: 'r-button', props: {label: '新增数据库', disabled: busy.value || !!edit.value || !databases || !servers
      || !databaseCatalogDbCanCreate(databases, servers, edit.value), onClick: beginCreate}},
    {type: 'r-button', props: {label: '管理', disabled: busy.value || !selectedDatabase.value, onClick: openTableView}},
    {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
  ]}
})
function hasPendingWork(): boolean {
  if (busy.value || loading.value) return true
  const ds = dataSet.value
  if (!ds) return false
  return Object.values(ds.tables).some(table => Object.values(table.views).some(view =>
    view.mutating || view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()))
}
useSystemPageDirtySource({get isDirty() {return hasPendingWork()}})
const selectedDatabase = computed(() => {
  revision.value
  const view = databaseView.value
  const selected = view?.getSelectedValues() ?? []
  if (!view || selected.length !== 1) return undefined
  return view.rows.find(row => view.getPkKey(row) === selected[0])
})

function chooseServer(row: DataRow): void {
  const view = serverView.value
  const original = toRaw(row)
  if (busy.value || edit.value || !view?.rows.includes(original)) return
  view.setSelectedRows([original])
  revision.value++
}

function chooseDatabase(row: DataRow): void {
  const view = databaseView.value
  const original = toRaw(row)
  if (busy.value || edit.value || !view?.rows.includes(original)) return
  view.setSelectedRows([original])
  revision.value++
}

type ScopedNavigationNode = Readonly<{item: RuntimeNavigationItem; ancestorUnavailable: boolean}>

function findNodesById(options: {items: readonly RuntimeNavigationItem[]; id: string;
  matches?: ScopedNavigationNode[]; ancestorUnavailable?: boolean}): ScopedNavigationNode[] {
  const {items, id, matches = [], ancestorUnavailable = false} = options
  for (const item of items) {
    if (item.id === id) matches.push({item, ancestorUnavailable})
    if (item.children?.length) findNodesById({items: item.children, id, matches,
      ancestorUnavailable: ancestorUnavailable || item.hidden === true || item.disabled === true})
  }
  return matches
}

function findNavigationPaths(options: {items: readonly RuntimeNavigationItem[]; id: string;
  prefix?: readonly RuntimeNavigationItem[]; matches?: RuntimeNavigationItem[][]}): RuntimeNavigationItem[][] {
  const {items, id, prefix = [], matches = []} = options
  for (const item of items) {
    const path = [...prefix, item]
    if (item.id === id) matches.push(path)
    if (item.children?.length) findNavigationPaths({items: item.children, id, prefix: path, matches})
  }
  return matches
}

function canonicalNavigationPath(path: string): string {
  return normalizeNavRuntimePath(path.split(/[?#]/, 1)[0] ?? '')
}

function findNavigationTargets(options: {items: readonly RuntimeNavigationItem[]; path: string;
  matches?: ScopedNavigationNode[]; ancestorUnavailable?: boolean}): ScopedNavigationNode[] {
  const {items, path, matches = [], ancestorUnavailable = false} = options
  for (const item of items) {
    const target = resolveNavNodeRuntimeTarget(item)
    const unavailable = ancestorUnavailable || item.hidden === true || item.disabled === true
    if (target.kind === 'route' && canonicalNavigationPath(target.path) === path) {
      matches.push({item, ancestorUnavailable})
    }
    if (item.children?.length) findNavigationTargets({items: item.children, path, matches, ancestorUnavailable: unavailable})
  }
  return matches
}

function appendDatabaseId(path: string, databaseId: string): string {
  const hashIndex = path.indexOf('#')
  const hash = hashIndex < 0 ? '' : path.slice(hashIndex)
  const withoutHash = hashIndex < 0 ? path : path.slice(0, hashIndex)
  const queryIndex = withoutHash.indexOf('?')
  const pathName = queryIndex < 0 ? withoutHash : withoutHash.slice(0, queryIndex)
  const query = new URLSearchParams(queryIndex < 0 ? '' : withoutHash.slice(queryIndex + 1))
  query.set('databaseId', databaseId)
  return `${pathName}?${query.toString()}${hash}`
}

function openTableView(): void {
  try {
    const view = databaseView.value
    const row = selectedDatabase.value
    if (!view || !row) throw new Error('请先选择数据库')
    const databaseId = view.getPkKey(row)
    if (typeof databaseId !== 'string' && typeof databaseId !== 'number' || String(databaseId).trim() === '') {
      throw new Error('所选数据库缺少正式主键')
    }
    if (!nav) throw new Error('表和视图管理导航尚未就绪')
    const routeNodeId = route.meta['nodeId']
    const activePath = nav.activePath.value
    if (route.meta['systemPageIdentityHost'] !== true || route.meta['systemPageIdentityState'] !== 'resolved'
      || typeof routeNodeId !== 'string' || routeNodeId.trim() === '' || activePath.length === 0
      || activePath.at(-1)?.id !== routeNodeId) {
      throw new Error('当前数据库目录导航身份尚未解析')
    }
    const moduleId = activePath[0]?.id
    const roots = getNavTree()?.items ?? []
    const modules = typeof moduleId === 'string' ? roots.filter(item => item.id === moduleId) : []
    const module = modules[0]
    if (modules.length !== 1 || !module) throw new Error('表和视图管理导航节点缺失、重复或不可用')
    const sourceNodes = findNodesById({items: [module], id: routeNodeId})
    const source = sourceNodes[0]
    if (sourceNodes.length !== 1 || !source || source.ancestorUnavailable || source.item.hidden || source.item.disabled) {
      throw new Error('表和视图管理导航节点缺失、重复或不可用')
    }
    const currentBranchPaths = findNavigationPaths({items: [module], id: routeNodeId})
    const currentBranchPath = currentBranchPaths[0]
    if (currentBranchPaths.length !== 1 || !currentBranchPath || currentBranchPath.length !== activePath.length
      || currentBranchPath.some((item, index) => item.id !== activePath[index]?.id)) {
      throw new Error('表和视图管理导航节点缺失、重复或不可用')
    }
    const targetPath = canonicalNavigationPath(TABLE_VIEW_PATH)
    const matches = findNavigationTargets({items: [module], path: targetPath})
    const target = matches[0]
    const targetKind = target ? resolveNavNodeRuntimeTarget(target.item) : undefined
    if (matches.length !== 1 || !target || target.ancestorUnavailable || target.item.hidden || target.item.disabled
      || targetKind?.kind !== 'route' || targetKind.routeKind !== 'page') {
      throw new Error('表和视图管理导航节点缺失、重复或不可用')
    }
    if (typeof target.item.path !== 'string') throw new Error('表和视图管理导航节点路径无效')
    actionError.value = ''
    nav.navigateTo({...target.item, path: appendDatabaseId(target.item.path, String(databaseId))})
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function act(operation: () => void | Promise<void>, success = ''): Promise<void> {
  const ds = dataSet.value
  const view = databaseView.value
  if (!ds || !view || busy.value) return
  const action = ++actionGeneration
  const current = () => dataSet.value === ds && databaseView.value === view && action === actionGeneration
  busy.value = true; actionError.value = ''; message.value = ''
  try {await operation(); if (current()) message.value = success}
  catch (cause) {if (current()) actionError.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (current()) {busy.value = false; revision.value++}}
}

async function beginCreate(): Promise<void> {
  await act(async () => {
    const db = databaseView.value
    const server = serverView.value
    if (!db || !server) return
    const ds = dataSet.value
    const action = actionGeneration
    unregisteredHint.value = ''
    const next = await databaseCatalogDbBeginCreate(db, server)
    if (dataSet.value === ds && databaseView.value === db && actionGeneration === action) edit.value = next
  })
}

async function cancelEdit(): Promise<void> {
  await act(() => {
    const view = databaseView.value
    const current = edit.value
    if (!view || !current) return
    edit.value = databaseCatalogDbCancelEdit(view, current)
    unregisteredHint.value = ''
  })
}

async function saveEdit(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const view = databaseView.value
    const current = edit.value
    if (!ds || !view || !current) return
    const action = actionGeneration
    const next = await databaseCatalogDbSaveEdit(ds, view, current) ?? undefined
    if (dataSet.value !== ds || databaseView.value !== view || actionGeneration !== action) return
    edit.value = next
    if (!edit.value) unregisteredHint.value = ''
  }, edit.value?.mode === 'add' ? '数据库已新增' : '数据库已保存')
}

async function loadUnregisteredNames(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const server = serverView.value
    const serverId = server ? databaseCatalogServerSelectedId(server) : ''
    if (!ds || !serverId) throw new Error('请先明确选择服务器')
    const action = actionGeneration
    const names = await databaseCatalogQueryUnregisteredDbNames(ds, serverId, {
      commandInput: DATABASE_DIRECTORY_COMMAND_INPUT_TABLE,
      unregisteredDbNames: DATABASE_DIRECTORY_UNREGISTERED_DATABASES_TABLE,
    })
    if (dataSet.value !== ds || serverView.value !== server || actionGeneration !== action) return
    unregisteredHint.value = names.length ? `未登记物理库名：${names.join('、')}` : '该服务器下没有未登记的物理库名'
  })
}

function release(): void {
  actionGeneration++
  busy.value = false; actionError.value = ''; message.value = ''; unregisteredHint.value = ''
  unsubscribe?.(); unsubscribe = undefined
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  edit.value = undefined; serverView.value = undefined; databaseView.value = undefined
  dataSet.value?.destroy(); dataSet.value = undefined
}

watch([scenarioId, scopeFingerprint], async ([id]) => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  release()
  try {
    if (!id) throw new Error('数据库管理页面缺少导航绑定的正式数据空间 ID')
    const ds = await LowcodeDatabaseDirectory.loadCatalog(id)
    if (!active || own !== generation) {ds.destroy(); return}
    const servers = requireDatabaseCatalogServerView(ds)
    const databases = requireDatabaseCatalogDbView(ds)
    dataSet.value = ds; serverView.value = servers; databaseView.value = databases
    const current = new PageRuntime({pageId: 'database-directory-page', scenarioIds: [ds.scenarioId ?? id], loadScenario: async () => ds})
    runtime = current; await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    unsubscribe = ds.onAnyViewChange({rowsChanged: () => revision.value++, selectedRowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++, editingChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, current); ready.value = true
  } catch (cause) {
    if (active && own === generation) {error.value = cause instanceof Error ? cause.message : String(cause); release()}
  } finally {if (active && own === generation) loading.value = false}
}, {immediate: true})

onBeforeUnmount(() => {active = false; generation++; release()})
</script>

<style scoped>
.database-directory-page { display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary); }
h1, h2 { margin: 0; }
h1 { font-size: 20px; }
h2 { margin-bottom: 8px; font-size: 16px; }
header p { color: var(--el-text-color-secondary); }
.database-directory-page__layout { display: grid; grid-template-columns: minmax(300px, 38%) 1fr; gap: 20px; align-items: start; }
.database-directory-page__servers, .database-directory-page__databases { min-width: 0; }
[role="alert"] { color: var(--el-color-danger); }
@media (max-width: 960px) { .database-directory-page__layout { grid-template-columns: 1fr; } }
</style>
