<!--
@module app:views/features/integration/api-management/ui/api-config-page
职责：服务提供商“配置信息设置”：JWT设置、请求头部信息、公共参数、认证账号四个独立提交域。
边界：消费外部服务管理页同一PageRuntime中的请求配置空间；providerId写入各视图查询参数，归属默认值、规则、删除许可和保存均由SPARK data承接。
AI用途：每个页签只保存本页签视图，不夹带其它页签草稿；未知回执须重读核验，不自动重放。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="authKey" :width="1180" :close-disabled="busy || unconfirmed"
    @update:model-value="close">
    <RendererSection class="api-config-page" title="配置信息设置" :bordered="false" :grid-columns="1" :grid-gap="12"
      :status="loading ? '正在读取服务提供商配置…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadTab('jwt')">
      <template #header-actions>
        <RendererButton label="接口列表" button-type="primary" :disabled="busy" @click="emit('interfaces')" />
        <RendererButton :data-view-key="authKey" label="保存" button-type="primary" perm-action="edit"
          :disabled="!ready || busy || unconfirmed" @click="save(authKey)" />
      </template>
      <RendererTabs v-if="ready" v-model="tab" :data-view-key="authKey" @update:model-value="loadTab">
        <RendererTabPane name="jwt" label="JWT设置" :index="0">
          <RendererForm :data-view-key="authKey" :children="baseFields" :grid-columns="2" label-width="130px" :show-data-view-meta="false" />
          <RendererSection title="认证设置" :bordered="true" :grid-columns="1">
            <RendererForm :data-view-key="authKey" :children="authFields" :grid-columns="2" label-width="130px" :show-data-view-meta="false" />
          </RendererSection>
          <RendererSection title="令牌过期刷新" :bordered="true" :grid-columns="1">
            <RendererForm :data-view-key="authKey" :children="refreshFields" :grid-columns="2" label-width="130px" :show-data-view-meta="false" />
          </RendererSection>
          <DisplayAlert v-if="invalid(authKey, 'loginApiName')" alert-type="warning" :closable="false" :show-icon="true"
            title="认证接口引用失效，已保留原值，请重新选择后保存。" />
        </RendererTabPane>
        <RendererTabPane name="headers" label="请求头部信息" :index="1" :lazy="true">
          <RendererTable v-if="loaded.has('headers')" :data-view-key="headerKey" :children="headerColumns" :toolbar="toolbar(headerKey, ['add', 'remove', 'save', 'cancel'])"
            :auto-columns="false" :stripe="true" :border="true" :show-data-view-meta="false" />
        </RendererTabPane>
        <RendererTabPane name="publicParams" label="公共参数" :index="2" :lazy="true">
          <RendererTable v-if="loaded.has('publicParams')" :data-view-key="parameterKey" :children="parameterColumns" :toolbar="toolbar(parameterKey, ['save', 'add', 'remove'])"
            :auto-columns="false" :stripe="true" :border="true" :show-data-view-meta="false" />
          <DisplayAlert v-if="invalid(parameterKey, 'interfaceId') || invalid(parameterKey, 'outputfield')" alert-type="warning" :closable="false" :show-icon="true"
            title="当前公共参数的接口或输出字段引用失效，已保留原值，请选择有效引用后保存。" />
        </RendererTabPane>
        <RendererTabPane name="accounts" label="认证账号" :index="3" :lazy="true">
          <RendererTable v-if="loaded.has('accounts')" :data-view-key="accountKey" :children="accountColumns" :toolbar="toolbar(accountKey, ['add', 'remove', 'save', 'cancel'])"
            :auto-columns="false" :stripe="true" :border="true" :show-data-view-meta="false" />
        </RendererTabPane>
      </RendererTabs>
      <RendererButton v-if="unconfirmed" label="重读核验（放弃本地修改）" :disabled="busy" @click="reload" />
    </RendererSection>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, reactive, ref} from 'vue'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {featureTableToolbar, runFeatureTableAction, type FeatureTableAction} from '@/views/features/shared/table/feature-table-actions'
import type {ApiConfigPageProps} from './api-config-page.props'

type RToolbarProps = SparkComponent.RToolbarProps
const {PAGE_RUNTIME, DisplayAlert, RendererTable, RendererForm, RendererDialog, RendererButton, RendererSection, RendererTabs, RendererTabPane, useSparkComponent, consumeRequiredPageService} = SparkComponent

const scenarioId = '446B5D94A71587E9BD4D325A4DF5F6F8'
const props = defineProps<ApiConfigPageProps>()
const emit = defineEmits<{close: []; interfaces: []}>()
const {sparkConsume} = useSparkComponent({type: 'api-config-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'api-config-page')
const key = (table: string, viewId = 'default') => buildDataViewKey(table, viewId, scenarioId)
const authKey = key('Base_InterfaceProvider', 'authentication'), headerKey = key('Base_InterfaceProvider_Headers')
const parameterKey = key('Base_Interface_PublicParam'), referencesKey = key('Base_Interface_PublicParam', 'references')
const accountKey = key('Base_InterfaceProvider_Account'), headerTypeKey = key('接口公共头部信息使用类型')
const interfaceKey = key('Base_DataServiceInterface'), loginFieldKey = key('Base_TblField', 'jwt')
type TabName = 'jwt' | 'headers' | 'publicParams' | 'accounts'
/** 各页签首次打开时读取的视图；接口与输出字段候选由字段级联按当前值读取。 */
const tabViews: Readonly<Record<TabName, readonly string[]>> = {
  jwt: [authKey],
  headers: [headerKey, headerTypeKey, referencesKey],
  publicParams: [parameterKey],
  accounts: [accountKey],
}
const writable = [authKey, headerKey, parameterKey, accountKey] as const
const ready = ref(false), loading = ref(false), busy = ref(false), error = ref(''), revision = ref(0), tab = ref<string | number>('jwt')
const loaded = reactive(new Set<TabName>())
let dataSet: DataSet | undefined, active = true, unsubscribe: (() => void) | undefined, unsubscribeCascade: (() => void) | undefined
const runtime = sparkConsume(PAGE_RUNTIME)
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const changed = () => {revision.value++}
const view = (viewKey: string): DataView => {
  const found = runtime?.resolveView(viewKey)
  if (!found) throw new Error(`配置信息设置缺少视图 ${viewKey}`)
  return found
}
const views = computed(() => {revision.value; return ready.value ? writable.map(view) : []})
const dirty = computed(() => views.value.some(item => item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges()))
const unconfirmed = computed(() => views.value.some(item => item.hasUnconfirmedSave))
useSystemPageDirtySource({get isDirty() {return busy.value || dirty.value || unconfirmed.value}})

function invalid(viewKey: string, field: string): boolean {
  revision.value
  if (!ready.value || !dataSet) return false
  const target = view(viewKey), row = target.currentRow
  return !!row?.[field] && dataSet.getFieldCascadeState({tableName: target.tableName, viewId: target.viewId, field}).valueStatus === 'invalid'
}
const field = (type: string, props: Record<string, unknown>): SparkNode => ({type, props})
const baseFields: SparkNode[] = [
  field('r-text', {field: 'Name', label: '提供商名称', readonly: true}),
  field('r-text', {field: 'BaseURL', label: 'API 基础 URL', readonly: true}),
]
const responseField = (name: string, label: string) => field('r-select', {field: name, label, clearable: true, filterable: true, optionDataViewKey: loginFieldKey})
const authFields: SparkNode[] = [
  field('r-select', {field: 'loginApiName', label: '认证接口', clearable: true, filterable: true, optionDataViewKey: interfaceKey}),
  field('r-text', {field: 'TokenPrefix', label: '令牌前缀'}),
  responseField('TokenField', '从响应中提取的令牌字段名'),
  responseField('refreshTokenField', '刷新令牌提取'),
  responseField('expireTimeField', '过期时间提取'),
  responseField('expireRefreshTokenField', '刷新令牌过期时间字段'),
]
const refreshFields: SparkNode[] = [
  field('r-text', {field: 'tokenHeaderField', label: 'Header提取令牌属性'}),
  field('r-text', {field: 'refreshTokenHeaderField', label: 'Header提取刷新令牌属性'}),
  field('r-text', {field: 'expireTimeHeaderField', label: 'Header提取过期时间属性'}),
]
const cell = (type: string, props: Record<string, unknown>) => field(type, {showCellControl: true, sortable: false, ...props})
const headerColumns: SparkNode[] = [
  cell('r-text', {field: 'paramName', label: '参数名称', minWidth: 240}),
  field('r-value-function', {field: 'paramValue', label: '值函数', minWidth: 280, publicParameterDataViewKey: referencesKey, functionContext: {capabilities: ['huoshan']}}),
  cell('r-select', {field: 'type', label: '使用场景', minWidth: 220, clearable: true, optionDataViewKey: headerTypeKey}),
]
/** 输出字段候选随当前行接口查询，非当前行不编辑，避免以他行接口的候选改写。 */
const notCurrent = (row: Readonly<DataRow>) => {
  const parameters = view(parameterKey), current = parameters.currentRow
  return !current || parameters.getPkKey(current) !== parameters.getPkKey(row)
}
const parameterColumns: SparkNode[] = [
  cell('r-text', {field: 'paramName', label: '参数名称', minWidth: 180}),
  cell('r-text', {field: 'desc', label: '参数描述', minWidth: 180}),
  cell('r-select', {field: 'outputfield', label: '输出字段', minWidth: 180, filterable: true, optionDataViewKey: key('Base_TblField'), cellReadonly: notCurrent}),
  cell('r-select', {field: 'interfaceId', label: '接口名称', minWidth: 180, filterable: true, optionDataViewKey: interfaceKey}),
  field('r-text', {field: 'accessPath', label: '接口路径', minWidth: 220, readonly: true, sortable: false, showOverflowTooltip: true}),
]
const accountColumns: SparkNode[] = [
  cell('r-text', {field: 'UserName', label: '用户名', minWidth: 220}),
  cell('r-text', {field: 'Password', label: '密码', minWidth: 240, showPassword: true}),
  cell('r-text', {field: 'description', label: '备注', minWidth: 240}),
]

function toolbar(viewKey: string, order: readonly FeatureTableAction[]): RToolbarProps {
  revision.value
  return featureTableToolbar({view: view(viewKey), order, locked: busy.value, run: action => run(viewKey, action)})
}

async function act(action: () => Promise<unknown>): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {await action()} catch (cause) {error.value = failure(cause)}
  finally {busy.value = false; changed()}
}
function run(viewKey: string, action: FeatureTableAction): Promise<void> {
  return act(async () => {
    await runFeatureTableAction(view(viewKey), action, pageService)
    if (action === 'save' && viewKey === parameterKey && loaded.has('headers')) await view(referencesKey).refresh()
  })
}
function save(viewKey: string): Promise<void> {
  return run(viewKey, 'save')
}
function reload(): Promise<void> {
  return act(async () => {
    const targets = views.value.filter(item => item.hasUnconfirmedSave || item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges())
    await dataSet?.discardAndReload({views: targets.map(item => ({tableName: item.tableName, viewId: item.viewId}))})
  })
}
async function close(): Promise<void> {
  if (busy.value || unconfirmed.value) return
  if (dirty.value) {
    const confirmed = await pageService.showConfirm('存在未保存的修改，关闭将放弃这些修改。', '关闭确认', {type: 'warning'})
    if (!confirmed || busy.value || unconfirmed.value) return
    for (const item of views.value) item.discardPendingChanges()
  }
  emit('close')
}
function isTab(value: string | number): value is TabName {
  return value === 'jwt' || value === 'headers' || value === 'publicParams' || value === 'accounts'
}
async function loadTab(name: string | number): Promise<void> {
  if (!isTab(name) || loaded.has(name) || !active) return
  if (name === 'jwt') loading.value = true
  error.value = ''
  try {
    if (!runtime) throw new Error('配置信息设置缺少外部服务管理的运行实例')
    dataSet ??= runtime.getDataSet(scenarioId)
    if (!dataSet) throw new Error('配置信息设置缺少请求配置数据空间')
    if (!unsubscribe) {
      unsubscribe = dataSet.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed, editingChanged: changed,
        editingFieldChanged: changed, editingDiscarded: changed, requestStateChanged: changed})
      unsubscribeCascade = dataSet.onFieldCascadeChange(changed)
    }
    const targets = tabViews[name].map(view)
    for (const target of targets) {
      if (target.hasEditingChanges() || target.dirtyTracking.hasPendingChanges() || target.hasUnconfirmedSave) target.discardPendingChanges()
      if ('providerId' in target.queryContext) target.queryContext = {...target.queryContext, providerId: props.providerId}
    }
    await Promise.all(targets.map(target => target.refresh()))
    const failed = targets.find(target => target.loadingError)
    if (failed?.loadingError) throw failed.loadingError
    if (!active) return
    loaded.add(name)
    if (name === 'jwt') ready.value = true
  } catch (cause) {
    if (active) error.value = failure(cause)
  } finally {
    if (name === 'jwt') loading.value = false
    changed()
  }
}
void loadTab('jwt')
onBeforeUnmount(() => {active = false; unsubscribe?.(); unsubscribeCascade?.()})
</script>

<style scoped>
.api-config-page {min-height: 560px}
</style>
