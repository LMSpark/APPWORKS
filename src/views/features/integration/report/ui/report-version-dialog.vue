<!--
@module app:views/features/integration/report/ui/report-version-dialog
职责：报表历史版本：列出本报表的版本，新增/改名/删除版本，启动选中版本（原启用版本停用，报表头切换启用版本及模型）。
边界：版本列表按 RptID 过滤（修正参考实现未过滤且新增遗漏 RptID 的缺陷）；启动在同一次DataSet保存中提交版本状态与报表头。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="versionKey" title="报表设计" :width="900" :append-to-body="true" :close-disabled="busy"
    @update:model-value="close">
    <DisplayAlert v-if="loading" alert-type="info" :closable="false" title="正在读取版本…" />
    <DisplayAlert v-if="message" alert-type="error" :closable="false" :title="message" />
    <SparkComponentRenderer v-if="ready" :config="toolbarConfig" />
    <SparkComponentRenderer v-if="ready" :config="tableConfig" />
    <FeatureRecordDialog v-if="editor" :key="editor.epoch" :data-view-key="versionKey" :record-id="editor.id" :created="editor.created"
      :title="editor.created ? '新增版本' : '编辑版本'" :form-rule="formRule" @close="closeEditor" />
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, shallowRef} from 'vue'
import {getSparkNodeChildren, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import {isOn, textOf} from './report-format'
import {commitReportChanges, reportPendingReason, reportSaveReadback} from './report-save'
const {PAGE_RUNTIME, RendererDialog, SparkComponentRenderer, DisplayAlert, useSparkComponent} = Components
const props = defineProps<{infoKey: string; infoId: string | number; tableRule: SparkNode; toolbarRule: SparkNode | undefined; formRule: SparkNode | undefined}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'report-version-dialog'})
const formRule = props.formRule
if (!formRule) throw new Error('报表版本缺少编辑表单')
const binding = props.tableRule.props?.['dataViewKey']
const versionKey = typeof binding === 'string' ? binding : ''
if (!versionKey) throw new Error('报表版本列表缺少正式视图绑定')
const busy = ref(false), loading = ref(true), ready = ref(false), message = ref('')
const editor = shallowRef<Readonly<{id: string | number; created: boolean; epoch: number}>>()
let epoch = 0

function view(key: string): DataView {
  const found = sparkConsume(PAGE_RUNTIME)?.resolveView(key)
  if (!found) throw new Error(`报表版本缺少正式视图 ${key}`)
  return found
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
async function guarded(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true; message.value = ''
  try { await action() } catch (cause) { message.value = failure(cause) } finally { busy.value = false }
}
function assertSettled(): void {
  const reason = reportPendingReason([view(versionKey), view(props.infoKey)])
  if (reason) throw new Error(reason)
}
async function loadVersions(): Promise<void> {
  const versions = view(versionKey)
  versions.queryContext = {reportId: String(props.infoId)}
  await versions.refresh()
  if (versions.loadingError) throw versions.loadingError
}
onMounted(() => void guarded(async () => {
  try {
    await loadVersions()
    ready.value = true
  } finally { loading.value = false }
}))

const toolbarConfig = computed<SparkNode>(() => {
  const toolbar = props.toolbarRule
  if (!toolbar) throw new Error('报表版本缺少新增操作规则')
  return {...toolbar, children: getSparkNodeChildren(toolbar.children).map(node => ({
    ...node, props: {...node.props, disabled: busy.value || !!editor.value},
  }))}
})

const tableConfig = computed<SparkNode>(() => {
  const actions = props.tableRule.props?.['actions']
  if (!actions || typeof actions !== 'object' || !('children' in actions) || !Array.isArray(actions.children)) {
    throw new Error('报表版本列表缺少操作规则')
  }
  const children = getSparkNodeChildren(actions.children).map(node => ({
    ...node, props: {...node.props, disabled: busy.value || !!editor.value},
  }))
  return {...props.tableRule, props: {...props.tableRule.props, actions: {...actions, children}}}
})

function idOf(target: DataView, row: DataRow): string | number {
  const id = target.getPkKey(row)
  if (id === undefined) throw new Error('版本缺少原生身份')
  return id
}
function captureVersion(versions: DataView, row: DataRow, fields: readonly string[] = []): string | number {
  versions.captureReadRow(row, [...versions.effectivePkFields, 'RptID', ...fields])()
  if (textOf(row, 'RptID') !== String(props.infoId)) throw new Error('版本与当前报表不一致')
  return idOf(versions, row)
}
function assertCompleteVersions(versions: DataView): void {
  versions.captureReadResult()()
  if (versions.nextPageAvailable === true || versions.countReported === true && versions.total !== versions.rows.length) {
    throw new Error('报表版本未完整读取')
  }
}
const add = () => guarded(async () => {
  assertSettled()
  const versions = view(versionKey), info = view(props.infoKey)
  const head = info.rows.find(row => info.getPkKey(row) === props.infoId)
  if (!head) throw new Error('该报表缺少当前正式记录')
  info.captureReadRow(head, ['version_id'])()
  assertCompleteVersions(versions)
  const activeId = textOf(head, 'version_id')
  const activeRows = versions.rows.filter(row => {
    captureVersion(versions, row, ['State'])
    return isOn(row['State'])
  })
  const active = activeRows[0]
  if (activeRows.length > 1 || (active ? String(idOf(versions, active)) : '') !== activeId) {
    throw new Error('报表头与启用版本不一致')
  }
  if (active) captureVersion(versions, active, ['isMerg', 'isDashboards'])
  const created = await versions.addRow({RptID: String(props.infoId), Version: '', State: '0',
    isMerg: isOn(active?.['isMerg']) ? '1' : '0', isDashboards: isOn(active?.['isDashboards']) ? '1' : '0'})
  editor.value = {id: idOf(versions, created), created: true, epoch: ++epoch}
})
function edit(row: DataRow): void {
  if (busy.value || editor.value) return
  try {
    assertSettled()
    editor.value = {id: captureVersion(view(versionKey), row), created: false, epoch: ++epoch}
  } catch (cause) { message.value = failure(cause) }
}
async function closeEditor(): Promise<void> {
  editor.value = undefined
  await guarded(loadVersions)
}
const remove = (row: DataRow) => guarded(async () => {
  assertSettled()
  const versions = view(versionKey), id = captureVersion(versions, row, ['State'])
  if (isOn(row['State'])) throw new Error('启用中的版本不能删除，请先启动其他版本')
  let dispatched = false
  let readback: string | undefined
  try {
    await versions.removeRow(id)
    dispatched = true
    await commitReportChanges({label: '删除版本', targets: [{view: versions, ids: [id]}]})
  } catch (cause) {
    if (!dispatched && versions.dirtyTracking.hasPendingChanges(id)) versions.discardPendingChanges([id])
    throw cause
  } finally {
    if (dispatched && !versions.hasUnconfirmedSave) readback = await reportSaveReadback([versions], '版本')
  }
  message.value = readback ? '删除成功。' + readback : '删除成功'
})
const activate = (row: DataRow) => guarded(async () => {
  assertSettled()
  const versions = view(versionKey), info = view(props.infoKey)
  assertCompleteVersions(versions)
  const id = captureVersion(versions, row, ['State', 'DataFormID'])
  for (const version of versions.rows) captureVersion(versions, version, ['State'])
  const label = versions.fieldAccess(row, 'Version').read === 'visible' ? textOf(row, 'Version') : ''
  const ids = [id]
  let dispatched = false
  let readback: string | undefined
  try {
    for (const other of versions.rows) {
      const otherId = versions.getPkKey(other)
      if (otherId !== undefined && otherId !== id && isOn(other['State'])) {
        ids.push(otherId)
        versions.updateEditingValue(otherId, 'State', '0')
      }
    }
    versions.updateEditingValue(id, 'State', '1')
    info.updateEditingValue(props.infoId, 'version_id', String(id))
    info.updateEditingValue(props.infoId, 'version_dataid', textOf(row, 'DataFormID'))
    dispatched = true
    await commitReportChanges({label: '启动版本', targets: [{view: versions, ids}, {view: info, ids: [props.infoId]}]})
  } catch (cause) {
    if (!dispatched) {
      if (versions.hasEditingChanges() || versions.dirtyTracking.hasPendingChanges()) versions.discardPendingChanges(ids)
      if (info.hasEditingChanges(props.infoId) || info.dirtyTracking.hasPendingChanges(props.infoId)) info.discardPendingChanges([props.infoId])
    }
    throw cause
  } finally {
    if (dispatched && ![versions, info].some(item => item.hasUnconfirmedSave)) readback = await reportSaveReadback([versions], '版本')
  }
  const confirmed = label ? `已启动版本 ${label}` : '已启动版本'
  message.value = readback ? confirmed + '。' + readback : confirmed
})
function invoke(command: string, row?: DataRow): void | Promise<void> {
  if (busy.value || editor.value || !ready.value) return
  if (command === 'add') return add()
  if (!row) return
  if (command === 'edit') return edit(row)
  if (command === 'remove') return remove(row)
  if (command === 'activate') return activate(row)
}
defineExpose({invoke})

function close(): void {
  if (!busy.value) emit('close')
}
</script>
