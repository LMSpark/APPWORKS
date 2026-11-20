<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/fields/removal/DataSpaceFieldRemoval
职责：使用标准弹窗与按钮预览、取消和暂存计算字段删除。
边界：不直接查询、授权或保存；提交和未决结果核验由原字段工作区承接。
AI用途：确认后返回原工作区统一保存，不另建删除提交或恢复入口。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="state.dataViewKey" title="删除计算字段" :grid-columns="1"
    :close-on-click-modal="false" :close-on-press-escape="false" :show-close="false">
    <p>删除当前计算字段定义；物理字段和其他定义保留。请核对其他页面及脚本的引用。</p>
    <p v-if="state.preview">{{ state.preview.name }} → {{ state.preview.outputName }} · {{ state.preview.id }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="state.status === 'ready'">依赖检查已通过，确认后暂存删除，由当前工作区统一保存。</p>
    <template #footer>
      <RendererButton v-if="state.status === 'idle'" :data-view-key="state.dataViewKey" data-action="retry-remove-field" label="重新检查删除" :disabled="busy" @click="run('preview')" />
      <RendererButton v-if="state.status === 'ready'" :data-view-key="state.dataViewKey" button-type="danger" data-action="confirm-remove-field" label="确认删除计算字段" :disabled="busy" @click="run('stage')" />
      <RendererButton v-if="['idle', 'ready'].includes(state.status)" :data-view-key="state.dataViewKey" data-action="cancel-remove-field" label="取消删除" :disabled="busy" @click="cancel" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
import type {DataSpaceFieldRemovalProps} from './DataSpaceFieldRemoval.props'
const props = defineProps<DataSpaceFieldRemovalProps>()
const emit = defineEmits<{changed: []; ended: []}>()
const owner = props.session.getFieldRemove(props.fieldId, props.fieldViewId)
const tick = ref(0), busy = ref(false), error = ref('')
let active = true
const state = computed(() => {props.revision; tick.value; return owner.getState()})
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
async function run(action: 'preview' | 'stage'): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    if (action === 'preview') await owner.preview()
    else {await owner.stage(); if (active) emit('ended')}
  } catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; tick.value++; emit('changed')}}
}
function cancel(): void {
  if (busy.value) return
  try {if (state.value.status === 'ready') owner.cancel(); emit('ended')} catch (cause) {error.value = describe(cause)}
}
onMounted(() => {if (owner.getState().status === 'idle') void run('preview')})
onBeforeUnmount(() => {active = false})
</script>
