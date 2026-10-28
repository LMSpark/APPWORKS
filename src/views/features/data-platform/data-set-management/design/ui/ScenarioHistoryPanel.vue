<template>
  <section v-if="open" class="scenario-history" role="region" aria-label="场景历史" :aria-busy="busy">
    <header class="scenario-history__header">
      <div><strong>场景文件历史</strong><span v-if="status.version !== null"> · {{ status.fileName }}</span></div>
      <div class="scenario-history__actions">
        <RendererButton label="刷新历史" :disabled="busy" @click="load" />
        <RendererButton v-if="status.state === 'unknown'" label="核验原快照" :disabled="busy" @click="verify" />
        <RendererButton v-if="onUndo" data-test="scene-history-undo" label="撤销定义更改" :disabled="busy || !canUndo" @click="undo" />
        <RendererButton v-if="onRedo" data-test="scene-history-redo" label="重做定义更改" :disabled="busy || !canRedo" @click="redo" />
        <RendererButton data-test="scene-snapshot" label="创建快照" :disabled="busy || !canCreate || (status.state === 'unknown') || status.state === 'pending'" @click="create" />
        <RendererButton data-test="scene-history-close" label="关闭历史" :disabled="busy" @click="$emit('close')" />
      </div>
    </header>
    <p v-if="status.state === 'unknown'" role="status">原快照结果未知。只读核验原编号和原文，不会重发创建请求。</p>
    <p v-if="status.state === 'not-applied'" role="status">{{ status.message || '原编号快照未应用；可按当前真实历史重新创建。' }}</p>
    <p v-if="status.state === 'confirmed'" role="status">{{ status.message || '原快照已确认。' }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!versions.length && !busy">暂无场景快照</p>
    <ul class="scenario-history__list">
      <li v-for="item in versions" :key="`${typeof item.version}:${item.version}`">
        <span>{{ item.label }}<small>{{ item.lastModified === null ? '时间未知' : new Date(item.lastModified).toLocaleString() }}</small></span>
        <RendererButton data-test="scene-preview" label="预览" :disabled="busy" @click="preview(item.version)" />
      </li>
    </ul>
    <template v-if="previewText !== null">
      <p>预览 {{ previewLabel }}；恢复仅写入当前定义草稿。</p>
      <pre class="scenario-history__preview">{{ previewText }}</pre>
      <div class="scenario-history__actions">
        <RendererButton data-test="scene-restore" label="恢复到定义草稿" :disabled="busy || draftDirty" @click="restore" />
        <RendererButton v-if="draftDirty" data-test="scene-save" label="显式保存定义" :disabled="busy || !onSave" button-type="primary" @click="save" />
      </div>
    </template>
    <RendererButton v-if="draftDirty && previewText === null" data-test="scene-save" label="显式保存定义" :disabled="busy || !onSave" button-type="primary" @click="save" />
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import type {DataView, DataViewSourceHistoryStatus, DataViewSourceVersion} from '@spark-appworks/spark-data'
import {DATA_SOURCE, RendererButton, useSparkComponent} from '@spark-appworks/spark-component'

const props = defineProps<{
  open: boolean
  view: DataView
  canCreate: boolean
  draftDirty: boolean
  onRestore: (version: string | number, text: string) => Promise<void>
  onSave?: () => Promise<void>
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: (() => Promise<void>) | undefined
  onRedo?: (() => Promise<void>) | undefined
}>()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'scenario-history-panel'})
watch(() => props.view, view => sparkProvide(DATA_SOURCE, view), {immediate: true})
const emit = defineEmits<{close: []; pending: [value: boolean]}>()
const versions = ref<readonly DataViewSourceVersion[]>([])
const previewText = ref<string | null>(null)
const previewVersion = ref<string | number | null>(null)
const status = ref<DataViewSourceHistoryStatus>({state: 'idle', version: null, fileName: null, message: null})
const busy = ref(false), error = ref(''), message = ref('')
let generation = 0, alive = true
const previewLabel = computed(() => previewVersion.value === null ? '' : `${previewVersion.value}__pagedata.json`)

watch(() => [props.open, props.view] as const, ([open]) => {if (open) void load()}, {immediate: true})
onBeforeUnmount(() => {alive = false; generation++; sparkRemove(DATA_SOURCE); if (busy.value) emit('pending', false)})

function readStatus(): void {
  try {status.value = props.view.getSourceHistoryStatus()}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function start(): number {const id = ++generation; busy.value = true; error.value = ''; message.value = ''; emit('pending', true); return id}
function finish(id: number): void {if (alive && id === generation) {busy.value = false; emit('pending', false); readStatus()}}
function current(id: number): boolean {return alive && id === generation && props.open}

async function load(): Promise<void> {
  if (busy.value) return
  const id = start()
  try {const result = await props.view.listSourceVersions(); if (current(id)) versions.value = result}
  catch (cause) {if (current(id)) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {finish(id)}
}
async function preview(version: string | number): Promise<void> {
  if (busy.value) return
  const id = start(); previewText.value = null; previewVersion.value = null
  try {const result = await props.view.previewSourceVersion(version); if (current(id)) {previewText.value = result; previewVersion.value = version}}
  catch (cause) {if (current(id)) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {finish(id)}
}
async function create(): Promise<void> {
  if (busy.value || !props.canCreate || (status.value.state === 'unknown') || status.value.state === 'pending') return
  const id = start()
  try {
    await props.view.createSourceVersion()
    if (current(id)) {message.value = '快照创建结果已核验'; versions.value = await props.view.listSourceVersions()}
  } catch (cause) {if (current(id)) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {finish(id)}
}
async function verify(): Promise<void> {
  if (busy.value || status.value.state !== 'unknown') return
  const id = start()
  try {const result = await props.view.verifySourceHistoryAttempt(); if (current(id)) {status.value = result; message.value = result.message ?? ''}}
  catch (cause) {if (current(id)) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {finish(id)}
}
async function restore(): Promise<void> {
  if (busy.value || props.draftDirty || previewText.value === null || previewVersion.value === null) return
  const id = start()
  try {await props.onRestore(previewVersion.value, previewText.value); if (current(id)) message.value = '历史已恢复到定义草稿；显式保存后生效'}
  catch (cause) {if (current(id)) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {finish(id)}
}
async function save(): Promise<void> {
  if (busy.value || !props.draftDirty || !props.onSave) return
  const id = start()
  try {await props.onSave(); if (current(id)) message.value = '定义已显式保存'}
  catch (cause) {if (current(id)) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {finish(id)}
}
async function undo(): Promise<void> {
  if (busy.value || !props.canUndo || !props.onUndo) return
  const id = start()
  try {await props.onUndo(); if (current(id)) message.value = '定义草稿已撤销'}
  catch (cause) {if (current(id)) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {finish(id)}
}
async function redo(): Promise<void> {
  if (busy.value || !props.canRedo || !props.onRedo) return
  const id = start()
  try {await props.onRedo(); if (current(id)) message.value = '定义草稿已重做'}
  catch (cause) {if (current(id)) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {finish(id)}
}
</script>

<style scoped>
.scenario-history {border:1px solid var(--el-border-color);padding:12px;margin:12px 0;background:var(--el-bg-color);}
.scenario-history__header,.scenario-history__actions,.scenario-history__list li {display:flex;align-items:center;gap:10px;}
.scenario-history__header {justify-content:space-between;flex-wrap:wrap;}
.scenario-history__list {list-style:none;padding:0;margin:8px 0;}
.scenario-history__list li {justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--el-border-color-lighter);}
.scenario-history__list small {display:block;color:var(--el-text-color-secondary);}
.scenario-history__preview {white-space:pre-wrap;overflow:auto;max-height:400px;}
</style>
