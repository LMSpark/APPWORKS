<!--
@module app:views/features/organization/job-management/ui/job-management-page
职责：展示当前租户岗位目录并提供查询、重置、刷新和分页。
边界：岗位及机构选项均读取正式 DataView，选项与主视图同批装配；不提供岗位编辑或跨租户切换。
AI用途：恢复岗位目录时，核对正式导航身份与机构选项绑定。
-->
<template>
  <RendererSection class="job-page" title="岗位管理" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在读取岗位…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <template #header-actions>
      <DisplayTag content="当前租户" tag-type="info" />
      <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" />
    </template>
    <DisplayAlert alert-type="info" :closable="false" :show-icon="true" title="本页只读取当前登录租户的正式组织投影，不提供跨租户切换。" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 20, 50, 100], showJumper: false}" />
  </RendererSection>
</template>

<script setup lang="ts">
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {DisplayAlert, DisplayTag, RendererButton, RendererSection, RendererTable, type RFilterProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const scenarioId = '0A835EB88AAC2BDFBDE344477C6827BB'
const {viewKey, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_JobInfo', componentType: 'job-management-page', title: '岗位管理',
  optionModels: ['Base_DepartInfo'],
})
const departmentViewKey = buildDataViewKey('Base_DepartInfo', 'default', scenarioId)
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
</script>

<style scoped>
.job-page {padding: 8px}
</style>
