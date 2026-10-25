<!--
@module app:views/features/data-platform/database-management/ui/service-management-page
职责：服务器目录；字段元信息只在 Base_serverInfo 的 DataTable.columns，列表/表单由绑定 DataView 的 autoColumns 消费列链，编排只调用 spark-data。
注册表单绑定 DatabaseServerRegister 写命令视图（/Db/registerServer），编辑表单绑定目录视图。
-->
<template>
  <section class="database-server-page">
    <header><h1>服务器管理</h1><p>注册并维护数据库服务器连接信息。</p></header>
    <p v-if="loading" role="status">正在读取服务器目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="ready">
      <p v-if="listError" role="alert">{{ listError }}</p>
      <div :inert="busy || !!editing">
        <RendererTable :data-view-key="catalogKey" :toolbar="toolbar" :filter="listFilter"
          :children="DATABASE_SERVER_LIST_FIELDS"
          :stripe="true" :on-row-click="choose" :highlight-current-row="true" :show-data-view-meta="false" />
      </div>
      <RendererDialog v-if="editing" :model-value="true"
        :title="editing.mode === 'add' ? '注册服务器' : '编辑服务器'" :width="560" :close-disabled="busy" @update:model-value="cancelEdit">
        <p v-if="actionError" role="alert">{{ actionError }}</p>
        <p v-if="editing.unconfirmed" role="status">保存结果尚未确认。核验只确认原提交结果，不会再次写入。</p>
        <p v-else-if="editing.readbackFailed" role="status">已保存，但目录尚未重新读取成功，请重新读取。</p>
        <RendererForm :key="editing.mode" :data-view-key="editing.mode === 'add' ? registerKey : catalogKey" context-data-member="currentRow" :auto-columns="true"
          :children="editing.mode === 'add' ? DATABASE_SERVER_REGISTER_FORM_FIELDS : []"
          :show-data-view-meta="false" :grid-columns="1"
          :form-props="{disabled: busy || editing.unconfirmed || editing.readbackFailed}" />
        <template #footer>
          <RendererButton v-if="!editing.unconfirmed && editing.mode === 'add'" label="测试连接" :disabled="busy" @click="testConnection" />
          <RendererButton v-if="!editing.unconfirmed" label="取消" :disabled="busy" @click="cancelEdit" />
          <RendererButton v-if="!editing.unconfirmed && !editing.readbackFailed" label="确定" :disabled="busy" @click="saveEdit" />
          <RendererButton v-if="editing.unconfirmed" label="核验保存结果" :disabled="busy" @click="saveEdit" />
          <RendererButton v-if="editing.readbackFailed" label="重新读取" :disabled="busy" @click="saveEdit" />
        </template>
      </RendererDialog>
      <RendererDialog v-if="deleteOpen" :model-value="true" title="删除确认" :width="420" :close-disabled="busy" @update:model-value="deleteOpen = false">
        <p>确认删除服务器“{{ deleteName }}”吗？</p>
        <p v-if="actionError" role="alert">{{ actionError }}</p>
        <template #footer>
          <RendererButton label="取消" :disabled="busy" @click="deleteOpen = false" />
          <RendererButton label="删除" :disabled="busy" @click="confirmDelete" />
        </template>
      </RendererDialog>
      <p v-if="actionError && !editing && !deleteOpen" role="alert">{{ actionError }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererButton, RendererDialog, RendererForm,
  useSparkComponent, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeDatabaseServer, DATABASE_SERVER_MODEL, DATABASE_SERVER_REGISTER_TABLE} from '@/lowcode/resources/database/lowcode-database-server'
import {DATABASE_SERVER_LIST_FIELDS, DATABASE_SERVER_REGISTER_FORM_FIELDS} from '@/lowcode/resources/database/database-server-catalog-metadata'
import {
  databaseServerBeginCreate,
  databaseServerBeginEdit,
  databaseServerCancelEdit,
  databaseServerCanCreate,
  databaseServerCanDelete,
  databaseServerCanEdit,
  databaseServerDeleteSelected,
  databaseServerEditing,
  databaseServerSaveEdit,
  databaseServerSelectedId,
  databaseServerTestConnection,
  requireDatabaseServerView,
  type DatabaseServerEditState,
} from '@/lowcode/resources/database/database-server-view-ops'

const route = useRoute()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'].trim() : '')
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'service-management-page'})
const dataSet = shallowRef<DataSet>()
const view = shallowRef<DataView>()
const edit = shallowRef<DatabaseServerEditState>()
const ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0)
const busy = ref(false), actionError = ref(''), message = ref(''), deleteOpen = ref(false), deleteName = ref('')
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true, actionGeneration = 0
const catalogScenarioId = computed(() => dataSet.value?.scenarioId ?? scenarioId.value)
const catalogKey = computed(() => buildDataViewKey(DATABASE_SERVER_MODEL, 'default', catalogScenarioId.value))
const registerKey = computed(() => buildDataViewKey(DATABASE_SERVER_REGISTER_TABLE, 'default', catalogScenarioId.value))
const listFilter = computed<RFilterProps>(() => ({
  autoQuery: true,
  collapsible: true,
  defaultCollapsed: true,
}))
const listError = computed(() => {revision.value; return view.value?.loadingError?.message ?? ''})
const editing = computed(() => {revision.value; const v = view.value; return v ? databaseServerEditing(v, edit.value) : undefined})
const toolbar = computed<RToolbarProps>(() => {
  revision.value
  const v = view.value
  return {children: [
    {type: 'r-button', props: {label: '注册服务器', disabled: busy.value || !!editing.value || !v || !databaseServerCanCreate(v, edit.value), onClick: beginCreate}},
    {type: 'r-button', props: {label: '编辑', disabled: busy.value || !v || !databaseServerCanEdit(v, edit.value), onClick: beginEdit}},
    {type: 'r-button', props: {label: '删除', disabled: busy.value || !v || !databaseServerCanDelete(v, edit.value), onClick: openDelete}},
    {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
  ]}
})
function choose(row: DataRow): void {
  if (busy.value || editing.value) return
  const v = view.value
  const original = toRaw(row)
  if (v?.rows.includes(original)) v.setSelectedRows([original])
}
async function act(operation: () => void | Promise<void>, success = ''): Promise<void> {
  const ds = dataSet.value
  const v = view.value
  if (!ds || !v || busy.value) return
  const action = ++actionGeneration
  const current = () => dataSet.value === ds && view.value === v && action === actionGeneration
  busy.value = true; actionError.value = ''; message.value = ''
  try {await operation(); if (current()) message.value = success}
  catch (cause) {if (current()) actionError.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (current()) {busy.value = false; revision.value++}}
}
async function beginCreate(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const v = view.value
    if (!ds || !v) return
    edit.value = await databaseServerBeginCreate(ds, v)
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
  await act(async () => {
    const ds = dataSet.value
    const v = view.value
    const current = edit.value
    if (!ds || !v || !current) return
    edit.value = await databaseServerSaveEdit(ds, v, current) ?? undefined
  }, edit.value?.mode === 'add' ? '服务器已注册' : '服务器已保存')
}
async function testConnection(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const current = edit.value
    if (!ds || !current || current.mode !== 'add') return
    const ok = await databaseServerTestConnection(ds, current)
    if (!ok) throw new Error('连接失败')
  }, '连接成功')
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
  await act(async () => {
    const ds = dataSet.value
    const v = view.value
    if (!ds || !v) return
    await databaseServerDeleteSelected(ds, v)
    edit.value = undefined
  }, '服务器已删除')
  if (!actionError.value) deleteOpen.value = false
}
function release(): void {
  actionGeneration++
  busy.value = false; actionError.value = ''; message.value = ''
  unsubscribe?.(); unsubscribe = undefined
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
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
    const current = new PageRuntime({pageId: 'service-management-page', scenarioIds: [formKey], loadScenario: async () => ds})
    runtime = current; await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    unsubscribe = ds.onAnyViewChange({rowsChanged: () => revision.value++, selectedRowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++, editingChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, current); ready.value = true
  } catch (cause) {if (active && own === generation) {error.value = cause instanceof Error ? cause.message : String(cause); release()}}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; release()})
</script>

<style scoped>
.database-server-page { display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary); }
h1 { margin: 0; font-size: 20px; }
header p { color: var(--el-text-color-secondary); }
[role="alert"] { color: var(--el-color-danger); }
</style>
