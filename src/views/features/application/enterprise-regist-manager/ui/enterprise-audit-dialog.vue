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
      <template v-else-if="actionable">
        <RendererButton label="通过" button-type="success" :disabled="busy || approving || !current || foreignRecovery || recoveryEnded" @click="approve" />
        <RendererButton label="不通过" button-type="danger" :disabled="busy || approving || !current || foreignRecovery || recoveryEnded" @click="reject" />
      </template>
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
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
const approving = ref(false), hint = ref(''), revision = ref(0)
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
async function submitCommand(id: string): Promise<void> {
  if (!command?.dataSet) throw new Error('入驻管理缺少企业初始化命令视图')
  await command.dataSet.saveChanges({views: [{tableName: command.tableName, viewId: command.viewId, ids: [id]}]})
}
async function approve(): Promise<void> {
  hint.value = ''
  if (!command || !await confirmed(`确定要审核通过"${displayName.value}"吗？通过后将初始化企业，不能撤销。`, '审核通过确认')) return
  approving.value = true
  let id = ''
  try {
    const added = command.getPkKey(await command.addRow({enterpriseId: props.recordId}))
    if (added === undefined) throw new Error('企业初始化命令缺少原生身份')
    id = String(added)
    await submitCommand(id)
    pageService.showMessage('企业初始化已完成，审核状态为已入驻', 'success')
    await view.refresh()
    cancel()
  } catch (cause) {
    if (id && !command.hasUnconfirmedSaveFor([id])) command.discardPendingChanges([id])
    hint.value = `审核通过未确认：${cause instanceof Error ? cause.message : String(cause)}`
  } finally {
    approving.value = false
    revision.value++
  }
}
async function verifyApproval(): Promise<void> {
  const id = pendingCommandId.value
  if (!id) return
  hint.value = ''
  approving.value = true
  try {
    await submitCommand(id)
    pageService.showMessage('企业初始化已完成，审核状态为已入驻', 'success')
    await view.refresh()
    cancel()
  } catch (cause) {
    hint.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    approving.value = false
    revision.value++
  }
}
async function reject(): Promise<void> {
  hint.value = ''
  if (!await confirmed(`确定要审核不通过"${displayName.value}"吗？`, '审核不通过确认')) return
  const original = originalRow['CheckState']
  view.updateEditingValue(props.recordId, 'CheckState', typeof original === 'number' ? 2 : '2')
  await save()
}
</script>
