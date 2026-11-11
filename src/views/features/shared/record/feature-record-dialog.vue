<!--
@module app:views/features/shared/record/feature-record-dialog
职责：按字段清单新增或编辑一条正式记录（维度中心、业务报表等功能页共用）。
边界：值写入宿主传入的原DataView并由公共记录编辑保存；页面专有校验由宿主validate给出，不另建草稿或提交通道。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" :title="title" :width="width"
    :append-to-body="true" :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <p v-if="error || hint" role="alert">{{ error || hint }}</p>
    <p v-if="!current" role="status">原记录已变化，请关闭并保留原修改。</p>
    <RendererForm :data-view-key="dataViewKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="columns">
      <template v-for="spec in visible" :key="spec.field">
        <FieldTextarea v-if="spec.kind === 'textarea'" :field="spec.field" :label="spec.label" :readonly="locked || !!spec.readonly" />
        <FieldSwitch v-else-if="spec.kind === 'switch'" :field="spec.field" :label="spec.label" :readonly="locked || !!spec.readonly" />
        <FieldNumber v-else-if="spec.kind === 'number'" :field="spec.field" :label="spec.label" :readonly="locked || !!spec.readonly" />
        <FieldSelect v-else-if="spec.kind === 'select'" :field="spec.field" :label="spec.label" v-bind="selectSource(spec)" :filterable="true" :clearable="!spec.required"
          :readonly="locked || !!spec.readonly" />
        <FieldRadio v-else-if="spec.kind === 'radio'" :field="spec.field" :label="spec.label" v-bind="selectSource(spec)" :readonly="locked || !!spec.readonly" />
        <FieldText v-else :field="spec.field" :label="spec.label" :readonly="locked || !!spec.readonly" />
      </template>
    </RendererForm>
    <template #footer>
      <RendererButton :label="foreignRecovery || recoveryEnded || hasStaged && !created ? '关闭并保留修改' : confirmedCreation ? '关闭' : '取消'"
        :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton :label="permissionsPending ? '回读已保存权限' : ownUnconfirmed ? '核验原保存结果' : '确定'" button-type="primary"
        :disabled="busy || foreignRecovery || !permissionsPending && (recoveryEnded || !current && !ownUnconfirmed)" @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import type {DataRow} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import type {FeatureFieldSpec} from './feature-field-spec'
const {PAGE_RUNTIME, RendererDialog, RendererForm, RendererButton, FieldText, FieldTextarea, FieldNumber, FieldSelect, FieldRadio, FieldSwitch,
  useSparkComponent, useDataViewRecordEditing} = Components
const props = withDefaults(defineProps<{dataViewKey: string; recordId: string | number; title: string; specs: readonly FeatureFieldSpec[]
  created?: boolean; width?: number; columns?: number; validate?: ((row: Readonly<DataRow>) => string | undefined) | undefined}>(),
{created: false, width: 660, columns: 1})
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'feature-record-dialog'})
const {row, busy, current, locked, error, ownUnconfirmed, foreignRecovery, recoveryEnded, hasStaged, permissionsPending,
  confirmedCreation, save, cancel} = useDataViewRecordEditing({mode: 'edit', runtime: () => sparkConsume(PAGE_RUNTIME),
  dataViewKey: () => props.dataViewKey, recordId: () => props.recordId, created: () => props.created,
  editableFields: props.specs.map(spec => spec.field), onFinish: () => emit('close')})
const hint = ref('')
const visible = computed(() => props.specs.filter(spec => !spec.when || (row.value !== undefined && spec.when(row.value))))

async function submit(): Promise<void> {
  hint.value = ''
  if (!ownUnconfirmed.value && !permissionsPending.value && row.value) {
    const missing = visible.value.find(spec => spec.required && isBlank(row.value?.[spec.field]))
    if (missing) { hint.value = `请填写${missing.label}`; return }
    const invalid = props.validate?.(row.value)
    if (invalid) { hint.value = invalid; return }
  }
  await save()
}
function selectSource(spec: FeatureFieldSpec): Record<string, unknown> {
  if (!spec.optionKey) return {options: [...(spec.options ?? [])]}
  return spec.labelFields ? {optionDataViewKey: spec.optionKey, optionLabelFields: spec.labelFields} : {optionDataViewKey: spec.optionKey}
}
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}
</script>
