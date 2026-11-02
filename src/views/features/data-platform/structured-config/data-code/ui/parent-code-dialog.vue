<!-- @module app:views/features/data-platform/structured-config/data-code/ui/parent-code-dialog -->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="父级编码段" :width="560" :close-disabled="state.closing.value"
    @update:model-value="state.cancel">
    <p v-if="state.loading.value" role="status">正在读取父编码与业务字段…</p>
    <p v-if="state.error.value" role="alert">{{ state.error.value }}</p>
    <RendererForm v-if="state.ready.value" :data-view-key="dataViewKey" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="ParameterName" label="参数名称" :on-change="state.guardWrite" />
      <FieldJson field="CodeNodeDesignJson" label="父编码规则" mode="form" :schema="schema" :on-change="state.guardWrite"
        :on-editing-change="value => state.pendingInput.value = value" />
    </RendererForm>
    <template #footer>
      <RendererButton label="取消" :disabled="state.closing.value" @click="state.cancel" />
      <RendererButton label="保存" :disabled="state.confirmDisabled.value" @click="state.confirm" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {FieldJson, FieldText, RendererDialog, RendererForm, RendererButton} from '@spark-appworks/spark-component'
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {useCodeNodeRuleDialog} from './dialogs/use-code-node-rule-dialog'
const props = defineProps<{dataViewKey: string; nodeId: string | number; busTableRowid: string}>()
const emit = defineEmits<{close: []}>()
const state = useCodeNodeRuleDialog(props, 'parent', () => emit('close'))
const schema: JsonSchemaObject = {type: 'object', required: ['RefCodeId', 'parentCodeBizField'], properties: {
  RefCodeId: {type: 'string', title: '父编码串', 'x-optionDataViewKey': state.parentOptionsKey},
  parentCodeBizField: {type: 'string', title: '父编码业务表关联字段', 'x-optionDataViewKey': state.fieldOptionsKey},
}}
</script>
