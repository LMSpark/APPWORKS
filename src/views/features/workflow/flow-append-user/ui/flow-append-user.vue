<!--
@module app:views/features/workflow/flow-append-user/ui/flow-append-user
职责：流程参与人追加（列表、加人、撤回）；嵌入办理页或对话框宿主。
边界：列表、选人、参数及命令统一走原SPARK data，未知结果保留原输入。
-->
<template>
  <RendererSection
    class="flow-append-user"
    :class="{'flow-append-user--embedded': embedded}"
    title="追加参与人"
    :bordered="!embedded"
    :grid-columns="1"
    :status="pageLoading ? '正在加载…' : ''"
    :error="pageError"
    :retryable="!!pageError && !pageLoading && !commandLocked"
    @retry="loadPageData"
  >
    <template #header-actions>
      <div class="flow-append-user__node" v-if="embedded">
        <span class="flow-append-user__node-label">节点</span>
        <span class="flow-append-user__node-value">{{ contextTitle }}</span>
      </div>
      <RendererButton label="添加办理人" button-type="primary" :disabled="pageLoading || !listViewKey || commandLocked" @click="openAddDialog" />
      <RendererButton v-if="revokeUnconfirmed" label="核验原命令结果" :disabled="revoking" @click="verifyOriginalRevoke" />
    </template>
  <p v-if="!embedded" class="flow-append-user__node-title">{{ contextTitle }}</p>
    <RendererTable v-if="listViewKey && !pageLoading && !pageError" :data-view-key="listViewKey"
      :children="listFields" :actions="listActions" :auto-columns="false" :show-pagination="false"
      :show-data-view-meta="false" :max-height="380" />

    <RendererDialog
      v-model="addDialog.visible"
      title="添加办理人"
      :width="560"
      :append-to-body="true"
      :close-on-click-modal="false"
      :destroy-on-close="true"
      :close-disabled="addCloseDisabled"
      @closed="resetAddDialog"
    >
      <div v-loading="addDialog.loading" class="flow-append-user__dialog-body">
        <DisplayAlert v-if="pageError" alert-type="error" :closable="false" :show-icon="true" :title="pageError" />
        <RendererForm v-if="parameterViewKey && candidateViewKey && !addDialog.loading" :data-view-key="parameterViewKey"
          :children="inputFields" :auto-columns="false" :show-data-view-meta="false" />
        <RendererForm v-if="optionsViewKey && !addDialog.loading" :data-view-key="optionsViewKey"
          :children="limitFields" :auto-columns="false" :show-data-view-meta="false" />
      </div>
      <template #footer>
        <RendererButton v-if="revokeUnconfirmed" label="核验原命令结果" :disabled="addDialog.submitting" @click="verifyOriginalRevoke" />
        <RendererButton label="取消" :disabled="addDialog.loading || addDialog.submitting || commandLocked" @click="resetAddDialog" />
        <RendererButton label="确认" button-type="primary" :disabled="addDialog.loading || addDialog.submitting || commandLocked" @click="submitAddDialog" />
      </template>
    </RendererDialog>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {DisplayAlert, RendererButton, RendererDialog, RendererForm, RendererSection, RendererTable, type RToolbarProps} from '@spark-appworks/spark-component'
import type {SparkNode} from '@spark-appworks/spark-data'
import type {FlowAppendUserContext} from '@/lowcode/resources/system/workflow/manage'
import {useFlowAppendUser} from './use-flow-append-user'

const props = withDefaults(defineProps<{
  context: FlowAppendUserContext
  embedded?: boolean
  userDirectoryViewKey?: string
  stepViewKey: string
}>(), {embedded: false})

const {
  embedded,
  contextTitle,
  pageLoading,
  pageError,
  listViewKey,
  stepStateViewKey,
  handleStateViewKey,
  revoking,
  commandLocked,
  revokeUnconfirmed,
  verifyOriginalRevoke,
  addDialog,
  parameterViewKey,
  optionsViewKey,
  candidateViewKey,
  addCloseDisabled,
  openAddDialog,
  submitAddDialog,
  resetAddDialog,
  revokeRecord,
  loadPageData,
} = useFlowAppendUser({
  context: () => props.context,
  stepViewKey: () => props.stepViewKey,
  embedded: () => props.embedded,
  ...(props.userDirectoryViewKey ? {userDirectoryViewKey: () => props.userDirectoryViewKey} : {}),
})

const inputFields = computed<SparkNode[]>(() => [{type: 'r-user-picker', props: {field: 'receiveUsers', label: '办理人', multiple: true, valueMode: 'array', optionDataViewKey: candidateViewKey.value, optionLabelField: 'name', optionValueField: 'value', disabled: commandLocked.value || addDialog.submitting}}])
const limitFields: SparkNode[] = [
  {type: 'r-number', props: {field: 'minNum', label: '最少人数', readonly: true}},
  {type: 'r-number', props: {field: 'maxNum', label: '最多人数', readonly: true}},
]
const listFields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'ReceiveUserName', label: '办理人', readonly: true, minWidth: 180}},
  {type: 'r-select', props: {field: 'StepState', label: '步骤状态', readonly: true, minWidth: 120, optionDataViewKey: stepStateViewKey.value, optionValueField: 'value', optionLabelField: 'label'}},
  {type: 'r-select', props: {field: 'STATUS', label: '办理状态', readonly: true, minWidth: 120, optionDataViewKey: handleStateViewKey.value, optionValueField: 'value', optionLabelField: 'label'}},
])
const listActions = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '撤回', link: true, buttonType: 'primary', disabled: pageLoading.value || revoking.value || commandLocked.value ? true : '$[appendRevokeDisabled]', onClick: revokeRecord}},
]}))
</script>

<style scoped>
.flow-append-user--embedded :deep(.renderer-section__header) {
  flex-wrap: wrap;
  gap: 8px;
}
.flow-append-user__node {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 12px;
}
.flow-append-user__node-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.flow-append-user__node-value {
  font-weight: 600;
}
.flow-append-user__node-title {
  margin: 0 0 8px;
  font-weight: 600;
}
.flow-append-user__dialog-body {
  min-height: 120px;
}
.flow-append-user__user-select {
  width: 100%;
}
.flow-append-user__dialog-tip {
  margin: 12px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
