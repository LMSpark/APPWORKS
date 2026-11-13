<!--
@module app:views/features/application/enterprise-regist-manager/ui/enterprise-password-dialog
职责：为入驻企业修改超级管理员密码（不少于6位，二次确认）。
边界：新密码写入原列表DataView本行的super_admin_pwd并由公共记录编辑保存；列表不读取原密码，确认值只在本页输入表中，不提交。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="listKey" :title="title" :width="480" :append-to-body="true"
    :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <p v-if="error || hint" role="alert">{{ error || hint }}</p>
    <p v-if="!current" role="status">原企业记录已变化，请关闭并保留原修改。</p>
    <RendererForm :data-view-key="listKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="super_admin_pwd" label="新密码" placeholder="请输入新密码" :show-password="true" :readonly="locked" />
    </RendererForm>
    <RendererForm :data-view-key="confirmKey" :data-source="confirmView" context-data-member="currentRow"
      :auto-columns="false" :show-data-view-meta="false">
      <FieldText :data-view-key="confirmKey" data-member="currentRow" data-field="confirmPassword" label="确认密码"
        placeholder="请再次输入新密码" :show-password="true" :readonly="locked" />
    </RendererForm>
    <template #footer>
      <RendererButton :label="foreignRecovery || recoveryEnded || hasStaged ? '关闭并保留修改' : '取消'" :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton :label="ownUnconfirmed ? '核验原保存结果' : '确认修改'" button-type="primary"
        :disabled="busy || foreignRecovery || recoveryEnded || !current && !ownUnconfirmed" @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {onBeforeUnmount, ref} from 'vue'
import {ElMessage} from 'element-plus'
import {buildDataViewKey, ensureDataSetStaticInputTable} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import type {DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
const {PAGE_RUNTIME, RendererDialog, RendererForm, RendererButton, FieldText, useSparkComponent, useDataViewRecordEditing} = Components
const props = defineProps<{listKey: string; recordId: string; title: string}>()
const emit = defineEmits<{close: [result: DataViewRecordEditingFinish]}>()
const {sparkConsume} = useSparkComponent({type: 'enterprise-password-dialog'})
const {view, dataSet, row, busy, current, locked, error, ownUnconfirmed, foreignRecovery, recoveryEnded, hasStaged, save, cancel} = useDataViewRecordEditing({
  mode: 'edit', runtime: () => sparkConsume(PAGE_RUNTIME), dataViewKey: () => props.listKey, recordId: () => props.recordId,
  editableFields: ['super_admin_pwd'], onFinish: result => {
    if (result === 'saved') ElMessage.success('密码修改成功')
    emit('close', result)
  },
})
const confirmTable = 'EnterprisePasswordConfirmation'
ensureDataSetStaticInputTable(dataSet, confirmTable, [{name: 'inputId', primary: true}, {name: 'confirmPassword', label: '确认密码'}])
const confirmView = dataSet.getView(confirmTable, 'default')
if (!confirmView) throw new Error('密码确认输入视图未装配')
const confirmKey = buildDataViewKey(confirmTable, 'default', dataSet.scenarioId)
confirmView.commitMode = 'staged'
resetConfirmation()
confirmView.setCurrentRowById(props.recordId)
const hint = ref('')

function resetConfirmation(): void {
  if (confirmView?.rows.some(item => confirmView.getPkKey(item) === props.recordId)) {
    confirmView.updateEditingValue(props.recordId, 'confirmPassword', '')
  } else {
    confirmView?.appendRow({inputId: props.recordId, confirmPassword: ''})
  }
}
function confirmation(): unknown {
  const source = confirmView?.rows.find(item => confirmView.getPkKey(item) === props.recordId)
  return (confirmView?.getEditingRow(props.recordId) ?? source)?.['confirmPassword']
}
async function submit(): Promise<void> {
  hint.value = ''
  if (!ownUnconfirmed.value) {
    if (view.fieldAccess(view.rows.find(item => view.getPkKey(item) === props.recordId) ?? null, 'super_admin_pwd').write !== 'allowed') {
      hint.value = '当前企业的超级管理员密码不可修改'
      return
    }
    const password = row.value?.['super_admin_pwd']
    if (typeof password !== 'string' || !password.trim()) { hint.value = '请输入新密码'; return }
    if (password !== password.trim()) { hint.value = '密码首尾不能包含空格'; return }
    if (password.length < 6) { hint.value = '密码长度不能少于 6 位'; return }
    if (confirmation() !== password) { hint.value = confirmation() ? '两次输入的密码不一致' : '请再次输入新密码'; return }
  }
  await save()
}
onBeforeUnmount(resetConfirmation)
</script>
