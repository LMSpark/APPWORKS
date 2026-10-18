<!--
@module app:views/features/data-platform/data-set-management/design/model/rename/DataSpaceModelRename
职责：以标准字段和列表展示注册名输入、准确引用预览和恢复入口。
边界：组件绑定原会话局部DataView，正式读写与配置保存归改名owner。
AI用途：原生模型节点的注册名修改；不在页面拼请求或保存业务数组。
-->
<template>
  <section aria-label="模型注册名编辑" :class="{compact: workspaceActions}">
    <h3 v-if="!workspaceActions">修改模型注册名</h3>
    <RendererForm :data-view-key="inputKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
      :grid-columns="1" :label-width="workspaceActions ? '82px' : 'auto'" :form-props="{disabled: locked, labelPosition: workspaceActions ? 'left' : 'top'}">
      <FieldText :data-view-key="inputKey" data-member="currentRow" data-field="name" :label="workspaceActions ? '节点名称:' : '新模型注册名'" />
    </RendererForm>
    <component :is="workspaceActions && state.status !== 'idle' ? RendererDialog : 'div'" v-if="!workspaceActions || state.pending || error || message"
      v-bind="workspaceActions && state.status !== 'idle' ? {modelValue: true, dataViewKey: inputKey, dataMember: 'currentRow', title: '修改模型注册名', width: 'min(1100px, calc(100vw - 48px))', gridColumns: 1,
        appendToBody: true, showClose: false, closeOnClickModal: false, closeOnPressEscape: false} : {}">
    <p v-if="!workspaceActions || state.status !== 'idle'">模型 ID 和物理来源保持不变；同步本空间定义中的明确引用与场景视图绑定。</p>
    <p v-if="!workspaceActions || state.status !== 'idle'">预览检查当前应用蓝图中的工具工作文件，同步静态完整视图绑定。含旧名的脚本或发布快照须先处理；原生 Vue、未挂载工具及其他应用不在扫描范围。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="state.status === 'unknown'" role="status">模型记录提交待核验；场景定义和工具文件尚未提交。请核验原提交，不能放弃或重复提交。</p>
    <p v-else-if="state.status === 'configuration'" role="status">{{ session.viewState?.saveStatus === 'unknown'
      ? '模型记录已确认；场景定义提交待核验；工具文件尚未提交'
      : '模型记录已确认；场景定义或工具文件尚未全部确认' }}。核验会接续尚未完成的配置，已确认部分不重复写入。</p>
    <p v-else-if="state.status === 'readback' || state.status === 'different'" role="status">当前模型记录或引用尚未完整核验；请核验并检查回读结果后继续。</p>
    <RendererTable v-if="state.changes.length" :data-view-key="changesKey" :auto-columns="false" :show-pagination="false" :show-data-view-meta="false">
      <FieldText field="table" label="定义表或文件" readonly />
      <FieldText field="record" label="记录或工具 ID" readonly />
      <FieldText field="property" label="属性" readonly />
      <FieldText field="before" label="原值" readonly />
      <FieldText field="after" label="新值" readonly />
    </RendererTable>
    <p v-if="state.tables.length">场景绑定：{{ state.tables.join('、') }}。视图名称和配置保持不变。</p>
    <p v-if="state.status !== 'idle' && state.status !== 'previewing'">已检查蓝图工具：{{ state.tools.length ? state.tools.join('、') : '无配置工具' }}。</p>
    <ul v-if="state.verification.length"><li v-for="item in state.verification" :key="`${item.table}:${item.id}:${item.property}`">{{ item.table }}/{{ item.id }}.{{ item.property }}：{{ item.result }}</li></ul>
    <div class="actions">
      <RendererButton v-if="editable && (!workspaceActions || state.pending)" data-action="preview-rename-model" :disabled="locked" @click="run('preview')" label="预览注册名变更" />
      <RendererButton v-if="state.status === 'ready'" data-action="save-rename-model" button-type="primary" :disabled="locked" @click="run('save')" label="确认修改注册名" />
      <RendererButton v-if="editable && state.pending" data-action="cancel-rename-model" :disabled="busy" @click="run('cancel')" label="放弃注册名修改" />
      <RendererButton v-if="!editable" data-action="verify-rename-model" :disabled="busy" @click="run('verify')" label="核验并接续配置保存" />
      <RendererButton v-if="state.status === 'different'" data-action="accept-rename-model" :disabled="busy" @click="run('acceptCurrent')" label="采用当前结果并结束操作" />
    </div>
    </component>
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {FieldText, RendererButton, RendererDialog, RendererForm, RendererTable} from '@spark-appworks/spark-component'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import type {DataSpaceModelEditorProps} from '../../ui/node-panel/data-set-design-node-panel.props'

const props = defineProps<DataSpaceModelEditorProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]}>()
const owner = props.session.getModelRename(props.modelId)
const inputKey = buildDataViewKey(owner.input.tableName, owner.input.viewId, props.session.metadataDataSet.scenarioId)
const changesKey = buildDataViewKey(owner.changesView.tableName, owner.changesView.viewId, props.session.metadataDataSet.scenarioId)
const busy = ref(false), tick = ref(0), error = ref(''), message = ref('')
let active = true
const state = computed(() => {tick.value; props.revision; return owner.getState()})
const editable = computed(() => ['idle', 'ready'].includes(state.value.status))
const locked = computed(() => props.disabled || busy.value || !editable.value)
watch(() => busy.value || state.value.pending, value => emit('pending', value), {immediate: true, flush: 'sync'})
const changed = () => {if (active) {tick.value++; emit('changed')}}
owner.input.events.on('editingFieldChanged', changed)
async function run(action: 'preview' | 'save' | 'verify' | 'cancel' | 'acceptCurrent'): Promise<void> {
  if (busy.value || props.disabled && ['preview', 'save'].includes(action)) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    const result = await owner[action]()
    if (active) message.value = action === 'save' || action === 'verify' && result === true ? '注册名、本空间引用及已扫描工具绑定已保存并回读确认'
      : action === 'cancel' ? '已放弃本地注册名修改' : action === 'acceptCurrent' ? '已采用当前正式结果；未补写引用' : ''
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
onBeforeUnmount(() => {active = false; owner.input.events.off('editingFieldChanged', changed); props.session.releaseModelRename(props.modelId); emit('pending', false)})
</script>
<style scoped>
section:not(.compact) {border-bottom:1px solid var(--el-border-color); padding-bottom:1rem; margin-bottom:1rem;}
.compact :deep(.el-form-item) {margin-bottom:0;}
.compact :deep(.el-form-item__content) {max-width:280px;}
p,li {overflow-wrap:anywhere;}
.actions {display:flex; flex-wrap:wrap; gap:.5rem; margin-top:.75rem;}
[role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
</style>
