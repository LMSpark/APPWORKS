<!--
@module app:views/features/data-platform/database-management/ui/service-management-page
职责：服务器目录；字段元信息只在 Base_serverInfo 的 DataTable.columns，列表/表单由绑定 DataView 的 autoColumns 消费列链，编排只调用 spark-data。
注册表单绑定 DatabaseServerRegister 写命令视图（/Db/registerServer），编辑表单绑定目录视图。
-->
<template>
  <RendererSection class="database-server-page" title="服务器管理" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取服务器目录…' : ''" :error="error || listError || (!editing && !deleteOpen ? actionError : '')">
    <template v-if="ready" #header-actions>
      <RendererButton label="注册" button-type="primary" icon="Plus" :disabled="busy || !!editing || !view || !databaseServerCanCreate(view, edit)"
        @click="beginCreate" />
    </template>
    <template v-if="ready">
      <div :inert="busy || !!editing">
        <RendererTable :data-view-key="catalogKey" :filter="listFilter" :actions="rowActions"
          :children="DATABASE_SERVER_LIST_FIELDS" :stripe="true" :border="true" :show-row-index="true"
          :on-row-click="choose" :highlight-current-row="true" :show-data-view-meta="false" :action-column="{label: '操作', width: 260, fixed: true}" />
      </div>
      <RendererDialog v-if="editing" :model-value="true"
        :title="editing.mode === 'add' ? '注册服务器' : '编辑服务器'" :width="860" :close-disabled="busy" @update:model-value="cancelEdit">
        <DisplayAlert v-if="actionError" alert-type="error" :closable="false" :title="actionError" />
        <DisplayAlert v-if="editing.unconfirmed" alert-type="warning" :closable="false" title="保存结果尚未确认。核验只确认原提交结果，不会再次写入。" />
        <DisplayAlert v-else-if="editing.readbackFailed" alert-type="warning" :closable="false" title="已保存，但目录尚未重新读取成功，请重新读取。" />
        <RendererForm :key="editing.mode" :data-view-key="editing.mode === 'add' ? registerKey : catalogKey" context-data-member="currentRow" :auto-columns="false"
          :children="editing.mode === 'add' ? DATABASE_SERVER_REGISTER_FORM_FIELDS : DATABASE_SERVER_EDIT_FORM_FIELDS"
          :show-data-view-meta="false" :grid-columns="12" label-width="120px"
          :form-props="{disabled: busy || editing.unconfirmed || editing.readbackFailed}" />
        <template #footer>
          <RendererButton v-if="!editing.unconfirmed && editing.mode === 'add'" label="测试连接" button-type="primary" :plain="true" :disabled="busy" @click="testConnection" />
          <RendererButton v-if="!editing.unconfirmed" label="取消" :disabled="busy" @click="cancelEdit" />
          <RendererButton v-if="!editing.unconfirmed && !editing.readbackFailed" label="确定" button-type="primary" :disabled="busy" @click="saveEdit" />
          <RendererButton v-if="editing.unconfirmed" label="核验保存结果" :disabled="busy" @click="saveEdit" />
          <RendererButton v-if="editing.readbackFailed" label="重新读取" :disabled="busy" @click="saveEdit" />
        </template>
      </RendererDialog>
      <RendererDialog v-if="deleteOpen" :model-value="true" title="删除确认" :width="420" :close-disabled="busy" @update:model-value="deleteOpen = false">
        <DisplayAlert alert-type="warning" :closable="false" :show-icon="true" :title="`确定要删除服务器“${deleteName}”吗？`" />
        <DisplayAlert v-if="actionError" alert-type="error" :closable="false" :title="actionError" />
        <template #footer>
          <RendererButton label="取消" :disabled="busy" @click="deleteOpen = false" />
          <RendererButton label="删除" button-type="danger" :disabled="busy" @click="confirmDelete" />
        </template>
      </RendererDialog>
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeDatabaseServer, DATABASE_SERVER_MODEL, DATABASE_SERVER_REGISTER_TABLE} from '@/lowcode/resources/database/server/resource'
import {DATABASE_SERVER_EDIT_FORM_FIELDS, DATABASE_SERVER_FILTER_TYPE_OPTIONS, DATABASE_SERVER_LIST_FIELDS,
  DATABASE_SERVER_REGISTER_FORM_FIELDS} from '@/lowcode/resources/database/server/catalog-metadata'
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
} from '@/lowcode/resources/database/server/view-ops'

type RFilterProps = SparkComponent.RFilterProps
type RToolbarProps = SparkComponent.RToolbarProps
const {PAGE_RUNTIME, RendererSection, RendererTable, RendererButton, RendererDialog, RendererForm, DisplayAlert, useSparkComponent, consumeRequiredPageService} = SparkComponent
const {sparkProvide, sparkRemove, sparkConsume} = useSparkComponent({type: 'service-management-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'service-management-page')

const route = useRoute()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'].trim() : '')
const session = new NativePageRuntimeSession({
  provide: current => sparkProvide(PAGE_RUNTIME, current),
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const dataSet = shallowRef<DataSet>()
const view = shallowRef<DataView>()
const edit = shallowRef<DatabaseServerEditState>()
const ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0)
const busy = ref(false), actionError = ref(''), deleteOpen = ref(false), deleteName = ref('')
let unsubscribe: (() => void) | undefined, generation = 0, active = true, actionGeneration = 0
const catalogScenarioId = computed(() => dataSet.value?.scenarioId ?? scenarioId.value)
const catalogKey = computed(() => buildDataViewKey(DATABASE_SERVER_MODEL, 'default', catalogScenarioId.value))
const registerKey = computed(() => buildDataViewKey(DATABASE_SERVER_REGISTER_TABLE, 'default', catalogScenarioId.value))
const listFilter = computed<RFilterProps>(() => ({
  autoQuery: false,
  collapsible: true,
  defaultCollapsed: true,
  children: [
    {type: 'r-text', props: {field: 'ServerName', label: '服务器名称', placeholder: '请输入服务器名称', clearable: true}},
    {type: 'r-text', props: {field: 'ip_address', label: '服务器IP地址', placeholder: '请输入服务器IP地址', clearable: true}},
    {type: 'r-select', props: {field: 'Type', label: '类型', placeholder: '请选择类型', clearable: true, options: [...DATABASE_SERVER_FILTER_TYPE_OPTIONS]}},
  ],
}))
const listError = computed(() => {revision.value; return view.value?.loadingError?.message ?? ''})
const editing = computed(() => {revision.value; const v = view.value; return v ? databaseServerEditing(v, edit.value) : undefined})
const rowActions = computed<RToolbarProps>(() => {
  revision.value
  const blocked = busy.value || !!editing.value || !view.value
  return {children: [
    {type: 'r-button', props: {label: '编辑', link: true, buttonType: 'primary', disabled: blocked, onClick: (row: unknown) => onRow(row, beginEdit)}},
    {type: 'r-button', props: {label: '删除', link: true, buttonType: 'danger', disabled: blocked, onClick: (row: unknown) => onRow(row, openDelete)}},
  ]}
})
/** 行操作作用于该行：先按原查询选中，再沿原选中行的编辑/删除守卫执行。 */
function onRow(row: unknown, run: () => unknown): void {
  const v = view.value
  const original = v?.rows.find(item => item === toRaw(row))
  if (!v || !original || busy.value || editing.value) return
  v.setSelectedRows([original])
  void run()
}
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
  busy.value = true; actionError.value = ''
  try {await operation(); if (current() && success) pageService.showMessage(success, 'success')}
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
  }, edit.value?.mode === 'add' ? '服务器注册成功' : '服务器编辑成功')
}
async function testConnection(): Promise<void> {
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
  await act(async () => {
    const ds = dataSet.value
    const v = view.value
    if (!ds || !v) return
    await databaseServerDeleteSelected(ds, v)
    edit.value = undefined
  }, '删除成功')
  if (!actionError.value) deleteOpen.value = false
}
function release(): void {
  actionGeneration++
  busy.value = false; actionError.value = ''
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
    const current = session.acquire({pageId: 'service-management-page', scenarioIds: [formKey], targetId: formKey,
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

<style scoped>
.database-server-page {padding: 8px}
</style>
