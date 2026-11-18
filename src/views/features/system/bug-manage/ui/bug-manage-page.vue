<!--
@module app:views/features/system/bug-manage/ui/bug-manage-page
职责：恢复BUG列表、按简述查询、分页及单条BUG详情编辑。
边界：列表、选项与编辑均绑定同一PageRuntime的正式DataView；处理时间字段在正式模型中缺失，不以其他字段替代。
AI用途：迁移系统运维BUG管理时，核对导航身份、选项视图及处理人姓名同步。
-->
<template>
  <RendererSection title="BUG管理" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取BUG列表…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false" />
    <BugDetailDialog v-if="ready && editing" :key="editing.epoch" :data-view-key="viewKey" :record-id="editing.id"
      :system-key="systemKey" :type-key="typeKey" :state-key="stateKey" :user-key="userKey" @close="editing = undefined" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {PageTool} from '@spark-appworks/spark-project-model'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {RendererSection, SparkPageRenderer} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import BugDetailDialog from './bug-detail-dialog.vue'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const scenarioId = '5B54AEBD5BD1BBC72710D4022589A404'
const tool = new PageTool({pageId: scenarioId})
tool.hydrateFileText('rule.json', rule)
tool.hydrateFileText('script.js', script)
tool.hydrateFileText('style.css', style)
tool.markLoaded()
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_Bug_Info', componentType: 'bug-manage-page', title: 'BUG管理',
  tool,
  optionModels: ['Base_AppSystemList', 'FkType_Zd', 'bug_State', 'Base_UserInfo'],
})
const systemKey = buildDataViewKey('Base_AppSystemList', 'default', scenarioId)
const typeKey = buildDataViewKey('FkType_Zd', 'default', scenarioId)
const stateKey = buildDataViewKey('bug_State', 'default', scenarioId)
const userKey = buildDataViewKey('Base_UserInfo', 'default', scenarioId)
const editing = ref<{id: string | number; epoch: number}>()
let epoch = 0
const runtime = computed(() => ready.value ? session.runtime : undefined)
watch(runtime, () => {editing.value = undefined}, {flush: 'sync'})
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (!session.isCurrent(current)) throw new Error('BUG目录运行实例已失效')
  }
  return {runtime: current, assertCurrent, invoke(command: string, input: unknown) {
    assertCurrent()
    if (command === 'bugs.connect') return {detailDisabled: () => editing.value !== undefined}
    if (command !== 'bugs.detail' || editing.value) return
    const view = current.resolveView(viewKey.value)
    const row = view?.rows.find(candidate => view.getPkKey(candidate) === input)
    const id = row && view?.getPkKey(row)
    if (id === undefined) {error.value = 'BUG记录缺少原生身份'; return}
    editing.value = {id, epoch: ++epoch}
  }}
})
</script>
