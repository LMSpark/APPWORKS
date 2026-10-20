<!--
@module app:views/features/data-platform/database-management/ui/service-management-page
职责：服务器目录；组件绑定 DataView，编排只调用 spark-data（DataView/DataSet）。
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
        <RendererTable :data-view-key="catalogKey" :children="fields" :toolbar="toolbar" :filter="filter"
          :stripe="true" :on-row-click="choose" :highlight-current-row="true" />
      </div>
      <RendererDialog v-if="editing" :model-value="true"
        :title="editing.mode === 'add' ? '注册服务器' : '编辑服务器'" :width="560" :close-disabled="busy" @update:model-value="cancelEdit">
        <p v-if="actionError" role="alert">{{ actionError }}</p>
        <p v-if="editing.unconfirmed" role="status">保存结果尚未确认。核验只确认原提交结果，不会再次写入。</p>
        <p v-else-if="editing.readbackFailed" role="status">已保存，但目录尚未重新读取成功，请重新读取。</p>
        <RendererForm :data-view-key="catalogKey" context-data-member="currentRow" :auto-columns="false"
          :show-data-view-meta="false" :grid-columns="1"
          :form-props="{disabled: busy || editing.unconfirmed || editing.readbackFailed}">
          <FieldSelect field="Type" label="数据库类型" :options="dbTypeOptions" />
          <FieldText field="ServerName" label="服务器名称" :maxlength="100" />
          <FieldText field="ip_address" label="主机地址" :maxlength="200" />
          <FieldText field="Port" label="端口" :maxlength="10" />
          <FieldTextarea field="description" label="描述" :maxlength="500" />
          <template v-if="editing.mode === 'add'">
            <FieldText field="UserName" label="用户名" :maxlength="100" />
            <FieldText field="Password" label="密码" :maxlength="200" />
          </template>
        </RendererForm>
        <p v-if="editing.mode === 'add'" role="status">连接测试须纳入绑定 DataView 的命令合同；当前未接入，保存前请自行核对连通性。</p>
        <template #footer>
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
import {buildDataViewKey, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererButton, RendererDialog, RendererForm, FieldText, FieldTextarea, FieldSelect,
  useSparkComponent, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeDatabaseServer, DATABASE_SERVER_MODEL} from '@/lowcode/resources/database/lowcode-database-server'
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
  requireDatabaseServerView,
  type DatabaseServerEditState,
} from '@/lowcode/resources/database/database-server-view-ops'

const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'service-management-page'})
const dataSet = shallowRef<DataSet>()
const view = shallowRef<DataView>()
const edit = shallowRef<DatabaseServerEditState>()
const ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0)
const busy = ref(false), actionError = ref(''), message = ref(''), deleteOpen = ref(false), deleteName = ref('')
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true, actionGeneration = 0
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(DATABASE_SERVER_MODEL, 'default', scenarioId.value))
const dbTypeOptions = [{value: 'MYSQL', label: 'MySQL'}, {value: 'SQLSERVER', label: 'SQL Server'}, {value: 'ORACLE', label: 'Oracle'}, {value: 'POSTGRESQL', label: 'PostgreSQL'}]
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
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'ServerName', label: '服务器名称', width: 200, readonly: true}},
  {type: 'r-text', props: {field: 'Type', label: '类型', width: 120, readonly: true}},
  {type: 'r-text', props: {field: 'ip_address', label: '主机', width: 180, readonly: true}},
  {type: 'r-text', props: {field: 'Port', label: '端口', width: 90, readonly: true}},
  {type: 'r-text', props: {field: 'description', label: '描述', width: 260, readonly: true}},
])
const filter = computed<RFilterProps>(() => ({autoFitMinWidth: '220px', children: [
  {type: 'r-text', props: {field: 'ServerName', label: '服务器名称', placeholder: '按名称筛选'}},
  {type: 'r-text', props: {field: 'ip_address', label: '主机', placeholder: '按主机筛选'}},
]}))
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
    const v = view.value
    if (!v) return
    edit.value = await databaseServerBeginCreate(v)
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
  }, '服务器已保存')
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
    const current = new PageRuntime({pageId: 'service-management-page', scenarioIds: [id], loadScenario: async () => ds})
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
