<!--
@module app:views/features/application/enterprise-regist-manager/ui/enterprise-regist-manager-page
职责：平台级入驻管理：按 5914 正式场景筛选企业，提供应用授权、审核、超管密码与企业配置入口。
边界：读写均经同一PageRuntime的DataView与命令视图；审核按钮只依据本行CheckState写权限，不按身份放行。
-->
<template>
  <section class="enterprise-regist">
    <header class="enterprise-regist__header">
      <h1>企业审核</h1>
      <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" />
    </header>
    <p v-if="loading" role="status">正在读取入驻企业…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <p v-if="openError" role="alert">{{ openError }}</p>
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter" :actions="actions"
      :auto-columns="false" :stripe="true" :show-row-index="true" :highlight-current-row="true"
      :show-data-view-meta="false" :pagination="{pageSizes: [20], showJumper: true}" />
    <EnterpriseAppAuthDialog v-if="dialog?.kind === 'auth'" :scenario-id="scenarioId" :record-id="dialog.recordId"
      :short-name="dialog.shortName" :title="dialog.title" @close="closeDialog" />
    <EnterpriseAuditDialog v-if="dialog?.kind === 'audit'" :list-key="viewKey" :command-key="commandKey" :record-id="dialog.recordId"
      :title="dialog.title" @close="closeDialog" />
    <EnterprisePasswordDialog v-if="dialog?.kind === 'password'" :list-key="viewKey" :record-id="dialog.recordId"
      :title="dialog.title" @close="closeDialog" />
    <EnterpriseConfigDialog v-if="dialog?.kind === 'config'" :data-view-key="configKey" :policy-key="policyKey"
      :application-key="applicationKey" :record-id="dialog.recordId" :title="dialog.title" @close="closeDialog" />
  </section>
</template>

<script setup lang="ts">
import {computed, ref, shallowRef} from 'vue'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererTable, type RFilterProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import EnterpriseAppAuthDialog from './enterprise-app-auth-dialog.vue'
import EnterpriseAuditDialog from './enterprise-audit-dialog.vue'
import EnterprisePasswordDialog from './enterprise-password-dialog.vue'
import EnterpriseConfigDialog from './enterprise-config-dialog.vue'

const scenarioId = '5914FF981A7DF228ED88BBDB71353470'
const modelName = 'Base_Enterprise_Info'
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName, componentType: 'enterprise-regist-manager-page', title: '入驻管理', optionModels: ['entCheckState', 'login_policy'],
})
const checkStateKey = buildDataViewKey('entCheckState', 'default', scenarioId)
const policyKey = buildDataViewKey('login_policy', 'default', scenarioId)
const commandKey = buildDataViewKey('EnterpriseInitializationRequest', 'default', scenarioId)
const configKey = buildDataViewKey(modelName, 'currentEnterprise', scenarioId)
const applicationKey = buildDataViewKey('Base_AppSystemList', 'enterpriseApplications', scenarioId)
type DialogKind = 'auth' | 'audit' | 'password' | 'config'
const dialog = shallowRef<Readonly<{kind: DialogKind; recordId: string; shortName: string; title: string}> | null>(null)
const openError = ref('')
const titles: Readonly<Record<DialogKind, string>> = {auth: '应用授权', audit: '企业审核', password: '密码修改', config: '企业配置'}

const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'CName', label: '企业中文名', readonly: true, width: 180, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'Name', label: '企业英文名', readonly: true, width: 160, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'ShortName', label: '企业英文简称', readonly: true, width: 140, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'createtime', label: '申请入驻日期', readonly: true, width: 140, valueAlign: 'center',
    emptyText: '-', displayFormatter: (value: unknown) => String(value ?? '').trim().slice(0, 10) || '-'}},
  {type: 'r-text', props: {field: 'industry_type', label: '行业类型', readonly: true, width: 140, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'contact_person', label: '联系人', readonly: true, width: 80, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'entInfoUserPhone', label: '联系号码', readonly: true, width: 130, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'EntUrl', label: '企业门户地址', readonly: true, width: 160, showOverflowTooltip: true, emptyText: '-'}},
  {type: 'r-select', props: {field: 'CheckState', label: '审核状态', readonly: true, width: 120, valueAlign: 'center',
    optionDataViewKey: checkStateKey, optionValueField: 'val', optionLabelField: 'txt'}},
]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [
    {type: 'r-text', props: {field: 'CName', label: '企业中文名', placeholder: '请输入企业中文名', filterTrim: true, clearable: true,
      filterAlternatives: [{field: 'CName', operator: 'contains'}]}},
    {type: 'r-select', props: {field: 'CheckState', label: '审核状态', placeholder: '请选择审核状态', clearable: true,
      optionDataViewKey: checkStateKey, optionValueField: 'val', optionLabelField: 'txt'}},
  ],
}
const listView = computed(() => ready.value ? session.runtime?.getDataSet(scenarioId)?.getView(modelName, 'default') : undefined)
const canAudit = ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) =>
  Boolean(row && dataSource && dataSource.fieldAccess(row, 'CheckState').write === 'allowed')
const action = (label: string, kind: DialogKind, extra: Record<string, unknown> = {}) => ({type: 'r-button', props: {
  dataViewKey: viewKey, label, link: true, ...extra, onClick: (row: DataRow) => openDialog(kind, row),
}})
const actions = {wrap: true, gap: 4, children: [
  action('应用授权', 'auth'),
  action('审核', 'audit', {buttonType: 'warning', onBeforeRender: canAudit}),
  action('密码修改', 'password'),
  action('配置', 'config'),
]}

function readIdentity(row: DataRow): string {
  const view = listView.value
  const id = row['rowid']
  if (!view || view.fieldAccess(row, 'rowid').read !== 'visible' || typeof id !== 'string' || !id.trim()) throw new Error('企业记录身份不可读')
  return id
}
function displayName(row: DataRow): string {
  const view = listView.value
  for (const field of ['CName', 'ShortName']) {
    const value = row[field]
    if (view?.fieldAccess(row, field).read === 'visible' && typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}
async function openDialog(kind: DialogKind, row: DataRow): Promise<void> {
  openError.value = ''
  try {
    const recordId = readIdentity(row), name = displayName(row)
    const title = name ? `${titles[kind]} - ${name}` : titles[kind]
    const shortName = kind === 'auth' || kind === 'config' ? readShortName(row) : ''
    if (kind === 'config') await prepareConfig(recordId, shortName)
    dialog.value = {kind, recordId, shortName, title}
  } catch (cause) {
    openError.value = `${titles[kind]}无法打开：${cause instanceof Error ? cause.message : String(cause)}`
  }
}
/** 打开配置前按本企业身份重新读取配置行与本企业应用候选；不复用列表行的配置值。 */
function readShortName(row: DataRow): string {
  const shortName = row['ShortName']
  if (listView.value?.fieldAccess(row, 'ShortName').read !== 'visible' || typeof shortName !== 'string' || !shortName.trim()) throw new Error('企业英文简称不可读')
  return shortName.trim()
}
async function prepareConfig(recordId: string, shortName: string): Promise<void> {
  const current = session.runtime, dataSet = current?.getDataSet(scenarioId)
  const config = dataSet?.getView(modelName, 'currentEnterprise'), applications = dataSet?.getView('Base_AppSystemList', 'enterpriseApplications')
  if (!current || !config || !applications) throw new Error('入驻管理缺少企业配置视图')
  if (config.hasEditingChanges() || config.dirtyTracking.hasPendingChanges() || config.hasUnconfirmedSave) throw new Error('上一次企业配置尚未保存或取消')
  config.queryContext = {...config.queryContext, enterpriseId: recordId}
  applications.queryContext = {...applications.queryContext, entShortName: shortName}
  await Promise.all([config.refresh(), applications.refresh()])
  if (!session.isCurrent(current)) throw new Error('页面已切换')
  const failed = [config, applications].find(view => view.loadingError)
  if (failed?.loadingError) throw failed.loadingError
  if (config.rows.length !== 1 || config.getPkKey(config.rows[0]!) !== recordId) throw new Error('未读取到唯一的企业配置记录')
}
function closeDialog(): void {
  dialog.value = null
}
</script>

<style scoped>
.enterprise-regist {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.enterprise-regist__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.enterprise-regist__header h1 {margin: 0; font-size: 20px}
</style>
