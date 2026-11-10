<!--
@module app:views/features/organization/organization-structure/ui/organization-structure-page
职责：展示当前租户机构目录并提供查询、重置、刷新和分页。
边界：只读取正式机构 DataView，不提供机构编辑或跨租户切换。
AI用途：恢复组织机构目录时，核对正式导航身份及只读数据绑定。
-->
<template>
  <section class="organization-page">
    <header class="organization-page__header">
      <h1>机构管理</h1>
      <div class="organization-page__actions">
        <span class="organization-page__tenant">当前租户</span>
        <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" />
      </div>
    </header>
    <p class="organization-page__scope">本页只读取当前登录租户的正式组织投影，不提供跨租户切换。</p>
    <p v-if="loading" role="status">正在读取机构…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 20, 50, 100], showJumper: false}" />
  </section>
</template>

<script setup lang="ts">
import type {SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererTable, type RFilterProps} from '@spark-appworks/spark-component'
import {useTenantGovernanceRuntime} from '../../tenant-governance/runtime/use-tenant-governance-runtime'

const scenarioId = '4138A7C47ECB96EA85CA61A8A8B7191F'
const {viewKey, ready, loading, error, loadCurrentRoute} = useTenantGovernanceRuntime({
  scenarioId, modelName: 'Base_DepartInfo', componentType: 'organization-structure-page', title: '机构管理',
})
const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'DepName', label: '机构名称', readonly: true, minWidth: 220, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'DepID', label: '机构 ID', readonly: true, minWidth: 180, sortable: false, showOverflowTooltip: true, emptyText: '未提供'}},
  {type: 'r-text', props: {field: 'Prowid', label: '上级机构 ID', readonly: true, minWidth: 180, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'DepLevel', label: '机构层级', readonly: true, minWidth: 140, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'CSR', label: '层级路径', readonly: true, minWidth: 260, sortable: false, showOverflowTooltip: true}},
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
.organization-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.organization-page__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.organization-page__header h1 {margin: 0; font-size: 20px}
.organization-page__actions {display: flex; align-items: center; gap: 12px}
.organization-page__tenant {padding: 4px 8px; border-radius: 4px; background: var(--el-fill-color-light); color: var(--el-text-color-regular)}
.organization-page__scope {margin: 0; padding: 10px 12px; border-radius: 4px; background: var(--el-color-info-light-9); color: var(--el-text-color-regular)}
</style>
