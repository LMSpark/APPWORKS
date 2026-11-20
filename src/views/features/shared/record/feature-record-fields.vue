<template>
  <RendererForm :data-view-key="dataViewKey" :context-row-id="recordId" :auto-columns="false"
    :show-data-view-meta="false" :grid-columns="columns">
    <template v-for="spec in visible" :key="spec.field">
      <FieldTextarea v-if="spec.kind === 'textarea'" :field="spec.field" :label="spec.label" v-bind="placeholderOf(spec)" :readonly="fieldReadonly(spec)" />
      <FieldSwitch v-else-if="spec.kind === 'switch'" :field="spec.field" :label="spec.label" :readonly="fieldReadonly(spec)" />
      <FieldNumber v-else-if="spec.kind === 'number'" :field="spec.field" :label="spec.label" :readonly="fieldReadonly(spec)" />
      <FieldSelect v-else-if="spec.kind === 'select'" :field="spec.field" :label="spec.label" v-bind="selectSource(spec)"
        :filterable="true" :clearable="!fieldRequired(spec)" :readonly="fieldReadonly(spec)" />
      <FieldRadio v-else-if="spec.kind === 'radio'" :field="spec.field" :label="spec.label" v-bind="selectSource(spec)"
        :readonly="fieldReadonly(spec)" />
      <FieldText v-else :field="spec.field" :label="spec.label" v-bind="placeholderOf(spec)" :readonly="fieldReadonly(spec)" />
    </template>
  </RendererForm>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import type {DataRow} from '@spark-appworks/spark-data'
import {RendererForm, FieldText, FieldTextarea, FieldNumber, FieldSelect, FieldRadio, FieldSwitch} from '@spark-appworks/spark-component'
import {visibleFeatureFields, type FeatureFieldSpec} from './feature-field-spec'

const props = withDefaults(defineProps<{dataViewKey: string; recordId: string | number; row?: Readonly<DataRow> | undefined
  specs: readonly FeatureFieldSpec[]; locked?: boolean; columns?: number}>(), {locked: false, columns: 1})
const visible = computed(() => visibleFeatureFields(props.specs, props.row))

function fieldReadonly(spec: FeatureFieldSpec): boolean {
  return props.locked || spec.readonly === true || (spec.readonlyWhen !== undefined && (!props.row || spec.readonlyWhen(props.row)))
}
function fieldRequired(spec: FeatureFieldSpec): boolean {
  return spec.required === true && (!spec.requiredWhen || (!!props.row && spec.requiredWhen(props.row)))
}
function placeholderOf(spec: FeatureFieldSpec): Record<string, string> {
  return spec.placeholder === undefined ? {} : {placeholder: spec.placeholder}
}
function selectSource(spec: FeatureFieldSpec): Record<string, unknown> {
  if (spec.labelJoiner !== undefined && (!spec.optionKey || !spec.labelFields)) {
    throw new Error('字段组合标题需要选项视图和标题字段列表')
  }
  if (!spec.optionKey) return {options: [...(spec.options ?? [])]}
  return spec.labelFields ? {optionDataViewKey: spec.optionKey, optionLabelFields: spec.labelFields,
    ...(spec.labelJoiner === undefined ? {} : {optionLabelJoiner: spec.labelJoiner})} : {optionDataViewKey: spec.optionKey}
}
</script>
