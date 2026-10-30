<!--
@module app:views/app/dev-system/components/NodeTargetConfig
职责：编辑导航目标和打开方式，按独立命令输入创建并绑定工具。
边界：导航字段绑定正式蓝图 DataView；候选和工具 ID 输入绑定当前 runtime 的短生命周期 DataView。
AI用途：选择原生页面、配置工具或外部链接并按现有创建 saga 绑定新工具。
-->
<template>
  <div v-if="state.blueprintDraft.navigation && resources" :key="scopeKey">
    <RendererForm v-if="blueprintBindingReady" :key="`${scopeKey}:navigation`" v-bind="blueprintContainerProps" :auto-columns="false" :show-data-view-meta="false" context-data-member="currentRow" label-width="120px">
      <RendererDivider content-position="left" content="导航目标" />
      <FieldSelect v-if="access('NavigationUrl').read && !customTargetEditing" v-bind="blueprintFieldProps" data-member="currentRow" data-field="NavigationUrl" label="页面或工具" placeholder="搜索已登记页面或工具" :option-data-view-key="resources.optionsViewKey" option-label-field="label" option-value-field="value" :filterable="true" :clearable="true" :readonly="!access('NavigationUrl').write" @update:model-value="onTargetChanged" />
      <FieldText v-else-if="access('NavigationUrl').read" v-bind="blueprintFieldProps" data-member="currentRow" data-field="NavigationUrl" label="自定义目标 URL" placeholder="vue:页面路径或外部地址" :readonly="!access('NavigationUrl').write" @update:model-value="onNavigationChanged" />
      <FieldText v-if="access('MobileUrl').read" v-bind="blueprintFieldProps" data-member="currentRow" data-field="MobileUrl" label="移动端目标" :readonly="!access('MobileUrl').write" @update:model-value="onNavigationChanged" />
      <FieldSelect v-if="access('NavigationType').read" v-bind="blueprintFieldProps" data-member="currentRow" data-field="NavigationType" label="打开方式" :options="openModeOptions" :readonly="!access('NavigationType').write" :clearable="false" @update:model-value="onNavigationChanged" />
      <RendererButton v-if="access('NavigationUrl').read" :data-view-key="blueprintViewKey" :label="customTargetEditing ? '同步当前工具目标' : '输入自定义目标'" :disabled="!access('NavigationUrl').write" @click="onToggleCustomTarget" />
    </RendererForm>

    <RendererForm v-if="commandInputViewKey && (flags.isPage.value || flags.isContent.value)" :key="`${scopeKey}:create-tool`" :data-view-key="commandInputViewKey" :auto-columns="false" :show-data-view-meta="false" context-data-member="currentRow" label-width="120px">
      <RendererDivider content-position="left" content="创建并绑定工具" />
      <FieldText :data-view-key="commandInputViewKey" data-member="currentRow" data-field="newToolId" label="新工具 ID" placeholder="输入未登记的工具 ID" @update:model-value="onToolIdChanged" />
      <RendererButton :data-view-key="commandInputViewKey" label="创建并绑定工具" :disabled="!access('NavigationUrl').write || !inputValue.trim() || creating" :loading="creating" @click="onCreateTool" />
    </RendererForm>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, shallowRef, watch} from 'vue'
import type {DevState} from '../useDevState'
import {useNodeKindFlags} from '../composables/useNodeKindFlags'
import {useNodeTargetResources} from '../node-target-resources'
import type {NodeTargetResources} from '../node-target-resources'
import * as SparkComponent from '@spark-appworks/spark-component'

const {FieldText, FieldSelect, RendererForm, RendererDivider, RendererButton} = SparkComponent
const props = defineProps<{state: DevState}>()
const flags = useNodeKindFlags(props.state)
const targetResources = useNodeTargetResources(props.state)
const resources = computed(() => targetResources.resources.value)
const inputValue = targetResources.inputValue
const creatingResources = shallowRef<NodeTargetResources>()
const creating = computed(() => creatingResources.value === resources.value && resources.value !== undefined)
const customTargetEditing = ref(false)
const access = (field: string) => props.state.blueprintNodeFieldAccess(field)
const blueprintComponentBinding = computed(() => {
  const owner = props.state.blueprintWorkspaceDataView.value
  return owner?.projectId === props.state.projectId ? owner.standardComponentBinding : undefined
})
const blueprintViewKey = computed(() => blueprintComponentBinding.value?.dataViewKey ?? '')
const blueprintContainerProps = computed(() => blueprintViewKey.value ? {dataViewKey: blueprintViewKey.value} : {})
const blueprintFieldProps = computed(() => blueprintViewKey.value ? {dataViewKey: blueprintViewKey.value} : {})
const blueprintBindingReady = computed(() => Boolean(blueprintViewKey.value && resources.value))
const commandInputViewKey = computed(() => resources.value?.commandInputViewKey ?? '')
const scopeKey = computed(() => resources.value
  ? `${resources.value.scope.runtime.instanceId}:${resources.value.scope.projectId}:${resources.value.scope.nodeId}:${resources.value.optionsViewKey}:${resources.value.commandInputViewKey ?? ''}`
  : 'node-target-unbound')

const openModeOptions = computed(() => {
  const view = props.state.blueprintWorkspaceDataView.value?.view
  const type = view?.columns.find(column => column.name === 'NavigationType')?.type
  const numeric = type !== undefined && ['number', 'int', 'integer', 'decimal', 'float', 'double'].includes(type)
  const values = numeric ? [4, 3, 2, 1, 0] : ['4', '3', '2', '1', '0']
  return values.map((value, index) => ({value, label: ['子系统', '当前窗口', '新窗口', '对话框', '嵌入'][index]}))
})

watch(scopeKey, () => {customTargetEditing.value = false}, {flush: 'sync'})

const onTargetChanged = computed(() => {
  const captured = resources.value
  return captured ? (value: unknown) => targetResources.changeTarget(captured, value) : undefined
})
const onNavigationChanged = computed(() => {
  const captured = resources.value
  return captured ? () => targetResources.changeNavigation(captured) : undefined
})
const onToolIdChanged = computed(() => {
  const captured = resources.value
  return captured ? () => targetResources.notifyInputChanged(captured) : undefined
})
const onToggleCustomTarget = computed(() => {
  const captured = resources.value
  return captured ? () => {
    if (!targetResources.isCurrent(captured)) return
    if (customTargetEditing.value) {
      const target = props.state.blueprintWorkspaceDataView.value?.value('NavigationUrl')
      if (typeof target === 'string') targetResources.changeTarget(captured, target)
    }
    customTargetEditing.value = !customTargetEditing.value
  } : undefined
})
const onCreateTool = computed(() => {
  const captured = resources.value
  return captured ? async () => {
    if (!targetResources.isCurrent(captured)) return
    creatingResources.value = captured
    try {
      await targetResources.createTool(captured)
    } catch (error) {
      if (targetResources.isCurrent(captured)) props.state.addStatus(`工具创建失败: ${String(error)}`, 'error')
    } finally {
      if (creatingResources.value === captured) creatingResources.value = undefined
    }
  } : undefined
})
</script>
