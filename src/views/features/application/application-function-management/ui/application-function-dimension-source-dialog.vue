<!--
@module app:views/features/application/application-function-management/ui/application-function-dimension-source-dialog
职责：蓝图节点“维度来源设计”对话框：选择正式来源模型、编辑来源绑定与字段维度映射。
边界：全部字段与选择绑定 88A4 维度设计空间的 DataView；装载、校验、保存与回读由宿主传入的流程状态承担。
AI用途：调整维度来源设计布局时修改本组件，不在此另建查询或保存链。
-->
<template>
  <RendererDialog :model-value="true" title="维度来源设计" width="1080px" :append-to-body="true" :close-disabled="busy"
    @update:model-value="close">
    <DisplayAlert v-if="dialogError" :description="dialogError" alert-type="error" />
    <DisplayAlert v-if="unknown" description="上次保存结果未知，只能重试保存或关闭后重新核对，不能继续编辑。" alert-type="warning" />
    <DisplayAlert v-if="loading" description="正在读取维度设计空间与数据空间正式模型…" alert-type="info" />
    <template v-else>
      <h3>来源模型</h3>
      <DisplayAlert v-if="modelLabel" :description="`当前来源模型：${modelLabel}`" alert-type="info" />
      <RendererTable v-if="modelViewKey" :data-view-key="modelViewKey" :children="[...modelColumns]" :actions="modelActions"
        :show-data-view-meta="false" :show-pagination="false" />
      <template v-if="bindingId !== undefined">
        <h3>来源绑定</h3>
        <FeatureRecordFields :data-view-key="bindingViewKey" :record-id="bindingId" :specs="bindingSpecs" :locked="locked" :columns="2" />
        <h3>字段维度映射</h3>
        <RendererButton label="新增映射" :disabled="locked" @click="addMapping" />
        <RendererTable :data-view-key="mappingViewKey" :children="[...mappingColumns]" :actions="mappingActions"
          :show-data-view-meta="false" :show-pagination="false" />
      </template>
    </template>
    <template #footer>
      <RendererButton label="取消" :disabled="busy" @click="close()" />
      <RendererButton label="保存" button-type="primary" :disabled="loading || busy || bindingId === undefined" :loading="busy" @click="save" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {DisplayAlert, RendererButton, RendererDialog, RendererTable} from '@spark-appworks/spark-component'
import FeatureRecordFields from '@/views/features/shared/record/feature-record-fields.vue'
import type {useApplicationFunctionDimensionSource} from './use-application-function-dimension-source'

const props = defineProps<{source: ReturnType<typeof useApplicationFunctionDimensionSource>}>()
const {loading, busy, dialogError, unknown, locked, modelViewKey, bindingViewKey, mappingViewKey, bindingId, modelLabel,
  bindingSpecs, mappingColumns, modelColumns, modelActions, mappingActions, addMapping, save, close} = props.source
</script>
