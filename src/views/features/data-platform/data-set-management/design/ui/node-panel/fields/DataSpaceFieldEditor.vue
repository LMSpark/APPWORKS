<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/fields/DataSpaceFieldEditor
职责：通过同一字段DataView维护模型的类型、输出、值函数、说明、排序、分组、脱敏及AI操作配置。
边界：组件绑定原生编辑覆盖，引用检查、提交和核验交原会话。
AI用途：数据空间设计的字段配置入口，保留数据权限、取消与待核验保护。
-->
<template>
  <section aria-label="字段配置编辑" :class="{'workspace-fields': workspaceModelId}">
    <h3 v-if="!workspaceModelId">字段配置</h3>
    <template v-if="fieldIds">
      <RendererSection :data-view-key="displayViewKey" data-member="currentRow" :grid-columns="1" class="meta-card" aria-label="模型信息">
        <div class="meta-header">
          <div v-if="$slots['model-name']" class="meta-name"><slot name="model-name" /></div>
          <RendererForm v-if="displayViewKey" class="meta-switches" aria-label="字段显示设置" :data-view-key="displayViewKey" context-data-member="currentRow"
            :auto-columns="false" :show-data-view-meta="false" :grid-columns="2" label-width="0px">
            <FieldCheckbox field="showSystemFields" label="" checkbox-text="显示系统字段" />
            <FieldCheckbox field="showSortGroup" label="" checkbox-text="显示排序分组" />
          </RendererForm>
          <div class="meta-actions">
            <slot name="model-actions" />
            <RendererButton :data-view-key="dataViewKey" data-action="enable-field-output" label="全部输出"
              :disabled="blocked || dialogOpen || !outputWritable" @click="stageOutput('all')" />
            <RendererButton :data-view-key="dataViewKey" data-action="invert-field-output" label="输出反转"
              :disabled="blocked || dialogOpen || !outputWritable" @click="stageOutput('invert')" />
          </div>
        </div>
      </RendererSection>
      <div class="field-toolbar" aria-label="字段操作">
        <slot name="field-create" />
        <RendererButton :data-view-key="dataViewKey" data-action="edit-field" :label="workspaceModelId ? '编辑' : '编辑字段'"
          :disabled="blocked || !state.data || dialogOpen || editOpen" @click="openContract" />
        <RendererButton :data-view-key="dataViewKey" button-type="danger" data-action="preview-remove-field" :label="workspaceModelId ? '删除' : '删除计算字段'"
          :disabled="blocked || dialogOpen || editOpen || !computedField || !canRemove" @click="requestRemoval" />
      </div>
      <RendererTable class="model-fields-table" :class="{'hide-system-fields': !showSystemFields}" :row-class-name="fieldRowClass"
        :data-view-key="dataViewKey" :auto-columns="false" :show-data-view-meta="false" :show-pagination="false"
        :highlight-current-row="true" :max-height="520" :on-current-change="selectTableField" :on-row-click="selectTableRow">
        <FieldText field="Name" label="名称" :min-width="180" readonly />
        <FieldText field="description" label="描述" :min-width="180" edit-on-dblclick :readonly="!canEdit('description')" />
        <FieldText field="FieldType" label="类型" :width="120" readonly />
        <FieldText label="输出信息" title-align="center" :children="outputChildren" />
        <FieldText v-if="showSortGroup" label="排序" title-align="center" :children="sortChildren" />
        <FieldNumber v-if="showSortGroup" field="Group" label="分组标记" :min-width="110" edit-on-dblclick :readonly="!canEdit('Group')" :min="0" :step="1" controls-position="right" />
        <FieldSelect field="Expression" label="脱敏规则" :min-width="220" show-cell-control :cell-readonly="ruleReadonly" placeholder="请选择脱敏规则"
          v-bind="rulesViewKey ? {optionDataViewKey: rulesViewKey} : {}" option-data-member="rows" option-label-field="name" option-value-field="rowid" filterable />
        <FieldCheckbox field="allowAIAdd" label="AI操作" :width="100" value-align="center" :true-value="1" :false-value="0" :cell-readonly="aiReadonly" />
      </RendererTable>
      <DisplayText v-if="showSortGroup" tag="p" :value="groupHelp" />
      <p v-if="!rulesViewKey" role="status">此数据空间未配置脱敏规则视图，已有规则值保留；其他模型字段可继续维护。</p>
      <p v-if="activeFieldHidden" role="status">当前字段在列表中已隐藏，编辑和草稿继续保留；勾选“显示系统字段”可重新显示，或点击“编辑字段”继续维护。</p>
    </template>
    <p v-if="state.error || workspaceState.error || error" role="alert">{{ error || state.error || workspaceState.error }}</p>
    <p v-if="fieldIds && functionState?.warning" role="status">{{ functionState.warning }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <component :is="fieldIds ? RendererDialog : 'div'" v-if="(!fieldIds || editOpen) && state.data && view && !view.destroyed"
      v-bind="fieldIds ? {modelValue: true, dataViewKey, dataMember: 'currentRow', title: computedField ? '编辑计算字段' : '编辑字段合同', width: '420px', gridColumns: 1,
        closeDisabled: busy || disabled, appendToBody: true, destroyOnClose: true, bodyClass: 'data-space-field-contract', footer: {class: 'data-space-field-contract-footer'}} : {}"
      @update:model-value="contractVisibilityChanged">
      <template v-if="fieldIds">
        <RendererForm :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
          :grid-columns="1" :grid-gap="0" label-width="68px" :form-props="{labelPosition: 'right', disabled: blocked}">
          <div v-for="field in contractFields" :key="field.name" :data-field-property="field.name">
            <p v-if="!field.readable">{{ field.label }}：不可读</p>
            <FieldTextarea v-else-if="field.name === 'description'" :field="field.name" :label="field.label" :rows="4" :maxlength="200" :readonly="!field.writable" />
            <FieldCheckbox v-else-if="field.name === 'IsOutput' || field.name === 'IsPKey'" :field="field.name" :label="field.label"
              :true-value="1" :false-value="0" :checkbox-text="field.name === 'IsOutput' ? '参与页面与接口输出' : '唯一记录主键（自动设为输出）'" :readonly="!field.writable"
              @update:model-value="contractValueChanged(field.name)" />
            <FieldText v-else :field="field.name" :label="field.label" :maxlength="100" :readonly="!field.writable" />
            <p v-if="field.warning" role="status">{{ field.warning }}</p>
          </div>
        </RendererForm>
        <p v-if="error" role="alert">{{ error }}</p>
      </template>
      <template v-else>
      <p>计算字段可修改名称；普通来源字段名称保持不变。输出名称留空时使用字段名。改名或关闭输出前，先处理本空间的配置引用，并核对外部页面绑定。</p>
      <p>字段类型用于模型的输出定义。计算字段、引用字段的种类及正式主键类型由各自合同维护；修改前请核对使用该字段的页面与规则。</p>
      <div v-for="field in state.data.fields" :key="field.name" :data-field-property="field.name">
        <p v-if="!field.readable">{{ field.label }}：不可读</p>
        <RendererForm v-else :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1"
          :form-props="{disabled: blocked || !field.writable}">
          <FieldText v-if="field.kind === 'text' || field.kind === 'function'" :field="field.name" :label="field.label" />
          <FieldNumber v-else-if="field.kind === 'number'" :field="field.name" :label="field.label" :min="0" />
          <FieldSelect v-else-if="field.kind === 'binary'" :field="field.name" :label="field.label" :clearable="false"
            :options="[{label: '是', value: 1}, {label: '否', value: 0}]" />
          <FieldSelect v-else-if="field.kind === 'rule'" :field="field.name" :label="field.label" :readonly="!rulesViewKey"
            v-bind="rulesViewKey ? {optionDataViewKey: rulesViewKey} : {}" option-data-member="rows" option-label-field="name" option-value-field="rowid" filterable />
          <FieldSelect v-else :field="field.name" :label="field.label" :clearable="false"
            :options="[{label: '不指定', value: ''}, {label: '升序', value: 'ascending'}, {label: '降序', value: 'descending'}]" />
        </RendererForm>
        <p v-if="field.warning" role="status">{{ field.warning }}</p>
        <DisplayText v-if="field.name === 'Group' && field.readable" tag="p" :value="groupHelp" />
        <template v-if="field.kind === 'function' && field.readable">
          <p>取值定义保存到当前模型字段，由正式查询解释执行；留空表示不指定值函数。</p>
          <p v-if="functionState?.warning" role="status">{{ functionState.warning }}</p>
          <RendererForm v-if="functionState" :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
            <FieldValueFunction :data-view-key="dataViewKey" data-member="currentRow" field="ValueFun" label="值函数"
              :function-context="functionState.context" :readonly="blocked || !field.writable" :on-dialog-visible-change="value => dialogOpen = value" />
          </RendererForm>
        </template>
      </div>
      </template>
      <template v-if="fieldIds" #footer>
        <RendererButton :data-view-key="dataViewKey" data-action="cancel-field-editor" label="取消" :disabled="busy || disabled" @click="cancelContract" />
        <RendererButton :data-view-key="dataViewKey" data-action="close-field-editor" label="确定" button-type="primary" :disabled="blocked" @click="confirmContract" />
      </template>
    </component>
    <p v-if="removalOwners().some(item => item.getState().status === 'staged')" role="status">计算字段删除已暂存，请保存当前工作区</p>
    <p v-if="state.status !== 'idle' || removalOwners().some(item => ['unknown', 'readback', 'different'].includes(item.getState().status))" role="alert">提交尚未完全确认，请先核验；不会重复提交。</p>
    <div class="actions">
      <RendererButton v-if="removalOwners().some(item => item.getState().status === 'different')" data-action="accept-field-removals" label="采用当前正式结果" :disabled="busy || disabled" @click="acceptRemovals" />
      <RendererButton v-if="!workspaceModelId" button-type="primary" data-action="save-field" :disabled="blocked || !(state.pending || workspaceState.pending) || dialogOpen" @click="save" :label="fieldIds ? '批量保存字段配置' : '保存字段配置'" />
      <RendererButton data-action="cancel-field" :disabled="busy || disabled || editOpen || state.status !== 'idle' || workspaceState.status !== 'idle' || !(state.pending || workspaceState?.pending) || dialogOpen" @click="discard" label="放弃本地修改" />
      <RendererButton v-if="state.status !== 'idle' || state.error || workspaceState.status !== 'idle'" data-action="verify-field" :disabled="busy || disabled || dialogOpen" @click="verify" :label="state.pending || workspaceState.pending ? '放弃本地修改并核验' : '重新核验字段配置'" />
      <RendererButton v-if="!fieldIds && computedField" :data-view-key="dataViewKey" button-type="danger" data-action="preview-remove-field" label="删除计算字段"
        :disabled="blocked || dialogOpen || !canRemove" @click="requestRemoval" />
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {DisplayText, RendererButton} from '@spark-appworks/spark-component'
import {FieldCheckbox, FieldNumber, FieldSelect, FieldText, FieldTextarea, FieldValueFunction, RendererDialog, RendererForm, RendererTable, RendererSection, type RTableProps} from '@spark-appworks/spark-component'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import type {DataSpaceFieldEditorProps} from './DataSpaceFieldEditor.props'
import {LowcodeDataSpaceSourceInputEdit} from '@/lowcode/data-space/model-source/source-input/lowcode-data-space-source-input-session'
import {fieldEditPrepareReloadBatch, fieldEditSaveBatch, fieldEditStageOutputBatch} from '@/lowcode/data-space/model-source/field-edit/lowcode-data-space-field-edit-session'

const props = defineProps<DataSpaceFieldEditorProps>()
const groupHelp = '0 表示不参与分组，正整数表示参与分组；数值大小不决定顺序。分组查询的普通输出字段须参与分组，聚合输出通过值函数配置。'
const emit = defineEmits<{changed: []; pending: [value: boolean]; remove: [fieldId: string]}>()
const busy = ref(false), tick = ref(0), error = ref(''), message = ref('')
const dialogOpen = ref(false)
const editOpen = ref(false)
let checkpoint: ReturnType<DataView['createEditingCheckpoint']> | undefined
const activeId = ref(props.fieldId)
const ids = computed(() => props.fieldIds ?? [props.fieldId])
let active = true
const view = computed(() => props.session.metadataDataSet.getView('Base_DataModel_Field', props.viewId ?? 'default'))
const dataViewKey = computed(() => buildDataViewKey('Base_DataModel_Field', props.viewId ?? 'default', props.session.metadataDataSet.scenarioId))
const rulesViewKey = computed(() => props.session.metadataDataSet.getView('Base_Desensitization_Rule', 'default')
  ? buildDataViewKey('Base_Desensitization_Rule', 'default', props.session.metadataDataSet.scenarioId) : undefined)
// 纯显示状态也走标准字段绑定；本地控件视图不承载正式定义或提交草稿。
const displayView = shallowRef<DataView>(), displayRevision = ref(0)
watch(() => props.fieldIds ? props.session : undefined, (session, _previous, onCleanup) => {
  if (!session) {displayView.value = undefined; return}
  const dataSet = session.metadataDataSet
  const table = dataSet.addTable(`FieldDisplay_${crypto.randomUUID().replaceAll('-', '')}`, [
    {name: 'id', type: 'string', isPrimaryKey: true},
    {name: 'showSystemFields', type: 'boolean'}, {name: 'showSortGroup', type: 'boolean'},
  ])
  table.resourceType = 'static-data'
  const controls = table.getOrCreateView('default')
  controls.commitMode = 'staged'
  controls.replaceRows([{id: 'display', showSystemFields: false, showSortGroup: false}]); controls.setCurrentRowById('display')
  controls.events.on('editingFieldChanged', ({field, nextValue}) => {
    if ((field !== 'showSystemFields' && field !== 'showSortGroup') || typeof nextValue !== 'boolean') return
    const row = {...controls.rows[0], [field]: nextValue}
    controls.discardEditingRows(); controls.replaceRows([row]); controls.setCurrentRowById('display'); displayRevision.value++
  })
  displayView.value = controls
  onCleanup(() => {if (!dataSet.destroyed) dataSet.removeTable(table.tableName)})
}, {immediate: true})
const displayViewKey = computed(() => displayView.value ? buildDataViewKey(displayView.value.tableName, displayView.value.viewId, props.session.metadataDataSet.scenarioId) : undefined)
const showSystemFields = computed(() => {displayRevision.value; return displayView.value?.rows[0]?.['showSystemFields'] === true})
const showSortGroup = computed(() => {displayRevision.value; return displayView.value?.rows[0]?.['showSortGroup'] === true})
const systemFields = new Set(['createuser', 'createtime', 'updateuser', 'updatetime', 'wfid', 'flowstate', 'reportid', 'description', 'lingma_sys_is_delete', 'lingma_sys_ent'])
function isSystemField(row: Readonly<DataRow>): boolean {
  return view.value?.fieldAccess(row, 'Name').read === 'visible' && typeof row['Name'] === 'string'
    && systemFields.has(row['Name'].trim().toLowerCase())
}
const fieldRowClass: NonNullable<RTableProps['rowClassName']> = ({row}) => isSystemField(row) ? 'data-space-system-field' : ''
const activeFieldHidden = computed(() => {
  props.revision; tick.value
  const row = view.value?.rows.find(item => item['rowid'] === activeId.value)
  return !!props.fieldIds && !showSystemFields.value && !!row && isSystemField(row)
})
// 身份校验可能在正式查询过渡期失败，必须在各消费处的错误边界内执行。
function owner() {return props.session.getFieldEdit(activeId.value, props.viewId)}
function owners() {const removed = new Set(removalOwners().map(item => item.getState().preview!.id)); return ids.value.filter(id => !removed.has(id) && (view.value?.rows.some(row => row['rowid'] === id) || props.fieldIds)).map(id => props.session.getFieldEdit(id, props.viewId))}
const pendingFields = computed(() => {
  props.revision; tick.value
  return ids.value.some(id => view.value?.hasEditingChanges(id) === true || view.value?.dirtyTracking.hasPendingChanges(id) === true)
})
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
function batchState() {
  const states = owners().map(item => item.getState())
  return {status: states.find(item => item.status !== 'idle')?.status ?? 'idle', pending: states.some(item => item.pending)}
}
const state = computed(() => {
  props.revision; tick.value
  try {return {...batchState(), data: activeId.value && view.value?.rows.some(row => row['rowid'] === activeId.value) && !removalOwners().some(item => item.getState().preview?.id === activeId.value) ? owner().read() : null, error: ''}}
  catch (cause) {
    const status = (() => {try {return batchState()} catch {return {status: 'idle', pending: pendingFields.value}}})()
    return {...status, data: null, error: describe(cause)}
  }
})
const workspaceModel = computed(() => {props.revision; tick.value; return props.workspaceModelId ? props.session.getModelEdit(props.workspaceModelId) : undefined})
const contractFields = computed(() => {
  props.revision; tick.value
  try {
    const fields = activeId.value && !state.value.error ? owner().readContract() : []
    return computedField.value ? fields.filter(field => field.name === 'Name' || field.name === 'description') : fields
  } catch {return []}
})
function removalOwners() {
  if (!props.fieldIds) {
    const removal = props.session.getFieldRemove(props.fieldId, props.viewId ?? 'default')
    return removal.getState().pending ? [removal] : []
  }
  const modelId = props.workspaceModelId ?? view.value?.queryContext['modelId']
  return typeof modelId === 'string' ? props.session.getModelFieldRemovals(modelId, props.viewId ?? 'default') : []
}
function sourceOwners() {return props.workspaceModelId ? props.session.getModelSourceInputs(props.workspaceModelId) : []}
const workspaceState = computed(() => {
  props.revision; tick.value
  try {
    const states = [workspaceModel.value?.getState(), ...sourceOwners().map(item => item.getState()), ...removalOwners().map(item => ({...item.getState(), status: item.getState().status === 'staged' ? 'idle' : item.getState().status}))].filter(item => item !== undefined)
    return {status: states.find(item => item.status !== 'idle')?.status ?? 'idle', pending: states.some(item => item.pending), error: ''}
  } catch (cause) {
    return {status: workspaceModel.value?.getState().status ?? 'idle', pending: workspaceModel.value?.getState().pending === true
      || props.session.hasPendingSourceInputs(), error: describe(cause)}
  }
})
const blocked = computed(() => busy.value || props.disabled || state.value.status !== 'idle' || !!state.value.error || !!workspaceState.value.error || workspaceState.value.status !== 'idle')
const interactionLocked = computed(() => busy.value || dialogOpen.value || editOpen.value || state.value.status !== 'idle'
  || !!state.value.error || !!workspaceState.value.error || workspaceState.value.status !== 'idle')
const canSave = computed(() => !blocked.value && !dialogOpen.value && !editOpen.value && (state.value.pending || workspaceState.value?.pending === true))
function canEdit(name: string): boolean {
  return !blocked.value && !dialogOpen.value && !editOpen.value
    && state.value.data?.fields.some(field => field.name === name && field.writable) === true
}
function fieldCellReadonly(row: Readonly<DataRow>, name: string): boolean {
  if (blocked.value || dialogOpen.value || editOpen.value || typeof row['rowid'] !== 'string' || !ids.value.includes(row['rowid'])) return true
  try {
    return !props.session.getFieldEdit(row['rowid'], props.viewId).read().fields.some(field => field.name === name && field.writable)
  } catch {return true}
}
const outputCellReadonly = (row: Readonly<DataRow>) => fieldCellReadonly(row, 'IsOutput')
const ruleReadonly = (row: Readonly<DataRow>) => !rulesViewKey.value || fieldCellReadonly(row, 'Expression')
const aiReadonly = (row: Readonly<DataRow>) => fieldCellReadonly(row, 'allowAIAdd')
function functionCellReadonly(row: Readonly<DataRow>): boolean {
  if (blocked.value || editOpen.value || typeof row['rowid'] !== 'string' || !ids.value.includes(row['rowid'])) return true
  try {return !props.session.getFieldEdit(row['rowid'], props.viewId).read().fields.some(field => field.name === 'ValueFun' && field.writable)}
  catch {return true}
}
const outputChildren = computed<SparkNode[]>(() => [
  {type: 'r-checkbox', props: {field: 'IsOutput', label: '输出', width: 82, trueValue: 1, falseValue: 0, cellReadonly: outputCellReadonly}},
  {type: 'r-text', props: {field: 'AsName', label: '别名', minWidth: 150, editOnDblclick: true, readonly: !canEdit('AsName')}},
  {type: 'r-value-function', props: {field: 'ValueFun', label: '值函数', minWidth: 260, cellReadonly: functionCellReadonly,
    functionContext: functionState.value?.context, onDialogVisibleChange: (visible: boolean) => {dialogOpen.value = visible}}},
])
const sortChildren = computed<SparkNode[]>(() => [
  {type: 'r-select', props: {field: 'OrderType', label: '类型', minWidth: 110, editOnDblclick: true, readonly: !canEdit('OrderType'), clearable: false,
    options: [{label: '不指定', value: ''}, {label: '升序', value: 'ascending'}, {label: '降序', value: 'descending'}]}},
  {type: 'r-number', props: {field: 'Order', label: '顺序', minWidth: 110, editOnDblclick: true, readonly: !canEdit('Order'), min: 0, step: 1, controlsPosition: 'right'}},
])
const computedField = computed(() => {
  props.revision; tick.value
  const row = view.value?.rows.find(item => item['rowid'] === activeId.value)
  return !!row && view.value?.fieldAccess(row, 'FieldType').read === 'visible' && row['FieldType'] === '计算字段'
})
const canRemove = computed(() => {
  props.revision; tick.value
  const row = view.value?.rows.find(item => item['rowid'] === activeId.value)
  return !!row && (pendingCreate.value || view.value?.deleteActionState(row) === 'enabled')
})
const pendingCreate = computed(() => {props.revision; tick.value; return view.value?.dirtyTracking.isPendingCreate(activeId.value) === true})
function requestRemoval(): void {
  if (blocked.value || dialogOpen.value || editOpen.value || !computedField.value || !canRemove.value) return
  if (pendingCreate.value) {
    try {owner().discard(); error.value = ''; changed()} catch (cause) {error.value = describe(cause)}
  } else emit('remove', activeId.value)
}
const outputWritable = computed(() => {
  props.revision; tick.value
  try {return owners().some(item => item.read().fields.some(field => field.name === 'IsOutput' && field.writable))} catch {return false}
})
const functionState = computed(() => {props.revision; tick.value; return !activeId.value || state.value.error ? null : owner().readValueFunction()})
watch(() => props.fieldId, value => {activeId.value = value})
watch(() => props.fieldIds, value => {
  if (value && !value.includes(activeId.value)) activeId.value = props.fieldId
})
watch(() => [activeId.value, props.revision], () => {
  if (activeId.value && !state.value.error && view.value && !view.value.destroyed && (!view.value.currentRow || view.value.getPkKey(view.value.currentRow) !== activeId.value)) {
    view.value.setCurrentRowById(activeId.value)
  }
}, {immediate: true, flush: 'sync'})
watch(() => busy.value || dialogOpen.value || editOpen.value || state.value.pending || state.value.status !== 'idle'
  || removalOwners().some(item => item.getState().pending), value => emit('pending', value), {immediate: true, flush: 'sync'})
function changed(): void {tick.value++; emit('changed')}
function openContract(): void {
  if (blocked.value || editOpen.value || !view.value || !activeId.value) return
  try {
    checkpoint = view.value.createEditingCheckpoint(activeId.value, contractFields.value.map(field => field.name))
    error.value = ''; message.value = ''; editOpen.value = true; changed()
  } catch (cause) {error.value = describe(cause)}
}
function cancelContract(): void {
  if (busy.value || props.disabled || !checkpoint) return
  try {
    checkpoint.restore(); checkpoint = undefined; editOpen.value = false; error.value = ''; changed()
  } catch (cause) {error.value = describe(cause)}
}
function contractVisibilityChanged(visible: unknown): void {if (visible === false) cancelContract()}
function confirmContract(): void {
  if (blocked.value || !checkpoint) return
  try {
    owner().confirmContract(ids.value); checkpoint.release(); checkpoint = undefined
    editOpen.value = false; error.value = ''; changed()
  } catch (cause) {error.value = describe(cause)}
}

function contractValueChanged(field: string): void {
  if (field !== 'IsPKey') return
  try {owner().ensurePrimaryOutput(ids.value); error.value = ''} catch (cause) {error.value = describe(cause)}
  tick.value++
}
function selectField(id: string): void {
  if (busy.value || props.disabled || dialogOpen.value || editOpen.value || state.value.status !== 'idle' || !ids.value.includes(id)) return
  activeId.value = id; error.value = ''; message.value = ''; changed()
}
const selectTableField: NonNullable<RTableProps['onCurrentChange']> = (row, _previous, control) => {
  if (busy.value || props.disabled || dialogOpen.value || editOpen.value || state.value.status !== 'idle') {
    control.cancel = true; return
  }
  if (typeof row?.['rowid'] === 'string') selectField(row['rowid'])
}
const selectTableRow: NonNullable<RTableProps['onRowClick']> = (row, _column, _event, control) => selectTableField(row, undefined, control)
async function stageOutput(mode: 'all' | 'invert'): Promise<void> {
  if (!active || blocked.value || dialogOpen.value || !outputWritable.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    const result = await fieldEditStageOutputBatch(owners(), mode)
    if (active) {
      const outputPending = ids.value.some(id => Object.hasOwn(view.value?.getEditingPatch(id) ?? {}, 'IsOutput'))
      message.value = outputPending ? `已暂存 ${result.changedCount} 个字段的输出修改，保留 ${result.primaryCount} 个主键字段输出；保存后生效。`
        : `当前输出与已保存配置一致，${owners().some(item => item.getState().pending) ? '其他字段草稿仍需保存' : '无需保存'}。`
    }
  } catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
async function run(action: 'save' | 'verify'): Promise<void> {
  if (busy.value || props.disabled || dialogOpen.value || editOpen.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    if (action === 'save') {
      if (workspaceModel.value) await workspaceModel.value.save(owners(), sourceOwners(), removalOwners())
      else await fieldEditSaveBatch(owners(), removalOwners())
    } else {
      const removals = removalOwners(), fields = owners(), inputs = sourceOwners()
      if (removals.length) view.value?.discardPendingChanges([...ids.value, ...removals.map(item => item.getState().preview!.id)])
      const reloadModel = workspaceModel.value && (workspaceModel.value.getState().pending || workspaceModel.value.getState().status !== 'idle')
        ? workspaceModel.value.prepareReload(workspaceModel.value.getState().pending) : undefined
      const reloadFields = fields.length && (!removals.length || fields.some(item => item.getState().pending || item.getState().status !== 'idle'))
        ? fieldEditPrepareReloadBatch(fields, fields.some(item => item.getState().pending)) : undefined
      const reloadInputs = LowcodeDataSpaceSourceInputEdit.prepareReloadBatch(inputs, inputs.some(item => item.getState().pending))
      await reloadModel?.()
      await reloadFields?.()
      await reloadInputs()
      for (const removal of removals) await removal.verify()
    }
    if (active) message.value = action === 'save'
      ? `${props.fieldIds ? '本次字段配置已批量保存' : '本次字段配置已保存'}${ids.value.some(id => view.value?.hasEditingChanges(id) || view.value?.dirtyTracking.hasPendingChanges(id)) || sourceOwners().some(owner => owner.getState().pending) || workspaceModel.value?.getState().pending ? '；仍有后续修改待保存' : ''}`
      : '已重新读取字段配置；未重复提交'
  } catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
function save(): Promise<void> {return run('save')}
function verify(): Promise<void> {return run('verify')}
function acceptRemovals(): void {
  try {removalOwners().forEach(item => item.acceptCurrent()); error.value = ''; message.value = '已采用当前正式结果；不代表原删除已确认成功'; changed()} catch (cause) {error.value = describe(cause)}
}
function discard(): void {
  if (busy.value || props.disabled || dialogOpen.value || editOpen.value || state.value.status !== 'idle') return
  try {workspaceModel.value?.discard(); removalOwners().forEach(item => item.cancel()); owners().forEach(item => item.discard()); sourceOwners().forEach(item => item.discard()); error.value = ''; message.value = '已放弃字段配置修改'; changed()} catch (cause) {error.value = describe(cause)}
}
defineExpose({save, canSave, busy, interactionLocked})
onBeforeUnmount(() => {checkpoint?.release(); checkpoint = undefined; active = false; emit('pending', false)})
</script>
<style scoped>
section:not(.workspace-fields) {border-top:1px solid var(--el-border-color); margin-top:1rem; padding-top:1rem;}
.actions {display:flex; flex-wrap:wrap; gap:.5rem; margin-top:1rem;}
.meta-card {border:1px solid var(--el-border-color-light); border-radius:12px; background:var(--el-bg-color-page);}
.meta-header {display:flex; align-items:center; gap:20px; flex-wrap:nowrap;}
.meta-name {flex:0 1 360px; min-width:240px;}
.meta-switches {flex:0 0 244px; max-width:100%;}
.meta-switches :deep(.el-form-item) {margin-bottom:0;}
.meta-switches :deep(.renderer-form-grid) {gap:12px;}
.meta-actions {display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-left:auto; flex:1 1 0; min-width:0;}
.meta-name :deep(.field-display) {display:flex; justify-content:flex-start; gap:8px;}
.meta-name :deep(.field-label) {flex:0 0 74px; min-width:0;}
.meta-name :deep(.field-value) {flex:1; min-width:0; overflow-wrap:anywhere; text-align:left;}
.field-toolbar {display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:16px 0;}
.meta-actions :deep(.el-button + .el-button), .field-toolbar :deep(.el-button + .el-button) {margin-left:0;}
.model-fields-table.hide-system-fields :deep(.data-space-system-field) {display:none;}
@media (max-width:1100px) {
  .meta-header {align-items:flex-start; flex-wrap:wrap;}
  .meta-name, .meta-switches, .meta-actions {flex-basis:100%; margin-left:0;}
}
[role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
:global(.data-space-field-contract-footer) {display:flex; justify-content:flex-end; gap:12px;}
:global(.data-space-field-contract-footer .el-button + .el-button) {margin-left:0;}
:global(.data-space-field-contract .el-form-item) {margin-bottom:18px;}
</style>
