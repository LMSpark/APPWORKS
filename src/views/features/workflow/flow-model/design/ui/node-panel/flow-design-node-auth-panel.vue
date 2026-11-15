<!--
@module app:views/features/workflow/flow-model/design/ui/node-panel/flow-design-node-auth-panel
职责：选中节点的 FunctionNodeAuth 授权行，绑定设计场景 nodeAuth 视图。
-->
<template>
  <RendererSection title="节点功能权限" :bordered="true" :grid-columns="1">
    <DisplayAlert v-if="!selectedNodeId" alert-type="info" :closable="false" :show-icon="true"
      title="请先在画布或节点表选中一个节点，再维护 FunctionNodeAuth 授权。" />
    <RendererTable v-else-if="viewKey" :data-view-key="viewKey" :children="columns" :stripe="true"
      :show-data-view-meta="false" :pagination="{pageSizes: [5, 10, 20], showJumper: true}" />
  </RendererSection>
</template>

<script setup lang="ts">
import type {SparkNode} from '@spark-appworks/spark-data'
import {DisplayAlert, RendererSection, RendererTable} from '@spark-appworks/spark-component'

defineProps<{viewKey: string; selectedNodeId: string}>()

const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'functionoption', label: '功能标签', minWidth: 160}},
  {type: 'r-text', props: {field: 'QID', label: '主体', minWidth: 120}},
  {type: 'r-text', props: {field: 'granttype', label: '授权类型', minWidth: 100}},
  {type: 'r-text', props: {field: 'masterId', label: '组织', minWidth: 120}},
  {type: 'r-text', props: {field: 'mastervaluefield', label: '组织字段', minWidth: 120}},
  {type: 'r-text', props: {field: 'status', label: '状态', minWidth: 80}},
  {type: 'r-text', props: {field: 'businessId', label: '业务标识', minWidth: 120, showOverflowTooltip: true}},
]
</script>