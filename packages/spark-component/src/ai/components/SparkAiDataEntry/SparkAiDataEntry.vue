<!--
@module @spark-appworks/spark-component:ai/components/SparkAiDataEntry/SparkAiDataEntry
职责：把统一AI批量新增会话呈现为标准RendererForm、RendererTable及字段子组件。
边界：只解析PAGE_RUNTIME完整目标、附着应用host会话并编排交互；不创建AI服务、数据owner或第二份业务草稿。
AI用途：按DataTable.columns中DataColumn.allowAIAdd与原DataView权限显示通用批量录入，并通过标准数据组件编辑提示和预览候选。
-->
<template>
  <section v-if="isVisible" class="spark-ai-data-entry">
    <header class="spark-ai-data-entry__header">
      <h3>{{ title }}</h3>
    </header>

    <p v-if="displayError" class="spark-ai-data-entry__error" role="alert">{{ displayError }}</p>
    <p v-else-if="sessionState?.confirmationError" class="spark-ai-data-entry__hint">{{ sessionState.confirmationError }}</p>

    <RendererForm
      v-if="sessionState && inputKey"
      :data-view-key="inputKey"
      :show-data-view-meta="false"
      :show-aggregate-summary="false"
      :show-selection-summary="false"
      :auto-columns="false"
      :grid-columns="1"
      :form-props="{labelPosition: 'top'}"
      class="spark-ai-data-entry__prompt"
    >
      <FieldTextarea
        :data-view-key="inputKey"
        data-member="currentRow"
        field="businessPrompt"
        label="业务提示"
        :rows="4"
        :maxlength="4000"
        :readonly="isPromptReadonly"
        placeholder="描述本次需要批量新增的数据"
      />
    </RendererForm>

    <RendererForm
      v-if="sessionState && turnKey"
      :data-view-key="turnKey"
      data-member="currentRow"
      :show-data-view-meta="false"
      :show-aggregate-summary="false"
      :show-selection-summary="false"
      :auto-columns="false"
      grid-min-width="220px"
      :form-props="{labelPosition: 'top'}"
      class="spark-ai-data-entry__status"
    >
      <FieldText
        v-for="field in turnFieldNodes"
        :key="field.name"
        :data-view-key="turnKey"
        data-member="currentRow"
        :field="field.name"
        :label="field.label ?? field.name"
        readonly
      />
    </RendererForm>

    <RendererTable
      v-if="sessionState && candidatesKey"
      :data-view-key="candidatesKey"
      :toolbar="toolbarConfig"
      :auto-columns="false"
      :children="[...candidateFieldNodes]"
      :show-pagination="false"
      :show-data-view-meta="false"
      :show-aggregate-summary="false"
      :show-selection-summary="false"
      class="spark-ai-data-entry__candidates"
    />
  </section>
  <div v-else-if="displayError" class="spark-ai-data-entry__error" role="alert">{{ displayError }}</div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue'
import {buildDataViewKey, parseDataViewKey, type DataColumn, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME} from '../../../core/capability-keys'
import {useSparkPageComponent} from '../../../core/useSparkComponent'
import RendererForm from '../../../components/containers/data-views/RendererForm/RendererForm.vue'
import RendererTable from '../../../components/containers/data-views/RendererTable/RendererTable.vue'
import {FieldText, FieldTextarea} from '../../../components/fields/data-components'
import {AI_DATA_ENTRY_HOST, type AiDataEntryAttachment, type AiDataEntrySessionSurface} from '../../data-entry-host-capability'
import type {SparkAiDataEntryProps} from './SparkAiDataEntry.props'

type SessionViewState = Readonly<{
  owner: AiDataEntrySessionSurface
  input: DataView
  candidates: DataView
  turn: DataView
  status: string | undefined
  busy: boolean
  blocksWorkspace: boolean
  hasCandidates: boolean
  pending: boolean
  error: string
  canStart: boolean
  canRefresh: boolean
  canCancel: boolean
  canConfirm: boolean
  confirmationError: string
  shouldAutoRefresh: boolean
}>

const props = withDefaults(defineProps<SparkAiDataEntryProps>(), {
  type: 'ai-data-entry',
  title: 'AI批量新增',
  disabled: false,
})

const {sparkConsume, isVisible, isDisabled} = useSparkPageComponent(props)
const attachment = shallowRef<AiDataEntryAttachment>()
const session = shallowRef<AiDataEntrySessionSurface>()
const localError = ref('')
const revision = ref(0)
const inputKey = ref('')
const candidatesKey = ref('')
const turnKey = ref('')
let unsubscribe: (() => void) | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let signalListener: (() => void) | undefined
let cleaning = false
let polling = false
let mounted = false

const sessionState = computed<SessionViewState | undefined>(() => {
  revision.value
  const owner = session.value
  return owner === undefined ? undefined : {
    owner,
    input: owner.input,
    candidates: owner.candidates,
    turn: owner.turn,
    status: owner.status,
    busy: owner.busy,
    blocksWorkspace: owner.blocksWorkspace,
    hasCandidates: owner.candidates.rows.length > 0,
    pending: owner.pending,
    error: owner.error,
    canStart: owner.canStart,
    canRefresh: owner.canRefresh,
    canCancel: owner.canCancel,
    canConfirm: owner.canConfirm,
    confirmationError: owner.confirmationError,
    shouldAutoRefresh: owner.shouldAutoRefresh,
  }
})
const isPromptReadonly = computed<boolean>(() => isDisabled.value
  || sessionState.value?.blocksWorkspace === true
  || sessionState.value?.hasCandidates === true)
const displayError = computed(() => localError.value || sessionState.value?.error || '')
const intervalMs = 10_000
function hasSessionError(active: AiDataEntrySessionSurface): boolean {
  return active.error.trim() !== '' || active.turn.loadingError !== null
    || active.candidates.loadingError !== null
}
const candidateFieldNodes = computed<readonly SparkNode[]>(() => {
  const state = sessionState.value
  if (state === undefined) return []
  const primaryKey = state.candidates.primaryKey
  return state.candidates.columns
    .filter(column => column.name !== primaryKey && column.isComputed !== true)
    .map(column => ({type: 'r-text', props: {field: column.name, label: column.label ?? column.name, readonly: true}}))
})
const turnFieldNodes = computed<readonly DataColumn[]>(() => {
  const state = sessionState.value
  if (state === undefined) return []
  return state.turn.columns.filter(column => ['status', 'errorCode', 'errorMessage'].includes(column.name))
})

function keyFor(runtime: PageRuntime, view: DataView): string {
  const table = view.dataTable
  const dataSet = table?.dataSet
  const scenarioId = dataSet?.scenarioId
  const modelName = table?.modelBinding?.modelName ?? table?.tableName
  if (typeof scenarioId !== 'string' || scenarioId.trim() === '' || typeof modelName !== 'string' || modelName.trim() === '') {
    throw new Error('AI录入视图缺少完整的数据空间或模型身份')
  }
  const key = buildDataViewKey(modelName, view.viewId, scenarioId)
  if (runtime.resolveView(key) !== view) throw new Error(`AI录入视图绑定未能解析到同一DataView: ${key}`)
  return key
}

function clearTimer(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function cleanupLocal(current: AiDataEntryAttachment, detach: boolean): void {
  if (cleaning || attachment.value !== current) return
  cleaning = true
  clearTimer()
  unsubscribe?.()
  unsubscribe = undefined
  if (signalListener !== undefined) current.signal.removeEventListener('abort', signalListener)
  signalListener = undefined
  attachment.value = undefined
  session.value = undefined
  revision.value++
  if (detach) current.detach()
  cleaning = false
}

function scheduleRefresh(): void {
  clearTimer()
  const current = attachment.value
  const active = session.value
  if (current === undefined || current.signal.aborted || active === undefined || !active.shouldAutoRefresh
    || active.busy || hasSessionError(active) || localError.value !== '') return
  timer = setTimeout(() => { void pollOnce(current, active) }, intervalMs)
}

async function pollOnce(current: AiDataEntryAttachment, active: AiDataEntrySessionSurface): Promise<void> {
  timer = undefined
  if (current.signal.aborted || attachment.value !== current || session.value !== active || !active.shouldAutoRefresh || active.busy || polling) return
  polling = true
  try { await active.refresh() }
  catch (error) {
    if (attachment.value === current && session.value === active && active.error.trim() === '') {
      localError.value = error instanceof Error ? error.message : String(error)
    }
  }
  finally {
    polling = false
    if (attachment.value === current && session.value === active) {
      revision.value++
      scheduleRefresh()
    }
  }
}

function connect(): void {
  const runtime = sparkConsume(PAGE_RUNTIME)
  const host = sparkConsume(AI_DATA_ENTRY_HOST)
  if (runtime === null || host === null) {
    localError.value = 'AI录入缺少当前页面运行时或应用会话owner'
    return
  }
  const descriptor = parseDataViewKey(props.dataViewKey)
  if (descriptor?.scope === undefined || descriptor.scope.trim() === '') {
    localError.value = 'AI录入目标必须使用完整的数据空间ID@模型名称@视图名称绑定'
    return
  }
  let acceptedAttachment: AiDataEntryAttachment | undefined
  try {
    const target = runtime.resolveView(props.dataViewKey)
    if (target === undefined) throw new Error(`页面绑定的视图不存在: ${props.dataViewKey}`)
    const opened = host.openSession(target)
    if (opened.session.targetView !== target) {
      // Do not detach a capability lease that belongs to a different target owner.
      throw new Error('AI录入host返回的会话目标与页面绑定不一致')
    }
    if (opened.signal.aborted) throw new Error('AI录入host返回的附件已撤销')
    acceptedAttachment = opened
    const nextInputKey = keyFor(runtime, opened.session.input)
    const nextCandidatesKey = keyFor(runtime, opened.session.candidates)
    const nextTurnKey = keyFor(runtime, opened.session.turn)
    attachment.value = opened
    session.value = opened.session
    inputKey.value = nextInputKey
    candidatesKey.value = nextCandidatesKey
    turnKey.value = nextTurnKey
    localError.value = ''
    unsubscribe = opened.session.subscribe(() => {
      revision.value++
      scheduleRefresh()
    })
    signalListener = () => cleanupLocal(opened, false)
    opened.signal.addEventListener('abort', signalListener, {once: true})
    scheduleRefresh()
  } catch (error) {
    if (acceptedAttachment !== undefined) {
      if (attachment.value === acceptedAttachment) cleanupLocal(acceptedAttachment, true)
      else acceptedAttachment.detach()
    }
    localError.value = error instanceof Error ? error.message : String(error)
  }
}

async function run(current: AiDataEntryAttachment, active: AiDataEntrySessionSurface, action: () => Promise<void>): Promise<void> {
  if (attachment.value !== current || session.value !== active || current.signal.aborted) return
  localError.value = ''
  try { await action() }
  catch (error) {
    if (attachment.value === current && session.value === active) {
      localError.value = active.error || (error instanceof Error ? error.message : String(error))
    }
  }
  finally {
    if (attachment.value === current && session.value === active) {
      revision.value++
      scheduleRefresh()
    }
  }
}

const actionNodes = computed<readonly SparkNode[]>(() => {
  const state = sessionState.value
  const current = attachment.value
  if (state === undefined || current === undefined) return []
  const active = state.owner
  const disabled = isDisabled.value
  return [
    {type: 'r-button', id: 'ai-data-entry-start', props: {dataViewKey: inputKey.value, label: '开始生成', disabled: disabled || state.busy || !state.canStart,
      onClick: () => run(current, active, () => active.start())}},
    {type: 'r-button', id: 'ai-data-entry-refresh', props: {dataViewKey: turnKey.value, label: '刷新查询', disabled: disabled || state.busy || !state.canRefresh,
      onClick: () => run(current, active, () => active.refresh())}},
    {type: 'r-button', id: 'ai-data-entry-cancel', props: {dataViewKey: turnKey.value, label: '停止生成', disabled: disabled || state.busy || !state.canCancel,
      onClick: () => run(current, active, () => active.cancel())}},
    {type: 'r-button', id: 'ai-data-entry-confirm', props: {dataViewKey: props.dataViewKey, label: '确认新增', disabled: disabled || state.busy || !state.canConfirm,
      onClick: () => run(current, active, () => active.confirm())}},
    {type: 'r-button', id: 'ai-data-entry-discard', props: {dataViewKey: candidatesKey.value, label: '清除候选', disabled: disabled || state.busy || !state.pending,
      onClick: () => run(current, active, () => active.discard())}},
  ]
})

const toolbarConfig = computed(() => ({dataViewKey: candidatesKey.value, dataMember: 'currentRow' as const, children: [...actionNodes.value]}))

onMounted(() => { mounted = true; connect() })
watch(() => props.dataViewKey, () => {
  if (!mounted) return
  const current = attachment.value
  if (current !== undefined) cleanupLocal(current, true)
  else clearTimer()
  inputKey.value = ''
  candidatesKey.value = ''
  turnKey.value = ''
  localError.value = ''
  connect()
})
onBeforeUnmount(() => {
  const current = attachment.value
  if (current !== undefined) cleanupLocal(current, true)
  else clearTimer()
})
</script>

<style scoped>
.spark-ai-data-entry { display: grid; gap: 12px; min-width: 0; }
.spark-ai-data-entry__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.spark-ai-data-entry__header h3 { margin: 0; font-size: 16px; }
.spark-ai-data-entry__status { color: var(--el-text-color-secondary); font-size: 12px; }
.spark-ai-data-entry__error { color: var(--el-color-danger); margin: 0; }
.spark-ai-data-entry__hint { color: var(--el-text-color-secondary); margin: 0; }
.spark-ai-data-entry__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.spark-ai-data-entry__candidates { min-width: 0; }
</style>
