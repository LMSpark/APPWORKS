<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/table-and-view-page
职责：库/表/视图只读目录；组件绑定 DataView，只经 spark-data 查询。
-->
<template>
  <section class="table-and-view-page">
    <header><h1>表和视图管理</h1><p>选择数据库与表或视图后浏览已登记字段（只读）。</p></header>
    <p v-if="loading" role="status">正在读取目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <p v-if="dbListError" role="alert">{{ dbListError }}</p>
      <div class="table-and-view-layout">
        <section class="table-and-view-databases">
          <h2>数据库</h2>
          <RendererTable :data-view-key="dbKey" :children="dbFields" :toolbar="dbToolbar" :stripe="true"
            :on-row-click="chooseDatabase" :highlight-current-row="true" :show-pagination="false" />
        </section>
        <section v-if="databaseSelected" class="table-and-view-main">
          <RendererTabs v-model="objectTab">
            <RendererTabPane name="tables" label="物理表" :index="0">
              <p v-if="tableListError" role="alert">{{ tableListError }}</p>
              <RendererTable :data-view-key="tableKey" :children="tableFields" :toolbar="childToolbar" :stripe="true" :show-pagination="false"
                :on-row-click="chooseTable" :highlight-current-row="true" />
            </RendererTabPane>
            <RendererTabPane name="views" label="视图" :index="1" :lazy="true">
              <p v-if="viewListError" role="alert">{{ viewListError }}</p>
              <RendererTable :data-view-key="viewKey" :children="viewFields" :toolbar="childToolbar" :stripe="true" :show-pagination="false"
                :on-row-click="chooseView" :highlight-current-row="true" />
            </RendererTabPane>
          </RendererTabs>
          <section v-if="resourceSelected" class="table-and-view-fields">
            <h2>字段</h2>
            <p v-if="fieldListError" role="alert">{{ fieldListError }}</p>
            <RendererTable :data-view-key="fieldKey" :children="fieldColumns" :toolbar="childToolbar" :stripe="true" :show-pagination="false" />
          </section>
          <p v-else class="table-and-view-hint">选择一张表或视图以查看字段目录。</p>
        </section>
        <p v-else class="table-and-view-hint">请从左侧选择数据库。</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
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
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_FIELD_VIEW_VIEW,
  LowcodeDatabaseTableView,
} from '@/lowcode/resources/database/lowcode-database-table-view'

const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'table-and-view-page'})
const dataSet = shallowRef<DataSet>()
const dbView = shallowRef<DataView>()
const tableView = shallowRef<DataView>()
const viewView = shallowRef<DataView>()
const fieldTableView = shallowRef<DataView>()
const fieldViewView = shallowRef<DataView>()
const ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0), objectTab = ref<string | number>('tables')
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true

const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const dbKey = computed(() => buildDataViewKey(DATABASE_CATALOG_DB_MODEL, 'default', scenarioId.value))
const tableKey = computed(() => buildDataViewKey(DATABASE_CATALOG_TABLE_MODEL, 'default', scenarioId.value))
const viewKey = computed(() => buildDataViewKey(DATABASE_CATALOG_VIEW_MODEL, 'default', scenarioId.value))
const fieldKey = computed(() => buildDataViewKey(DATABASE_CATALOG_FIELD_MODEL,
  objectTab.value === 'views' ? DATABASE_CATALOG_FIELD_VIEW_VIEW : DATABASE_CATALOG_FIELD_TABLE_VIEW, scenarioId.value))
const activeFieldView = computed(() => objectTab.value === 'views' ? fieldViewView.value : fieldTableView.value)

const dbListError = computed(() => {revision.value; return dbView.value?.loadingError?.message ?? ''})
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

const dbToolbar = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {label: '刷新', action: 'refresh'}}]}))
const childToolbar = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {label: '刷新', action: 'refresh'}}]}))

const dbFields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'Name', label: '数据库名称', width: 180, readonly: true}},
  {type: 'r-text', props: {field: 'ServerName', label: '服务器', width: 160, readonly: true}},
  {type: 'r-text', props: {field: 'SchemaName', label: '架构', width: 120, readonly: true}},
  {type: 'r-text', props: {field: 'Remark', label: '备注', width: 220, readonly: true}},
])
const tableFields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'tblname', label: '表名', width: 200, readonly: true}},
  {type: 'r-text', props: {field: 'tbldesc', label: '说明', width: 240, readonly: true}},
  {type: 'r-text', props: {field: 'schemaName', label: '架构', width: 120, readonly: true}},
  {type: 'r-text', props: {field: 'status', label: '状态', width: 90, readonly: true}},
])
const viewFields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'vewname', label: '视图名', width: 200, readonly: true}},
  {type: 'r-text', props: {field: 'vewdesc', label: '说明', width: 240, readonly: true}},
  {type: 'r-text', props: {field: 'SchemaName', label: '架构', width: 120, readonly: true}},
  {type: 'r-text', props: {field: 'status', label: '状态', width: 90, readonly: true}},
])
const fieldColumns = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'enname', label: '字段名', width: 160, readonly: true}},
  {type: 'r-text', props: {field: 'cnname', label: '标题', width: 160, readonly: true}},
  {type: 'r-text', props: {field: 'DataTypeName', label: '类型', width: 120, readonly: true}},
  {type: 'r-text', props: {field: 'DataLen', label: '长度', width: 80, readonly: true}},
  {type: 'r-text', props: {field: 'IsPKey', label: '主键', width: 70, readonly: true}},
])

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

async function chooseDatabase(row: DataRow): Promise<void> {
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
  unsubscribe?.()
  unsubscribe = undefined
  sparkRemove(PAGE_RUNTIME)
  runtime?.dispose()
  runtime = undefined
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
    const db = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const tables = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    const views = ds.getView(DATABASE_CATALOG_VIEW_MODEL, 'default')
    const tableFields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    const viewFields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_VIEW_VIEW)
    if (!db || !tables || !views || !tableFields || !viewFields) throw new Error('表和视图目录缺少正式视图')
    dataSet.value = ds
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
