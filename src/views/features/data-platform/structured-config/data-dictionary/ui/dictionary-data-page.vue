<!--
@module app:views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page
职责：按已保存的字典设计维护正式条目，并在需要时挂载通用AI批量录入组件。
边界：目录宿主持有本页owner且置于Dialog槽外；clean close先显式释放AI会话和PageRuntime。
AI用途：组件根据DataTable.columns中DataColumn.allowAIAdd及原DataView权限生成候选，确认仍暂存到原条目视图。
-->
<template>
  <RendererDialog :model-value="open" title="字典数据维护" width="min(1100px, 94vw)" :close-disabled="isDirty" @update:model-value="requestClose">
    <section v-if="ready && workspace" class="dictionary-data-page">
      <header>
        <h1>字典数据维护</h1>
        <p>{{ dictionaryHeading }}</p>
      </header>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="aiError && aiVisible" role="alert">AI录入不可用：{{ aiError }}</p>
      <RendererTable :data-view-key="entryKey" :children="entryFields" :toolbar="entryToolbar" :stripe="true" :highlight-current-row="true"
        :on-row-click="chooseEntry" :show-data-view-meta="false" />
      <RendererForm v-if="entrySelected" :data-view-key="entryKey" :children="editFields" grid-min-width="220px" :show-data-view-meta="false" />
      <SparkAiDataEntry v-if="aiVisible" :data-view-key="entryKey" title="AI批量新增" />
    </section>
    <p v-else-if="loading" role="status">正在读取字典数据…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template #footer>
      <RendererButton label="关闭" :disabled="isDirty" @click="requestClose" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {DictionarySchema} from '@spark-appworks/spark-lowcode-api'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererDialog, RendererForm, RendererTable, SparkAiDataEntry, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import {useDictionaryWorkspace} from '../model/use-dictionary-workspace'

const props = withDefaults(defineProps<{
  /** 唯一字典身份；undefined表示没有目标，不能与open=false混为一义。 */
  dictionaryId?: string
  /** 目录宿主始终挂载owner；此值只控制工作区打开/关闭。 */
  open?: boolean
}>(), {open: true})
const emit = defineEmits<{
  /** 宿主关闭保护状态；草稿、AI输入/候选、未知结果或忙碌时为true。 */
  pending: [value: boolean]
  /** 请求目录宿主执行dirty预检和正式owner释放后再关闭。 */
  close: []
}>()
const owner = useDictionaryWorkspace({
  dictionaryId: () => props.dictionaryId,
  open: () => props.open,
  pageId: 'dictionary-data-page',
  onPending: value => emit('pending', value),
})
defineExpose({releaseClean: owner.releaseClean, get isDirty() {return owner.isDirty}})
const {workspace, aiHost, aiVisible, ready, loading, busy, error, aiError, revision, uncertain, aiLocked, run, openAi} = owner
const isDirty = computed(() => {
  revision.value
  return busy.value || workspace.value?.pending === true || aiHost.value?.isDirty === true
})
const entryKey = buildDataViewKey('_Base_DictData', 'default', LowcodeDictionary.editorScenarioId)
const dictionaryHeading = computed(() => {
  revision.value
  const id = props.dictionaryId ?? ''
  const name = workspace.value?.definition.currentRow?.['TypeName']
  const title = typeof name === 'string' && name.trim() ? name.trim() : ''
  return title ? `当前方案：${title}（${id}）` : `当前方案 ID：${id}`
})
const entrySelected = computed(() => {revision.value; return workspace.value?.entries.currentRow != null})
const entryRemovable = computed(() => {
  revision.value
  const current = workspace.value, row = current?.entries.currentRow
  const id = row && current?.entries.getPkKey(row)
  return id !== undefined && id !== null && current?.canRemoveEntry(id) === true
})
const entryFields = computed<SparkNode[]>(() => {
  revision.value
  return [...DictionarySchema.fields.map(field => ({type: 'r-text', props: {
    field: field.name, label: workspace.value?.fieldLabel(field.name) ?? field.defaultLabel, width: 155,
  }})), {type: 'r-number', props: {field: 'ordIdx', label: '排序', width: 90}}]
})
const entryToolbar = computed<RToolbarProps>(() => {
  revision.value
  return {wrap: true, children: [
    {type: 'r-button', props: {label: 'AI 候选', dataViewKey: entryKey, disabled: busy.value || uncertain.value, onClick: openAi}},
    {type: 'r-button', props: {label: '新增条目', dataViewKey: entryKey, permAction: 'create', disabled: busy.value || aiLocked.value || uncertain.value,
      onClick: () => run(() => workspace.value!.addEntry())}},
    {type: 'r-button', props: {label: '删除当前条目', dataViewKey: entryKey, disabled: busy.value || aiLocked.value || uncertain.value || !entryRemovable.value,
      onClick: removeEntry}},
    {type: 'r-button', props: {label: '设置排序', dataViewKey: entryKey,
      disabled: busy.value || aiLocked.value || uncertain.value || workspace.value?.canApplyDisplayedOrder !== true,
      onClick: () => run(() => workspace.value!.applyDisplayedOrder())}},
    {type: 'r-button', props: {label: '保存数据', dataViewKey: entryKey, buttonType: 'primary', disabled: busy.value || aiLocked.value || uncertain.value,
      onClick: () => run(() => workspace.value!.saveData())}},
    {type: 'r-button', props: {label: uncertain.value ? '核验原提交（保留本地修改）' : '取消数据修改并重读', dataViewKey: entryKey,
      disabled: busy.value || aiLocked.value, onClick: () => run(() => workspace.value!.load(true))}},
  ]}
})
const editFields = computed<SparkNode[]>(() => entryFields.value.map(node => ({...node, props: {...node.props, readonly: busy.value || aiLocked.value}})))
function chooseEntry(row: DataRow): void {workspace.value?.entries.setCurrentRow(row)}
function requestClose(): void {emit('close')}
async function removeEntry(): Promise<void> {
  const current = workspace.value, row = current?.entries.currentRow
  if (!current || !row) return
  const id = current.entries.getPkKey(row)
  if (id !== undefined) await run(() => current.removeEntry(id))
}
</script>

<style scoped>
.dictionary-data-page { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 16px; padding: 24px; color: var(--el-text-color-primary); }
.dictionary-data-page > * { min-width: 0; }
.dictionary-data-page header { display: grid; gap: 4px; }
.dictionary-data-page h1 { margin: 0; font-size: 1.25rem; font-weight: 600; }
.dictionary-data-page header p { margin: 0; color: var(--el-text-color-secondary); }
</style>
