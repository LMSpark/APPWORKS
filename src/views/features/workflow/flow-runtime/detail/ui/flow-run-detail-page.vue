<!--
@module app:views/features/workflow/flow-runtime/detail/ui/flow-run-detail-page
职责：按 wfid/flowid 展示流程运行详情与办理轨迹（图与步骤区待完整接回）。
边界：消费流程监控场景 View_FlowObjList 与正式 queryContext。
-->
<template>
  <RendererSection class="flow-run-detail-page" title="流程运行详情" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在读取运行详情…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <DisplayAlert v-if="ready" alert-type="info" :closable="false" :show-icon="true"
      :title="`实例 ${routeQuery.wfid} · 模型 ${routeQuery.flowid}`" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="columns" :stripe="true" :show-data-view-meta="false" />
    <DisplayAlert alert-type="warning" :closable="false" :show-icon="true"
      title="运行图、步骤钻取与退回操作仍待 FlowRunDetail 专用合同接回；当前仅验证导航身份与列表读回。" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {DisplayAlert, RendererSection, RendererTable} from '@spark-appworks/spark-component'
import {readFlowRuntimeRouteQuery} from '@/lowcode/resources/system/workflow/manage'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const scenarioId = 'E328FBBF518141973C575D612CD75151'
const route = useRoute()
const routeQuery = computed(() => readFlowRuntimeRouteQuery(route.query))
const {viewKey, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,
  modelName: 'View_FlowObjList',
  componentType: 'flow-run-detail-page',
  title: '流程运行详情',
  optionModels: ['Dict_state'],
  queryContext: () => ({rowid: routeQuery.value.wfid, WFMID: routeQuery.value.flowid}),
})
const stateKey = buildDataViewKey('Dict_state', 'default', scenarioId)
const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'TITLE', label: '流程标题', readonly: true, minWidth: 220}},
  {type: 'r-text', props: {field: 'AppDesc', label: '应用名称', readonly: true, minWidth: 160}},
  {type: 'r-select', props: {field: 'status', label: '状态', readonly: true, minWidth: 120, optionDataViewKey: stateKey}},
  {type: 'r-text', props: {field: 'handleInfo', label: '办理信息', readonly: true, minWidth: 200}},
]
</script>

<style scoped>
.flow-run-detail-page {padding: 8px}
</style>