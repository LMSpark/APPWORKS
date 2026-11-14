<!--
@module app:views/features/organization/user-management/ui/user-management-page
职责：展示当前租户人员任职目录并提供姓名、机构查询、重置、刷新和分页。
边界：人员及机构选项均读取机构空间正式 DataView，选项与主视图同批装配；不提供人员编辑或跨租户切换。
AI用途：恢复人员目录时，核对导航身份与所消费机构空间的绑定。
-->
<template>
  <RendererSection class="user-page" title="人员管理" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在读取人员…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
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

const navigationId = '1B7FD70E326717B8E4B611D0431FFCBA'
const scenarioId = '4138A7C47ECB96EA85CA61A8A8B7191F'
const departmentViewKey = buildDataViewKey('Base_DepartInfo', 'options', scenarioId)
const {viewKey, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  navigationId, scenarioId, modelName: 'View_UserDJAndDepCSR', componentType: 'user-management-page', title: '人员管理',
  optionViews: [departmentViewKey],
})
const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'UserName', label: '人员姓名', readonly: true, minWidth: 180, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'UserID', label: '人员 ID', readonly: true, minWidth: 200, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'DepName', label: '所属机构', readonly: true, minWidth: 220, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'JobName', label: '岗位', readonly: true, minWidth: 180, showOverflowTooltip: true}},
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
</script>

<style scoped>
.user-page {padding: 8px}
</style>
