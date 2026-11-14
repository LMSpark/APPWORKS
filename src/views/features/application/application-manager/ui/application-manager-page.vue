<!--
@module app:views/features/application/application-manager/ui/application-manager-page
职责：应用系统列表：0C70 正式应用目录的筛选分页，新增/编辑/删除应用系统，应用链接与进入应用，企业默认应用，项目管理，文档任务及关联数据库。
边界：列表、表单、负责人、关联与导航根都绑定同一 PageRuntime 的正式 DataView，写入经应用记录编排分阶段保存；默认应用只写本企业 ent_config 成员。
AI用途：恢复应用管理入口时复用本地正式场景、标准组件与 DataView 绑定；导出与报价管理尚未交付。
-->
<template>
  <RendererSection class="application-manager" title="应用系统列表" :header="header" :bordered="false" :grid-columns="1">
    <p v-if="loading" role="status">正在读取应用目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <p v-if="documentSubmitting" role="status">正在提交文档任务，请勿重复操作…</p>
    <p v-if="message" role="alert">{{ message }}</p>
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter"
      :actions="actions" :auto-columns="false" :stripe="true" :show-row-index="true" :highlight-current-row="true"
      :show-data-view-meta="false" :pagination="{pageSizes: [10, 20, 50, 100], showJumper: true}" />
    <ApplicationManagerFormDialog v-if="record" :key="record.appId" :record="record" :portal="defaultApplication"
      @close="record = null" @saved="afterSaved" />
    <ApplicationRelationDialogs v-if="relationTarget" :sysid="relationTarget.id" :title="relationTarget.title" @close="relationTarget = null" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, inject, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRouter} from 'vue-router'
import {getNavHomePath, SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererSection, RendererTable, useSparkComponent, type RFilterProps, type RToolbarProps, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {lowcodeApi, readLowcodePrincipal} from '@/lowcode/lowcode-runtime'
import {buildApplicationPath} from '@/services/application-scope'
import {PROJECT_SWITCH_KEY} from '@/services/project/project-shell'
import {EnterpriseDefaultApplication} from '@/services/project/enterprise-landing'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import * as Model from '../model/application-manager-model'
import ApplicationManagerFormDialog from './application-manager-form-dialog.vue'
import ApplicationRelationDialogs from './application-relation-dialogs.vue'

const {APPLICATION_MANAGER_SCENARIO: scenarioId, ApplicationManagerRecord, readApplicationId, readText} = Model
const modelName = 'Base_AppSystemList'
const {sparkConsume} = useSparkComponent({type: 'application-manager-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'application-manager-page')
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,
  modelName,
  componentType: 'application-manager-page',
  title: '应用系统列表',
  optionModels: ['应用系统状态'],
  peerScenarioIds: [Model.DATABASE_RELATIONS_SCENARIO, Model.PERSON_SCENARIO],
})
const statusViewKey = buildDataViewKey('应用系统状态', 'default', scenarioId)
const userViewKey = buildDataViewKey('Base_UserInfo', 'default', Model.PERSON_SCENARIO)
/** 项目管理进入目标应用的应用功能管理页，导航身份为该页正式节点。 */
const PROJECT_MANAGEMENT_PATH = '/features/application/application-function-management/ui/application-function-page'
const PROJECT_MANAGEMENT_NODE_ID = '7AB874097A1E8711A42FD845939A6E05'
const router = useRouter()
const projectSwitch = inject(PROJECT_SWITCH_KEY)
const record = shallowRef<Model.ApplicationManagerRecord | null>(null)
const relationTarget = ref<{id: string; title: string} | null>(null)
const busy = ref(false), message = ref(''), documentSubmitting = ref(false)
const defaultApplication = shallowRef<EnterpriseDefaultApplication | null>(null)
const defaultApplicationId = ref(''), defaultWritable = ref(false), defaultSaving = ref(false)
const dataSet = () => {
  const found = ready.value ? session.runtime?.getDataSet(scenarioId) : undefined
  if (!found) throw new Error('应用目录尚未就绪')
  return found
}
const pageView = () => {
  const found = dataSet().getView(modelName, 'default')
  if (!found) throw new Error('应用目录缺少正式列表视图')
  return found
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const notDelivered = (label: string) => () => pageService.showMessage(`${label}尚未交付`, 'info')

const header = computed(() => ({children: [
  {type: 'r-button', props: {label: '新增', buttonType: 'primary', disabled: !ready.value || busy.value, onClick: openCreate}},
  {type: 'r-button', props: {label: '导出', onClick: notDelivered('导出')}},
  ...(ready.value ? [{type: 'r-button', props: {dataViewKey: viewKey, label: '刷新', action: 'refresh'}}] : []),
]}))
const column = (field: string, label: string, props: Record<string, unknown>): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, showOverflowTooltip: true, ...props}})
const fields: SparkNode[] = [
  column('AppDesc', '简称', {minWidth: 200, cellAction: (row: Readonly<DataRow>) => void openEdit(row),
    cellActionEnabled: (row: Readonly<DataRow>) => canEdit(row)}),
  column('AppName', '系统名称', {minWidth: 180}),
  column('WebUrl', 'WebUrl', {minWidth: 200}),
  column('DeveloperName', '开发商名称', {minWidth: 160}),
  column('CreateTime', '创建时间', {minWidth: 120, displayFormatter: (value: unknown) => String(value ?? '').slice(0, 10)}),
  {type: 'r-select', props: {field: 'AppType', label: '状态', readonly: true, minWidth: 120,
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
type RowGuard = (row: DataRow, view: DataView) => boolean
type RowButtonOptions = Readonly<{visible?: RowGuard; buttonType?: string; disabled?: boolean}>
type ApplicationTarget = Readonly<{path: string; query?: Record<string, string>}>
type RowRenderContext = Readonly<{row?: DataRow | null; dataSource?: DataView | null}>
const rowButton = (label: string, onClick: (row: DataRow) => unknown, options: RowButtonOptions = {}) =>
  ({type: 'r-button', props: {dataViewKey: viewKey, label, link: true, onClick,
    ...(options.buttonType ? {buttonType: options.buttonType} : {}), ...(options.disabled ? {disabled: true} : {}),
    ...(options.visible ? {onBeforeRender: ({row, dataSource}: RowRenderContext) =>
      Boolean(row && dataSource && options.visible?.(row, dataSource))} : {})}})
const hasId: RowGuard = (row, view) => Boolean(readApplicationId(row, view))
const isDefault: RowGuard = (row, view) => Boolean(defaultApplicationId.value && readApplicationId(row, view) === defaultApplicationId.value)
const actions = computed<RToolbarProps>(() => ({wrap: true, gap: 4, children: [
  rowButton('编辑', row => openEdit(row), {visible: row => canEdit(row)}),
  rowButton('删除', row => removeApplication(row), {buttonType: 'danger', disabled: busy.value, visible: (row, view) =>
    readText(row, 'AppType') === Model.APPLICATION_DELETABLE_STATUS && view.deleteActionState(row) === 'enabled'}),
  rowButton('应用链接', openApplicationLink),
  rowButton('打开应用', openApplicationLink),
  rowButton('进入应用', openApplication, {visible: hasId}),
  rowButton('默认', () => undefined, {buttonType: 'success', disabled: true, visible: isDefault}),
  rowButton('设为默认', row => saveDefaultApplication(row), {disabled: defaultSaving.value,
    visible: (row, view) => defaultWritable.value && hasId(row, view) && !isDefault(row, view)}),
  rowButton('取消默认', () => saveDefaultApplication(null), {buttonType: 'danger', disabled: defaultSaving.value,
    visible: (row, view) => defaultWritable.value && isDefault(row, view)}),
  rowButton('项目管理', openProjectManagement, {visible: hasId}),
  rowButton('需求说明书', row => submitApplicationDocument(row, 'requirements-specification'), {disabled: documentSubmitting.value, visible: hasId}),
  rowButton('功能设计说明书', row => submitApplicationDocument(row, 'system-detailed-design'), {disabled: documentSubmitting.value, visible: hasId}),
  rowButton('报价管理', notDelivered('报价管理')),
  rowButton('关联数据库', openRelations, {visible: (row, view) => hasId(row, view) && view.editActionState(row) === 'enabled'}),
]}))

function canEdit(row: Readonly<DataRow>): boolean {
  try {
    const view = pageView()
    return Boolean(readApplicationId(row, view)) && view.editActionState(row) === 'enabled'
  } catch { return false }
}

async function refreshUsers(): Promise<void> {
  const users = session.runtime?.resolveView(userViewKey)
  if (!users) throw new Error('应用管理缺少人员视图')
  await users.refresh()
  if (users.loadingError) throw new Error(`获取人员列表失败：${users.loadingError.message}`)
}

async function openRecord(open: () => Promise<Model.ApplicationManagerRecord>): Promise<void> {
  if (busy.value || record.value) return
  busy.value = true; message.value = ''
  try {
    await refreshUsers()
    record.value = await open()
  } catch (cause) { message.value = failure(cause) } finally { busy.value = false }
}
function openCreate(): Promise<void> {
  return openRecord(() => {
    const status = session.runtime?.resolveView(statusViewKey)
    return ApplicationManagerRecord.openCreate(dataSet(), readText(status?.rows[0], 'val') || '0')
  })
}
function openEdit(row: Readonly<DataRow>): Promise<void> {
  return openRecord(() => {
    const id = readApplicationId(row, pageView())
    if (!id) throw new Error('应用目录缺少可读的应用身份')
    return ApplicationManagerRecord.openEdit(dataSet(), id)
  })
}
async function afterSaved(): Promise<void> {
  if (defaultApplication.value) defaultApplicationId.value = defaultApplication.value.applicationId
  await pageView().refresh()
}

async function removeApplication(row: DataRow): Promise<void> {
  if (busy.value) return
  const title = readText(row, 'AppDesc') || readText(row, 'AppName') || readText(row, 'rowid')
  const confirmed = await pageService.showConfirm(`确认删除应用系统“${title}”吗？`, '删除确认', {type: 'warning'})
  if (!confirmed) return
  busy.value = true; message.value = ''
  try {
    pageService.showMessage(await Model.deleteApplication(dataSet(), row), 'success')
    await pageView().refresh()
  } catch (cause) { message.value = `删除应用系统失败：${failure(cause)}` } finally { busy.value = false }
}

function openRelations(row: DataRow): void {
  const id = readApplicationId(row, pageView())
  if (!id) { pageService.showMessage('关联数据库缺少可读的应用身份', 'error'); return }
  relationTarget.value = {id, title: readText(row, 'AppDesc') || readText(row, 'AppName')}
}

let defaultGeneration = 0
function releaseDefaultApplication(): void {
  defaultGeneration++
  defaultApplication.value?.destroy()
  defaultApplication.value = null
  defaultApplicationId.value = ''
  defaultWritable.value = false
  defaultSaving.value = false
}
async function loadDefaultApplication(): Promise<void> {
  releaseDefaultApplication()
  const own = defaultGeneration
  try {
    const config = await EnterpriseDefaultApplication.load(() => {
      if (own !== defaultGeneration) throw new Error('应用目录已切换')
    })
    if (own !== defaultGeneration) {config.destroy(); return}
    defaultApplication.value = config
    defaultApplicationId.value = config.applicationId
    defaultWritable.value = config.writable
  } catch (cause) {
    if (own === defaultGeneration) message.value = `企业默认应用读取失败：${failure(cause)}`
  }
}
async function saveDefaultApplication(row: DataRow | null): Promise<void> {
  const config = defaultApplication.value
  if (!config || defaultSaving.value) return
  message.value = ''
  defaultSaving.value = true
  try {
    const id = row ? readApplicationId(row, pageView()) : ''
    if (row && !id) throw new Error('应用目录缺少可读的应用身份')
    await config.save(row ? id : null)
    defaultApplicationId.value = config.applicationId
    pageService.showMessage(row ? '已设为企业默认应用' : '已取消企业默认应用', 'success')
  } catch (cause) {
    message.value = `默认应用保存未确认：${failure(cause)}`
  } finally {
    if (defaultApplication.value === config) defaultSaving.value = false
  }
}

/** 切换到目标应用后进入其页面；切换回执失效即中止导航。 */
async function enterApplication(row: DataRow, target: ApplicationTarget): Promise<void> {
  const projectId = readApplicationId(row, pageView())
  if (!projectId) throw new Error('应用目录缺少可读的应用身份')
  if (!readLowcodePrincipal()) throw new Error('未登录，无法切换应用')
  if (!projectSwitch) throw new Error('应用管理页缺少项目切换服务')
  const receipt = await projectSwitch.switchAndReload(projectId)
  receipt.assertCurrent()
  const failed = await router.push({path: buildApplicationPath({projectId}, target.path), ...(target.query ? {query: target.query} : {})})
  receipt.assertCurrent()
  if (failed) throw new Error('应用页面导航未完成')
}
async function openApplication(row: DataRow): Promise<void> {
  try { await enterApplication(row, {path: getNavHomePath()}) } catch (cause) { pageService.showMessage(`进入应用失败：${failure(cause)}`, 'error') }
}
async function openProjectManagement(row: DataRow): Promise<void> {
  try {
    await enterApplication(row, {path: PROJECT_MANAGEMENT_PATH, query: {[SYSTEM_PAGE_NAVIGATION_ID_QUERY]: PROJECT_MANAGEMENT_NODE_ID}})
  } catch (cause) { pageService.showMessage(`进入项目管理失败：${failure(cause)}`, 'error') }
}

function openApplicationLink(row: DataRow): void {
  let url: string
  try {
    url = Model.resolveApplicationWebUrl(row, pageView())
  } catch (cause) {
    pageService.showMessage(`应用链接不可用：${failure(cause)}`, 'error')
    return
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
    pageService.showMessage('已请求打开应用链接；浏览器打开状态无法确认。', 'info')
  } catch (cause) {
    pageService.showMessage(`请求打开应用链接时浏览器报错：${failure(cause)}；打开状态无法确认。`, 'warning')
  }
}

let documentGeneration = 0
async function submitApplicationDocument(row: DataRow, kind: 'requirements-specification' | 'system-detailed-design'): Promise<void> {
  if (documentSubmitting.value) {
    pageService.showMessage('文档任务正在提交，请勿重复操作。', 'warning')
    return
  }
  const current = session.runtime
  const generation = documentGeneration
  const label = kind === 'requirements-specification' ? '需求说明书' : '功能设计说明书'
  documentSubmitting.value = true
  try {
    if (!current || !session.isCurrent(current)) throw new Error('应用页面作用域已失效')
    const projectId = readApplicationId(row, pageView())
    if (!projectId) throw new Error('应用目录缺少可读的项目身份')
    if (!readLowcodePrincipal()) throw new Error('未登录，无法提交文档任务')
    const receipt = await lowcodeApi.blueprint.submitDocument(projectId, kind)
    if (generation !== documentGeneration || !session.isCurrent(current)) return
    if (receipt.status !== 'submitted' || receipt.coverage !== 'legacy-menu-scope') throw new Error('文档提交回执格式未知')
    pageService.showMessage(`${label}请求已收到提交回执；文件生成状态未知。`, 'info')
  } catch (cause) {
    if (generation !== documentGeneration || (current && !session.isCurrent(current))) return
    pageService.showMessage(`${label}提交结果未确认：${failure(cause)}`, 'error')
  } finally {
    if (generation === documentGeneration) documentSubmitting.value = false
  }
}

watch(ready, value => {
  documentGeneration++
  documentSubmitting.value = false
  record.value = null
  relationTarget.value = null
  message.value = ''
  if (value) void loadDefaultApplication()
  else releaseDefaultApplication()
}, {flush: 'sync'})
onBeforeUnmount(() => {
  documentGeneration++
  releaseDefaultApplication()
})
</script>

<style scoped>
.application-manager {padding: 24px}
</style>
