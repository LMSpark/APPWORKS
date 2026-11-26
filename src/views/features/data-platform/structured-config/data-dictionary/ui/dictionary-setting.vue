<!--
@module app:views/features/data-platform/structured-config/data-dictionary/ui/dictionary-setting
职责：维护字典方案的名称、编码类型及六项字段标题。
边界：标准表单绑定正式定义DataView，只保存设计配置，不提供业务条目编辑器。
AI用途：实现专题方案设计页时保留元数据空间和已保存方案的独立消费边界。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :host="host"
    :route-snapshot="routeSnapshot" :auto-load="false" />
  <p v-else-if="error" role="alert">{{ error }}</p>
  <p v-else-if="loading" role="status">正在读取字典设计…</p>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {DictionarySchema} from '@/platform-adapters/api'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {SparkPageRenderer} from '@spark-appworks/spark-component'
import {PageTool} from '@spark-appworks/spark-project-model'
import {useDictionaryWorkspace} from '../model/use-dictionary-workspace'
import rule from './definition-tool/rule.json?raw'
import script from './definition-tool/script.js?raw'
import style from './definition-tool/style.css?raw'

const props = defineProps<{dictionaryId: string; create?: boolean; applicationScenarioId?: string}>()
const emit = defineEmits<{pending: [value: boolean]; saved: []; cancelled: []}>()
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const tool = new PageTool({pageId: 'dictionary-setting'})
tool.hydrateFileText('rule.json', rule)
tool.hydrateFileText('script.js', script)
tool.hydrateFileText('style.css', style)
tool.markLoaded()

const {workspace, runtime, loading, busy, error, revision, uncertain, run, discard, bindScriptHost} = useDictionaryWorkspace({
  dictionaryId: () => props.dictionaryId, purpose: 'design', tool,
  ...(props.create ? {create: true, applicationScenarioId: () => props.applicationScenarioId} : {}),
  onPending: value => emit('pending', value),
})
const creating = computed(() => {
  revision.value
  return workspace.value?.definition.dirtyTracking.pendingCreateIds.has(props.dictionaryId) === true
})
function cancelDesign(): void {
  if (!busy.value && !uncertain.value) {discard(); emit('cancelled')}
}
async function saveDesign(): Promise<void> {
  if (!uncertain.value && await run(() => workspace.value!.saveDesign())) emit('saved')
}
async function reloadDesign(): Promise<void> {await run(() => workspace.value!.load(true))}
const host = bindScriptHost(command => {
  if (command === 'dictionary.design.connect') return {
    state: () => ({busy: busy.value, uncertain: uncertain.value, error: error.value, creating: creating.value}),
    titleFields: DictionarySchema.fields,
    save: saveDesign, reload: reloadDesign, cancel: cancelDesign,
    applicationOptions: () => creating.value && props.applicationScenarioId
      ? buildDataViewKey('Base_AppSystemList', 'default', props.applicationScenarioId) : undefined,
  }
  throw new Error('未知的字典设计动作')
})
</script>
