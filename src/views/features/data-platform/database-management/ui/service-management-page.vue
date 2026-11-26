<!--
@module app:views/features/data-platform/database-management/ui/service-management-page
职责：装配正式服务器目录场景及原调用的 PageTool，向工具提供原 DataView 身份和命令。
边界：列元数据、注册、连接测试、编辑与删除由原资源和 DataView 承接。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false" />
  <RendererSection v-else title="服务器管理" :bordered="false" :grid-columns="1"
    :status="loading ? '正在读取服务器目录…' : ''" :error="error" />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, isDataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {PageTool} from '@spark-appworks/spark-project-model'
import {RendererSection, SparkPageRenderer, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {LowcodeDatabaseServer, DATABASE_SERVER_MODEL, DATABASE_SERVER_REGISTER_TABLE} from '@/platform-adapters/resources/database/server/resource'
import {DATABASE_SERVER_EDIT_FORM_FIELDS, DATABASE_SERVER_FILTER_TYPE_OPTIONS, DATABASE_SERVER_LIST_FIELDS,
  DATABASE_SERVER_REGISTER_FORM_FIELDS} from '@/platform-adapters/resources/database/server/catalog-metadata'
import {
  databaseServerBeginCreate,
  databaseServerBeginEdit,
  databaseServerCancelEdit,
  databaseServerCanCreate,
  databaseServerCanDelete,
  databaseServerDeleteSelected,
  databaseServerEditing,
  databaseServerSaveEdit,
  databaseServerSelectedId,
  databaseServerTestConnection,
  requireDatabaseServerView,
  type DatabaseServerEditState,
} from '@/platform-adapters/resources/database/server/view-ops'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const {sparkConsume} = useSparkComponent({type: 'service-management-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'service-management-page')

const route = useRoute()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'].trim() : '')
const session = new NativePageRuntimeSession()
const dataSet = shallowRef<DataSet>()
const view = shallowRef<DataView>()
const edit = shallowRef<DatabaseServerEditState>()
const ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0)
const busy = ref(false), actionError = ref(''), deleteOpen = ref(false), deleteName = ref('')
let unsubscribe: (() => void) | undefined, generation = 0, active = true, actionGeneration = 0
const catalogScenarioId = computed(() => dataSet.value?.scenarioId ?? scenarioId.value)
const catalogKey = computed(() => buildDataViewKey(DATABASE_SERVER_MODEL, 'default', catalogScenarioId.value))
const registerKey = computed(() => buildDataViewKey(DATABASE_SERVER_REGISTER_TABLE, 'default', catalogScenarioId.value))
const listError = computed(() => {revision.value; return view.value?.loadingError?.message ?? ''})
const editing = computed(() => {revision.value; const v = view.value; return v ? databaseServerEditing(v, edit.value) : undefined})
const directoryLocked = () => busy.value || !!editing.value || deleteOpen.value || !view.value
const runtime = computed(() => ready.value ? session.runtime : undefined)
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (!active || !session.isCurrent(current)) throw new Error('服务器目录运行实例已失效')
  }
  return {runtime: current, assertCurrent, async invoke(command: string, input: unknown) {
    assertCurrent()
    switch (command) {
      case 'servers.connect':
        return {
          catalogKey: catalogKey.value, registerKey: registerKey.value,
          filterTypes: [...DATABASE_SERVER_FILTER_TYPE_OPTIONS], listFields: DATABASE_SERVER_LIST_FIELDS,
          registerFields: DATABASE_SERVER_REGISTER_FORM_FIELDS, editFields: DATABASE_SERVER_EDIT_FORM_FIELDS,
          state: () => ({busy: busy.value, editing: editing.value, deleteOpen: deleteOpen.value, deleteName: deleteName.value,
            directoryLocked: directoryLocked(), listError: listError.value, actionError: actionError.value}),
          canCreate: () => {
            revision.value
            const target = view.value
            return !!target && !directoryLocked() && databaseServerCanCreate(target, edit.value)
          },
        }
      case 'servers.select': choose(input); return
      case 'servers.create': if (!directoryLocked()) await beginCreate(); return
      case 'servers.edit': if (choose(input)) await beginEdit(); return
      case 'servers.openDelete': if (choose(input)) openDelete(); return
      case 'servers.cancelDelete': if (!busy.value) deleteOpen.value = false; return
      case 'servers.delete': if (deleteOpen.value) await confirmDelete(); return
      case 'servers.testConnection': await testConnection(); return
      case 'servers.cancelEdit': await cancelEdit(); return
      case 'servers.save': await saveEdit(); return
      default: throw new Error('服务器目录工具动作未登记')
    }
  }}
})
/** 只接受当前正式查询中原对象的行。 */
function choose(value: unknown): boolean {
  if (directoryLocked() || !isDataRow(value)) return false
  const v = view.value
  const row = toRaw(value)
  if (!v?.rows.includes(row)) return false
  v.setSelectedRows([row])
  return true
}
async function act(operation: (isCurrent: () => boolean) => void | Promise<void>, success = ''): Promise<void> {
  const ds = dataSet.value
  const v = view.value
  if (!ds || !v || busy.value) return
  const action = ++actionGeneration
  const current = () => dataSet.value === ds && view.value === v && action === actionGeneration
  busy.value = true; actionError.value = ''
  try {await operation(current); if (current() && success) pageService.showMessage(success, 'success')}
  catch (cause) {if (current()) actionError.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (current()) {busy.value = false; revision.value++}}
}
async function beginCreate(): Promise<void> {
  await act(async isCurrent => {
    const ds = dataSet.value
    const v = view.value
    if (!ds || !v) return
    const started = await databaseServerBeginCreate(ds, v)
    if (isCurrent()) edit.value = started
  })
}
async function beginEdit(): Promise<void> {
  await act(() => {
    const v = view.value
    if (!v) return
    edit.value = databaseServerBeginEdit(v)
  })
}
async function cancelEdit(): Promise<void> {
  await act(() => {
    const v = view.value
    const current = edit.value
    if (!v || !current) return
    edit.value = databaseServerCancelEdit(v, current)
  })
}
async function saveEdit(): Promise<void> {
  if (!edit.value) return
  await act(async isCurrent => {
    const ds = dataSet.value
    const v = view.value
    const current = edit.value
    if (!ds || !v || !current) return
    const next = await databaseServerSaveEdit(ds, v, current)
    if (isCurrent()) edit.value = next
  }, edit.value?.mode === 'add' ? '服务器注册成功' : '服务器编辑成功')
}
async function testConnection(): Promise<void> {
  if (edit.value?.mode !== 'add' || editing.value?.unconfirmed) return
  await act(async () => {
    const ds = dataSet.value
    const current = edit.value
    if (!ds || !current || current.mode !== 'add') return
    const ok = await databaseServerTestConnection(ds, current)
    if (!ok) throw new Error('测试连接失败')
  }, '测试连接成功')
}
function openDelete(): void {
  const v = view.value
  if (!v || !databaseServerCanDelete(v, edit.value)) return
  const id = databaseServerSelectedId(v)
  const row = v.rows.find(item => v.getPkKey(item) === id)
  deleteName.value = typeof row?.['ServerName'] === 'string' ? row['ServerName'] : ''
  actionError.value = ''; deleteOpen.value = true
}
async function confirmDelete(): Promise<void> {
  await act(async isCurrent => {
    const ds = dataSet.value
    const v = view.value
    if (!ds || !v) return
    await databaseServerDeleteSelected(ds, v)
    if (isCurrent()) deleteOpen.value = false
  }, '删除成功')
}
function release(): void {
  actionGeneration++
  busy.value = false; actionError.value = ''; deleteOpen.value = false; deleteName.value = ''
  unsubscribe?.(); unsubscribe = undefined
  session.dispose()
  edit.value = undefined; view.value = undefined
  dataSet.value?.destroy(); dataSet.value = undefined
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''; release()
  try {
    if (!id) throw new Error('服务器管理入口缺少导航绑定的数据空间ID')
    const ds = await LowcodeDatabaseServer.loadCatalog(id)
    if (!active || own !== generation) {ds.destroy(); return}
    const v = requireDatabaseServerView(ds)
    dataSet.value = ds; view.value = v
    const formKey = ds.scenarioId ?? id
    const tool = new PageTool({pageId: 'service-management-page'})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    const current = session.acquire({tool, scenarioIds: [formKey], targetId: formKey,
      loadScenario: async () => ds})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    unsubscribe = ds.onAnyViewChange({rowsChanged: () => revision.value++, selectedRowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++, editingChanged: () => revision.value++})
    if (active && own === generation && session.isCurrent(current)) ready.value = true
  } catch (cause) {if (active && own === generation) {error.value = cause instanceof Error ? cause.message : String(cause); release()}}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; release()})
</script>
