<!--
@module app:views/features/organization/user-management/ui/user-management-page
职责：展示当前租户人员任职目录并提供姓名、机构查询、重置、刷新和分页。
边界：人员及机构选项均读取机构空间正式 DataView，不提供人员编辑或跨租户切换。
AI用途：恢复人员目录时，核对导航身份与所消费机构空间的绑定。
-->
<template>
  <section class="user-page">
    <header class="user-page__header">
      <h1>人员管理</h1>
      <div class="user-page__actions">
        <span class="user-page__tenant">当前租户</span>
        <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" />
      </div>
    </header>
    <p class="user-page__scope">本页只读取当前登录租户的正式组织投影，不提供跨租户切换。</p>
    <p v-if="loading" role="status">正在读取人员…</p>
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

const navigationId = '1B7FD70E326717B8E4B611D0431FFCBA'
const scenarioId = '4138A7C47ECB96EA85CA61A8A8B7191F'
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  navigationId, scenarioId, modelName: 'View_UserDJAndDepCSR', componentType: 'user-management-page', title: '人员管理',
})
const departmentViewKey = buildDataViewKey('Base_DepartInfo', 'options', scenarioId)
const optionsLoading = ref(false), optionsError = ref('')
const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'UserName', label: '人员姓名', readonly: true, minWidth: 180, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'UserID', label: '人员 ID', readonly: true, minWidth: 200, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'DepName', label: '所属机构', readonly: true, minWidth: 220, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'JobName', label: '岗位', readonly: true, minWidth: 180, sortable: false, showOverflowTooltip: true}},
]
const filter: RFilterProps = {
  autoQuery: false,
  queryOnReset: true,
  firstPageOnSearch: true,
  showExpressionEditor: false,
  showDataViewMeta: false,
  children: [
    {type: 'r-text', props: {field: 'UserName', label: '人员姓名', placeholder: '请输入人员姓名', filterTrim: true}},
    {type: 'r-select', props: {field: 'DepID', label: '所属机构', placeholder: '请选择所属机构',
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
    const view = current.getDataSet(scenarioId)?.getView('Base_DepartInfo', 'options')
    if (!view) throw new Error('人员管理缺少正式机构选项视图')
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
.user-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.user-page__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.user-page__header h1 {margin: 0; font-size: 20px}
.user-page__actions {display: flex; align-items: center; gap: 12px}
.user-page__tenant {padding: 4px 8px; border-radius: 4px; background: var(--el-fill-color-light); color: var(--el-text-color-regular)}
.user-page__scope {margin: 0; padding: 10px 12px; border-radius: 4px; background: var(--el-color-info-light-9); color: var(--el-text-color-regular)}
</style>
