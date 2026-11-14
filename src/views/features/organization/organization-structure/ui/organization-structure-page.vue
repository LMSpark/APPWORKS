<!--
@module app:views/features/organization/organization-structure/ui/organization-structure-page
职责：展示当前租户机构目录并提供查询、重置、刷新和分页。
边界：只读取正式机构 DataView，不提供机构编辑或跨租户切换。
AI用途：恢复组织机构目录时，核对正式导航身份及只读数据绑定。
-->
<template>
  <RendererSection class="organization-page" title="机构管理" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在读取机构…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
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
import type {SparkNode} from '@spark-appworks/spark-data'
import {DisplayAlert, DisplayTag, RendererButton, RendererSection, RendererTable, type RFilterProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const scenarioId = '4138A7C47ECB96EA85CA61A8A8B7191F'
const {viewKey, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_DepartInfo', componentType: 'organization-structure-page', title: '机构管理',
})
const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'DepName', label: '机构名称', readonly: true, minWidth: 220, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'DepID', label: '机构 ID', readonly: true, minWidth: 180, showOverflowTooltip: true, emptyText: '未提供'}},
  {type: 'r-text', props: {field: 'Prowid', label: '上级机构 ID', readonly: true, minWidth: 180, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'DepLevel', label: '机构层级', readonly: true, minWidth: 140, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'CSR', label: '层级路径', readonly: true, minWidth: 260, showOverflowTooltip: true}},
]
const filter: RFilterProps = {
  autoQuery: false,
  queryOnReset: true,
  firstPageOnSearch: true,
  showExpressionEditor: false,
  showDataViewMeta: false,
  children: [{type: 'r-text', props: {field: 'DepName', label: '机构名称', placeholder: '请输入机构名称', filterTrim: true}}],
}
</script>

<style scoped>
.organization-page {padding: 8px}
</style>
