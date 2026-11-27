<!--
@module app:views/features/application/enterprise-regist-manager/ui/enterprise-audit-dialog
职责：只读展示入驻申请的账号与企业信息；待审核企业可审核通过（企业初始化命令）或不通过（审核状态改为未通过）。
边界：通过只经原命令视图提交并以回读确认，未知结果保留核验、不重发；不通过经原列表DataView的记录编辑保存。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="listKey" :title="title" :width="960" :append-to-body="true"
    :close-disabled="busy || approving || ownUnconfirmed" @update:model-value="close">
    <p v-if="error || hint" role="alert">{{ error || hint }}</p>
    <p v-if="!current" role="status">原企业记录已变化，请关闭后刷新列表。</p>
    <p v-if="pendingCommandId" role="alert">企业初始化已提交，后台完成前结果未知；不能重新发送，可稍后核验。</p>
    <RendererSection title="账号信息" :bordered="true" :grid-columns="1">
      <RendererForm :data-view-key="listKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="4">
        <FieldImage field="personUrl" label="账号图标" :readonly="true" />
        <FieldText field="entadminAccount" label="企业账号" :readonly="true" />
        <FieldText field="contact_person" label="联系人" :readonly="true" />
        <FieldText field="entInfoUserPhone" label="联系号" :readonly="true" />
        <FieldText field="entMailbox" label="邮箱" :readonly="true" />
        <FieldText field="createtime" label="创建时间" :readonly="true" />
      </RendererForm>
    </RendererSection>
    <RendererSection title="企业信息" :bordered="true" :grid-columns="1">
      <RendererForm :data-view-key="listKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="4">
        <FieldImage field="EnterpriseIcon" label="企业图标" :readonly="true" />
        <FieldText field="CName" label="企业中文名" :readonly="true" />
        <FieldText field="ShortCName" label="企业中文简称" :readonly="true" />
        <FieldText field="Name" label="企业英文名" :readonly="true" />
        <FieldText field="ShortName" label="企业英文简称" :readonly="true" />
        <FieldText field="entBusReg" label="营业执照注册号" :readonly="true" />
        <FieldText field="entOrgCer" label="机构代码证号" :readonly="true" />
        <FieldText field="domain_name" label="平台地址" :readonly="true" />
        <FieldImage field="entScanBusLicen" label="营业执照扫描件" :readonly="true" />
        <FieldImage field="entScanOrgCer" label="机构代码证扫描件" :readonly="true" />
      </RendererForm>
    </RendererSection>
    <template #footer>
      <RendererButton label="关闭" :disabled="busy || approving || ownUnconfirmed" @click="close" />
      <template v-if="pendingCommandId">
        <RendererButton label="核验初始化结果" button-type="primary" :disabled="approving" @click="verifyApproval" />
      </template>
      <template v-else-if="ownUnconfirmed">
        <RendererButton label="核验原保存结果" button-type="primary" :disabled="busy" @click="save" />
      </template>
      <template v-else-if="actionable && !approvalConfirmed">
        <RendererButton label="通过" button-type="success" :disabled="busy || approving || !current || foreignRecovery || recoveryEnded" @click="approve" />
        <RendererButton label="不通过" button-type="danger" :disabled="busy || approving || !current || foreignRecovery || recoveryEnded" @click="reject" />
      </template>
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, ref, toRaw} from 'vue'
import {submitDataSetCommand} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import type {DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
const {PAGE_RUNTIME, RendererDialog, RendererSection, RendererForm, RendererButton, FieldText, FieldImage, useSparkComponent, useDataViewRecordEditing, consumeRequiredPageService} = Components
const props = defineProps<{listKey: string; commandKey: string; recordId: string; title: string}>()
const emit = defineEmits<{close: [result: DataViewRecordEditingFinish]}>()
const {sparkConsume} = useSparkComponent({type: 'enterprise-audit-dialog'})
const pageService = consumeRequiredPageService(sparkConsume, 'enterprise-audit-dialog')

const runtime = () => sparkConsume(PAGE_RUNTIME)
const {view, originalRow, busy, current, error, ownUnconfirmed, foreignRecovery, recoveryEnded, save, cancel} = useDataViewRecordEditing({
  mode: 'edit', runtime, dataViewKey: () => props.listKey, recordId: () => props.recordId, editableFields: ['CheckState'],
  onFinish: result => emit('close', result),
})
const command = runtime()?.resolveView(props.commandKey)
const approving = ref(false), approvalConfirmed = ref(false), hint = ref(''), revision = ref(0)
const pendingCommandId = computed(() => {
  revision.value
  const row = command?.rows.find(item => item['enterpriseId'] === props.recordId && command.hasUnconfirmedSaveFor([String(item['commandId'])]))
  return row ? String(row['commandId']) : ''
})
const actionable = computed(() => String(originalRow['CheckState']) === '0' && view.fieldAccess(originalRow, 'CheckState').write === 'allowed')
const displayName = computed(() => props.title.replace(/^企业审核 - /u, ''))

function close(): void {
  if (busy.value || approving.value || ownUnconfirmed.value) return
  cancel()
}
async function confirmed(message: string, title: string): Promise<boolean> {
  try {
    if (!await pageService.showConfirm(message, title, {type: 'warning', confirmText: '确定', cancelText: '取消'})) return false
    return true
  } catch {
    return false
  }
}
/** 确认与实际派发必须基于打开时的同一企业行。 */
async function confirmAudit(message: string, title: string): Promise<(() => void) | undefined> {
  const read = view.captureReadRow(toRaw(originalRow), [view.primaryKey, 'CheckState'])
  const assertCurrent = () => {
    if (!current.value || !actionable.value) throw new Error('原企业审核入口已失效')
    read()
  }
  assertCurrent()
  if (!await confirmed(message, title)) return undefined
  assertCurrent()
  return assertCurrent
}
async function showConfirmedApproval(): Promise<void> {
  approvalConfirmed.value = true
  pageService.showMessage('企业初始化已完成，审核状态为已入驻', 'success')
  try {
    const result = await view.requestRefresh()
    if (result.refreshStatus !== 'read') throw Error(result.message ?? '企业列表未完成读取')
    cancel()
  } catch (cause) {
    hint.value = `审核已确认，列表刷新失败：${cause instanceof Error ? cause.message : String(cause)}`
  }
}
async function approve(): Promise<void> {
  hint.value = ''
  if (!command || approvalConfirmed.value || approving.value || busy.value) return
  approving.value = true
  try {
    const assertOriginal = await confirmAudit(`确定要审核通过"${displayName.value}"吗？通过后将初始化企业，不能撤销。`, '审核通过确认')
    if (!assertOriginal) return
    await submitDataSetCommand(command, {enterpriseId: props.recordId}, {assertCurrent: () => {
      assertOriginal()
      if (runtime()?.resolveView(props.commandKey) !== command) throw Error('原企业审核入口已失效')
    }})
    await showConfirmedApproval()
  } catch (cause) {
    hint.value = `审核通过未确认：${cause instanceof Error ? cause.message : String(cause)}`
  } finally {
    approving.value = false
    revision.value++
  }
}
async function verifyApproval(): Promise<void> {
  const id = pendingCommandId.value
  const dataSet = command?.dataSet
  const batchId = dataSet?.saveJournal.batchId
  if (!id || !command || !dataSet || !batchId || approving.value) return
  hint.value = ''
  approving.value = true
  try {
    const result = await dataSet.verifySaveJournalAndRead({batchId, receiptViews: [command], readbackViews: []})
    const receipt = result.journal.views.find(item => item.tableName === command.tableName && item.viewId === command.viewId
      && item.ids.length === 1 && item.ids[0] === id)
    if (receipt?.state !== 'applied') throw Error(receipt?.originalError?.message ?? '原企业初始化仍未确认')
    if (runtime()?.resolveView(props.commandKey) === command) await showConfirmedApproval()
  } catch (cause) {
    hint.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    approving.value = false
    revision.value++
  }
}
async function reject(): Promise<void> {
  if (approving.value || busy.value) return
  hint.value = ''
  approving.value = true
  try {
    if (!await confirmAudit(`确定要审核不通过"${displayName.value}"吗？`, '审核不通过确认')) return
    const original = originalRow['CheckState']
    view.updateEditingValue(props.recordId, 'CheckState', typeof original === 'number' ? 2 : '2')
    await save()
  } catch (cause) {
    hint.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    approving.value = false
  }
}
</script>
