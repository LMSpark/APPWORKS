<!--
@module app:views/features/data-platform/data-set-management/design/model/source/DataSpaceModelSource
职责：共享正式来源选择，预览新增、兼容替换或当前来源字段同步并显式提交和核验。
边界：使用会话对应操作owner，不复制正式记录或越过差异校验。
AI用途：模型新增/来源替换入口，共用查询、取消、脏状态和未决处理。
-->
<template>
  <section :aria-label="title" :class="{compact: workspaceActions}">
    <h3 v-if="!workspaceActions">{{ title }}</h3>
    <p v-if="error || state.error" role="alert">{{ error || state.error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div class="actions">
      <RendererButton data-action="open-sources" :disabled="blocked" @click="openPicker" :label="workspaceActions ? '选择模型' : '选择模型来源'" />
      <RendererButton v-if="modelId" data-action="sync-source" :disabled="blocked" @click="previewBoundSource" label="从来源更新字段" />
      <RendererButton v-if="!workspaceActions" data-action="cancel-create" :disabled="blocked" @click="discard" label="取消选择" />
    </div>
    <RendererDialog v-model="pickerVisible" :data-view-key="controls.key(controls.search)" data-member="currentRow"
      title="数据模型弹出层" width="min(980px, calc(100vw - 32px))" body-class="data-space-source-dialog" :grid-columns="1" append-to-body :close-on-click-modal="false"
      :footer="{class: 'data-space-source-footer'}"
      :close-on-press-escape="!busy" :show-close="!busy">
      <p v-if="error" role="alert">{{ error }}</p>
      <RendererForm class="source-dialog-tabs" :data-view-key="controls.key(controls.search)" context-data-member="currentRow" :auto-columns="false"
        :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked, labelWidth: '0px'}">
        <FieldSelect field="type" label="来源类型" presentation="tabs" :options="[...types]" :clearable="false" />
      </RendererForm>
      <p v-if="queryState.error" role="alert">{{ queryState.error }}</p>
      <RendererTable :key="results.viewId + results.tableName" :data-view-key="controls.key(results)" data-member="rows"
        :auto-columns="false" :show-data-view-meta="false" :show-pagination="true" :max-height="460"
        :pagination="{pageSizes: [10, 20, 50], showJumper: false}" highlight-current-row aria-label="来源候选">
        <FieldText :field="controls.specification.name" :label="type === 'table' ? '表名' : '名称'" :min-width="260" :sortable="false" :header="searchHeader('keyword', '来源名称')" />
        <FieldText v-if="controls.specification.description" :field="controls.specification.description" label="描述" empty-text="-" :min-width="260" :sortable="false" :header="searchHeader('description', '来源说明')" />
        <FieldText v-else label="描述" empty-text="-" :min-width="260" :sortable="false" />
        <FieldText v-if="controls.specification.databaseName" field="databaseDisplay" label="数据库名称 / 稳定 ID" :min-width="260" :sortable="false" :header="searchHeader('databaseName', '数据库名称')" />
      </RendererTable>
      <p v-if="queryState.empty">没有符合条件的来源。</p>
      <template #footer>
        <RendererButton v-if="queryState.error" data-action="search-sources" :disabled="blocked" @click="search" label="重试" />
        <RendererButton data-action="cancel-source-dialog" :disabled="blocked" @click="closePicker" label="取消" />
        <RendererButton data-action="preview-source" button-type="primary" :disabled="blocked || !queryState.canSelect" @click="previewSelected" label="确定" />
      </template>
    </RendererDialog>
    <component :is="workspaceActions ? RendererDialog : 'div'" v-if="!pickerVisible && (state.data?.preview || unresolved)" data-source-preview
      v-bind="workspaceActions ? {modelValue: true, dataViewKey: controls.key(controls.fields), title: synchronizing ? '来源字段同步预览' : modelId ? '来源替换预览' : '模型新增核验', width: 'min(1100px, calc(100vw - 48px))', gridColumns: 1,
        appendToBody: true, showClose: false, closeOnClickModal: false, closeOnPressEscape: false} : {}">
      <p v-if="workspaceActions && (error || state.error)" role="alert">{{ error || state.error }}</p>
      <template v-if="state.data?.preview">
      <h4>{{ synchronizing ? '来源字段同步预览' : modelId ? '来源替换预览' : '创建预览' }}</h4>
      <p v-if="modelId">模型注册名：{{ state.data.preview.name }}</p>
      <RendererForm v-else :data-view-key="controls.key(controls.registration)" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1"
        :form-props="{disabled: blocked || state.data.status !== 'ready', labelPosition: 'top'}">
        <FieldText field="name" label="模型注册名" />
      </RendererForm>
      <p v-if="nameError" role="alert">{{ nameError }}</p>
      <p>来源名：{{ state.data.preview.prepared.model.MetaName }}</p>
      <p>来源类型：{{ state.data.preview.prepared.model.Type }} · {{ state.data.preview.prepared.model.description }}</p>
      <RendererTable class="source-preview-table" :data-view-key="controls.key(controls.fields)" data-member="rows" :auto-columns="false" :show-data-view-meta="false" :show-pagination="false"
        :aria-label="modelId ? '来源字段' : '待创建字段'">
        <FieldText field="Name" label="名称" /><FieldText field="description" label="说明" /><FieldText field="FieldType" label="类型" />
        <FieldText field="purpose" label="用途" /><FieldText field="primary" label="主键" /><FieldText field="output" label="输出" />
      </RendererTable>
      <p v-if="!state.data.preview.prepared.fields.length">此来源没有预设字段。</p>
      <template v-if="replacement">
        <section v-if="replacement.viewChanges.length" aria-label="命名视图投影迁移">
          <h4>将同步以下命名视图的字段合同</h4>
          <p>确认来源变化时一并确认这些投影变化；先核验数据库，再保存视图配置，失败后继续核验。</p>
          <RendererTable :data-view-key="controls.key(controls.viewChanges)" data-member="rows" :auto-columns="false" :show-data-view-meta="false" :show-pagination="false">
            <FieldText field="tableName" label="模型绑定" /><FieldText field="viewId" label="视图" /><FieldText field="fieldId" label="字段ID" />
            <FieldText field="before" label="原合同" /><FieldText field="after" label="迁移后合同" />
          </RendererTable>
        </section>
        <fieldset v-if="replacement.contractChanges.length"><legend>确认来源字段合同变化</legend>
          <p>保留字段身份和输出别名，更新来源类型及主键标记；新主键必须参与输出。命名视图仍须通过最终模型校验。</p>
          <RendererForm v-for="item in replacement.contractChanges" :key="item.id" :data-view-key="controls.key(controls.choice('contract', item.id))" context-data-member="currentRow"
            :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked || state.data.status !== 'ready', labelPosition: 'top'}">
            <FieldCheckbox field="accepted" :label="`确认字段 ${item.name}`" :checkbox-text="`${item.before} → ${item.after}`" />
          </RendererForm>
        </fieldset>
        <section v-if="replacement.fieldChoices.length" aria-label="字段来源映射">
          <div v-for="item in replacement.fieldChoices" :key="item.id">
              <p>原字段：{{ item.name }} · 保留输出名：{{ item.outputName }}</p>
              <RendererForm :data-view-key="controls.key(controls.choice('mapping', item.id))" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1"
                :form-props="{disabled: blocked || state.data.status !== 'ready', labelPosition: 'top'}">
                <FieldSelect field="sourceName" :label="`来源字段 ${item.name}`" :clearable="false" />
              </RendererForm>
              <p v-if="!item.candidates.includes(item.sourceName)" role="alert">{{ item.sourceName }}（来源缺失或合同不符，原值保留）</p>
          </div>
        </section>
        <fieldset v-if="!synchronizing && replacement.additions.length"><legend>引入为输出字段</legend>
          <RendererForm v-for="item in replacement.additions" :key="item.sourceName" :data-view-key="controls.key(controls.choice('addition', item.sourceName))" context-data-member="currentRow"
            :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked || state.data.status !== 'ready', labelPosition: 'top'}">
            <FieldCheckbox field="included" :label="`引入字段 ${item.sourceName}`" :checkbox-text="item.sourceName" />
          </RendererForm>
        </fieldset>
        <fieldset v-if="replacement.removalChoices.length"><legend>移除旧来源字段</legend>
          <p>仅移除明确选择的字段定义；确认替换时检查引用和删除权限。</p>
          <RendererForm v-for="item in replacement.removalChoices" :key="item.id" :data-view-key="controls.key(controls.choice('removal', item.id))" context-data-member="currentRow"
            :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked || state.data.status !== 'ready', labelPosition: 'top'}">
            <FieldCheckbox field="removed" :label="`移除旧字段 ${item.name}`" :checkbox-text="item.name" />
          </RendererForm>
        </fieldset>
        <fieldset v-if="replacement.inputChoices.length"><legend>新来源输入参数</legend>
          <p>明确选择空间参数引用或JSON常量；配置随本次{{ synchronizing ? '字段同步' : '来源替换' }}一并保存。</p>
          <p v-if="replacement.parameterWarning" role="alert">{{ replacement.parameterWarning }}</p>
          <RendererForm v-for="item in replacement.inputChoices" :key="item.sourceName" :data-view-key="controls.key(controls.choice('parameter', item.sourceName))" context-data-member="currentRow"
            :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked || state.data.status !== 'ready', labelPosition: 'top'}">
            <FieldValueFunction field="ValueFun" :label="`参数 ${item.sourceName}`" :input-parameter-data-view-key="controls.key(controls.inputParameters)"
              :function-context="inputFunctionContext" :on-dialog-visible-change="inputDialogChanged" />
          </RendererForm>
        </fieldset>
        <RendererTable class="source-preview-table" :data-view-key="controls.key(controls.differences)" data-member="rows" :auto-columns="false"
          :show-data-view-meta="false" :show-pagination="false" aria-label="字段差异">
          <FieldText field="name" label="字段" /><FieldText field="result" label="处理" />
        </RendererTable>
        <section v-if="replacement.relationChanges.length" aria-label="关系引用迁移">
          <h4>将同步更新以下关系中的字段引用</h4>
          <details v-for="item in replacement.relationChanges" :key="item.id">
            <summary>关系 {{ item.id }}</summary>
            <p>原表达式</p><pre>{{ item.before }}</pre>
            <p>本次提交表达式</p><pre>{{ item.after }}</pre>
          </details>
        </section>
        <RendererTable v-if="replacement.modelChanges.length" :data-view-key="controls.key(controls.modelChanges)" data-member="rows"
          :auto-columns="false" :show-data-view-meta="false" :show-pagination="false" aria-label="模型字段引用迁移">
          <FieldText field="property" label="配置" /><FieldText field="before" label="原字段引用" /><FieldText field="after" label="本次提交引用" />
        </RendererTable>
        <section v-if="replacement.expressionChanges.length" aria-label="模型表达式迁移">
          <h4>将同步更新以下模型配置</h4>
          <details v-for="item in replacement.expressionChanges" :key="`${item.id}:${item.property}`">
            <summary>{{ item.name }} · {{ item.property }}</summary>
            <p>原配置</p><pre>{{ item.before }}</pre>
            <p>本次提交配置</p><pre>{{ item.after }}</pre>
          </details>
        </section>
        <section v-if="replacement.fieldExpressionChanges.length" aria-label="字段取值引用迁移">
          <h4>将同步更新以下字段取值定义</h4>
          <details v-for="item in replacement.fieldExpressionChanges" :key="item.id">
            <summary>{{ item.name }}</summary>
            <p>原取值定义</p><pre>{{ item.before }}</pre>
            <p>本次提交定义</p><pre>{{ item.after }}</pre>
          </details>
        </section>
        <ul role="alert"><li v-for="problem in replacement.problems" :key="problem">{{ problem }}</li></ul>
        <p v-if="synchronizing">同用途同名字段保留原记录及配置，计算字段保留。将新增 {{ replacement.additions.length }} 个字段、删除 {{ replacement.removals.length }} 个已消失的字段定义；确认时核对权限与引用。</p>
        <p v-else>已有字段映射保留记录ID和输出名；勾选字段才会新增并输出。确认会提交来源、字段及以上模型配置和关系引用变更。</p>
      </template>
      <p v-else>创建模型及以上字段后，可在模型下配置数据视图。</p>
      <RendererButton button-type="primary" :data-action="synchronizing ? 'confirm-sync-source' : modelId ? 'replace-source' : 'create-model'"
        :disabled="blocked || inputDialogOpen || state.data.status !== 'ready' || !!nameError || !!replacement?.problems.length" @click="save" :label="synchronizing ? '确认同步字段' : modelId ? '确认替换来源' : '确认创建模型'" />
      <RendererButton v-if="workspaceActions" data-action="cancel-create" :disabled="blocked" @click="discard" label="取消选择" />
      </template>
    <template v-if="unresolved">
      <p v-if="state.data?.status === 'configuration'" role="alert">数据库定义已确认，视图配置尚未完整确认。继续核验只接续配置阶段，不会重复提交数据库。</p>
      <p v-else-if="modelId && state.data && 'abandonNotApplied' in state.data && state.data.abandonNotApplied" role="alert">原数据库批次已确认未生效。可明确放弃本次来源意图；该操作只清理原批次目标，不会改写数据库或视图配置。</p>
      <p v-else-if="modelId" role="alert">{{ synchronizing ? '字段同步' : '来源替换' }}尚未完整确认。核验原批次会保留本地修改；未知或不完整回执不能采用当前正式结果。</p>
      <p v-else-if="state.data && 'canDiscardLocalChanges' in state.data && state.data.canDiscardLocalChanges" role="alert">数据库新增批次已完整确认，但模型或字段目标仍有后续本地修改。默认核验会保留修改；只有明确放弃这些原目标修改后才继续正式回读。</p>
      <p v-else role="alert">{{ synchronizing ? '字段同步' : '新增' }}尚未完整确认。核验会检查原SPARK批次并保留模型与字段本地修改，不会重放数据库写入；确认后如仍有后续修改，可单独明确放弃再继续回读。</p>
      <ul><li v-for="item in state.data?.verification ?? []" :key="`${item.table}:${item.id}`">{{ item.table }} · {{ item.id }}：{{ item.result }}</li></ul>
      <div class="actions">
        <RendererButton data-action="verify-create" :disabled="busy || disabled" @click="verify" :label="state.data?.status === 'configuration' ? '继续核验视图配置' : modelId ? '核验原来源批次（保留本地修改）' : '核验原模型及字段批次（保留本地修改）'" />
        <RendererButton v-if="!modelId && state.data && 'canAbandonNotApplied' in state.data && state.data.canAbandonNotApplied" data-action="abandon-not-applied-create" :disabled="busy || disabled" @click="abandonNotAppliedCreate" label="放弃未生效的本次新增" />
        <RendererButton v-if="!modelId && state.data && 'canDiscardLocalChanges' in state.data && state.data.canDiscardLocalChanges" data-action="discard-confirmed-create-edits" :disabled="busy || disabled" @click="discardConfirmedCreateEdits" label="放弃模型及字段后续修改并继续核验" />
        <RendererButton v-if="modelId && state.data && 'discardRecovered' in state.data && state.data.discardRecovered" data-action="discard-source-recovery" :disabled="busy || disabled" @click="discardRecovered" label="放弃本地新修改并继续核验" />
        <RendererButton v-if="modelId && state.data && 'abandonNotApplied' in state.data && state.data.abandonNotApplied" data-action="abandon-source-intent" :disabled="busy || disabled" @click="abandonNotApplied" label="放弃未生效的本次来源意图" />
        <RendererButton v-if="props.modelId && state.data?.status === 'different' && state.data && 'canAcceptCurrent' in state.data && state.data.canAcceptCurrent" data-action="accept-create" :disabled="busy || disabled" @click="acceptCurrent" label="接受当前正式结果，结束本次操作" />
      </div>
    </template>
    </component>
  </section>
</template>
<script setup lang="ts">
import {DataViewFilter, RequestState, type SparkNode} from '@spark-appworks/spark-data'
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {FieldCheckbox, FieldSelect, FieldText, FieldValueFunction, RendererForm, RendererTable, RendererButton, RendererDialog} from '@spark-appworks/spark-component'
import type {DataSpaceModelSourceProps} from './DataSpaceModelSource.props'
import {LowcodeDataSpaceSourceCatalog} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
import {DataSpaceSourceControls} from './data-space-source-controls'

const props = defineProps<DataSpaceModelSourceProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]; created: [id: string]}>()
const types = LowcodeDataSpaceSourceCatalog.types
const pickerOpen = ref(false)
const inputDialogOpen = ref(false)
function inputDialogChanged(visible: boolean): void {inputDialogOpen.value = visible}
const busy = ref(false), tick = ref(0), error = ref(''), message = ref('')
let active = true
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const title = computed(() => props.modelId ? '模型来源' : '从来源新增模型')
const owner = computed(() => {props.revision; return props.modelId ? props.session.getModelSourceEdit(props.modelId) : props.session.getModelCreate()})
const state = computed(() => {
  props.revision; tick.value
  try {return {data: owner.value.getState(), error: ''}} catch (cause) {return {data: null, error: describe(cause)}}
})
const unresolved = computed(() => !!state.value.data && ['unknown', 'readback', 'unsubmitted', 'different', 'configuration'].includes(state.value.data.status))
const replacement = computed(() => state.value.data?.preview && 'differences' in state.value.data.preview ? state.value.data.preview : null)
const synchronizing = computed(() => replacement.value?.operation === 'synchronize')
const inputFunctionContext = computed(() => ({definitions: (DataViewFilter.editorContext({inputParams: replacement.value?.inputParams ?? []}).definitions ?? [])
  .map(definition => definition.type === 'GetInputParam' ? {...definition, label: '空间参数'} : {...definition, enabled: () => false})}))
const nameError = computed(() => state.value.data && 'nameError' in state.value.data ? state.value.data.nameError : '')
const blocked = computed(() => busy.value || props.disabled || unresolved.value || !!state.value.error)
const controls = new DataSpaceSourceControls(props.session.metadataDataSet, async change => {
  if (!active) return
  if (change.kind === 'result') {tick.value++; return}
  if (blocked.value) return
  if (change.kind === 'search') {discard(); return}
  const current = owner.value
  busy.value = true
  try {
    if (change.kind === 'name' && typeof change.value === 'string' && 'setName' in current) current.setName(change.value)
    else if (change.kind === 'mapping' && typeof change.value === 'string' && 'mapField' in current) await current.mapField({fieldId: change.id, sourceName: change.value})
    else if (change.kind === 'addition' && typeof change.value === 'boolean' && 'includeField' in current) await current.includeField({sourceName: change.id, included: change.value})
    else if (change.kind === 'removal' && typeof change.value === 'boolean' && 'removeField' in current) await current.removeField({fieldId: change.id, removed: change.value})
    else if (change.kind === 'parameter' && typeof change.value === 'string' && 'configureInput' in current) current.configureInput({sourceName: change.id, value: change.value})
    else if (change.kind === 'contract' && typeof change.value === 'boolean' && 'confirmFieldContract' in current) current.confirmFieldContract({fieldId: change.id, accepted: change.value})
    else throw new Error('来源选择值无效')
    if (active && owner.value === current) error.value = ''
  } catch (cause) {if (active && owner.value === current) error.value = describe(cause)}
  finally {
    if (active && owner.value === current) {
      try {controls.sync(current.getState(), true)} catch (cause) {error.value = describe(cause)}
    }
    if (active) {busy.value = false; changed()}
  }
})
const results = computed(() => {tick.value; return controls.results})
const queryState = computed(() => {tick.value; return {canSelect: controls.canSelect,
  error: controls.results.loadingError?.message, empty: controls.results.requestState === RequestState.Loaded && !controls.results.rows.length}})
const pickerVisible = computed({get: () => pickerOpen.value, set: value => {if (!value) closePicker()}})
const type = computed(() => {tick.value; return controls.read('type')})
function searchHeader(field: string, label: string): SparkNode {
  return {type: 'r-form', props: {dataViewKey: controls.key(controls.search), contextDataMember: 'currentRow',
    autoColumns: false, showDataViewMeta: false, gridColumns: 1, formProps: {disabled: blocked.value, labelWidth: '0px'}},
    children: [{type: 'r-text', props: {field, label, placeholder: '筛选', clearable: true}}]}
}
watch(() => state.value.data, value => controls.sync(value), {immediate: true})
watch(() => pickerOpen.value || busy.value || state.value.data?.pending === true, value => emit('pending', value), {immediate: true, flush: 'sync'})
function openPicker(): void {pickerOpen.value = true; controls.setOpen(true)}
function closePicker(): void {
  if (!pickerOpen.value || blocked.value) return
  discard(); controls.setOpen(false); pickerOpen.value = false
}
function changed(): void {tick.value++; emit('changed')}
function discard(): void {
  if (blocked.value) return
  try {owner.value.discard(); message.value = ''; error.value = ''; changed()}
  catch (cause) {error.value = describe(cause)}
}
async function run(action: () => Promise<string | void>): Promise<void> {
  if (busy.value || props.disabled) return
  busy.value = true; error.value = ''; message.value = ''
  let created: string | void = undefined
  try {created = await action()} catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; changed()}}
  if (active && created && !props.modelId) emit('created', created)
}
function search(): Promise<void> {return run(() => controls.results.refresh())}
function previewSelected(): Promise<void> {
  return run(async () => {
    await owner.value.preview(controls.selected())
    if (props.confirmOnSelection && !props.modelId) {
      try {return await commitPrepared()}
      finally {if (active) {controls.setOpen(false); pickerOpen.value = false}}
    }
    if (active) {controls.setOpen(false); pickerOpen.value = false}
    return undefined
  })
}
function save(): Promise<void> {return inputDialogOpen.value ? Promise.resolve() : run(commitPrepared)}
async function commitPrepared(): Promise<string> {
  return owner.value.save()
}
function previewBoundSource(): Promise<void> {
  return run(async () => {
    const current = owner.value
    if ('previewBoundSource' in current) await current.previewBoundSource()
  })
}
function verify(): Promise<void> {
  return run(async () => {
    const result = props.modelId ? await props.session.getModelSourceEdit(props.modelId).verify()
      : await props.session.getModelCreate().verify()
    if (result.confirmed && result.modelId) return result.modelId
    if (active) message.value = owner.value.getState().status === 'ready' ? '未派发的本地操作已放弃，可以重新预览' : '正式结果与本次预览不一致。请核对下方逐项结果后处理。'
    return undefined
  })
}
function discardRecovered(): Promise<void> {
  if (!props.modelId) return Promise.resolve()
  return run(() => props.session.getModelSourceEdit(props.modelId!).verify({discardLocalChanges: true}).then(() => undefined))
}
function abandonNotApplied(): Promise<void> {
  if (!props.modelId) return Promise.resolve()
  return run(() => props.session.getModelSourceEdit(props.modelId!).verify({abandonNotApplied: true}).then(() => undefined))
}
function abandonNotAppliedCreate(): Promise<void> {
  if (props.modelId) return Promise.resolve()
  return run(() => props.session.getModelCreate().abandonNotApplied())
}
function discardConfirmedCreateEdits(): Promise<void> {
  if (props.modelId) return Promise.resolve()
  return run(() => props.session.getModelCreate().discardLocalChanges())
}
function acceptCurrent(): void {
  if (!props.modelId || busy.value || props.disabled) return
  try {
    props.session.getModelSourceEdit(props.modelId).acceptCurrent(); message.value = '已采用当前正式结果，未补写或撤销服务器记录'; error.value = ''; changed()
  }
  catch (cause) {error.value = describe(cause)}
}
onBeforeUnmount(() => {active = false; controls.dispose(); emit('pending', false)})
</script>
<style scoped>
.compact > .actions {margin:0; gap:12px;}
.compact > .actions :deep(.el-button + .el-button) {margin-left:0;}
pre {white-space:pre-wrap; overflow-wrap:anywhere;}
.source-preview-table {max-height:300px; overflow:auto; margin-bottom:1rem;}
.source-dialog-tabs {margin-top:-12px;}
.source-dialog-tabs :deep(.el-form-item__label) {display:none;}
:global(.data-space-source-dialog) {max-height:calc(85vh - 140px); overflow-y:auto; overflow-x:hidden;}
:global(.data-space-source-dialog .field-table-header .el-form-item__label) {display:none;}
:global(.data-space-source-dialog .field-table-header > span) {color:var(--el-color-primary); font-size:12px; font-weight:700; text-align:left;}
:global(.data-space-source-footer) {justify-content:flex-end;}
.actions {display:flex; flex-wrap:wrap; gap:.5rem; margin:1rem 0;} [role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
</style>
