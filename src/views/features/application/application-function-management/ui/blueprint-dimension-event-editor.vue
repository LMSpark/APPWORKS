<!--
@module app:views/features/application/application-function-management/ui/blueprint-dimension-event-editor
职责：“数据模型事件维护”子对话框：编辑已保存数据模型来源绑定对应的唯一事件合同。
边界：表单绑定 88A4 Bil_Dimension_Rule_Template.editByEvent，业务分类与字段候选经 optionDataViewKey 提供；校验、保存与回读由宿主流程状态承担。
AI用途：调整事件维护布局时修改本组件，不在此另建查询或保存链。
-->
<template>
  <RendererDialog :model-value="true" title="数据模型事件维护" width="760px" :append-to-body="true" :close-disabled="busy"
    @update:model-value="closeEvent">
    <DisplayAlert v-if="eventUnknown" title="保存结果尚未核验" description="请重试“保存事件”核验原提交，确认记录是否已存在后再继续。"
      alert-type="warning" :show-icon="true" :closable="false" />
    <DisplayAlert v-if="eventError" title="事件维护失败" :description="eventError" alert-type="error" :show-icon="true" :closable="false" />
    <DisplayAlert v-if="busy && eventId === undefined" description="正在读取正式数据模型事件…" alert-type="info" :closable="false" />
    <FeatureRecordFields v-if="eventId !== undefined" :data-view-key="eventViewKey" :record-id="eventId" :specs="eventSpecs"
      :locked="busy || eventUnknown" :columns="2" />
    <template #footer>
      <RendererButton label="关闭" :disabled="busy" @click="closeEvent()" />
      <RendererButton label="保存事件" button-type="primary" :disabled="busy || eventId === undefined" :loading="busy" @click="saveEvent" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {DisplayAlert, RendererButton, RendererDialog} from '@spark-appworks/spark-component'
import FeatureRecordFields from '@/views/features/shared/record/feature-record-fields.vue'
import type {useApplicationFunctionDimensionSource} from './use-application-function-dimension-source'

const props = defineProps<{source: ReturnType<typeof useApplicationFunctionDimensionSource>}>()
const {busy, eventError, eventViewKey, eventId, eventUnknown, eventSpecs, saveEvent, closeEvent} = props.source
</script>
