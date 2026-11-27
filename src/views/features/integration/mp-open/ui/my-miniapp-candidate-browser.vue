<!--
@module app:views/features/integration/mp-open/ui/my-miniapp-candidate-browser
职责：浏览当前应用和个人授权范围内的可安装模板及可用业务应用候选。
边界：本页正式模型的命名视图负责服务端过滤和分页，当前页实例释放时撤下候选读取。
AI用途：复用正式候选视图和分页呈现，供浏览及后续正式操作选择。
-->
<template>
  <RendererTabs v-model="selected">
    <RendererTabPane :index="0" name="installableWechat" label="微信模板" />
    <RendererTabPane :index="1" name="installableDouyin" label="抖音模板" />
    <RendererTabPane :index="2" name="businessApplications" label="业务应用" />
  </RendererTabs>
  <p v-if="loading" role="status">正在读取候选…</p>
  <p v-if="error" role="alert">{{ error }}</p>
  <RendererButton v-if="error && !loading" label="重试" @click="loadCurrentRoute" />
  <RendererTable v-if="ready" :key="viewKey" :data-view-key="viewKey" :children="columns" :auto-columns="false"
    :pagination="{pageSizes: [10], showJumper: false}" />
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {RendererButton, RendererTabPane, RendererTable, RendererTabs} from '@spark-appworks/spark-component'
import type {SparkNode} from '@spark-appworks/spark-data'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const scenarioId='547CB8AD9613D81428C2280A8FC22819'
const selected=ref('installableWechat')
const isApplication=computed(()=>selected.value==='businessApplications')
const modelName=computed(()=>isApplication.value?'Base_AppSystemList':'base_channel_miniapp_template')
const templateColumns:SparkNode[]=[
  {type:'r-text',props:{field:'display_name',label:'模板名称',readonly:true}},
  {type:'r-text',props:{field:'provider',label:'渠道',readonly:true}},
]
const applicationColumns:SparkNode[]=[
  {type:'r-text',props:{field:'AppName',label:'应用名称',readonly:true}},
]
const columns=computed(()=>isApplication.value?applicationColumns:templateColumns)
const {viewKey,loading,ready,error,loadCurrentRoute}=useFeaturePageRuntime({
  scenarioId,navigationId:scenarioId,modelName,viewId:selected,
  workingPlanRoute:'/features/integration/mp-open/ui/my-miniapp-page',
  componentType:'my-miniapp-candidate-browser',title:'小程序候选',
})
</script>
