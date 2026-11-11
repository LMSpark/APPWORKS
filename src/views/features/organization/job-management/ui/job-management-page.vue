<!--
@module app:views/features/organization/job-management/ui/job-management-page
职责：展示当前租户岗位目录并提供查询、重置、刷新和分页。
边界：岗位及机构选项均读取正式 DataView，不提供岗位编辑或跨租户切换。
AI用途：恢复岗位目录时，核对正式导航身份与机构选项绑定。
-->
<template>
  <section class="job-page">
    <header class="job-page__header">
      <h1>岗位管理</h1>
      <div class="job-page__actions">
        <span class="job-page__tenant">当前租户</span>
        <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" />
      </div>
    </header>
    <p class="job-page__scope">本页只读取当前登录租户的正式组织投影，不提供跨租户切换。</p>
    <p v-if="loading" role="status">正在读取岗位…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <p v-if="optionsLoading" role="status">正在读取机构选项…</p>
    <p v-if="optionsError" role="alert">{{ optionsError }}</p>
    <RendererButton v-if="optionsError && !optionsLoading" label="重试机构选项" @click="loadDepartmentOptions" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 20, 50, 100], showJumper: false}" />
  </section>
</template>

<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from 'vue'
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererTable, type RFilterProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const scenarioId = '0A835EB88AAC2BDFBDE344477C6827BB'
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_JobInfo', componentType: 'job-management-page', title: '岗位管理',
})
const departmentViewKey = buildDataViewKey('Base_DepartInfo', 'default', scenarioId)
const optionsLoading = ref(false), optionsError = ref('')
const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'JobName', label: '岗位名称', readonly: true, minWidth: 220, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'JobCode', label: '岗位编码', readonly: true, minWidth: 160, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'DepName', label: '所属机构', readonly: true, minWidth: 220, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'Depid', label: '机构 ID', readonly: true, minWidth: 180, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'DepLevel', label: '职级', readonly: true, minWidth: 140, sortable: false, showOverflowTooltip: true}},
]
const filter: RFilterProps = {
  autoQuery: false,
  queryOnReset: true,
  firstPageOnSearch: true,
  showExpressionEditor: false,
  showDataViewMeta: false,
  children: [
    {type: 'r-text', props: {field: 'JobName', label: '岗位名称', placeholder: '请输入岗位名称', filterTrim: true}},
    {type: 'r-select', props: {field: 'Depid', label: '所属机构', placeholder: '请选择所属机构',
      filterable: true, clearable: true, optionDataViewKey: departmentViewKey,
      optionLabelField: 'DepName', optionLabelFields: ['DepName', 'DepID'], optionValueField: 'DepID', optionValueTrim: true}},
  ],
}
let optionsGeneration = 0

async function loadDepartmentOptions(): Promise<void> {
  const current = session.runtime
  if (!ready.value || !current || optionsLoading.value) return
  const own = ++optionsGeneration
  optionsLoading.value = true; optionsError.value = ''
  try {
    const view = current.getDataSet(scenarioId)?.getView('Base_DepartInfo', 'default')
    if (!view) throw new Error('岗位管理缺少正式机构选项视图')
    await view.refresh()
    if (view.loadingError) throw view.loadingError
  } catch (cause) {
    if (own === optionsGeneration && session.isCurrent(current)) {
      optionsError.value = `机构选项读取失败：${cause instanceof Error ? cause.message : String(cause)}`
    }
  } finally {
    if (own === optionsGeneration && session.isCurrent(current)) optionsLoading.value = false
  }
}

watch(ready, value => {
  optionsGeneration++
  optionsLoading.value = false; optionsError.value = ''
  if (value) void loadDepartmentOptions()
}, {flush: 'sync'})
onBeforeUnmount(() => {optionsGeneration++})
</script>

<style scoped>
.job-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.job-page__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.job-page__header h1 {margin: 0; font-size: 20px}
.job-page__actions {display: flex; align-items: center; gap: 12px}
.job-page__tenant {padding: 4px 8px; border-radius: 4px; background: var(--el-fill-color-light); color: var(--el-text-color-regular)}
.job-page__scope {margin: 0; padding: 10px 12px; border-radius: 4px; background: var(--el-color-info-light-9); color: var(--el-text-color-regular)}
</style>
