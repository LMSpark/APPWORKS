<!--
@module app:views/features/application/application-function-management/ui/page-design/page-design-pane
职责：项目蓝图页“页面设计”页签：页面目标（创建并绑定工具）、AI 编辑与工具审批、三文件交付与预览。
边界：导航目标的选择在“导航配置”页签；本页签只读展示目标，创建工具沿工作区创建 saga，文件经文件 DataView 保存，
  发布经 use-page-design 的交付 saga；不另建草稿或保存通道。
AI用途：调整页面设计页签布局时定位本组件；动作与 saga 在 use-page-design / node-target-resources。
-->
<template>
  <section class="page-design-pane">
    <div class="application-function-page__details-toolbar">
      <h2>页面设计</h2>
      <div :key="pageDesign.actionScopeKey.value" class="page-design-pane__actions">
        <RendererForm v-if="pageDesign.pageDesignPromptViewKey.value" :key="pageDesign.pageDesignPromptScopeKey.value"
          :data-view-key="pageDesign.pageDesignPromptViewKey.value" :show-data-view-meta="false" :show-aggregate-summary="false"
          :show-selection-summary="false" :auto-columns="false" :grid-columns="1" class="page-design-pane__prompt">
          <FieldText :data-view-key="pageDesign.pageDesignPromptViewKey.value" data-member="currentRow" data-field="businessPrompt"
            clearable placeholder="描述 AI 编辑需求" @update:model-value="pageDesign.notifyPageDesignPromptChanged" />
        </RendererForm>
        <RendererButton v-if="state.activePageId.value" v-bind="binding" label="AI 编辑" icon="MagicStick" button-type="primary"
          :loading="state.pageDesignAiRunning.value" :disabled="!pageDesign.canRunPageDesignAi.value" @click="pageDesign.actions.value.runPageDesignAi" />
        <RendererButton v-bind="binding" :label="pageDesign.previewActionLabel.value" icon="Search"
          :disabled="!pageDesign.canPreviewCurrentPage.value" @click="pageDesign.actions.value.preview" />
        <RendererButton v-if="state.activePageId.value" v-bind="binding" label="打开运行页面" icon="Connection"
          @click="pageDesign.actions.value.openRuntimePage" />
        <RendererButton v-if="pageDesign.canVerifyPendingWrites.value" v-bind="binding" label="核验待定提交" button-type="warning"
          :loading="state.allSaving.value" @click="pageDesign.verifyPendingWrites" />
      </div>
    </div>

    <DisplayAlert v-for="(message, index) in recentMessages" :key="`${message.time}:${index}`"
      :description="`${message.time} ${message.text}`" :alert-type="message.type" />

    <section v-if="state.aiToolApprovalPending.value.length > 0" class="page-design-pane__approvals">
      <h3>AI 工具审批</h3>
      <AiToolApprovalPanel :pending="state.aiToolApprovalPending.value" empty-text="暂无待审批工具"
        @allow="state.approveAiTool" @reject="state.rejectAiTool" @abort="state.abortAiTool" />
    </section>

    <RendererForm v-bind="binding" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
      :grid-columns="1" label-width="120px">
      <FieldText v-bind="binding" data-member="currentRow" data-field="NavigationUrl" label="页面目标" :readonly="true" />
    </RendererForm>
    <DisplayAlert v-if="!state.activePageId.value" alert-type="info"
      description="当前节点没有绑定配置工具：可在“导航配置”选择已登记页面或工具，或在下方创建并绑定新工具。" />

    <RendererForm v-if="commandInputViewKey" :key="targetScopeKey" :data-view-key="commandInputViewKey" :auto-columns="false"
      :show-data-view-meta="false" context-data-member="currentRow" :grid-columns="1" label-width="120px">
      <FieldText :data-view-key="commandInputViewKey" data-member="currentRow" data-field="newToolId" label="新工具 ID"
        placeholder="输入未登记的工具 ID" @update:model-value="onToolIdChanged" />
      <RendererButton :data-view-key="commandInputViewKey" label="创建并绑定工具"
        :disabled="!canWriteTarget || !targets.inputValue.value.trim() || creating" :loading="creating" @click="onCreateTool" />
    </RendererForm>

    <DeliveryPane v-if="state.activePageId.value" :key="`${pageDesign.actionScopeKey.value}:delivery`" :state="state"
      :saving="pageDesign.delivering.value" :can-publish="pageDesign.canSaveDelivery.value"
      v-bind="pageDesign.previewRequest.value ? {previewRequest: pageDesign.previewRequest.value} : {}"
      :register-preview-guard="pageDesign.registerPreviewGuard" @save="pageDesign.actions.value.saveDelivery" />
  </section>
</template>

<script setup lang="ts">
import {computed, shallowRef} from 'vue'
import * as SparkComponent from '@spark-appworks/spark-component'
import type {DevState} from '../blueprint-state/useDevState'
import type {usePageDesign} from './use-page-design'
import type {NodeTargetResources, useNodeTargetResources} from './node-target-resources'
import DeliveryPane from './DeliveryPane.vue'

const {AiToolApprovalPanel, DisplayAlert, FieldText, RendererButton, RendererForm} = SparkComponent
const props = defineProps<{
  state: DevState
  pageDesign: ReturnType<typeof usePageDesign>
  targets: ReturnType<typeof useNodeTargetResources>
  binding: Readonly<{dataViewKey?: string}>
}>()

const recentMessages = computed(() => props.state.statusMessages.value.slice(0, 3))
const resources = computed(() => props.targets.resources.value)
const commandInputViewKey = computed(() => resources.value?.commandInputViewKey ?? '')
const targetScopeKey = computed(() => resources.value
  ? `${resources.value.scope.runtime.instanceId}:${resources.value.scope.projectId}:${resources.value.scope.nodeId}:${resources.value.commandInputViewKey ?? ''}`
  : 'node-target-unbound')
const canWriteTarget = computed(() => {
  void props.state.externalDataViewRevision.value
  return props.state.blueprintNodeFieldAccess('NavigationUrl').write
})
const creatingResources = shallowRef<NodeTargetResources>()
const creating = computed(() => creatingResources.value === resources.value && resources.value !== undefined)

function onToolIdChanged(): void {
  const captured = resources.value
  if (captured) props.targets.notifyInputChanged(captured)
}
async function onCreateTool(): Promise<void> {
  const captured = resources.value
  if (!captured || !props.targets.isCurrent(captured)) return
  creatingResources.value = captured
  try {
    await props.targets.createTool(captured)
  } catch (error) {
    if (props.targets.isCurrent(captured)) props.state.addStatus(`工具创建失败: ${String(error)}`, 'error')
  } finally {
    if (creatingResources.value === captured) creatingResources.value = undefined
  }
}
</script>

<style scoped>
.page-design-pane { display: flex; flex-direction: column; gap: 0.75rem; }
.page-design-pane__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; }
.page-design-pane__prompt { min-width: 16rem; }
.page-design-pane__approvals h3 { margin: 0 0 0.5rem; font-size: 0.875rem; }
</style>
