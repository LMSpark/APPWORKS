<!--
@module app:views/features/integration/api-management/ui/api-config-page
职责：服务提供商“配置信息设置”：JWT设置、请求头部信息、公共参数、认证账号四个独立提交域。
边界：消费外部服务管理页同一PageRuntime中的请求配置空间；providerId写入各视图查询参数，归属默认值、规则、删除许可和保存均由SPARK data承接。
AI用途：每个页签只保存本页签视图，不夹带其它页签草稿；未知回执须重读核验，不自动重放。
-->
<template>
  <SparkComponentRenderer :config="dialogConfig" />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, reactive, ref} from 'vue'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, getSparkNodeChildren, nodeId, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {featureTableToolbar, runFeatureTableAction, type FeatureTableAction} from '@/views/features/shared/table/feature-table-actions'
import type {ApiConfigPageProps} from './api-config-page.props'

type RToolbarProps = SparkComponent.RToolbarProps
const {PAGE_RUNTIME, SparkComponentRenderer, useSparkComponent, consumeRequiredPageService} = SparkComponent

const scenarioId = '446B5D94A71587E9BD4D325A4DF5F6F8'
const props = defineProps<ApiConfigPageProps>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'api-config-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'api-config-page')
const key = (table: string, viewId = 'default') => buildDataViewKey(table, viewId, scenarioId)
const authKey = key('Base_InterfaceProvider', 'authentication'), headerKey = key('Base_InterfaceProvider_Headers')
const parameterKey = key('Base_Interface_PublicParam'), referencesKey = key('Base_Interface_PublicParam', 'references')
const accountKey = key('Base_InterfaceProvider_Account'), headerTypeKey = key('接口公共头部信息使用类型')
type TabName = 'jwt' | 'headers' | 'publicParams' | 'accounts'
/** 各页签首次打开时读取的视图；接口与输出字段候选由字段级联按当前值读取。 */
const tabViews: Readonly<Record<TabName, readonly string[]>> = {
  jwt: [authKey],
  headers: [headerKey, headerTypeKey, referencesKey],
  publicParams: [parameterKey],
  accounts: [accountKey],
}
const writable = [authKey, headerKey, parameterKey, accountKey] as const
const ready = ref(false), busy = ref(false), error = ref(''), revision = ref(0), tab = ref<string | number>('jwt')
const loaded = reactive(new Set<TabName>())
const pendingTabs = reactive(new Set<TabName>())
const tabErrors = reactive(new Map<TabName, string>())
const selectedTabLoading = computed(() => isTab(tab.value) && pendingTabs.has(tab.value))
const selectedTabError = computed(() => isTab(tab.value) ? tabErrors.get(tab.value) ?? '' : '')
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
/** 输出字段候选随当前行接口查询，非当前行不编辑，避免以他行接口的候选改写。 */
const notCurrent = (row: Readonly<DataRow>) => {
  const parameters = view(parameterKey), current = parameters.currentRow
  return !current || parameters.getPkKey(current) !== parameters.getPkKey(row)
}
const tableTabs = {
  headers: {viewKey: headerKey, actions: ['add', 'remove', 'save', 'cancel']},
  publicParams: {viewKey: parameterKey, actions: ['save', 'add', 'remove']},
  accounts: {viewKey: accountKey, actions: ['add', 'remove', 'save', 'cancel']},
} satisfies Record<Exclude<TabName, 'jwt'>, {viewKey: string; actions: FeatureTableAction[]}>

function selectTab(name: string | number): void {
  if (!isTab(name)) return
  tab.value = name
  void loadTab(name)
}
function bindTabs(tabs: SparkNode): SparkNode {
  return {
    ...tabs,
    props: {...tabs.props, modelValue: tab.value, on: {'update:modelValue': selectTab}},
    children: getSparkNodeChildren(tabs.children).map(pane => {
      const name = nodeId(pane)
      if (name === undefined || !isTab(name)) throw new Error('服务商配置包含未知页签')
      if (!loaded.has(name)) return {...pane, children: []}
      const children = getSparkNodeChildren(pane.children).flatMap(node => {
        if (node.type === 'r-alert') {
          const invalidReference = name === 'jwt' ? invalid(authKey, 'loginApiName')
            : invalid(parameterKey, 'interfaceId') || invalid(parameterKey, 'outputfield')
          return invalidReference ? [node] : []
        }
        if (name === 'jwt') return [node]
        const {viewKey, actions} = tableTabs[name]
        return [{
          ...node,
          props: {...node.props, toolbar: toolbar(viewKey, actions)},
          children: getSparkNodeChildren(node.children).map(child =>
            name === 'publicParams' && nodeId(child) === 'outputfield'
              ? {...child, props: {...child.props, cellReadonly: notCurrent}}
              : child),
        }]
      })
      return {...pane, children}
    }),
  }
}

const dialogConfig = computed<SparkNode>(() => {
  const [section] = getSparkNodeChildren(props.config.children)
  if (!section) throw new Error('服务商配置缺少弹窗内容')
  const header = section.props?.['header'] as {children?: SparkNode[]} | undefined
  const actions = getSparkNodeChildren(header?.children).map(node => ({
    ...node,
    props: nodeId(node) === 'config-save'
      ? {...node.props, disabled: !ready.value || busy.value || unconfirmed.value}
      : {...node.props, disabled: busy.value},
  }))
  const children = getSparkNodeChildren(section.children).flatMap(node => {
    if (node.type === 'r-tabs') return ready.value ? [bindTabs(node)] : []
    return unconfirmed.value
      ? [{...node, props: {...node.props, disabled: busy.value}}]
      : []
  })
  return {
    ...props.config,
    props: {...props.config.props, closeDisabled: busy.value || unconfirmed.value || pendingTabs.size > 0,
      on: {'update:modelValue': close}},
    children: [{
      ...section,
      props: {...section.props, header: {...header, children: actions},
        status: selectedTabLoading.value ? '正在读取服务提供商配置…' : '',
        error: selectedTabError.value || error.value,
        retryable: Boolean(selectedTabError.value) && !selectedTabLoading.value,
        on: {retry: () => loadTab(tab.value)}},
      children,
    }],
  }
})

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
async function saveAuthentication(): Promise<void> {
  if (active && ready.value && !unconfirmed.value) await run(authKey, 'save')
}
function verifyOriginalSaves(): Promise<void> {
  return act(async () => {
    for (const target of views.value.filter(item => item.hasUnconfirmedSave)) {
      const result=await target.saveChanges()
      if(!result.success)throw new Error(result.message || '原保存结果尚未核定')
    }
  })
}
defineExpose({saveAuthentication, verifyOriginalSaves})
async function close(): Promise<void> {
  if (busy.value || unconfirmed.value || pendingTabs.size > 0) return
  if (dirty.value) {
    const confirmed = await pageService.showConfirm('存在未保存的修改，关闭将放弃这些修改。', '关闭确认', {type: 'warning'})
    if (!confirmed || busy.value || unconfirmed.value || pendingTabs.size > 0) return
    for (const item of views.value) item.discardPendingChanges()
  }
  emit('close')
}
function isTab(value: string | number): value is TabName {
  return value === 'jwt' || value === 'headers' || value === 'publicParams' || value === 'accounts'
}
async function loadTab(name: string | number): Promise<void> {
  if (!isTab(name) || loaded.has(name) || pendingTabs.has(name) || !active) return
  pendingTabs.add(name)
  tabErrors.delete(name)
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
    if (targets.some(target => target.hasEditingChanges() || target.dirtyTracking.hasPendingChanges() || target.hasUnconfirmedSave)) {
      throw new Error('当前配置视图仍有待处理的修改或保存结果')
    }
    for (const target of targets) {
      if ('providerId' in target.queryContext) target.queryContext = {...target.queryContext, providerId: props.providerId}
    }
    const results = await Promise.allSettled(targets.map(target => target.refresh()))
    const rejected = results.find(result => result.status === 'rejected')
    if (rejected) throw rejected.reason
    const failed = targets.find(target => target.loadingError)
    if (failed?.loadingError) throw failed.loadingError
    if (!active) return
    loaded.add(name)
    if (name === 'jwt') ready.value = true
  } catch (cause) {
    if (active) tabErrors.set(name, failure(cause))
  } finally {
    pendingTabs.delete(name)
    changed()
  }
}
void loadTab('jwt')
onBeforeUnmount(() => {active = false; unsubscribe?.(); unsubscribeCascade?.()})
</script>
