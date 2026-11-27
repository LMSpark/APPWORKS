<!--
@module app:views/features/integration/api-management/ui/api-management-page
职责：外部服务管理：服务提供商目录的新建、编辑、删除、AI添加，并进入接口列表与基础配置。
边界：目录、记录编辑与删除都绑定同一PageRuntime的正式DataView；删除前经请求配置空间的children视图核对下属记录，有则拒绝。
AI用途：恢复外部服务入口时复用标准外壳、通用记录对话框和AI添加对话框，不手写请求或第二份草稿。
-->
<template>
  <RendererSection class="api-manage-page" title="外部服务管理" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取外部服务目录…' : ''" :error="error || message" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false" />
    <FeatureRecordDialog v-if="ready && dialog?.kind === 'record'" :key="dialog.epoch" :data-view-key="viewKey" :record-id="dialog.id"
      :created="dialog.created" :title="dialog.created ? '新增外部服务提供商' : '编辑外部服务提供商'" :specs="specs" :width="640"
      @close="closeRecord" />
    <AiDataEntryDialog v-if="ready && dialog?.kind === 'ai'" :key="dialog.epoch" :data-view-key="viewKey" @close="closeAi" />
    <ApiInterfaceListPage v-if="ready && interfaces" :key="interfaces.epoch" :provider-id="interfaces.id"
      :provider-name="interfaces.name" @close="interfaces = null" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref, shallowRef} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {RendererSection, SparkComponentRenderer, SparkPageRenderer, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import type {FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import AiDataEntryDialog from '@/views/features/shared/ai/ai-data-entry-dialog.vue'
import ApiConfigPage from './api-config-page.vue'
import ApiInterfaceListPage from './api-interface-list-page.vue'
import {PageTool} from '@spark-appworks/spark-project-model'
import rule from './provider-tool/rule.json?raw'
import script from './provider-tool/script.js?raw'
import style from './provider-tool/style.css?raw'

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
const route=useRoute()
const routeSnapshot=computed(()=>{
  const {path,fullPath,name,params,query,hash}=route
  return {path,fullPath,name:name??null,params,query,hash}
})
const tool=new PageTool({pageId:'api-management-page'})
tool.hydrateFileText('rule.json',rule)
tool.hydrateFileText('script.js',script)
tool.hydrateFileText('style.css',style)
tool.markLoaded()
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,
  modelName,
  tool,
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
const providerConfig = shallowRef<InstanceType<typeof ApiConfigPage> | null>(null)
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
const list = () => resolve(viewKey.value)
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
const specs: readonly FeatureFieldSpec[] = [
  {field: 'Name', label: '提供商名称', placeholder: '请输入提供商名称', required: true},
  {field: 'BaseURL', label: 'API 基础 URL', placeholder: '请输入 API 基础 URL', required: true},
]
const runtime=computed(()=>ready.value?session.runtime:undefined)
const host=computed(()=>{
  const current=runtime.value
  if(!current)return undefined
  const assertCurrent=()=>{if(!session.isCurrent(current))throw new Error('外部服务目录实例已失效')}
  return {runtime:current,assertCurrent,async invoke(command:string,input:unknown){
    assertCurrent()
    if (dialog.value?.kind === 'config') {
      const config = providerConfig.value
      if (command === 'providers.configInterfaces') return openConfigInterfaces()
      if (command === 'providers.configSave') return await config?.saveAuthentication()
      if (command === 'providers.configVerify') return await config?.verifyOriginalSaves()
      if (command === 'providers.configTab') return config?.selectTab(input)
      if (command === 'providers.configRetry') return await config?.retryTab()
      if (command === 'providers.configClose') return await config?.close()
    }
    if(command==='providers.connect')return {
      blocked:()=>blocked.value,unresolved:()=>unresolvedModifier.value,
      canEdit:(row:DataRow|null|undefined)=>!!row&&list().editActionState(row)==='enabled',
      canDelete:(row:DataRow|null|undefined)=>!!row&&list().deleteActionState(row)==='enabled',
      configuration: ApiConfigPage,
      node: SparkComponentRenderer,
      configurationProps: () => {
        const target = dialog.value
        if (!ready.value || target?.kind !== 'config') return undefined
        return {key: target.epoch, providerId: target.id, onClose: () => {
          if (dialog.value === target) dialog.value = null
        }}
      },
      bindConfiguration: (config: InstanceType<typeof ApiConfigPage> | null) => {providerConfig.value = config},
      configurationBindings: () => providerConfig.value?.bindings,
    }
    if(blocked.value)return undefined
    if(command==='providers.create')await openCreate()
    if(command==='providers.ai')openAi()
    const catalog=list()
    const row=catalog.rows.find(item=>catalog.getPkKey(item)===input)
    if(!row)return undefined
    if(command==='providers.edit'&&catalog.editActionState(row)==='enabled')openEdit(row)
    if(command==='providers.remove'&&catalog.deleteActionState(row)==='enabled')await removeProvider(row)
    if(command==='providers.config'&&catalog.editActionState(row)==='enabled')openConfig(row)
    if(command==='providers.interfaces')openInterfaces(String(catalog.getPkKey(row)??''),text(row,'Name'))
    return undefined
  }}
})

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
    const owner = view.dataSet
    if (!owner) throw new Error('外部服务目录缺少所属数据空间')
    await view.removeRow(id)
    try {
      await owner.saveRecord(view, id)
    } catch (cause) {
      if (!view.destroyed && !view.hasUnconfirmedSave && view.dirtyTracking.isPendingDelete(id)) {
        view.discardPendingChanges([id])
      }
      throw cause
    }
    try {
      const readback = await view.requestRefresh({defer: false})
      if (readback.refreshStatus !== 'read') throw new Error(readback.message ?? '目录未完成读取')
      revision.value++
    } catch (cause) {
      pageService.showMessage('删除已确认，外部服务目录回读失败：' + failure(cause), 'warning')
      return
    }
    pageService.showMessage('删除成功', 'success')
  } catch (cause) { message.value = `删除服务提供商失败：${failure(cause)}` } finally { busy.value = false }
}
</script>

<style scoped>
.api-manage-page {padding: 8px}
</style>
