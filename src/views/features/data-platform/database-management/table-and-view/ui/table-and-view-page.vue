<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/table-and-view-page
职责：库/表/视图/字段只读目录；字段元信息只在各模型 DataTable.columns，列表/表单由绑定 DataView 的 autoColumns 消费列链，不手写字段 children。
-->
<template>
  <section class="table-and-view-page">
    <header><h1>表和视图管理</h1><p>选择数据库与表或视图后浏览已登记字段（只读）。</p></header>
    <p v-if="loading" role="status">正在读取目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <p v-if="serverListError" role="alert">{{ serverListError }}</p>
      <p v-if="dbListError" role="alert">{{ dbListError }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <div class="table-and-view-layout">
        <section class="table-and-view-sidebar">
          <h2>服务器</h2>
          <RendererTable :data-view-key="serverKey" :toolbar="serverToolbar" :stripe="true"
            :on-row-click="chooseServer" :highlight-current-row="true" :show-pagination="false" :show-data-view-meta="false" />
          <h2>数据库</h2>
          <div :inert="busy || !!dbEdit">
            <RendererTable :data-view-key="dbKey" :toolbar="dbToolbar" :stripe="true"
              :on-row-click="chooseDatabase" :highlight-current-row="true" :show-pagination="false" :show-data-view-meta="false" />
          </div>
        </section>
        <section v-if="databaseSelected" class="table-and-view-main">
          <RendererTabs v-model="objectTab">
            <RendererTabPane name="tables" label="物理表" :index="0">
              <p v-if="tableListError" role="alert">{{ tableListError }}</p>
              <RendererTable :data-view-key="tableKey" :toolbar="childToolbar" :stripe="true" :show-pagination="false" :show-data-view-meta="false"
                :on-row-click="chooseTable" :highlight-current-row="true" />
            </RendererTabPane>
            <RendererTabPane name="views" label="视图" :index="1" :lazy="true">
              <p v-if="viewListError" role="alert">{{ viewListError }}</p>
              <RendererTable :data-view-key="viewKey" :toolbar="childToolbar" :stripe="true" :show-pagination="false" :show-data-view-meta="false"
                :on-row-click="chooseView" :highlight-current-row="true" />
            </RendererTabPane>
          </RendererTabs>
          <section v-if="resourceSelected" class="table-and-view-fields">
            <h2>字段</h2>
            <p v-if="fieldListError" role="alert">{{ fieldListError }}</p>
            <RendererTable :data-view-key="fieldKey" :toolbar="childToolbar" :stripe="true" :show-pagination="false" :show-data-view-meta="false" />
          </section>
          <p v-else class="table-and-view-hint">选择一张表或视图以查看字段目录。</p>
        </section>
        <p v-else class="table-and-view-hint">请从左侧选择数据库。</p>
      </div>
      <RegisterDatabaseDialog v-if="dbEditing"
        :catalog-key="dbKey" :server-label="selectedServerLabel" :editing="dbEditing"
        :busy="busy" :action-error="actionError" :unregistered-hint="unregisteredHint"
        :can-load-unregistered="canLoadUnregistered"
        @cancel="cancelDbRegister" @save="saveDbRegister" @load-unregistered="loadUnregisteredNames" />
      <p v-if="actionError && !dbEditing" role="alert">{{ actionError }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {
  PAGE_RUNTIME,
  RendererTable,
  RendererTabs,
  RendererTabPane,
  useSparkComponent,
  type RToolbarProps,
} from '@spark-appworks/spark-component'
import {
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_SERVER_MODEL,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_FIELD_VIEW_VIEW,
  LowcodeDatabaseTableView,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {queryUnregisteredDatabaseNames} from '@/lowcode/resources/database/database-spark-data-auxiliary'
import {
  databaseCatalogDbBeginCreate,
  databaseCatalogDbCancelEdit,
  databaseCatalogDbCanCreate,
  databaseCatalogDbEditing,
  databaseCatalogDbSaveEdit,
  databaseCatalogServerSelectedId,
  type DatabaseCatalogDbEditState,
} from '@/lowcode/resources/database/database-catalog-db-view-ops'
import RegisterDatabaseDialog from './register-database-dialog.vue'

const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'table-and-view-page'})
const dataSet = shallowRef<DataSet>()
const serverView = shallowRef<DataView>()
const dbView = shallowRef<DataView>()
const dbEdit = shallowRef<DatabaseCatalogDbEditState>()
const tableView = shallowRef<DataView>()
const viewView = shallowRef<DataView>()
const fieldTableView = shallowRef<DataView>()
const fieldViewView = shallowRef<DataView>()
const ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0), objectTab = ref<string | number>('tables')
const busy = ref(false), actionError = ref(''), message = ref(''), unregisteredHint = ref('')
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true, actionGeneration = 0

const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const serverKey = computed(() => buildDataViewKey(DATABASE_CATALOG_SERVER_MODEL, 'default', scenarioId.value))
const dbKey = computed(() => buildDataViewKey(DATABASE_CATALOG_DB_MODEL, 'default', scenarioId.value))
const tableKey = computed(() => buildDataViewKey(DATABASE_CATALOG_TABLE_MODEL, 'default', scenarioId.value))
const viewKey = computed(() => buildDataViewKey(DATABASE_CATALOG_VIEW_MODEL, 'default', scenarioId.value))
const fieldKey = computed(() => buildDataViewKey(DATABASE_CATALOG_FIELD_MODEL,
  objectTab.value === 'views' ? DATABASE_CATALOG_FIELD_VIEW_VIEW : DATABASE_CATALOG_FIELD_TABLE_VIEW, scenarioId.value))
const activeFieldView = computed(() => objectTab.value === 'views' ? fieldViewView.value : fieldTableView.value)

const serverListError = computed(() => {revision.value; return serverView.value?.loadingError?.message ?? ''})
const dbListError = computed(() => {revision.value; return dbView.value?.loadingError?.message ?? ''})
const dbEditing = computed(() => {revision.value; const v = dbView.value; return v ? databaseCatalogDbEditing(v, dbEdit.value) : undefined})
const selectedServerLabel = computed(() => {
  revision.value
  const view = serverView.value
  if (!view) return ''
  const id = databaseCatalogServerSelectedId(view)
  const row = view.rows.find(item => view.getPkKey(item) === id)
  const name = row?.['ServerName']
  return typeof name === 'string' && name ? name : id
})
const canLoadUnregistered = computed(() => {
  revision.value
  const view = serverView.value
  return !!view && databaseCatalogServerSelectedId(view).length > 0 && !busy.value
})
const tableListError = computed(() => {revision.value; return tableView.value?.loadingError?.message ?? ''})
const viewListError = computed(() => {revision.value; return viewView.value?.loadingError?.message ?? ''})
const fieldListError = computed(() => {revision.value; return activeFieldView.value?.loadingError?.message ?? ''})
const databaseSelected = computed(() => {
  revision.value
  const view = dbView.value
  if (!view) return false
  return view.getSelectedValues().length === 1
})
const resourceSelected = computed(() => {
  revision.value
  const tables = tableView.value
  const views = viewView.value
  if (!tables || !views) return false
  return tables.getSelectedValues().length === 1 || views.getSelectedValues().length === 1
})

const serverToolbar = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {label: '刷新', action: 'refresh'}}]}))
const dbToolbar = computed<RToolbarProps>(() => {
  revision.value
  const db = dbView.value
  const server = serverView.value
  return {children: [
    {type: 'r-button', props: {label: '注册数据库', disabled: busy.value || !!dbEdit.value || !db || !server || !databaseCatalogDbCanCreate(db, server, dbEdit.value), onClick: beginDbRegister}},
    {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
  ]}
})
const childToolbar = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {label: '刷新', action: 'refresh'}}]}))

async function act(operation: () => void | Promise<void>, success = ''): Promise<void> {
  const ds = dataSet.value
  const db = dbView.value
  if (!ds || !db || busy.value) return
  const action = ++actionGeneration
  const current = () => dataSet.value === ds && dbView.value === db && action === actionGeneration
  busy.value = true; actionError.value = ''; message.value = ''
  try {await operation(); if (current()) message.value = success}
  catch (cause) {if (current()) actionError.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (current()) {busy.value = false; revision.value++}}
}

async function beginDbRegister(): Promise<void> {
  await act(async () => {
    const db = dbView.value
    const server = serverView.value
    if (!db || !server) return
    unregisteredHint.value = ''
    dbEdit.value = await databaseCatalogDbBeginCreate(db, server)
  })
}

async function cancelDbRegister(): Promise<void> {
  await act(() => {
    const db = dbView.value
    const current = dbEdit.value
    if (!db || !current) return
    dbEdit.value = databaseCatalogDbCancelEdit(db, current)
    unregisteredHint.value = ''
  })
}

async function saveDbRegister(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const db = dbView.value
    const current = dbEdit.value
    if (!ds || !db || !current) return
    dbEdit.value = await databaseCatalogDbSaveEdit(ds, db, current) ?? undefined
    if (!dbEdit.value) unregisteredHint.value = ''
  }, '数据库已注册')
}

async function loadUnregisteredNames(): Promise<void> {
  await act(async () => {
    const server = serverView.value
    if (!server) return
    const id = databaseCatalogServerSelectedId(server)
    if (!id) throw new Error('请先选择服务器')
    const ds = dataSet.value
    if (!ds) return
    const names = await queryUnregisteredDatabaseNames(ds, id)
    unregisteredHint.value = names.length
      ? `未登记物理库（可填到「Name」）：${names.join('、')}`
      : '该服务器下没有未登记的物理库名'
  })
}

async function refreshDatabases(): Promise<void> {
  const db = dbView.value
  if (!db) return
  await db.refresh()
  if (db.loadingError) throw db.loadingError
}

async function refreshChildren(): Promise<void> {
  const tables = tableView.value
  const views = viewView.value
  if (!tables || !views) return
  await Promise.all([tables.refresh(), views.refresh()])
  if (tables.loadingError) throw tables.loadingError
  if (views.loadingError) throw views.loadingError
}

async function refreshFields(): Promise<void> {
  const fields = activeFieldView.value
  if (!fields) return
  await fields.refresh()
  if (fields.loadingError) throw fields.loadingError
}

async function chooseServer(row: DataRow): Promise<void> {
  if (busy.value || dbEdit.value) return
  const view = serverView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) return
  view.setSelectedRows([original])
  dbView.value?.setSelectedRows([])
  tableView.value?.setSelectedRows([])
  viewView.value?.setSelectedRows([])
  revision.value++
  try {
    await refreshDatabases()
    await refreshChildren()
    await refreshFields()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function chooseDatabase(row: DataRow): Promise<void> {
  if (busy.value || dbEdit.value) return
  const view = dbView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) return
  view.setSelectedRows([original])
  tableView.value?.setSelectedRows([])
  viewView.value?.setSelectedRows([])
  revision.value++
  try {
    await refreshChildren()
    await refreshFields()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function chooseTable(row: DataRow): Promise<void> {
  const view = tableView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) return
  viewView.value?.setSelectedRows([])
  view.setSelectedRows([original])
  revision.value++
  try {
    await refreshFields()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function chooseView(row: DataRow): Promise<void> {
  const view = viewView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) return
  tableView.value?.setSelectedRows([])
  view.setSelectedRows([original])
  revision.value++
  try {
    await refreshFields()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function release(): void {
  actionGeneration++
  busy.value = false; actionError.value = ''; message.value = ''; unregisteredHint.value = ''
  unsubscribe?.()
  unsubscribe = undefined
  sparkRemove(PAGE_RUNTIME)
  runtime?.dispose()
  runtime = undefined
  dbEdit.value = undefined
  serverView.value = undefined
  dbView.value = undefined
  tableView.value = undefined
  viewView.value = undefined
  fieldTableView.value = undefined
  fieldViewView.value = undefined
  dataSet.value?.destroy()
  dataSet.value = undefined
}

watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false
  loading.value = true
  error.value = ''
  release()
  try {
    if (!id) throw new Error('表和视图管理入口缺少导航绑定的数据空间ID')
    const ds = await LowcodeDatabaseTableView.loadCatalog(id)
    if (!active || own !== generation) {ds.destroy(); return}
    const server = ds.getView(DATABASE_CATALOG_SERVER_MODEL, 'default')
    const db = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const tables = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    const views = ds.getView(DATABASE_CATALOG_VIEW_MODEL, 'default')
    const tableFields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    const viewFields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_VIEW_VIEW)
    if (!server || !db || !tables || !views || !tableFields || !viewFields) throw new Error('表和视图目录缺少正式视图')
    dataSet.value = ds
    serverView.value = server
    dbView.value = db
    tableView.value = tables
    viewView.value = views
    fieldTableView.value = tableFields
    fieldViewView.value = viewFields
    const current = new PageRuntime({pageId: 'table-and-view-page', scenarioIds: [id], loadScenario: async () => ds})
    runtime = current
    await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    unsubscribe = ds.onAnyViewChange({
      rowsChanged: () => revision.value++,
      selectedRowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++,
      editingChanged: () => revision.value++,
    })
    sparkProvide(PAGE_RUNTIME, current)
    ready.value = true
  } catch (cause) {
    if (active && own === generation) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      release()
    }
  } finally {
    if (active && own === generation) loading.value = false
  }
}, {immediate: true})

onBeforeUnmount(() => {active = false; generation++; release()})
</script>

<style scoped>
.table-and-view-page { display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary); }
h1 { margin: 0; font-size: 20px; }
h2 { margin: 0 0 8px; font-size: 16px; }
header p { color: var(--el-text-color-secondary); }
.table-and-view-layout { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 20px; align-items: start; }
.table-and-view-main { display: grid; gap: 16px; }
.table-and-view-fields { display: grid; gap: 8px; }
.table-and-view-hint { color: var(--el-text-color-secondary); margin: 0; padding-top: 24px; }
[role="alert"] { color: var(--el-color-danger); }
@media (max-width: 960px) {
  .table-and-view-layout { grid-template-columns: 1fr; }
}
</style>
