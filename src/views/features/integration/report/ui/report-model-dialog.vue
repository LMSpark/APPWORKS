<!--
@module app:views/features/integration/report/ui/report-model-dialog
职责：为报表的启用版本绑定数据模型（数据空间）：按名称分页查找，确定后报表头与启用版本在同一次DataSet保存中写入。
边界：只修改报表头 version_dataid 与启用版本 DataFormID；候选来自Base_DataSet的picker视图。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="pickerKey" title="选择模型" :width="760" :append-to-body="true" :close-disabled="busy"
    @update:model-value="close">
    <DisplayAlert v-if="message" alert-type="error" :closable="false" :title="message" />
    <DisplayAlert v-if="selectedName" alert-type="success" :closable="false" :title="`已选择：${selectedName}`" />
    <SparkComponentRenderer v-if="ready" :config="tableRule" />
    <template #footer>
      <SparkComponentRenderer :config="footerConfig" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {getSparkNodeChildren, nodeId, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {isOn, textOf} from './report-format'
import {commitReportChanges, reportPendingReason} from './report-save'
const {PAGE_RUNTIME, RendererDialog, SparkComponentRenderer, DisplayAlert, useSparkComponent} = Components
const props = defineProps<{infoKey: string; reportKey: string; tableRule: SparkNode; footerRule: SparkNode | undefined; infoId: string | number}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'report-model-dialog'})
const busy = ref(false), ready = ref(false), message = ref(''), selectedId = ref(''), selectedName = ref('')

const binding = props.tableRule.props?.['dataViewKey']
const pickerKey = typeof binding === 'string' ? binding : ''
if (!pickerKey) throw new Error('模型候选列表缺少正式视图绑定')

let originalVersion: {id: string; assertCurrent: () => void} | undefined
let assertSelection: (() => void) | undefined

const footerConfig = computed<SparkNode>(() => {
  const footer = props.footerRule
  if (!footer) throw new Error('模型选择缺少确认操作规则')
  return {...footer, children: getSparkNodeChildren(footer.children).map(node => ({
    ...node, props: {...node.props, disabled: busy.value || nodeId(node) === 'submitReportModel' && !selectedId.value},
  }))}
})
function view(key: string): DataView {
  const found = sparkConsume(PAGE_RUNTIME)?.resolveView(key)
  if (!found) throw new Error(`选择模型缺少正式视图 ${key}`)
  return found
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
onMounted(async () => {
  busy.value = true
  try {
    const info = view(props.infoKey), report = view(props.reportKey)
    const head = info.rows.find(row => info.getPkKey(row) === props.infoId)
    if (!head) throw new Error('该报表缺少当前正式记录')
    const assertHead = info.captureReadRow(head, ['version_id'])
    const id = textOf(head, 'version_id')
    const version = id && report.rows.find(row => String(report.getPkKey(row)) === id)
    if (!version) throw new Error('该报表的启用版本不存在，请先在历史版本中启动一个版本')
    const assertVersion = report.captureReadRow(version, ['RptID', 'State'])
    if (textOf(version, 'RptID') !== String(props.infoId) || !isOn(version['State'])) throw new Error('该版本不是当前报表的启用版本')
    originalVersion = {id, assertCurrent() { assertHead(); assertVersion() }}
    const picker = view(pickerKey)
    await picker.refresh()
    if (picker.loadingError) throw picker.loadingError
    originalVersion.assertCurrent()
    ready.value = true
  } catch (cause) { message.value = failure(cause) } finally { busy.value = false }
})

function choose(row: DataRow): void {
  if (busy.value) return
  assertSelection = undefined; selectedId.value = ''; selectedName.value = ''; message.value = ''
  try {
    const picker = view(pickerKey)
    const id = picker.getPkKey(row)
    if (id === undefined) throw new Error('模型候选缺少正式身份')
    const nameReadable = picker.fieldAccess(row, 'Name').read === 'visible'
    assertSelection = picker.captureReadRow(row, [...picker.effectivePkFields, ...(nameReadable ? ['Name'] : [])])
    selectedId.value = String(id)
    selectedName.value = nameReadable ? textOf(row, 'Name') : ''
  } catch (cause) { message.value = failure(cause) }
}
async function submit(): Promise<void> {
  if (busy.value || !selectedId.value || !originalVersion || !assertSelection) return
  busy.value = true; message.value = ''
  const info = view(props.infoKey), report = view(props.reportKey)
  let versionId = ''
  try {
    const reason = reportPendingReason([info, report])
    if (reason) throw new Error(reason)
    try { originalVersion.assertCurrent() }
    catch (cause) { ready.value = false; selectedId.value = ''; selectedName.value = ''; throw new Error(`${failure(cause)}；请关闭后重新打开模型选择`) }
    try { assertSelection() }
    catch (cause) { selectedId.value = ''; selectedName.value = ''; assertSelection = undefined; throw new Error(`${failure(cause)}；请选择当前查询中的模型`) }
    versionId = originalVersion.id
    info.updateEditingValue(props.infoId, 'version_dataid', selectedId.value)
    report.updateEditingValue(versionId, 'DataFormID', selectedId.value)
    await commitReportChanges({label: '绑定模型', targets: [{view: info, ids: [props.infoId]}, {view: report, ids: [versionId]}]})
    emit('close')
  } catch (cause) {
    message.value = failure(cause)
    if (versionId && ![info, report].some(item => item.hasUnconfirmedSave)) {
      try {
        if (info.hasEditingChanges(props.infoId) || info.dirtyTracking.hasPendingChanges(props.infoId)) info.discardPendingChanges([props.infoId])
        if (report.hasEditingChanges(versionId) || report.dirtyTracking.hasPendingChanges(versionId)) report.discardPendingChanges([versionId])
      } catch (discard) { message.value += `；撤销本地修改失败：${failure(discard)}` }
    }
  } finally { busy.value = false }
}
function invoke(command: string, row?: DataRow): void | Promise<void> {
  if (command === 'choose' && row && ready.value) return choose(row)
  if (command === 'submit') return submit()
  if (command === 'cancel') return close()
}
defineExpose({invoke})
function close(): void {
  if (!busy.value) emit('close')
}
</script>
