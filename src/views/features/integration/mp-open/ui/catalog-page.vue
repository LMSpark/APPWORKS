<!--
@module app:views/features/integration/mp-open/ui/catalog-page
职责：按微信、抖音渠道展示当前授权的小程序模板目录，以正式记录键稳定分页。
边界：当前 PageRuntime 装配正式工作 Plan，标准表格消费当前目录视图及字段读取权限。安装候选使用独立命名视图和服务端过滤条件。
AI用途：恢复模板目录原生入口时使用当前导航授权和目录视图。选页和渠道切换由现有宿主掌管。
-->
<template>
  <RendererSection title="小程序模板目录" :grid-columns="1" :bordered="false">
    <RendererTabs v-model="selectedView">
      <RendererTabPane :index="0" name="catalogWechat" label="微信" />
      <RendererTabPane :index="1" name="catalogDouyin" label="抖音" />
    </RendererTabs>
    <p v-if="loading" role="status">正在读取模板目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading" label="重试" @click="loadCurrentRoute" />
    <RendererTable v-if="ready" :key="viewKey" :data-view-key="viewKey" :children="columns" :auto-columns="false"
      :pagination="{pageSizes: [10], showJumper: false}" />
  </RendererSection>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {RendererButton, RendererSection, RendererTabPane, RendererTable, RendererTabs} from '@spark-appworks/spark-component'
import type {SparkNode} from '@spark-appworks/spark-data'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const scenarioId = '3F1AB1BEE8CDF6A4DE28F44A933CDCF5'
const selectedView = ref('catalogWechat')
const {viewKey, loading, ready, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, navigationId: scenarioId, modelName: 'base_channel_miniapp_template', viewId: selectedView,
  workingPlanRoute: '/features/integration/mp-open/ui/catalog-page',
  componentType: 'mp-template-catalog', title: '小程序模板目录',
})

const columns: SparkNode[] = [
  {type:'r-text', props:{field:'display_name',label:'模板名称',readonly:true}},
  {type:'r-text', props:{field:'provider',label:'渠道',readonly:true}},
  {type:'r-checkbox', props:{field:'catalog_visible',label:'上架',readonly:true}},
  {type:'r-checkbox', props:{field:'active',label:'启用',readonly:true}},
]
</script>
