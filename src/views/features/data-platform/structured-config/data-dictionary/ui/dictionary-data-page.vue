<!--
@module app:views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page
职责：按已保存的字典设计维护六字段业务数据。
边界：宿主通过唯一dictionaryId prop提供目标；标准组件绑定正式条目DataView，不编辑或保存设计配置。
AI用途：实现用户数据维护页时复用数据空间查询、编辑覆盖、权限和独立保存范围。
-->
<template>
  <section class="dictionary-data-page">
    <header>
      <h1>字典数据维护</h1>
      <p v-if="ready && workspace">{{ dictionaryHeading }}</p>
      <p v-else>按 dictionaryId 消费已保存的设计，仅维护业务条目。</p>
    </header>
    <p v-if="loading" role="status">正在读取字典数据…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready && workspace">
      <RendererTable :data-view-key="entryKey" :children="entryFields" :toolbar="entryToolbar" :stripe="true" :highlight-current-row="true"
        :on-row-click="chooseEntry" :show-data-view-meta="false" />
      <RendererForm v-if="entrySelected" :data-view-key="entryKey" :children="editFields" grid-min-width="220px" :show-data-view-meta="false" />
      <section v-if="aiVisible && aiCandidates" class="dictionary-ai-candidates" aria-label="AI候选">
        <header>
          <h2>AI 候选</h2>
          <p>确认仅加入条目草稿，仍需保存数据；AI结果不会直接保存业务条目。</p>
        </header>
        <p v-if="aiCandidates.waitingForUnsupportedTool" role="status">当前轮次等待审批或客户端工具；本页不提交工具结果，可查询或停止。</p>
        <p v-if="aiCandidates.status">轮次状态：{{ aiCandidates.status }}</p>
        <p v-if="aiCandidates.error" role="alert">{{ aiCandidates.error }}</p>
        <p v-if="aiCandidates.confirmationError" class="ai-reason">{{ aiCandidates.confirmationError }}</p>
        <RendererForm :data-view-key="aiInputKey" :children="aiInputFields" grid-min-width="220px" :show-data-view-meta="false" />
        <RendererForm :data-view-key="aiTurnKey" :children="aiTurnFields" grid-min-width="220px" :show-data-view-meta="false" />
        <RendererTable :data-view-key="aiCandidatesKey" :children="candidateFields" :toolbar="aiToolbar" :stripe="true"
          :show-data-view-meta="true" />
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {DictionarySchema} from '@spark-appworks/spark-lowcode-api'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {RendererForm, RendererTable, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import {useDictionaryWorkspace} from '../model/use-dictionary-workspace'

const props = defineProps<{
  /** 唯一字典目标身份，由当前目录宿主按所选正式字典传入；页面不从路由或第二个参数推导目标。 */
  dictionaryId: string
}>()
const emit = defineEmits<{
  /** 宿主关闭保护状态；草稿、保存中或保存结果未知时为 true，须阻止关闭以免丢失待核验工作。 */
  pending: [value: boolean]
}>()
const {workspace, aiCandidates, aiVisible, aiLocked, ready, loading, busy, error, revision, uncertain, run, runAi, openAi, discardAi} = useDictionaryWorkspace({
  dictionaryId: () => props.dictionaryId,
  pageId: 'dictionary-data-page',
  onPending: value => emit('pending', value),
})
const entryKey = buildDataViewKey('_Base_DictData', 'default', LowcodeDictionary.editorScenarioId)
const aiInputKey = buildDataViewKey('DictionaryAiInput', 'default', LowcodeDictionary.editorScenarioId)
const aiTurnKey = buildDataViewKey('AiTurnStatus', 'default', LowcodeDictionary.editorScenarioId)
const aiCandidatesKey = buildDataViewKey('DictionaryAiCandidates', 'default', LowcodeDictionary.editorScenarioId)
const dictionaryHeading = computed(() => {
  revision.value
  const id = props.dictionaryId
  const name = workspace.value?.definition.currentRow?.['TypeName']
  const title = typeof name === 'string' && name.trim() ? name.trim() : ''
  return title ? `当前方案：${title}（${id}）` : `当前方案 ID：${id}`
})
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
const entryToolbar = computed<RToolbarProps>(() => {
  revision.value
  return {wrap: true, children: [
    {type: 'r-button', props: {label: 'AI 候选', dataViewKey: entryKey, disabled: busy.value || uncertain.value,
      onClick: openAi}},
    {type: 'r-button', props: {label: '新增条目', dataViewKey: entryKey, permAction: 'create', disabled: busy.value || aiLocked.value || uncertain.value,
      onClick: () => run(() => workspace.value!.addEntry())}},
    {type: 'r-button', props: {label: '删除当前条目', dataViewKey: entryKey, disabled: busy.value || aiLocked.value || uncertain.value || !entryRemovable.value,
      onClick: removeEntry}},
    {type: 'r-button', props: {label: '设置排序', dataViewKey: entryKey,
      disabled: busy.value || aiLocked.value || uncertain.value || workspace.value?.canApplyDisplayedOrder !== true,
      onClick: () => run(() => workspace.value!.applyDisplayedOrder())}},
    {type: 'r-button', props: {label: '保存数据', dataViewKey: entryKey, buttonType: 'primary', disabled: busy.value || aiLocked.value || uncertain.value,
      onClick: () => run(() => workspace.value!.saveData())}},
    {type: 'r-button', props: {label: uncertain.value ? '核验原提交（保留本地修改）' : '取消数据修改并重读', dataViewKey: entryKey, disabled: busy.value || aiLocked.value,
      onClick: () => run(() => workspace.value!.load(true))}},
]}
})
const editFields = computed<SparkNode[]>(() => entryFields.value.map(node => ({...node, props: {...node.props, readonly: busy.value || aiLocked.value}})))
const aiInputFields = computed<SparkNode[]>(() => [{type: 'r-textarea', props: {field: 'requirements', label: '生成需求', rows: 4, readonly: aiLocked.value}}])
const aiTurnFields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'status', label: '轮次状态', readonly: true}},
  {type: 'r-text', props: {field: 'errorMessage', label: '轮次错误', readonly: true}},
])
const candidateFields = computed<SparkNode[]>(() => DictionarySchema.fields.map(field => ({type: 'r-text', props: {
  field: field.name, label: workspace.value?.fieldLabel(field.name) ?? field.defaultLabel, width: 155, readonly: true,
}})))
const aiToolbar = computed<RToolbarProps>(() => {
  revision.value
  const owner = aiCandidates.value
  return {wrap: true, children: [
    {type: 'r-button', props: {label: '生成候选', dataViewKey: aiInputKey, buttonType: 'primary', disabled: busy.value || !owner?.canStart,
      onClick: () => runAi(async candidate => {await candidate.start(); await candidate.refresh()}, true)}},
    {type: 'r-button', props: {label: '查询结果', dataViewKey: aiTurnKey, disabled: busy.value || !owner?.canRefresh,
      onClick: () => runAi(candidate => candidate.refresh(), true)}},
    {type: 'r-button', props: {label: '停止生成', dataViewKey: aiTurnKey, disabled: busy.value || !owner?.canCancel,
      onClick: () => runAi(async candidate => {await candidate.cancel(); await candidate.refresh()}, true)}},
    {type: 'r-button', props: {label: '确认加入草稿', dataViewKey: entryKey, buttonType: 'primary', disabled: busy.value || !owner?.canConfirm,
      onClick: () => runAi(candidate => candidate.confirm())}},
    {type: 'r-button', props: {label: '放弃候选', dataViewKey: aiCandidatesKey, disabled: busy.value || aiLocked.value,
      onClick: discardAi}},
  ]}
})
function chooseEntry(row: DataRow): void {workspace.value?.entries.setCurrentRow(row)}
async function removeEntry(): Promise<void> {
  const owner = workspace.value, row = owner?.entries.currentRow
  if (!owner || !row) return
  const id = owner.entries.getPkKey(row)
  if (id !== undefined) await run(() => owner.removeEntry(id))
}
</script>

<style scoped>
.dictionary-data-page { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 16px; padding: 24px; color: var(--el-text-color-primary); }
.dictionary-data-page > * { min-width: 0; }
.dictionary-data-page header { display: grid; gap: 4px; }
.dictionary-data-page h1 { margin: 0; font-size: 1.25rem; font-weight: 600; }
.dictionary-data-page header p { margin: 0; color: var(--el-text-color-secondary); }
</style>
