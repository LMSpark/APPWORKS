<!--
@module app:views/features/data-platform/structured-config/data-dictionary/ui/dictionary-setting
职责：维护字典方案的名称、编码类型及六项字段标题。
边界：标准表单绑定正式定义DataView，只保存设计配置，不提供业务条目编辑器。
AI用途：实现专题方案设计页时保留元数据空间和已保存方案的独立消费边界。
-->
<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="loading">正在读取字典设计…</p>
  <template v-if="ready && workspace">
    <RendererForm :data-view-key="definitionKey" :children="definitionFields" grid-min-width="220px" :show-data-view-meta="false" />
    <RendererButton :data-view-key="definitionKey" label="保存设计" button-type="primary" :disabled="busy || uncertain" @click="save" />
    <RendererButton :data-view-key="definitionKey" :label="uncertain ? '核验原提交（保留本地修改）' : '取消设计修改并重读'" :disabled="busy" @click="reload" />
    <RendererButton :data-view-key="definitionKey" label="放弃设计修改并关闭" :disabled="busy || uncertain" @click="cancel" />
    <RendererButton v-if="!isCreating" :data-view-key="definitionKey" label="删除字典资源…" :disabled="busy || !definitionRemovable" @click="confirmDelete = true" />
    <p v-if="!isCreating" role="status">尚无覆盖数据库、配置和代码消费者的全局引用检查，暂不允许删除字典资源。</p>
    <RendererDialog :data-view-key="definitionKey" :model-value="confirmDelete" title="删除字典资源" width="480px" @update:model-value="confirmDelete = false">
      <p>此操作将删除字典定义及其全部条目；全局引用范围尚未验证，当前不可提交。</p>
      <RendererButton label="取消" :disabled="busy" @click="confirmDelete = false" />
      <RendererButton label="确认删除" button-type="danger" :disabled="busy || !definitionRemovable" @click="removeDefinition" />
    </RendererDialog>
  </template>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {DictionarySchema} from '@spark-appworks/spark-lowcode-api'
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {RendererForm, RendererButton, RendererDialog} from '@spark-appworks/spark-component'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import {useDictionaryWorkspace} from '../model/use-dictionary-workspace'

const props = defineProps<{dictionaryId: string; create?: boolean; applicationScenarioId?: string}>()
const emit = defineEmits<{pending: [value: boolean]; saved: []; deleted: []; cancelled: []}>()
const {workspace, ready, loading, busy, error, revision, uncertain, run, discard} = useDictionaryWorkspace({
  dictionaryId: () => props.dictionaryId, ...(props.create ? {create: true, applicationScenarioId: () => props.applicationScenarioId} : {}), pageId: 'dictionary-setting',
  onPending: value => emit('pending', value),
})
const confirmDelete = ref(false)
const definitionRemovable = computed(() => {revision.value; return workspace.value?.canRemoveDefinition === true})
const isCreating = computed(() => {
  revision.value
  return workspace.value?.definition.dirtyTracking.pendingCreateIds.has(props.dictionaryId) === true
})
const definitionKey = buildDataViewKey('_Base_DictType', 'default', LowcodeDictionary.editorScenarioId)
const definitionFields = computed<SparkNode[]>(() => [
  ...(isCreating.value && props.applicationScenarioId?.trim() ? [{type: 'r-select', props: {field: 'AppId', label: '所属应用', readonly: busy.value, clearable: true,
    optionDataViewKey: buildDataViewKey('Base_AppSystemList', 'default', props.applicationScenarioId),
    optionLabelField: 'AppDesc', optionValueField: 'rowid'}}] : []),
  {type: 'r-text', props: {field: 'TypeName', label: '字典名称', readonly: busy.value}},
  {type: 'r-select', props: {field: 'dictionaryType', label: '编码类型', readonly: busy.value,
    options: [{value: '0', label: '字符型'}, {value: '1', label: '数值型'}]}},
  ...DictionarySchema.fields.map(field => ({type: 'r-text', props: {field: field.titleField,
    label: `${field.defaultLabel}标题`, readonly: busy.value}})),
  {type: 'r-text', props: {field: 'functiondesc', label: '功能描述', readonly: busy.value}},
])
async function reload(): Promise<void> {
  if (await run(() => workspace.value!.load(true)) && workspace.value?.removed) emit('deleted')
}
function cancel(): void {if (!busy.value && !uncertain.value) {discard(); emit('cancelled')}}
async function save(): Promise<void> {if (await run(() => workspace.value!.saveDesign())) emit('saved')}
async function removeDefinition(): Promise<void> {
  if (await run(async () => {await workspace.value!.removeDefinition(); await workspace.value!.saveDesign()})) emit('deleted')
  confirmDelete.value = false
}
</script>
