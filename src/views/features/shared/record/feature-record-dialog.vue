<!--
@module app:views/features/shared/record/feature-record-dialog
职责：按字段清单新增或编辑一条正式记录（维度中心、业务报表等功能页共用）。
边界：值写入宿主传入的原DataView并由公共记录编辑保存；页面专有校验由宿主validate给出，不另建草稿或提交通道。
-->
<template>
  <RendererDialog v-if="!headless" :model-value="true" :data-view-key="dataViewKey" :title="title" :width="width"
    :append-to-body="true" :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <p v-if="error || hint" role="alert">{{ error || hint }}</p>
    <p v-if="!current" role="status">原记录已变化，请关闭并保留原修改。</p>
    <SparkComponentRenderer v-if="recordForm" :config="recordForm" />
    <FeatureRecordFields v-else :data-view-key="dataViewKey" :record-id="recordId" :row="row" :specs="fieldSpecs" :locked="locked" :columns="columns" />
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
import {getSparkNodeChildren, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {missingFeatureField, type FeatureFieldSpec} from './feature-field-spec'
import FeatureRecordFields from './feature-record-fields.vue'
const {PAGE_RUNTIME, RendererDialog, RendererButton, SparkComponentRenderer, useSparkComponent, useDataViewRecordEditing} = Components
const props = withDefaults(defineProps<{dataViewKey: string; recordId: string | number; title: string; specs?: readonly FeatureFieldSpec[]; formRule?: SparkNode
  created?: boolean; headless?: boolean; width?: number; columns?: number; validate?: ((row: Readonly<DataRow>) => string | undefined) | undefined}>(),
{created: false, width: 660, columns: 1, specs: () => []})
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'feature-record-dialog'})
const fieldSpecs = computed<readonly FeatureFieldSpec[]>(() => {
  const form = props.formRule
  if (!form) return props.specs
  if (form.type !== 'r-form' || form.props?.['dataViewKey'] !== props.dataViewKey) throw new Error('记录表单与原记录视图绑定不一致')
  return getSparkNodeChildren(form.children).map(({props}) => {
    const field = props?.['field'], label = props?.['label']
    if (typeof field !== 'string' || typeof label !== 'string') throw new Error('记录表单字段缺少正式身份或标签')
    return {field, label, required: props?.['visible'] !== false && props?.['required'] === true}
  })
})
const {row, busy, current, locked, error, ownUnconfirmed, foreignRecovery, recoveryEnded, hasStaged, permissionsPending,
  confirmedCreation, save, cancel} = useDataViewRecordEditing({mode: 'edit', runtime: () => sparkConsume(PAGE_RUNTIME),
  dataViewKey: () => props.dataViewKey, recordId: () => props.recordId, created: () => props.created,
  editableFields: fieldSpecs.value.map(spec => spec.field), onFinish: () => emit('close')})
const recordForm = computed<SparkNode | undefined>(() => {
  const form = props.formRule
  if (!form) return undefined
  const children = getSparkNodeChildren(form.children).filter(node => node.props?.['visible'] !== false)
    .map(node => ({...node, props: {...node.props, readonly: locked.value || node.props?.['readonly'] === true}}))
  return {...form, props: {...form.props, contextRowId: props.recordId}, children}
})
const hint = ref('')
async function submit(): Promise<void> {
  hint.value = ''
  if (!ownUnconfirmed.value && !permissionsPending.value && row.value) {
    const missing = missingFeatureField(fieldSpecs.value, row.value)
    if (missing) { hint.value = `请填写${missing.label}`; return }
    const invalid = props.validate?.(row.value)
    if (invalid) { hint.value = invalid; return }
  }
  await save()
}
defineExpose({
  state:()=>({busy:busy.value,current:current.value,locked:locked.value,error:error.value||hint.value,
    ownUnconfirmed:ownUnconfirmed.value,foreignRecovery:foreignRecovery.value,recoveryEnded:recoveryEnded.value,
    hasStaged:hasStaged.value,permissionsPending:permissionsPending.value,confirmedCreation:confirmedCreation.value}),
  submit,cancel,
})
</script>
