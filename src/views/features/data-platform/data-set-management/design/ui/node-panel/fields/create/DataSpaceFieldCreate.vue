<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/fields/create/DataSpaceFieldCreate
职责：标准组件绑定计算字段输入视图，调用原新增流程。
边界：不查询、不授权、不保存文件，不复制创建草稿。
AI用途：计算字段新增、取消及未知结果核验。
-->
<template>
  <section aria-label="新增计算字段">
    <RendererButton v-if="state && !workspaceActions" :data-view-key="state.dataViewKey" data-action="create-field" label="添加计算字段" button-type="primary"
      :disabled="disabled || busy || !state.canAdd || state.pending" @click="begin" />
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <RendererDialog v-if="state" :model-value="state.pending" :data-view-key="state.dataViewKey" data-member="currentRow"
      :title="workspaceActions ? '添加计算字段' : '新增计算字段'" :grid-columns="1" :close-on-click-modal="false" :show-close="workspaceActions" :close-on-press-escape="workspaceActions"
      :close-disabled="locked || dialogOpen" @update:model-value="visible => {if (!visible) cancel()}"
      v-bind="workspaceActions ? {width: '420px'} : {}" :append-to-body="workspaceActions" :destroy-on-close="workspaceActions"
      body-class="data-space-field-create" :footer="{class: 'data-space-field-create-footer'}">
      <p v-if="!workspaceActions">在当前模型增加计算字段定义。保存后可在模型数据视图中使用。</p>
      <RendererForm :data-view-key="state.dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1"
        :grid-gap="0" v-bind="workspaceActions ? {labelWidth: '68px'} : {}" :form-props="{disabled: locked, labelPosition: workspaceActions ? 'right' : 'top'}">
        <template v-if="workspaceActions">
          <FieldText field="Name" label="名称" :maxlength="100" />
          <FieldTextarea field="description" label="描述" :rows="4" :maxlength="200" />
        </template>
        <template v-else>
        <FieldText field="Name" label="字段名称" />
        <FieldText field="AsName" label="输出名称" />
        <FieldText field="description" label="字段说明" />
        <FieldSelect field="IsOutput" label="参与输出" :clearable="false" :options="[{label: '输出', value: 1}, {label: '不输出', value: 0}]" />
        <FieldText field="ValueFun" label="值函数原文" />
        <FieldValueFunction v-if="functionState" :data-view-key="state.dataViewKey" data-member="currentRow" field="ValueFun" label="值函数"
          :function-context="functionState.context" :readonly="locked" :on-dialog-visible-change="value => dialogOpen = value" />
        </template>
      </RendererForm>
      <p v-if="functionState?.warning" role="status">{{ functionState.warning }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="state.verification" role="status">{{ state.verification }}</p>
      <p v-if="['unknown', 'readback', 'different'].includes(state.status)" role="alert">新增尚未完全确认，请先核验；不会重复提交。</p>
      <p v-else-if="state.status === 'saving'" role="status">正在保存新增字段…</p>
      <template #footer>
        <RendererButton :data-view-key="state.dataViewKey" data-action="cancel-field-create" label="取消" :disabled="locked || dialogOpen" @click="cancel" />
        <RendererButton :data-view-key="state.dataViewKey" data-action="save-field-create" :label="workspaceActions ? '确定' : '保存计算字段'" button-type="primary" :disabled="locked || dialogOpen" @click="run('save')" />
        <RendererButton v-if="['unknown', 'readback', 'different'].includes(state.status)" :data-view-key="state.dataViewKey"
          data-action="verify-field-create" label="核验新增结果" :disabled="busy || disabled || dialogOpen" @click="run('verify')" />
        <RendererButton v-if="state.canAbandonNotApplied" :data-view-key="state.dataViewKey" data-action="abandon-field-create"
          label="结束未应用的新增" :disabled="busy || disabled || dialogOpen" @click="run('abandon')" />
        <RendererButton v-if="state.canDiscardLocalChanges" :data-view-key="state.dataViewKey" data-action="discard-field-create-changes"
          label="放弃后续字段修改并核验" :disabled="busy || disabled || dialogOpen" @click="run('discard')" />
      </template>
    </RendererDialog>
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {FieldText, FieldTextarea, FieldSelect, FieldValueFunction, RendererButton, RendererDialog, RendererForm} from '@spark-appworks/spark-component'
import type {SparkNode} from '@spark-appworks/spark-data'
import type {DataSpaceFieldCreateProps} from './DataSpaceFieldCreate.props'
const props = defineProps<DataSpaceFieldCreateProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]; created: [id: string]}>()
const fieldViewId = props.workspaceActions ? 'modelFields' : 'default'
const owner = props.session.getFieldCreate(props.modelId, fieldViewId)
const busy = ref(false), tick = ref(0), error = ref(''), message = ref(''), dialogOpen = ref(false)
let active = true
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const state = computed(() => {props.revision; tick.value; try {return owner.getState()} catch {return null}})
const locked = computed(() => busy.value || props.disabled || state.value?.status !== 'editing')
const toolbarAction = computed<SparkNode | undefined>(() => {
  const current = state.value
  if (!props.workspaceActions || !current) return undefined
  return {type: 'r-button', id: 'field-create-workspace-action', props: {
    'data-action': 'create-field', dataViewKey: current.dataViewKey, label: '添加计算字段', buttonType: 'primary',
    disabled: props.disabled || busy.value || !current.canAdd || current.pending, onClick: begin,
  }}
})
const functionState = computed(() => {props.revision; tick.value; try {return state.value?.pending ? owner.readValueFunction() : null} catch {return null}})
watch(() => busy.value || dialogOpen.value || state.value?.pending === true, value => emit('pending', value), {immediate: true, flush: 'sync'})
function changed(): void {tick.value++; emit('changed')}
function begin(): void {
  if (props.disabled || busy.value || !state.value?.canAdd) return
  try {owner.begin(); error.value = ''; message.value = ''; changed()} catch (cause) {error.value = describe(cause)}
}
function cancel(): void {
  if (locked.value || dialogOpen.value) return
  try {owner.cancel(); error.value = ''; changed()} catch (cause) {error.value = describe(cause)}
}
async function run(action: 'save' | 'verify' | 'abandon' | 'discard'): Promise<void> {
  if (props.disabled || busy.value || dialogOpen.value) return
  busy.value = true; error.value = ''
  try {
    const id = action === 'save' ? props.workspaceActions ? await owner.stage() : await owner.save()
      : action === 'verify' ? await owner.verify() : action === 'abandon' ? (owner.abandonNotApplied(), null) : await owner.discardLocalChangesAndVerify()
    if (active && id) {message.value = action === 'discard' ? '后续字段修改已放弃并精确核验' : props.workspaceActions ? '' : '计算字段已保存并精确回读'; emit('created', id)}
    else if (active && action === 'abandon') message.value = '本次新增意图已结束，未再次提交'
  } catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
function getToolbarAction(): SparkNode | undefined {return toolbarAction.value}
defineExpose({getToolbarAction})
onBeforeUnmount(() => {active = false; props.session.releaseFieldCreate(props.modelId, fieldViewId); emit('pending', false)})
</script>
<style scoped>
:global(.data-space-field-create-footer) {display:flex; justify-content:flex-end; gap:12px;}
:global(.data-space-field-create-footer .el-button + .el-button) {margin-left:0;}
:global(.data-space-field-create .el-form-item) {margin-bottom:18px;}
</style>
