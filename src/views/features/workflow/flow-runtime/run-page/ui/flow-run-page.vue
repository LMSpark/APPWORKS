<!--
@module app:views/features/workflow/flow-runtime/run-page/ui/flow-run-page
职责：流程办理桌面页占位，承接 wfid/flowid 路由参数。
-->
<template>
  <RendererSection class="flow-run-page" title="流程办理" :bordered="false" :grid-columns="1"
    :status="loading ? '正在打开流程办理页…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <DisplayAlert alert-type="info" :closable="false" :show-icon="true" :title="summary" />
    <DisplayAlert alert-type="warning" :closable="false" :show-icon="true" title="提交、退回、加签等运行操作待 FlowRunPage 合同接回。" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {DisplayAlert, RendererSection} from '@spark-appworks/spark-component'
import {readFlowRuntimeRouteQuery} from '@/lowcode/resources/system/workflow/manage'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const scenarioId = 'E328FBBF518141973C575D612CD75151'
const route = useRoute()
const query = computed(() => readFlowRuntimeRouteQuery(route.query))
const summary = computed(() => `实例 ${query.value.wfid} · 模型 ${query.value.flowid}`)
const {ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'View_FlowObjList', componentType: 'flow-run-page', title: '流程办理',
  queryContext: () => ({rowid: query.value.wfid}),
})
</script>