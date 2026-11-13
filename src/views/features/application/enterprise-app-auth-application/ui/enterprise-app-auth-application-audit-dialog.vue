<!--
@module app:views/features/application/enterprise-app-auth-application/ui/enterprise-app-auth-application-audit-dialog
职责：审核一条待审批的应用授权申请：只读展示申请信息，填写拒绝原因，通过写 INITIALIZING、不通过写 REJECTED。
边界：申请信息绑定列表视图的同一记录；审批只在 audit 视图（常驻范围为本记录）编辑 auth_status、operator 与可选的 review_comment，
  按记录提交。通过会触发后端授权初始化，不可撤回；取消撤销本地编辑。
-->
<template>
  <RendererDialog :model-value="true" title="申请审核" :width="640" :append-to-body="true" :close-disabled="busy" @update:model-value="close">
    <p v-if="loading" role="status">正在读取申请…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <RendererForm :data-view-key="listKey" :context-row-id="recordId" :children="details" :auto-columns="false"
        :show-data-view-meta="false" :grid-columns="2" />
      <RendererForm :data-view-key="auditKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <FieldTextarea field="review_comment" label="拒绝原因（不通过时填写）" :rows="3" :maxlength="500"
          :show-word-limit="true" placeholder="可选，拒绝时将写入审批意见" />
      </RendererForm>
    </template>
    <template #footer>
      <RendererButton label="取消" :disabled="busy" @click="close" />
      <RendererButton label="通过" button-type="success" icon="Select" :disabled="!ready || busy || unconfirmed" @click="decide('INITIALIZING')" />
      <RendererButton label="不通过" button-type="danger" icon="CloseBold" :disabled="!ready || busy || unconfirmed" @click="decide('REJECTED')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {ElMessage} from 'element-plus'
import {buildDataViewKey, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {APP_AUTH_SCENARIOS, commitAppAuthRecord, formatRequestedAt, readAppAuthSession} from '../model/enterprise-app-auth-application-model'
const {PAGE_RUNTIME, RendererButton, RendererDialog, RendererForm, FieldTextarea, useSparkComponent} = Components

const props = defineProps<{recordId: string | number}>()
const emit = defineEmits<{close: [], decided: []}>()
const {sparkConsume} = useSparkComponent({type: 'enterprise-app-auth-application-audit-dialog'})
const scenarioId = APP_AUTH_SCENARIOS.review
const listKey = buildDataViewKey('enterprise_app_auth', 'default', scenarioId)
const auditKey = buildDataViewKey('enterprise_app_auth', 'audit', scenarioId)
const readonly = {readonly: true, sortable: false}
const details: SparkNode[] = [
  {type: 'r-select', props: {...readonly, field: 'enterprise_id', label: '申请企业', unmatchedText: '-',
    optionDataViewKey: buildDataViewKey('Base_Enterprise_Info', 'default', scenarioId), optionValueField: 'rowid', optionLabelField: 'CName'}},
  {type: 'r-text', props: {...readonly, field: 'ent_shortname', label: '企业简称', emptyText: '-', displayFallbackFields: ['enterprise_id']}},
  {type: 'r-select', props: {...readonly, field: 'app_id', label: '申请应用', unmatchedText: '-',
    optionDataViewKey: buildDataViewKey('Base_AppSystemList', 'default', scenarioId), optionValueField: 'rowid', optionLabelField: 'displayName'}},
  {type: 'r-text', props: {...readonly, field: 'app_id', label: '应用ID', emptyText: '-'}},
  {type: 'r-select', props: {...readonly, field: 'source_ent', label: '来源企业', unmatchedText: '-',
    optionDataViewKey: buildDataViewKey('Base_Enterprise_Info', 'byShortName', scenarioId), optionValueField: 'ShortName', optionLabelField: 'CName'}},
  {type: 'r-text', props: {...readonly, field: 'source_ent', label: '来源企业简称', emptyText: '-'}},
  {type: 'r-text', props: {...readonly, field: 'requested_at', label: '申请时间', emptyText: '-', displayFormatter: formatRequestedAt}},
  {type: 'r-text', props: {...readonly, field: 'review_comment', label: '申请说明', emptyText: '-'}},
]

function resolve(key: string): DataView {
  const view = sparkConsume(PAGE_RUNTIME)?.resolveView(key)
  if (!view) throw new Error(`申请审核缺少数据视图 ${key}`)
  return view
}
const audit = resolve(auditKey)
const loading = ref(true), ready = ref(false), busy = ref(false), error = ref(''), revision = ref(0)
const bump = () => {revision.value++}
const events = ['rowsChanged', 'editingChanged', 'requestStateChanged'] as const
const unconfirmed = computed(() => {
  revision.value
  return audit.hasUnconfirmedSave
})
let originalComment: unknown

/** 打开时按本记录重读 audit 视图并确认唯一可写；拒绝原因从空白开始，申请说明原值留作回退。 */
onMounted(async () => {
  for (const event of events) audit.events.on(event, bump)
  try {
    if (audit.hasEditingChanges() || audit.dirtyTracking.hasPendingChanges() || audit.hasUnconfirmedSave) throw new Error('上一次审核尚未提交或取消')
    audit.queryContext = {...audit.queryContext, recordId: String(props.recordId)}
    await audit.refresh()
    if (audit.loadingError) throw audit.loadingError
    const row = audit.rows.length === 1 ? audit.rows[0] : undefined
    if (!row || audit.getPkKey(row) !== props.recordId) throw new Error('未读取到唯一的申请记录')
    if (audit.fieldAccess(row, 'auth_status').write !== 'allowed') throw new Error('无权审核该申请')
    originalComment = row['review_comment']
    audit.updateEditingValue(props.recordId, 'review_comment', '')
    ready.value = true
  } catch (cause) {
    error.value = `申请读取失败：${cause instanceof Error ? cause.message : String(cause)}`
  } finally {
    loading.value = false
  }
})
onBeforeUnmount(() => {
  for (const event of events) audit.events.off(event, bump)
})

function rejectComment(): string {
  const value = audit.getEditingRow(props.recordId)?.['review_comment']
  return typeof value === 'string' ? value.trim() : ''
}
async function decide(status: 'INITIALIZING' | 'REJECTED'): Promise<void> {
  if (busy.value || !ready.value) return
  busy.value = true; error.value = ''
  try {
    const {userId} = readAppAuthSession(), comment = status === 'REJECTED' ? rejectComment() : ''
    audit.updateEditingValue(props.recordId, 'review_comment', comment || originalComment)
    audit.updateEditingValue(props.recordId, 'auth_status', status)
    audit.updateEditingValue(props.recordId, 'operator', userId)
    await commitAppAuthRecord(audit, props.recordId)
    ElMessage.success(status === 'INITIALIZING' ? '已批准，正在初始化…' : '已拒绝申请')
    emit('decided')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    if (!audit.hasUnconfirmedSaveFor([props.recordId])) audit.updateEditingValue(props.recordId, 'review_comment', '')
  } finally {
    busy.value = false; bump()
  }
}
/** 结果未知时关闭只保留待核对状态；其余撤销本记录的本地编辑。 */
function close(): void {
  if (busy.value) return
  if (!audit.hasUnconfirmedSaveFor([props.recordId])) audit.discardPendingChanges([props.recordId])
  emit('close')
}
</script>
