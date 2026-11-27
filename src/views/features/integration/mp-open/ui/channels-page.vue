<!--
@module app:views/features/integration/mp-open/ui/channels-page
职责：展示视频号已授权账号与运营号，各自呈现本次正式读取、空结果及失败。
边界：专用账号走独立的服务授权 DataView，运营号走正式模型，两个区域消费同一授权 PageRuntime。
AI用途：恢复视频号渠道只读入口，保持列表许可和后续挂载动作的合同相互独立。
-->
<template>
  <RendererSection title="视频号渠道" :grid-columns="1" :bordered="false">
    <p v-if="loading" role="status">正在读取视频号渠道…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading" label="重试" @click="loadCurrentRoute" />
    <template v-if="ready">
      <section aria-label="视频号账号">
        <h2>视频号账号</h2>
        <template v-if="accountState.requestState.value === RequestState.Failed">
          <p role="alert">{{ accountState.loadingError.value?.message || '视频号账号读取失败' }}</p>
          <RendererButton label="重试读取视频号账号" @click="reloadAccounts" />
        </template>
        <p v-else-if="accountState.requestState.value !== RequestState.Loaded" role="status">正在读取视频号账号…</p>
        <RendererTable v-else :data-view-key="accountsKey" :children="accountColumns" :auto-columns="false" :show-pagination="false" :show-data-view-meta="false" />
      </section>
      <section aria-label="运营号">
        <h2>运营号</h2>
        <p v-if="operatorEmpty" role="status">没有符合条件的运营号</p>
        <RendererTable :data-view-key="viewKey" :children="operatorColumns" :filter="operatorFilter" :auto-columns="false" />
      </section>
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {RendererButton, RendererSection, RendererTable, useDataViewState, type RFilterProps} from '@spark-appworks/spark-component'
import {buildDataViewKey, RequestState, type SparkNode} from '@spark-appworks/spark-data'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const scenarioId = '0BBCD14A992018D72F7D0131BBEE6700'
const accountsKey = buildDataViewKey('WechatChannelsAccounts','default',scenarioId)
const {viewKey, session, loading, ready, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, navigationId: scenarioId, modelName:'base_channel_operator_account', viewId:'operators',
  workingPlanRoute:'/features/integration/mp-open/ui/channels-page',
  componentType:'mp-channels', title:'视频号渠道', optionViews:[accountsKey], independentInitialReads:true,
})
const accountView = computed(() => ready.value ? session.runtime?.resolveView(accountsKey) ?? null : null)
const operatorView = computed(() => ready.value ? session.runtime?.resolveView(viewKey.value) ?? null : null)
const accountState = useDataViewState(accountView)
const operatorState = useDataViewState(operatorView)
const operatorEmpty = computed(() => operatorState.requestState.value === RequestState.Loaded
  && operatorState.countReported.value === true && operatorState.total.value === 0)
async function reloadAccounts(): Promise<void> {await accountView.value?.requestRefresh()}
const accountColumns: SparkNode[] = [
  {type:'r-text',props:{field:'nickName',label:'视频号',readonly:true}},
  {type:'r-text',props:{field:'authorizerAppId',label:'AppId',readonly:true}},
  {type:'r-text',props:{field:'authorizationStatus',label:'授权状态',readonly:true}},
  {type:'r-text',props:{field:'userName',label:'微信号',readonly:true}},
  {type:'r-checkbox',props:{field:'enabled',label:'启用',readonly:true}},
]
const operatorColumns: SparkNode[] = [
  {type:'r-text',props:{field:'operator_uid',label:'运营号 UID',readonly:true}},
  {type:'r-text',props:{field:'display_name',label:'展示名',readonly:true}},
  {type:'r-text',props:{field:'bind_mode',label:'绑定模式',readonly:true}},
  {type:'r-text',props:{field:'status',label:'状态',readonly:true}},
  {type:'r-text',props:{field:'updated_at',label:'更新时间',readonly:true}},
]
const operatorFilter: RFilterProps = {
  autoQuery:false,queryOnReset:true,firstPageOnSearch:true,showExpressionEditor:false,showDataViewMeta:false,
  children:[
    {type:'r-text',props:{field:'display_name',label:'展示名',filterOp:'contains',filterTrim:true}},
    {type:'r-text',props:{field:'bind_mode',label:'绑定模式',filterOp:'eq',filterTrim:true}},
    {type:'r-text',props:{field:'status',label:'状态',filterOp:'eq',filterTrim:true}},
  ],
}
</script>
