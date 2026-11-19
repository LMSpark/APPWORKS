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
      <SparkComponentRenderer :config="appendActionsConfig" />
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
        <SparkComponentRenderer :config="appendInputActionsConfig" />
      </template>
    </RendererDialog>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {RendererDialog, RendererSection, SparkComponentRenderer} from '@spark-appworks/spark-component'
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
const appendActionsRule = rules.find(node => nodeId(node) === 'appendActions')
const appendInputActionsRule = rules.find(node => nodeId(node) === 'appendInputActions')
const revokeRule = listRule?.props?.['actions']
const revokeButton = revokeRule && typeof revokeRule === 'object' && 'children' in revokeRule && Array.isArray(revokeRule.children)
  ? revokeRule.children.find(isSparkNode)
  : undefined
if (!listRule || !inputRule || !limitsRule || !revokeButton || !appendActionsRule || !appendInputActionsRule) throw new Error('流程办理工具缺少追加办理人组件')

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
const inputActionsLocked = () => addDialog.loading || addDialog.submitting || commandLocked.value
const actions: Record<string, {run: () => void | Promise<void>; disabled: () => boolean; visible?: () => boolean}> = {
  openAppendInput: {run: openAddDialog, disabled: () => pageLoading.value || !listViewKey.value || commandLocked.value},
  verifyAppendList: {run: verifyOriginalRevoke, disabled: () => revoking.value, visible: () => revokeUnconfirmed.value},
  verifyAppendInput: {run: verifyOriginalRevoke, disabled: () => addDialog.submitting, visible: () => revokeUnconfirmed.value},
  cancelAppendInput: {run: resetAddDialog, disabled: inputActionsLocked},
  confirmAppendInput: {run: submitAddDialog, disabled: inputActionsLocked},
}
function bindActions(toolbar: SparkNode): SparkNode {
  const children = getSparkNodeChildren(toolbar.children).flatMap(button => {
    const action = actions[nodeId(button) ?? '']
    if (!action || action.visible?.() === false) return []
    return [{...button, props: {...button.props, onClick: action.run, disabled: action.disabled()}}]
  })
  return {...toolbar, children}
}
const appendActionsConfig = computed(() => bindActions(appendActionsRule))
const appendInputActionsConfig = computed(() => bindActions(appendInputActionsRule))
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
