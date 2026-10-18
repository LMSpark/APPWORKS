<!--
@module app:views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page
职责：按已保存的字典设计维护六字段业务数据。
边界：URL输入dictionaryId，标准组件绑定正式条目DataView，不编辑或保存设计配置。
AI用途：实现用户数据维护页时复用数据空间查询、编辑覆盖、权限和独立保存范围。
-->
<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="loading">正在读取字典数据…</p>
  <template v-if="ready && workspace">
    <RendererTable :data-view-key="entryKey" :children="entryFields" :on-row-click="chooseEntry" />
    <RendererForm v-if="entrySelected" :data-view-key="entryKey" :children="editFields" grid-min-width="220px" :show-data-view-meta="false" />
    <RendererButton label="新增条目" :data-view-key="entryKey" perm-action="create" :disabled="busy || uncertain" @click="run(() => workspace!.addEntry())" />
    <RendererButton label="删除当前条目" :data-view-key="entryKey" :disabled="busy || uncertain || !entryRemovable" @click="removeEntry" />
    <RendererButton label="保存数据" :data-view-key="entryKey" button-type="primary" :disabled="busy || uncertain" @click="run(() => workspace!.saveData())" />
    <RendererButton :label="uncertain ? '重读核验（放弃本地修改）' : '取消数据修改并重读'" :data-view-key="entryKey" :disabled="busy" @click="run(() => workspace!.load(true))" />
  </template>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {DictionarySchema} from '@spark-appworks/spark-lowcode-api'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {RendererForm, RendererTable, RendererButton} from '@spark-appworks/spark-component'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import {useDictionaryWorkspace} from '../model/use-dictionary-workspace'

const route = useRoute()
const {workspace, ready, loading, busy, error, revision, uncertain, run} = useDictionaryWorkspace({
  dictionaryId: () => typeof route.query['dictionaryId'] === 'string' ? route.query['dictionaryId'] : undefined,
  pageId: 'dictionary-data-page',
})
const entryKey = buildDataViewKey('_Base_DictData', 'default', LowcodeDictionary.editorScenarioId)
const entrySelected = computed(() => {revision.value; return workspace.value?.entries.currentRow != null})
const entryRemovable = computed(() => {
  revision.value
  const owner = workspace.value, row = owner?.entries.currentRow
  const id = row && owner?.entries.getPkKey(row)
  return id !== undefined && id !== null && owner?.canRemoveEntry(id) === true
})
const entryFields = computed<SparkNode[]>(() => {
  revision.value
  return [...DictionarySchema.fields.map(field => ({type: 'r-text', props: {
    field: field.name, label: workspace.value?.fieldLabel(field.name) ?? field.defaultLabel, width: 155,
  }})), {type: 'r-number', props: {field: 'ordIdx', label: '排序', width: 90}}]
})
const editFields = computed<SparkNode[]>(() => entryFields.value.map(node => ({...node, props: {...node.props, readonly: busy.value}})))
function chooseEntry(row: DataRow): void {workspace.value?.entries.setCurrentRow(row)}
async function removeEntry(): Promise<void> {
  const owner = workspace.value, row = owner?.entries.currentRow
  if (!owner || !row) return
  const id = owner.entries.getPkKey(row)
  if (id !== undefined) await run(() => owner.removeEntry(id))
}
</script>
