<!--
@module app:views/features/integration/report/ui/report-create-dialog
职责：新增报表：报表头（名称、应用系统、描述）与初始版本（合并报表、看板标志）两条待新增记录在同一次DataSet保存中提交。
边界：两条记录由宿主在正式DataView中预先新增并互相引用；取消时撤销两条待新增，保存结果未确认时保留并提示核验。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="infoKey" title="新增报表" :width="640" :append-to-body="true"
    :close-disabled="!canCancel" @update:model-value="open => {if (!open) cancel()}">
    <DisplayAlert v-if="hint" alert-type="error" :closable="false" :title="hint" />
    <DisplayAlert v-if="blocked" alert-type="warning" :closable="false" :title="blocked" />
    <RendererForm :data-view-key="infoKey" :context-row-id="infoId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
      <FieldText field="RptName" label="报表名称" :readonly="locked" />
      <FieldSelect field="modid" label="应用系统" :option-data-view-key="appKey" :filterable="true" :readonly="locked" />
      <FieldTextarea field="RptDesc" label="报表描述" :readonly="locked" />
    </RendererForm>
    <RendererForm :data-view-key="reportKey" :context-row-id="reportId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
      <FieldCheckbox field="isMerg" label="合并报表" true-value="1" false-value="0" :readonly="locked" />
      <FieldCheckbox field="isDashboards" label="看板" true-value="1" false-value="0" :readonly="locked || merged" />
    </RendererForm>
    <template #footer>
      <RendererButton label="取消" :disabled="!canCancel" @click="cancel" />
      <RendererButton v-if="ownUnknown && !abandonInterrupted" label="放弃核验并返回" :disabled="busy || !current" @click="abandon" />
      <RendererButton :label="saveLabel" button-type="primary" :disabled="busy || abandonInterrupted || foreignUnknown || recoveryEnded || missingReceipt || !current"
        @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef} from 'vue'
import {ElMessageBox} from 'element-plus'
import {DataViewSaveNotAppliedError, type DataRow, type DataView} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {isOn, syncAppName, textOf} from './report-format'
const {PAGE_RUNTIME, RendererDialog, RendererForm, RendererButton, FieldText, FieldTextarea, FieldSelect, FieldCheckbox, DisplayAlert, useSparkComponent} = Components
const props = defineProps<{infoKey: string; reportKey: string; appKey: string; infoId: string | number; reportId: string | number}>()
const emit = defineEmits<{close: [reason?: 'abandoned']}>()
const {sparkConsume} = useSparkComponent({type: 'report-create-dialog'})
const busy = ref(false), abandonInterrupted = ref(false), hint = ref(''), revision = ref(0), failure = shallowRef<Error>()
const confirmed = shallowRef<ReadonlySet<DataView>>(new Set())
const runtime = sparkConsume(PAGE_RUNTIME)

function view(key: string): DataView {
  const found = runtime?.resolveView(key)
  if (!found) throw new Error(`新增报表缺少正式视图 ${key}`)
  return found
}
const info = view(props.infoKey), report = view(props.reportKey), apps = view(props.appKey)
const owner = info.dataSet
if (!runtime || !owner || report.dataSet !== owner || apps.dataSet !== owner) throw new Error('新增报表缺少同一DataSet')
const dataSet = owner, page = runtime
const binding = {infoKey: props.infoKey, reportKey: props.reportKey, appKey: props.appKey, infoId: props.infoId, reportId: props.reportId}
const targets = [{view: info, id: binding.infoId}, {view: report, id: binding.reportId}]
const contexts = targets.map(target => JSON.stringify(target.view.queryContext))
let active = true
const isCurrent = () => active && !page.destroyed && !dataSet.destroyed && sparkConsume(PAGE_RUNTIME) === page
    && props.infoKey === binding.infoKey && props.reportKey === binding.reportKey && props.appKey === binding.appKey
    && props.infoId === binding.infoId && props.reportId === binding.reportId
    && page.resolveView(binding.infoKey) === info && page.resolveView(binding.reportKey) === report
    && page.resolveView(binding.appKey) === apps
    && targets.every((target, index) => JSON.stringify(target.view.queryContext) === contexts[index])
const current = computed(() => {void revision.value; return isCurrent()})
const unknown = computed(() => {void revision.value; return targets.some(target => target.view.hasUnconfirmedSave)})
const ownUnknown = computed(() => unknown.value && failure.value !== undefined
  && targets.filter(target => target.view.hasUnconfirmedSave).every(target => target.view.hasUnconfirmedSaveFor([target.id], failure.value)))
const foreignUnknown = computed(() => unknown.value && !ownUnknown.value)
const recoveryEnded = computed(() => failure.value !== undefined && !unknown.value)
const missingReceipt = computed(() => {void revision.value; return targets.some(target =>
  !confirmed.value.has(target.view) && !target.view.hasUnconfirmedSave && !target.view.dirtyTracking.isPendingCreate(target.id))})
const permissionsPending = computed(() => {void revision.value; return targets.some(target =>
  confirmed.value.has(target.view) && target.view.hasPendingSavedRowPermissions)})
const canCancel = computed(() => current.value && !busy.value && !abandonInterrupted.value && !unknown.value && !recoveryEnded.value
  && !missingReceipt.value && confirmed.value.size === 0)
const locked = computed(() => busy.value || abandonInterrupted.value || unknown.value || recoveryEnded.value || missingReceipt.value
  || confirmed.value.size > 0 || !current.value)
const blocked = computed(() => !current.value ? '原报表编辑身份已变化，不能处理当前草稿。'
  : abandonInterrupted.value ? '放弃核验未完整执行，本窗不能再次提交或丢弃。'
  : foreignUnknown.value ? '存在其他操作的待核验提交，请由原操作处理；本窗保留草稿。'
  : recoveryEnded.value ? '原提交捕获已结束，本窗不能重新提交或丢弃，请先核对正式结果。'
  : missingReceipt.value ? '部分记录缺少本窗确认回执，请先核对正式结果，不能重发或丢弃。' : '')
const saveLabel = computed(() => ownUnknown.value ? '核验原保存结果' : permissionsPending.value ? '回读已保存权限'
  : confirmed.value.size > 0 ? '保存剩余记录' : '确定')
const editing = (target: DataView, id: string | number): Readonly<DataRow> | undefined => {
  void revision.value
  return target.getEditingRow(id) ?? undefined
}
const merged = computed(() => isOn(editing(report, binding.reportId)?.['isMerg']))
const changed = () => {revision.value++}
const stop = dataSet.onAnyViewChange({rowsChanged: changed, editingChanged: changed, editingDiscarded: changed,
  mutatingChanged: changed, requestStateChanged: changed, editingFieldChanged: (table, viewId, event) => {
  revision.value++
  if (table === report.tableName && viewId === report.viewId && event.rowId === binding.reportId && event.field === 'isMerg' && isOn(event.nextValue)) {
    report.updateEditingValue(binding.reportId, 'isDashboards', '0')
  }
}})
onBeforeUnmount(() => {active = false; stop()})

function cancel(): void {
  if (!isCurrent() || !canCancel.value) return
  try {
    report.discardPendingChanges([binding.reportId])
    info.discardPendingChanges([binding.infoId])
    emit('close')
  } catch (cause) {hint.value = cause instanceof Error ? cause.message : String(cause)}
}
async function abandon(): Promise<void> {
  if (busy.value || abandonInterrupted.value || !isCurrent() || !ownUnknown.value) return
  const original = failure.value
  let pending: typeof targets = []
  busy.value = true
  try {
    try {
      await ElMessageBox.confirm(
        '本次新增可能已部分或全部生效。放弃核验不会撤销服务端记录，将丢弃本窗本地新增草稿；返回后请按报表及版本ID核对实际结果。',
        '放弃原提交核验', {type: 'warning', confirmButtonText: '放弃核验', cancelButtonText: '继续核验'},
      )
    } catch (cause) {
      if (cause === 'cancel' || cause === 'close') return
      throw cause
    }
    pending = targets.filter(target => target.view.hasUnconfirmedSave)
    if (!isCurrent() || !original || failure.value !== original || pending.length === 0
      || pending.some(target => !target.view.hasUnconfirmedSaveFor([target.id], original))) {
      throw new Error('原提交身份已变化，不能放弃核验')
    }
    if (targets.some(target => target.view.hasEditingChanges(target.id)
      || target.view.dirtyTracking.hasPendingChanges(target.id) && !target.view.dirtyTracking.isPendingCreate(target.id))) {
      throw new Error('原记录还有其他待处理修改，不能自动丢弃')
    }
    for (const target of targets) {
      if (!target.view.abandonUnconfirmedSave()) throw new Error('原来源不支持放弃核验')
    }
    for (const target of [...targets].reverse()) {
      if (target.view.dirtyTracking.isPendingCreate(target.id)) target.view.discardPendingChanges([target.id])
    }
    failure.value = undefined
    emit('close', 'abandoned')
  } catch (cause) {
    if (active) {
      const error = cause instanceof Error ? cause.message : String(cause)
      if (pending.some(target => !target.view.hasUnconfirmedSave)) {
        abandonInterrupted.value = true
        hint.value = `放弃核验未完整执行且原核验状态已改变；请保留本窗并人工核对报表ID ${String(binding.infoId)}、版本ID ${String(binding.reportId)}，勿重新提交。原因：${error}`
      } else hint.value = error
    }
  } finally {
    if (active) {busy.value = false; revision.value++}
  }
}
function finishIfConfirmed(): boolean {
  if (!isCurrent()) return false
  if (!targets.every(target => confirmed.value.has(target.view)
    && !target.view.hasUnconfirmedSave && !target.view.dirtyTracking.hasPendingChanges(target.id)
    && !target.view.hasEditingChanges(target.id))) {
    hint.value = '本轮结果已处理，但仍有记录待保存或缺少确认回执'
    return false
  }
  if (permissionsPending.value) {
    hint.value = '新增已确认，尚需回读新增记录的数据权限'
    return false
  }
  emit('close')
  return true
}
async function submit(): Promise<void> {
  if (busy.value || abandonInterrupted.value || foreignUnknown.value || recoveryEnded.value || missingReceipt.value || !isCurrent()) return
  hint.value = ''
  const recovering = ownUnknown.value
  busy.value = true
  try {
    if (permissionsPending.value) {
      for (const target of targets) if (confirmed.value.has(target.view) && target.view.hasPendingSavedRowPermissions) {
        await target.view.refreshSavedRowPermissions()
        if (!isCurrent()) return
      }
      finishIfConfirmed()
      return
    }
    if (!recovering && confirmed.value.size === 0) {
      const row = editing(info, binding.infoId)
      if (!row || !textOf(row, 'RptName')) {hint.value = '请填写报表名称'; return}
      const invalid = syncAppName({info, apps, id: binding.infoId, row})
      if (invalid) {hint.value = invalid; return}
    }
    const result = await dataSet.saveChanges({views: targets.map(target =>
      ({tableName: target.view.tableName, viewId: target.view.viewId, ids: [target.id]}))})
    if (!isCurrent()) return
    if (!result.data) throw new Error(result.error?.message ?? result.message ?? '新增结果缺少回执')
    const next = new Set(confirmed.value)
    for (const target of targets) {
      const receipt = result.data.viewResults.find(item => item.tableName === target.view.tableName && item.viewId === target.view.viewId)
      if (receipt?.createdCount === 1 && receipt.failedCount === 0 && receipt.failedEditingRows === 0) next.add(target.view)
    }
    confirmed.value = next
    if (!targets.some(target => target.view.hasUnconfirmedSave)) failure.value = undefined
    if (!result.success) throw new Error(result.error?.message ?? result.message ?? '新增结果未全部确认')
    finishIfConfirmed()
  } catch (cause) {
    if (!active) return
    if (cause instanceof Error && targets.some(target => target.view.hasUnconfirmedSaveFor([target.id], cause))) failure.value = cause
    else if (recovering && cause instanceof DataViewSaveNotAppliedError && !unknown.value) failure.value = undefined
    hint.value = cause instanceof Error ? cause.message : String(cause)
    if (unknown.value) hint.value += ownUnknown.value ? '；请核验原保存结果' : '；存在其他待核验提交，不能接管'
  } finally {
    if (active) {busy.value = false; revision.value++}
  }
}
</script>
