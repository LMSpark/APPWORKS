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
    <SparkComponentRenderer v-if="listViewKey && !pageLoading && !pageError" :config="listConfig" />

    <RendererDialog
      v-model="addDialog.visible"
      title="添加办理人"
      :data-view-key="parameterViewKey || listViewKey || undefined"
      :width="560"
      :append-to-body="true"
      :close-on-click-modal="false"
      :destroy-on-close="true"
      :close-disabled="addCloseDisabled"
      @closed="resetAddDialog"
    >
      <RendererSection class="flow-append-user__dialog-body" :bordered="false" :grid-columns="1"
        :status="addDialog.loading ? '正在读取办理人候选…' : ''" :error="pageError">
        <SparkComponentRenderer v-if="parameterViewKey && candidateViewKey && !addDialog.loading" :config="inputConfig" />
        <SparkComponentRenderer v-if="optionsViewKey && !addDialog.loading" :config="limitsConfig" />
      </RendererSection>
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
import {RendererButton, RendererDialog, RendererSection, SparkComponentRenderer} from '@spark-appworks/spark-component'
import {getSparkNodeChildren, isSparkNode, nodeId, type SparkNode} from '@spark-appworks/spark-data'
import {compileRule} from '@spark-appworks/spark-project-model'
import rule from '../../flow-runtime/run-page/ui/tool/rule.json?raw'
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

const rules = compileRule(rule)
const listRule = rules.find(node => nodeId(node) === 'appendParticipants')
const inputRule = rules.find(node => nodeId(node) === 'appendInput')
const limitsRule = rules.find(node => nodeId(node) === 'appendLimits')
const revokeRule = listRule?.props?.['actions']
const revokeButton = revokeRule && typeof revokeRule === 'object' && 'children' in revokeRule && Array.isArray(revokeRule.children)
  ? revokeRule.children.find(isSparkNode)
  : undefined
if (!listRule || !inputRule || !limitsRule || !revokeButton) throw new Error('流程办理工具缺少追加办理人组件')

const listConfig = computed<SparkNode>(() => ({
  ...listRule,
  props: {...listRule.props, dataViewKey: listViewKey.value, actions: {children: [{
    ...revokeButton,
    props: {...revokeButton.props,
      disabled: pageLoading.value || revoking.value || commandLocked.value ? true : revokeButton.props?.['disabled'],
      onClick: revokeRecord,
    },
  }]}},
  children: getSparkNodeChildren(listRule.children).map(field => {
    const optionDataViewKey = field.props?.['field'] === 'StepState' ? stepStateViewKey.value
      : field.props?.['field'] === 'STATUS' ? handleStateViewKey.value : undefined
    return optionDataViewKey === undefined ? field : {...field, props: {...field.props, optionDataViewKey}}
  }),
}))
const inputConfig = computed<SparkNode>(() => ({
  ...inputRule,
  props: {...inputRule.props, dataViewKey: parameterViewKey.value},
  children: getSparkNodeChildren(inputRule.children).map(field => ({...field, props: {...field.props,
    optionDataViewKey: candidateViewKey.value, disabled: commandLocked.value || addDialog.submitting,
  }})),
}))
const limitsConfig = computed<SparkNode>(() => ({...limitsRule, props: {...limitsRule.props, dataViewKey: optionsViewKey.value}}))
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
