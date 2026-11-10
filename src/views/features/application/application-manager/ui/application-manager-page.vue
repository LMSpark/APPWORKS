<!--
@module app:views/features/application/application-manager/ui/application-manager-page
职责：展示 0C70 正式应用目录，提供 DataView 筛选、分页和安全的应用导航。
边界：不猜测未确认字段，不提供新增、编辑、删除、关联或负责人写入。
AI用途：恢复应用管理入口时复用本地正式场景与标准 DataView 组件。
-->
<template>
  <section class="application-manager">
    <header class="application-manager__header">
      <h1>应用系统列表</h1>
      <div class="application-manager__header-actions">
        <RendererButton label="新增" :disabled="true" />
        <RendererButton label="导出" :disabled="true" />
        <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" />
      </div>
    </header>
    <p class="application-manager__scope">
      新增、编辑和数据库关联暂不可用；删除与项目管理因缺少完整服务合同暂不可用。
      文档操作只提交任务，文件生成状态需另行确认。
    </p>
    <p v-if="loading" role="status">正在读取应用目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <p v-if="statusLoading" role="status">正在读取状态选项…</p>
    <p v-if="documentSubmitting" role="status">正在提交文档任务，请勿重复操作…</p>
    <p v-if="statusError" role="alert">{{ statusError }}</p>
    <RendererButton v-if="statusError && !statusLoading && ready" label="重试状态选项" @click="loadStatusOptions" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter"
      :actions="actions" :auto-columns="false" :stripe="true" :show-row-index="true" :highlight-current-row="true"
      :show-data-view-meta="false" :pagination="{pageSizes: [10, 20, 50, 100], showJumper: false}" />
    <section v-if="ready" class="application-manager__details" aria-label="所选应用的只读关联">
      <h2>所选应用关联信息</h2>
      <p>负责人关系：{{ ownerSummary }}</p>
      <p>默认数据库：{{ databaseSummary }}</p>
      <h3>默认数据库关联</h3>
      <RendererTable :data-view-key="databaseRelationViewKey" :children="databaseRelationFields"
        :auto-columns="false" :highlight-current-row="true" :show-pagination="false" :show-data-view-meta="false" />
      <template v-if="canReadDatabaseName">
        <h3>正式数据库名称</h3>
        <RendererTable :data-view-key="databaseViewKey" :children="databaseFields"
          :auto-columns="false" :show-pagination="false" :show-data-view-meta="false" />
      </template>
    </section>
  </section>
</template>

<script setup lang="ts">
import {computed, inject, onBeforeUnmount, ref, watch} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import {getNavHomePath} from '@spark-appworks/spark-app'
import {buildDataViewKey, RequestState, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererTable, type RFilterProps} from '@spark-appworks/spark-component'
import {lowcodeApi, readLowcodePrincipal} from '@/lowcode/lowcode-runtime'
import {buildApplicationPath} from '@/services/application-scope'
import {PROJECT_SWITCH_KEY} from '@/services/project/project-shell'
import {useTenantGovernanceRuntime} from '@/views/features/organization/tenant-governance/runtime/use-tenant-governance-runtime'

const scenarioId = '0C70F74793F9E858B71E0DBDEC784D57'
const modelName = 'Base_AppSystemList'
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useTenantGovernanceRuntime({
  scenarioId,
  modelName,
  componentType: 'application-manager-page',
  title: '应用系统列表',
})
const statusViewKey = buildDataViewKey('应用系统状态', 'default', scenarioId)
const databaseRelationViewKey = buildDataViewKey('Base_AppAndSource_Relation', 'default', scenarioId)
const databaseViewKey = buildDataViewKey('_base_dbInfo', 'default', scenarioId)
const router = useRouter()
const projectSwitch = inject(PROJECT_SWITCH_KEY)
const associationRevision = ref(0)
const dataSet = computed(() => {
  associationRevision.value
  if (!ready.value) return undefined
  return session.runtime?.getDataSet(scenarioId)
})
const pageView = computed(() => {
  if (!ready.value) return undefined
  return session.runtime?.getDataSet(scenarioId)?.getView(modelName, 'default')
})
const databaseRelationView = computed(() => dataSet.value?.getView('Base_AppAndSource_Relation', 'default'))
const databaseView = computed(() => dataSet.value?.getView('_base_dbInfo', 'default'))
const ownerView = computed(() => dataSet.value?.getView('Base_MainBody_RoleUser', 'default'))
const statusLoading = ref(false)
const statusError = ref('')
const documentSubmitting = ref(false)
const databaseRelationFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'conName', label: '关联数据库', readonly: true, minWidth: 240, sortable: false, showOverflowTooltip: true}},
]
const databaseFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'Name', label: '数据库名称', readonly: true, minWidth: 240, sortable: false, showOverflowTooltip: true}},
]
const ownerSummary = computed(() => {
  associationRevision.value
  const view = ownerView.value
  if (!view || view.requestState === RequestState.Idle) return '等待所选应用'
  if (view.requestState === RequestState.Failed) return '查询失败'
  if (view.requestState !== RequestState.Loaded) return '正在读取'
  if (view.total === 0) return '当前查询未返回人员关联'
  if (view.total !== 1) return '存在多条人员关联，无法确认负责人'
  if (view.rows.length !== 1) return '人员关联未完整读取，无法确认负责人'
  const row = view.rows[0]
  if (!row || !view.getColumn('UserIdField')) return '人员身份字段不可用，无法确认负责人'
  if (view.fieldAccess(row, 'UserIdField').read !== 'visible') return '无权限读取人员身份，无法确认负责人'
  if (!Object.hasOwn(row, 'UserIdField') || typeof row['UserIdField'] !== 'string' || !row['UserIdField'].trim()) {
    return '关联缺少人员身份，无法确认负责人'
  }
  return '存在人员关联，负责人身份尚未确认'
})
const databaseRelationProblem = computed(() => {
  associationRevision.value
  const view = databaseRelationView.value
  if (!view || view.requestState !== RequestState.Loaded || view.total === 0) return ''
  if (view.total !== 1) return '存在多条默认数据库关联，无法确定'
  if (view.rows.length !== 1) return '默认数据库关联未完整读取'
  const row = view.rows[0]
  if (!row || !view.getColumn('conid')) return '默认数据库身份字段不可用'
  if (view.fieldAccess(row, 'conid').read !== 'visible') return '无权限读取默认数据库身份'
  if (!Object.hasOwn(row, 'conid') || typeof row['conid'] !== 'string' || !row['conid'].trim()) {
    return '默认数据库关联缺少数据库身份'
  }
  return ''
})
const canReadDatabaseName = computed(() => {
  associationRevision.value
  const view = databaseRelationView.value
  return view?.requestState === RequestState.Loaded && view.total === 1 && !databaseRelationProblem.value
})
const databaseSummary = computed(() => {
  associationRevision.value
  const relationView = databaseRelationView.value
  if (!relationView || relationView.requestState === RequestState.Idle) return '等待所选应用'
  if (relationView.requestState === RequestState.Failed) return '默认数据库关联查询失败'
  if (relationView.requestState !== RequestState.Loaded) return '正在读取默认数据库关联'
  if (relationView.total === 0) return '没有匹配到正式默认数据库关联'
  if (databaseRelationProblem.value) return databaseRelationProblem.value
  const view = databaseView.value
  if (!view || view.requestState === RequestState.Idle || view.requestState === RequestState.Preparing
    || view.requestState === RequestState.Loading) return '关联已记录，正在读取数据库名称'
  if (view.requestState === RequestState.Failed) return '关联已记录，但数据库名称查询失败'
  if (view.total === 0) return '关联已记录，但未找到匹配的数据库名称'
  if (view.total !== 1) return '关联已记录，但数据库身份不唯一'
  if (view.rows.length !== 1) return '关联已记录，但数据库名称未完整读取'
  const row = view.rows[0]
  if (!row || !view.getColumn('Name')) return '关联已记录，但数据库名称字段不可用'
  if (view.fieldAccess(row, 'Name').read !== 'visible') return '关联已记录，但无权限读取数据库名称'
  if (!Object.hasOwn(row, 'Name') || typeof row['Name'] !== 'string' || !row['Name'].trim()) {
    return '关联已记录，但数据库名称缺失'
  }
  return '数据库名称已读取，见下方正式模型结果'
})
const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'AppDesc', label: '简称', readonly: true, minWidth: 220, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'AppName', label: '系统名称', readonly: true, minWidth: 180, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'WebUrl', label: 'WebUrl', readonly: true, minWidth: 220, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'DeveloperName', label: '开发商名称', readonly: true, minWidth: 160, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'CreateTime', label: '创建时间', readonly: true, minWidth: 180, sortable: false, showOverflowTooltip: true}},
  {type: 'r-select', props: {field: 'AppType', label: '状态', readonly: true, minWidth: 120, sortable: false,
    optionDataViewKey: statusViewKey, optionValueField: 'val', optionLabelField: 'txt'}},
]
const filter: RFilterProps = {
  autoQuery: false,
  queryOnReset: true,
  firstPageOnSearch: true,
  showExpressionEditor: false,
  showDataViewMeta: false,
  children: [
    {type: 'r-text', props: {field: 'AppDesc', label: '关键词', placeholder: '搜索简称或系统名称', filterTrim: true,
      filterAlternatives: [{field: 'AppDesc', operator: 'contains'}, {field: 'AppName', operator: 'contains'}]}},
  ],
}
const actions = computed(() => ({wrap: true, gap: 4, children: [
  {type: 'r-button', props: {dataViewKey: viewKey, label: '编辑', link: true, disabled: true}},
  {type: 'r-button', props: {dataViewKey: viewKey, label: '删除', link: true, disabled: true}},
  {type: 'r-button', props: {
    dataViewKey: viewKey,
    label: '应用链接',
    link: true,
    onClick: (row: DataRow) => openApplicationLink(row),
  }},
  {type: 'r-button', props: {
    dataViewKey: viewKey,
    label: '打开应用',
    link: true,
    onClick: (row: DataRow) => openApplicationLink(row),
  }},
  {type: 'r-button', props: {
    dataViewKey: viewKey,
    label: '进入应用',
    link: true,
    onBeforeRender: ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) =>
      Boolean(row && dataSource && canOpenApplication(row, dataSource)),
    onClick: (row: DataRow) => openApplication(row),
  }},
  {type: 'r-button', props: {dataViewKey: viewKey, label: '项目管理', link: true, disabled: true}},
  {type: 'r-button', props: {
    dataViewKey: viewKey,
    label: '需求说明书',
    link: true,
    disabled: documentSubmitting.value,
    onBeforeRender: ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) =>
      Boolean(row && dataSource && canOpenApplication(row, dataSource)),
    onClick: (row: DataRow) => submitApplicationDocument(row, 'requirements-specification'),
  }},
  {type: 'r-button', props: {
    dataViewKey: viewKey,
    label: '功能设计说明书',
    link: true,
    disabled: documentSubmitting.value,
    onBeforeRender: ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) =>
      Boolean(row && dataSource && canOpenApplication(row, dataSource)),
    onClick: (row: DataRow) => submitApplicationDocument(row, 'system-detailed-design'),
  }},
  {type: 'r-button', props: {dataViewKey: viewKey, label: '报价管理', link: true, disabled: true}},
  {type: 'r-button', props: {dataViewKey: viewKey, label: '关联数据库', link: true, disabled: true}},
] }))
let statusGeneration = 0
let documentGeneration = 0
let stopWatchingAssociations: (() => void) | undefined

async function loadStatusOptions(): Promise<void> {
  const current = session.runtime
  if (!ready.value || !current || statusLoading.value) return
  const own = ++statusGeneration
  statusLoading.value = true
  statusError.value = ''
  try {
    const view = current.getDataSet(scenarioId)?.getView('应用系统状态', 'default')
    if (!view) throw new Error('应用管理缺少正式状态字典视图')
    await view.refresh()
    if (view.loadingError) throw view.loadingError
  } catch (cause) {
    if (own === statusGeneration && session.isCurrent(current)) {
      statusError.value = `状态选项读取失败：${cause instanceof Error ? cause.message : String(cause)}`
    }
  } finally {
    if (own === statusGeneration && session.isCurrent(current)) statusLoading.value = false
  }
}

function canOpenApplication(row: DataRow, dataView: DataView): boolean {
  return Boolean(dataView.getColumn('rowid')
    && Object.hasOwn(row, 'rowid')
    && dataView.fieldAccess(row, 'rowid').read === 'visible'
    && typeof row['rowid'] === 'string'
    && row['rowid'].trim())
}

async function openApplication(row: DataRow): Promise<void> {
  try {
    const dataView = pageView.value
    if (!dataView || !canOpenApplication(row, dataView)) throw new Error('应用目录缺少可读的应用身份')
    const projectId = String(row['rowid']).trim()
    if (!readLowcodePrincipal()) throw new Error('未登录，无法切换应用')
    if (!projectSwitch) throw new Error('应用管理页缺少项目切换服务')
    const receipt = await projectSwitch.switchAndReload(projectId)
    receipt.assertCurrent()
    const failure = await router.push(buildApplicationPath({projectId}, getNavHomePath()))
    receipt.assertCurrent()
    if (failure) throw new Error('应用页面导航未完成')
  } catch (cause) {
    ElMessage.error(`进入应用失败：${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

function resolveApplicationWebUrl(row: DataRow, dataView: DataView): string {
  if (!dataView.getColumn('WebUrl') || !Object.hasOwn(row, 'WebUrl')
    || dataView.fieldAccess(row, 'WebUrl').read !== 'visible') {
    throw new Error('WebUrl字段当前无可读权限')
  }
  const value = row['WebUrl']
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value.trim())) {
    throw new Error('WebUrl为空或包含无效字符')
  }
  const url = new URL(value.trim(), window.location.origin)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('WebUrl只允许HTTP(S)地址')
  if (url.username || url.password) throw new Error('WebUrl不允许内嵌凭据')
  return url.href
}

function openApplicationLink(row: DataRow): void {
  let url: string
  try {
    const dataView = pageView.value
    if (!dataView) throw new Error('应用目录尚未就绪')
    url = resolveApplicationWebUrl(row, dataView)
  } catch (cause) {
    ElMessage.error(`应用链接不可用：${cause instanceof Error ? cause.message : String(cause)}`)
    return
  }

  try {
    window.open(url, '_blank', 'noopener,noreferrer')
    ElMessage.info('已请求打开应用链接；浏览器打开状态无法确认。')
  } catch (cause) {
    ElMessage.warning(`请求打开应用链接时浏览器报错：${cause instanceof Error ? cause.message : String(cause)}；打开状态无法确认。`)
  }
}

async function submitApplicationDocument(
  row: DataRow,
  kind: 'requirements-specification' | 'system-detailed-design',
): Promise<void> {
  if (documentSubmitting.value) {
    ElMessage.warning('文档任务正在提交，请勿重复操作。')
    return
  }
  const current = session.runtime
  const generation = documentGeneration
  const label = kind === 'requirements-specification' ? '需求说明书' : '功能设计说明书'
  documentSubmitting.value = true
  try {
    if (!current || !session.isCurrent(current)) throw new Error('应用页面作用域已失效')
    const dataView = pageView.value
    if (!dataView || !canOpenApplication(row, dataView)) throw new Error('应用目录缺少可读的项目身份')
    if (!readLowcodePrincipal()) throw new Error('未登录，无法提交文档任务')
    const projectId = String(row['rowid']).trim()
    const receipt = await lowcodeApi.blueprint.submitDocument(projectId, kind)
    if (generation !== documentGeneration || !session.isCurrent(current)) return
    if (receipt.status !== 'submitted' || receipt.coverage !== 'legacy-menu-scope') {
      throw new Error('文档提交回执格式未知')
    }
    ElMessage.info(`${label}请求已收到提交回执；文件生成状态未知。`)
  } catch (cause) {
    if (generation !== documentGeneration || (current && !session.isCurrent(current))) return
    ElMessage.error(`${label}提交结果未确认：${cause instanceof Error ? cause.message : String(cause)}`)
  } finally {
    if (generation === documentGeneration) documentSubmitting.value = false
  }
}

watch(ready, value => {
  statusGeneration++
  documentGeneration++
  stopWatchingAssociations?.()
  stopWatchingAssociations = undefined
  associationRevision.value++
  statusLoading.value = false
  statusError.value = ''
  documentSubmitting.value = false
  if (value) {
    const dataSet = session.runtime?.getDataSet(scenarioId)
    if (dataSet) {
      const changed = () => {associationRevision.value++}
      stopWatchingAssociations = dataSet.onAnyViewChange({
        rowsChanged: changed,
        requestStateChanged: changed,
        currentRowChanged: changed,
      })
    }
    void loadStatusOptions()
  }
}, {flush: 'sync'})
onBeforeUnmount(() => {
  statusGeneration++
  documentGeneration++
  stopWatchingAssociations?.()
})
</script>

<style scoped>
.application-manager {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.application-manager__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.application-manager__header-actions {display: flex; align-items: center; gap: 8px}
.application-manager__header h1 {margin: 0; font-size: 20px}
.application-manager__scope {margin: 0; padding: 10px 12px; border-radius: 4px; background: var(--el-color-info-light-9); color: var(--el-text-color-regular)}
.application-manager__details {display: grid; gap: 12px}
.application-manager__details h2, .application-manager__details h3, .application-manager__details p {margin: 0}
</style>
