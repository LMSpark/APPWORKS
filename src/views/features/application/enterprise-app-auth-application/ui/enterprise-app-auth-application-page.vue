<!--
@module app:views/features/application/enterprise-app-auth-application/ui/enterprise-app-auth-application-page
职责：申请列表：其他企业对本企业发布应用的待审批申请（C06D 场景常驻范围：PENDING、来源为本企业、REQUEST），逐条审核。
边界：企业、应用名称经同场景选项视图查值显示；审核入口只依据本行 auth_status 写权限与 PENDING 状态，审批由审核弹窗按记录提交。
-->
<template>
  <RendererSection class="app-auth-review" title="申请列表" :bordered="false" :grid-columns="1">
    <template #header-actions>
      <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" />
    </template>
    <p v-if="loading" role="status">正在读取申请列表…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <p v-if="openError" role="alert">{{ openError }}</p>
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :actions="actions"
      :auto-columns="false" :stripe="true" :show-row-index="true" :highlight-current-row="true"
      :show-data-view-meta="false" :pagination="{pageSizes: [20], showJumper: true}" />
    <EnterpriseAppAuthApplicationAuditDialog v-if="auditId !== undefined" :record-id="auditId" @close="closeAudit" @decided="closeAudit" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererSection, RendererTable} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {APP_AUTH_SCENARIOS, formatRequestedAt, readAppAuthSession} from '../model/enterprise-app-auth-application-model'
import EnterpriseAppAuthApplicationAuditDialog from './enterprise-app-auth-application-audit-dialog.vue'

const scenarioId = APP_AUTH_SCENARIOS.review
const modelName = 'enterprise_app_auth'
const byShortNameKey = buildDataViewKey('Base_Enterprise_Info', 'byShortName', scenarioId)
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName, componentType: 'enterprise-app-auth-application-page', title: '申请列表',
  optionModels: ['Base_Enterprise_Info', 'Base_AppSystemList', 'app_auth_status'], optionViews: [byShortNameKey],
  queryContext: () => ({entShortName: readAppAuthSession().entShortName}),
})
const auditId = ref<string | number>(), openError = ref('')
const lookup = {readonly: true, showOverflowTooltip: true, unmatchedText: '-'}
const fields: SparkNode[] = [
  {type: 'r-select', props: {...lookup, sortable: false, field: 'enterprise_id', label: '申请企业', width: 200, cellTitleField: 'ent_shortname',
    optionDataViewKey: buildDataViewKey('Base_Enterprise_Info', 'default', scenarioId), optionValueField: 'rowid', optionLabelField: 'CName'}},
  {type: 'r-select', props: {...lookup, sortable: false, field: 'app_id', label: '申请应用', minWidth: 200, cellTitleField: 'app_id',
    optionDataViewKey: buildDataViewKey('Base_AppSystemList', 'default', scenarioId), optionValueField: 'rowid', optionLabelField: 'displayName'}},
  {type: 'r-select', props: {...lookup, field: 'source_ent', label: '来源企业', width: 180, cellTitleField: 'source_ent',
    optionDataViewKey: byShortNameKey, optionValueField: 'ShortName', optionLabelField: 'CName'}},
  {type: 'r-text', props: {field: 'requested_at', label: '申请时间', readonly: true, width: 160, valueAlign: 'center',
    emptyText: '-', displayFormatter: formatRequestedAt}},
  {type: 'r-select', props: {field: 'auth_status', label: '状态', readonly: true, width: 110, valueAlign: 'center',
    optionDataViewKey: buildDataViewKey('app_auth_status', 'default', scenarioId), optionValueField: 'val', optionLabelField: 'txt',
    valueTagTypes: {PENDING: 'warning'}}},
  {type: 'r-text', props: {field: 'review_comment', label: '申请说明', readonly: true, minWidth: 200, showOverflowTooltip: true}},
]
const listView = computed(() => ready.value ? session.runtime?.getDataSet(scenarioId)?.getView(modelName, 'default') : undefined)
const canAudit = ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) => {
  if (!row || !dataSource || dataSource.fieldAccess(row, 'auth_status').write !== 'allowed') return false
  return dataSource.fieldAccess(row, 'auth_status').read === 'visible' && row['auth_status'] === 'PENDING'
}
const actions = {wrap: false, gap: 4, children: [
  {type: 'r-button', props: {dataViewKey: viewKey, label: '审核', link: true, buttonType: 'primary', icon: 'Select', onBeforeRender: canAudit,
    onClick: openAudit}},
]}

function openAudit(row: DataRow): void {
  openError.value = ''
  const id = listView.value?.getPkKey(row)
  if (id === undefined || id === '') {openError.value = '缺少申请记录'; return}
  auditId.value = id
}
function closeAudit(): void {
  auditId.value = undefined
  void listView.value?.refresh()
}
</script>

<style scoped>
.app-auth-review {padding: 24px}
</style>
