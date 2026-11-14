<!--
@module app:views/features/integration/api-management/ui/api-management-page
职责：外部服务管理：服务提供商目录的新建、编辑、删除、AI添加，并进入接口列表与基础配置。
边界：目录、记录编辑与删除都绑定同一PageRuntime的正式DataView；删除前经请求配置空间的children视图核对下属记录，有则拒绝。
AI用途：恢复外部服务入口时复用标准外壳、通用记录对话框和AI添加对话框，不手写请求或第二份草稿。
-->
<template>
  <RendererSection class="api-manage-page" title="外部服务管理" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取外部服务目录…' : ''" :error="error || message" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <template v-if="ready" #header-actions>
      <RendererButton label="AI添加" icon="ChatDotRound" :disabled="blocked" @click="openAi" />
      <RendererButton :data-view-key="viewKey" label="新建" button-type="primary" icon="Plus" perm-action="create"
        :disabled="blocked" @click="openCreate" />
    </template>
    <DisplayAlert v-if="ready && unresolvedModifier" alert-type="warning" :closable="false" :show-icon="true"
      title="部分修改人在当前可读用户目录中未解析，保留原始标识。" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="columns" :actions="actions" :auto-columns="false"
      :stripe="true" :border="true" :show-data-view-meta="false" :action-column="{label: '提供商操作', width: 280, fixed: true}"
      :pagination="{pageSizes: [10, 20, 50, 100], showJumper: true}" />
    <FeatureRecordDialog v-if="ready && dialog?.kind === 'record'" :key="dialog.epoch" :data-view-key="viewKey" :record-id="dialog.id"
      :created="dialog.created" :title="dialog.created ? '新增外部服务提供商' : '编辑外部服务提供商'" :specs="specs" :width="640"
      @close="closeRecord" />
    <AiDataEntryDialog v-if="ready && dialog?.kind === 'ai'" :key="dialog.epoch" :data-view-key="viewKey" @close="closeAi" />
    <ApiConfigPage v-if="ready && dialog?.kind === 'config'" :key="dialog.epoch" :provider-id="dialog.id"
      @close="dialog = null" @interfaces="openConfigInterfaces" />
    <ApiInterfaceListPage v-if="ready && interfaces" :key="interfaces.epoch" :provider-id="interfaces.id"
      :provider-name="interfaces.name" @close="interfaces = null" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {DisplayAlert, RendererButton, RendererSection, RendererTable, useSparkComponent, type RToolbarProps, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import type {FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import AiDataEntryDialog from '@/views/features/shared/ai/ai-data-entry-dialog.vue'
import ApiConfigPage from './api-config-page.vue'
import ApiInterfaceListPage from './api-interface-list-page.vue'

const scenarioId = '8CBB62EBC873A38DB9E6EEF177AFC731'
const configScenarioId = '446B5D94A71587E9BD4D325A4DF5F6F8'
const modelName = 'Base_InterfaceProvider'
/** 删除服务提供商前须为空的下属记录：请求配置空间中按服务商归属过滤的children视图。 */
const childRecords = [
  {modelName: 'Base_DataServiceInterface', label: '接口'},
  {modelName: 'Base_InterfaceProvider_Headers', label: '请求头'},
  {modelName: 'Base_Interface_PublicParam', label: '公共参数'},
  {modelName: 'Base_InterfaceProvider_Account', label: '认证账号'},
] as const
const userViewKey = buildDataViewKey('Base_UserInfo', 'default', scenarioId)
const {sparkConsume} = useSparkComponent({type: 'api-management-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'api-management-page')
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,
  modelName,
  componentType: 'api-management-page',
  title: '外部服务管理',
  optionModels: ['Base_UserInfo'],
  peerScenarioIds: [configScenarioId],
})

type ProviderDialog = Readonly<{kind: 'record'; id: string | number; created: boolean; epoch: number}>
  | Readonly<{kind: 'config'; id: string; name: string; epoch: number}>
  | Readonly<{kind: 'ai'; epoch: number}>
type InterfaceDialog = Readonly<{id: string; name: string; epoch: number}>
const dialog = ref<ProviderDialog | null>(null)
const interfaces = ref<InterfaceDialog | null>(null)
const busy = ref(false), message = ref(''), revision = ref(0)
let epoch = 0
const blocked = computed(() => busy.value || dialog.value !== null || interfaces.value !== null)
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const resolve = (key: string): DataView => {
  const view = ready.value ? session.runtime?.resolveView(key) : undefined
  if (!view) throw new Error(`外部服务管理缺少视图 ${key}`)
  return view
}
const list = () => resolve(viewKey)
const text = (row: Readonly<DataRow>, field: string) => typeof row[field] === 'string' ? row[field] : ''

const unresolvedModifier = computed(() => {
  revision.value
  if (!ready.value) return false
  const users = resolve(userViewKey), providers = list()
  const ids = new Set(users.rows.filter(row => users.fieldAccess(row, 'rowid').read === 'visible'
    && users.fieldAccess(row, 'UserName').read === 'visible').map(row => row['rowid']))
  return providers.rows.some(row => providers.fieldAccess(row, 'updateuser').read === 'visible'
    && row['updateuser'] !== undefined && row['updateuser'] !== null && row['updateuser'] !== '' && !ids.has(row['updateuser']))
})
const column = (field: string, label: string, props: Record<string, unknown>): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, showOverflowTooltip: true, ...props}})
const columns: SparkNode[] = [
  column('Name', '服务提供商名称', {minWidth: 220}),
  column('BaseURL', 'API 基础 URL', {minWidth: 320}),
  {type: 'r-select', props: {field: 'updateuser', label: '修改人', width: 160, readonly: true, sortable: false, optionDataViewKey: userViewKey}},
  column('updatetime', '修改时间', {width: 140, displayFormatter: (value: unknown) => String(value ?? '').slice(0, 10)}),
]
const specs: readonly FeatureFieldSpec[] = [
  {field: 'Name', label: '提供商名称', placeholder: '请输入提供商名称', required: true},
  {field: 'BaseURL', label: 'API 基础 URL', placeholder: '请输入 API 基础 URL', required: true},
]
type RowRenderContext = Readonly<{row?: DataRow | null; dataSource?: DataView | null}>
type RowGuard = (row: DataRow, view: DataView) => boolean
type RowButtonOptions = Readonly<{visible?: RowGuard; buttonType?: string; permAction?: 'edit' | 'delete'}>
const rowButton = (label: string, onClick: (row: DataRow) => unknown, options: RowButtonOptions = {}): SparkNode =>
  ({type: 'r-button', props: {dataViewKey: viewKey, label, link: true, buttonType: options.buttonType ?? 'primary', disabled: blocked.value, onClick,
    ...(options.permAction ? {permAction: options.permAction} : {}),
    ...(options.visible ? {onBeforeRender: ({row, dataSource}: RowRenderContext) =>
      Boolean(row && dataSource && options.visible?.(row, dataSource))} : {})}})
const actions = computed<RToolbarProps>(() => ({gap: 4, children: [
  rowButton('编辑', openEdit, {visible: (row, view) => view.editActionState(row) === 'enabled'}),
  rowButton('删除', removeProvider, {buttonType: 'danger', visible: (row, view) => view.deleteActionState(row) === 'enabled'}),
  rowButton('接口列表', row => openInterfaces(String(list().getPkKey(row) ?? ''), text(row, 'Name'))),
  rowButton('基础配置', openConfig, {permAction: 'edit'}),
]}))

async function openCreate(): Promise<void> {
  if (blocked.value) return
  busy.value = true; message.value = ''
  try {
    const view = list()
    if (view.dirtyTracking.hasPendingChanges() || view.hasUnconfirmedSave) throw new Error('目录仍有未处理的修改，请刷新后再新建')
    const id = view.getPkKey(await view.addRow({}))
    if (id === undefined) throw new Error('新增服务提供商缺少原生身份')
    dialog.value = {kind: 'record', id, created: true, epoch: ++epoch}
  } catch (cause) { message.value = `新增服务提供商失败：${failure(cause)}` } finally { busy.value = false }
}
function openEdit(row: DataRow): void {
  const id = list().getPkKey(row)
  if (id === undefined) { message.value = '服务提供商缺少可读的身份'; return }
  dialog.value = {kind: 'record', id, created: false, epoch: ++epoch}
}
function openConfig(row: DataRow): void {
  const id = list().getPkKey(row)
  if (id === undefined) { message.value = '服务提供商缺少可读的身份'; return }
  dialog.value = {kind: 'config', id: String(id), name: text(row, 'Name'), epoch: ++epoch}
}
function openInterfaces(id: string, name: string): void {
  if (!id) { message.value = '服务提供商缺少可读的身份'; return }
  interfaces.value = {id, name, epoch: ++epoch}
}
function openConfigInterfaces(): void {
  const current = dialog.value
  if (current?.kind === 'config') openInterfaces(current.id, current.name)
}
function openAi(): void {
  if (!blocked.value) dialog.value = {kind: 'ai', epoch: ++epoch}
}
async function refreshList(): Promise<void> {
  const view = list()
  if (view.dirtyTracking.hasPendingChanges() || view.hasUnconfirmedSave) return
  await view.refresh()
  revision.value++
}
async function closeRecord(): Promise<void> {
  dialog.value = null
  try { await refreshList() } catch (cause) { message.value = `刷新外部服务目录失败：${failure(cause)}` }
}
async function closeAi(saved: boolean): Promise<void> {
  dialog.value = null
  if (saved) await closeRecord()
}

async function removeProvider(row: DataRow): Promise<void> {
  if (blocked.value) return
  const confirmed = await pageService.showConfirm(`确定要删除服务提供商“${text(row, 'Name')}”吗？`, '删除确认', {type: 'warning'})
  if (!confirmed) return
  busy.value = true; message.value = ''
  const view = list(), id = view.getPkKey(row)
  try {
    if (id === undefined) throw new Error('服务提供商缺少可读的身份')
    if (view.dirtyTracking.hasPendingChanges() || view.hasUnconfirmedSave) throw new Error('目录仍有未处理的修改，请刷新后再删除')
    const children = childRecords.map(child => ({label: child.label, view: resolve(buildDataViewKey(child.modelName, 'children', configScenarioId))}))
    await Promise.all(children.map(child => {
      child.view.queryContext = {...child.view.queryContext, providerId: String(id)}
      return child.view.refresh()
    }))
    const failed = children.find(child => child.view.loadingError)
    if (failed?.view.loadingError) throw failed.view.loadingError
    const occupied = children.filter(child => child.view.rows.length > 0 || child.view.total > 0).map(child => child.label)
    if (occupied.length > 0) throw new Error(`该服务提供商下仍有${occupied.join('、')}，不能删除`)
    if (view.deleteActionState(row) !== 'enabled') throw new Error('当前无删除该服务提供商的权限')
    await view.removeRow(id)
    const result = await view.dataSet?.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
    if (!result) throw new Error('外部服务目录缺少所属数据空间')
    if (!result.success) {
      if (!view.hasUnconfirmedSave) view.discardPendingChanges([id])
      throw new Error(result.error?.message ?? '删除结果未确认，请刷新核验')
    }
    pageService.showMessage('删除成功', 'success')
    await refreshList()
  } catch (cause) { message.value = `删除服务提供商失败：${failure(cause)}` } finally { busy.value = false }
}
</script>

<style scoped>
.api-manage-page {padding: 8px}
</style>
