<!--
@module app:views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page
职责：按已保存的字典设计维护正式条目，并在需要时挂载通用AI批量录入组件。
边界：目录宿主持有本页owner且置于Dialog槽外；clean close先显式释放AI会话和PageRuntime。
AI用途：组件根据DataTable.columns中DataColumn.allowAIAdd及原DataView权限生成候选，确认仍暂存到原条目视图。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :host="host"
    :route-snapshot="routeSnapshot" :auto-load="false" />
  <RendererDialog v-else-if="open" :model-value="true" title="字典数据维护" width="min(1100px, 94vw)"
    @update:model-value="requestClose">
    <p v-if="loading" role="status">正在读取字典数据…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template #footer><RendererButton label="关闭" @click="requestClose" /></template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {DictionarySchema} from '@/platform-adapters/api'
import {isRecord} from '@spark-appworks/spark-utils'
import {RendererButton, RendererDialog, SparkPageRenderer} from '@spark-appworks/spark-component'
import {PageTool} from '@spark-appworks/spark-project-model'
import {useDictionaryWorkspace} from '../model/use-dictionary-workspace'
import rule from './entries-tool/rule.json?raw'
import script from './entries-tool/script.js?raw'
import style from './entries-tool/style.css?raw'

const props = withDefaults(defineProps<{
  /** 唯一字典身份；undefined 表示没有目标。 */
  dictionaryId?: string
  /** 目录宿主始终挂载 owner；此值控制工作区打开。 */
  open?: boolean
}>(), {open: true})
const emit = defineEmits<{pending: [value: boolean]; close: []}>()
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const tool = new PageTool({pageId: 'dictionary-data-page'})
tool.hydrateFileText('rule.json', rule)
tool.hydrateFileText('script.js', script)
tool.hydrateFileText('style.css', style)
tool.markLoaded()
const owner = useDictionaryWorkspace({
  dictionaryId: () => props.dictionaryId, open: () => props.open, purpose: 'data', tool,
  onPending: value => emit('pending', value),
})
defineExpose({releaseClean: owner.releaseClean, get isDirty() {return owner.isDirty}})
const {workspace, runtime, aiVisible, loading, busy, error, aiError, revision, uncertain, aiLocked, run, openAi} = owner
const heading = computed(() => {
  revision.value
  const id = props.dictionaryId ?? ''
  const definition = workspace.value?.definition
  const row = definition?.getEditingRow(id)
  const name = row && definition?.fieldAccess(row, 'TypeName').read === 'visible' ? row['TypeName'] : undefined
  const title = typeof name === 'string' && name.trim() ? name.trim() : ''
  return title ? `当前方案：${title}（${id}）` : `当前方案 ID：${id}`
})
const state = computed(() => {
  revision.value
  const current = workspace.value, row = current?.entries.currentRow
  const id = row && current?.entries.getPkKey(row)
  return {
    busy: busy.value, uncertain: uncertain.value, aiLocked: aiLocked.value, aiVisible: aiVisible.value,
    error: error.value, aiError: aiError.value, dirty: owner.isDirty, selected: !!row,
    removable: id !== undefined && id !== null && current?.canRemoveEntry(id) === true,
    canSort: current?.canApplyDisplayedOrder === true,
  }
})
function requestClose(): void {emit('close')}
const host = owner.bindScriptHost(command => {
  const current = workspace.value
  if (!current) throw new Error('字典数据工作区已失效')
  if (command !== 'dictionary.entries.connect') throw new Error('未知的字典数据动作')
  return {
    state: () => state.value, heading: () => heading.value, close: requestClose,
    fields: () => {
      revision.value
      return DictionarySchema.fields.map(field => ({name: field.name, label: current.fieldLabel(field.name)}))
    },
    select(row: unknown) {
      if (isRecord(row) && current.entries.rows.includes(row)) current.entries.setCurrentRow(row)
    },
    openAi() {if (!busy.value && !uncertain.value) openAi()},
    async reload() {if (!aiLocked.value) await run(() => current.load(true))},
    async add() {if (!aiLocked.value && !uncertain.value) await run(() => current.addEntry())},
    async sort() {if (!aiLocked.value && !uncertain.value) await run(() => current.applyDisplayedOrder())},
    async save() {if (!aiLocked.value && !uncertain.value) await run(() => current.saveData())},
    async remove() {
      const row = current.entries.currentRow
      const id = row && current.entries.getPkKey(row)
      if (id !== undefined && id !== null && !aiLocked.value && !uncertain.value) await run(() => current.removeEntry(id))
    },
  }
})
</script>
