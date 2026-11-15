<!--
@module app:views/features/workflow/flow-model/design/ui/form-panel/flow-design-form-panel
职责：流程设计关联表单列表，绑定 WFM_WORKFORM 正式视图。
-->
<template>
  <RendererSection title="关联表单" :bordered="true" :grid-columns="1">
    <RendererTable v-if="viewKey" :data-view-key="viewKey" :children="columns" :stripe="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 20, 50], showJumper: true}" />
  </RendererSection>
</template>

<script setup lang="ts">
import type {SparkNode} from '@spark-appworks/spark-data'
import {RendererSection, RendererTable} from '@spark-appworks/spark-component'

defineProps<{viewKey: string}>()

const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'FormName', label: '表单名称', minWidth: 160}},
  {type: 'r-text', props: {field: 'FORMID', label: '表单 ID', minWidth: 140}},
  {type: 'r-text', props: {field: 'URL', label: 'URL', minWidth: 200, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'BusTable', label: '业务表', minWidth: 120}},
  {type: 'r-text', props: {field: 'TitleField', label: '标题字段', minWidth: 120}},
]
</script>