<!--
@module app:views/features/data-platform/structured-config/dimension-definition/ui/dimension-design-page
职责：维度中心——来源锚点、事件合同、规则治理（规则头/条件/结果）、维度定义、已有映射与业务分类的查看和维护。
边界：所有列表、明细与编辑都绑定88A4数据空间的正式DataView，经DataSet提交；映射计数、锚点计数等跨行统计不在前端聚合，改为选中后查看明细。
AI用途：迁移参考仓 integration/dimension 页面时，核对规则启用前置、引用删除守卫与条件/结果的规则归属。
-->
<template>
  <section class="dimension-page">
    <header class="dimension-page__header">
      <div><h1>维度中心</h1><p>租户级统一维度治理：维护事件合同、维度定义、字典映射与规则，支撑跨 APP 数据贯通。</p></div>
      <RendererButton v-if="ready" label="刷新" :disabled="busy || !!dialog || !!ruleDialog || !!deletion" @click="refreshAll" />
    </header>
    <p v-if="loading" role="status">正在加载维度配置…</p>
    <p v-if="error || message" role="alert">{{ error || message }}</p>
    <div v-if="deletion" class="dimension-page__actions">
      <RendererButton v-if="deletion.phase === 'verify'" label="核验原删除结果" :disabled="busy" @click="verifyDelete" />
      <RendererButton v-if="deletion.phase === 'verify'" label="放弃核验并回读" :disabled="busy" @click="abandonDelete" />
      <RendererButton v-if="deletion.phase === 'continue'" label="继续删除规则" :disabled="busy" @click="continueDelete" />
      <RendererButton v-if="deletion.phase === 'settle' || deletion.phase === 'continue'" label="放弃未保存删除并回读"
        :disabled="busy" @click="settleDelete" />
      <RendererButton v-if="deletion.phase === 'reload'" label="重试删除回读" :disabled="busy" @click="retryDeleteReadback" />
      <RendererButton v-if="deletion.phase === 'reload'" label="返回并核对删除结果" :disabled="busy" @click="dismissDeleteReadback" />
    </div>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <RendererTabs v-if="ready" v-model="tab">
      <RendererTabPane label="来源锚点" name="binding" :index="0" :lazy="true">
        <RendererTable :data-view-key="bindingKey" :children="bindingColumns" :current-page-search="search('binding_code', 'source_model_meta_name', 'event_code')" :highlight-current-row="true"
          :show-data-view-meta="false" />
        <template v-if="selectedBinding">
          <h2>映射明细：{{ selectedBinding }}</h2>
          <template v-if="detailError(mappingKey)">
            <p role="alert">{{ detailError(mappingKey) }}</p>
            <RendererButton label="重试明细" :disabled="busy || !!dialog || !!ruleDialog || !!deletion" @click="retryDetail(mappingKey)" />
          </template>
          <RendererTable v-else :data-view-key="mappingKey" :children="mappingColumns" :show-data-view-meta="false" />
        </template>
      </RendererTabPane>
      <RendererTabPane label="事件合同" name="event" :index="1" :lazy="true">
        <RendererTable :data-view-key="templateKey" :children="templateColumns" :current-page-search="search('template_name', 'event_code')" :highlight-current-row="true"
          :show-data-view-meta="false" />
        <template v-if="selectedEvent">
          <h2>蓝图锚点：{{ selectedEvent }}</h2>
          <template v-if="detailError(eventBindingKey)">
            <p role="alert">{{ detailError(eventBindingKey) }}</p>
            <RendererButton label="重试明细" :disabled="busy || !!dialog || !!ruleDialog || !!deletion" @click="retryDetail(eventBindingKey)" />
          </template>
          <RendererTable v-else :data-view-key="eventBindingKey" :children="bindingColumns" :show-data-view-meta="false" />
        </template>
      </RendererTabPane>
      <RendererTabPane label="规则治理" name="rule" :index="2" :lazy="true">
        <RendererButton label="新增规则" :disabled="busy || !!dialog || !!ruleDialog || !!deletion" @click="addRule" />
        <RendererTable :data-view-key="ruleKey" :children="ruleColumns" :actions="ruleActions" :current-page-search="search('rule_code', 'rule_name', 'event_code')"
          :show-data-view-meta="false" />
      </RendererTabPane>
      <RendererTabPane label="维度定义" name="definition" :index="3" :lazy="true">
        <RendererButton label="新增维度" :disabled="busy || !!dialog || !!ruleDialog || !!deletion" @click="add(definitionKey)" />
        <RendererTable :data-view-key="definitionKey" :children="definitionColumns" :actions="childActions(definitionKey)"
          :current-page-search="search('definition_code', 'definition_name')" :show-data-view-meta="false" />
      </RendererTabPane>
      <RendererTabPane label="已有映射（只读）" name="dictionary" :index="4" :lazy="true">
        <RendererTable :data-view-key="dictTypeKey" :children="dictTypeColumns" :highlight-current-row="true" :show-data-view-meta="false" />
        <template v-if="selectedDictType">
          <h2>字典项：{{ selectedDictType }}</h2>
          <template v-if="detailError(dictItemKey)">
            <p role="alert">{{ detailError(dictItemKey) }}</p>
            <RendererButton label="重试明细" :disabled="busy || !!dialog || !!ruleDialog || !!deletion" @click="retryDetail(dictItemKey)" />
          </template>
          <RendererTable v-else :data-view-key="dictItemKey" :children="dictItemColumns" :show-data-view-meta="false" />
        </template>
      </RendererTabPane>
      <RendererTabPane label="业务分类" name="category" :index="5" :lazy="true">
        <RendererButton label="新增分类" :disabled="busy || !!dialog || !!ruleDialog || !!deletion" @click="add(categoryKey)" />
        <RendererTable :data-view-key="categoryKey" :children="categoryColumns" :actions="childActions(categoryKey)"
          :current-page-search="search('biz_category_code', 'biz_category_name')" :show-data-view-meta="false" />
      </RendererTabPane>
    </RendererTabs>
    <FeatureRecordDialog v-if="ready && dialog" :key="dialog.epoch" :data-view-key="dialog.key" :record-id="dialog.id" :created="dialog.created"
      :title="dialog.title" :specs="dialog.specs" :columns="dialog.columns" :width="dialog.columns === 2 ? 900 : 660" :validate="dialog.validate"
      @close="closeDialog" />
    <DimensionRuleEditor v-if="ready && ruleDialog" :key="ruleDialog.epoch" :rule-key="ruleKey" :condition-key="conditionKey"
      :result-key="resultKey" :event-key="templateKey" :binding-key="validationBindingKey" :rule-id="ruleDialog.id" :created="ruleDialog.created"
      @close="closeRuleDialog" />
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {RequestState, buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_SERVICE, RendererButton, RendererTable, RendererTabs, RendererTabPane, useSparkComponent, type RToolbarProps, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import type {FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import DimensionRuleEditor from './dimension-rule-editor.vue'
import {abandonRuleDeletion, retryRuleDeletionReadback, settleRuleDeletion, stageRuleDeletion, submitRuleDeletion,
  verifyRuleDeletion, type DimensionRuleDeletion} from './dimension-rule-deletion'
import {CATEGORY_SPECS, DEFINITION_SPECS, FLAG_DISPLAY, YES_NO_DISPLAY, text} from './dimension-field-spec'

const scenarioId = '88A4D51B01702C3856F4632E234BF34B'
const key = (model: string, view = 'default') => buildDataViewKey(`Bil_Dimension_${model}`, view, scenarioId)
const {sparkConsume} = useSparkComponent({type: 'dimension-design-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'dimension-design-page')
const {viewKey: bindingKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Bil_Dimension_Source_Binding', componentType: 'dimension-design-page', title: '维度中心',
})
const templateKey = key('Rule_Template'), ruleKey = key('Rule'), definitionKey = key('Definition'), dictTypeKey = key('Dict_Type')
const categoryKey = key('Biz_Category'), mappingKey = key('Source_Mapping', 'byBinding'), eventBindingKey = key('Source_Binding', 'byEvent')
const validationBindingKey = key('Source_Binding', 'validationByEvent')
const conditionKey = key('Rule_Condition', 'byRule'), resultKey = key('Rule_Result', 'byRule'), dictItemKey = key('Dict_Item', 'byType')

type Dialog = Readonly<{key: string; id: string | number; created: boolean; title: string; specs: readonly FeatureFieldSpec[]
  columns: number; validate?: (row: Readonly<DataRow>) => string | undefined; epoch: number}>
const tab = ref('binding'), busy = ref(false), message = ref(''), revision = ref(0)
const dialog = shallowRef<Dialog>()
const ruleDialog = shallowRef<Readonly<{id: string | number; created: boolean; epoch: number}>>()
const deletion = shallowRef<DimensionRuleDeletion>()
const workspaceViews: Readonly<Record<string, readonly string[]>> = {
  binding: [bindingKey], event: [templateKey], rule: [ruleKey, templateKey],
  definition: [definitionKey], dictionary: [dictTypeKey], category: [categoryKey],
}
const search = (...fields: string[]) => ({fields, placeholder: '关键字'})
let epoch = 0, stop: (() => void) | undefined

function hasPending(): boolean {
  const runtime = session.runtime
  if (busy.value || ruleDialog.value || deletion.value || runtime?.isDirty) return true
  if (!runtime || runtime.destroyed) return false
  return runtime.call.scenarioIds.some(id => {
    const dataSet = runtime.getDataSet(id)
    return dataSet && Object.values(dataSet.tables).some(table => table.viewList.some(item =>
      item.mutating || item.hasUnconfirmedSave || item.hasPendingSavedRowPermissions))
  })
}
useSystemPageDirtySource({get isDirty() {return hasPending()}})
onBeforeRouteLeave(() => !hasPending())
onBeforeRouteUpdate(() => !hasPending())

function view(viewKey: string): DataView {
  const found = session.runtime?.resolveView(viewKey)
  if (!found) throw new Error(`维度中心缺少正式视图 ${viewKey}`)
  return found
}
watch(ready, value => {
  stop?.(); stop = undefined
  if (value) stop = view(bindingKey).dataSet?.onAnyViewChange({
    rowsChanged: changed, currentRowChanged: changed, requestStateChanged: changed, cleared: changed,
  })
}, {immediate: true})
onBeforeUnmount(() => stop?.())
function changed(): void { revision.value++ }
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const rows = (viewKey: string): readonly DataRow[] => { void revision.value; return view(viewKey).rows }
function selectedLabel(viewKey: string, field: string, fallback?: string): string {
  void revision.value
  const target = view(viewKey), row = target.currentRow
  if (!row || target.requestState !== RequestState.Loaded) return ''
  if (target.fieldAccess(row, field).read !== 'visible') return '（字段不可读）'
  const value = text(row, field)
  if (value) return value
  return fallback && target.fieldAccess(row, fallback).read === 'visible' ? text(row, fallback) || '（未填写）' : '（未填写）'
}
const selectedBinding = computed(() => selectedLabel(bindingKey, 'binding_code', 'id'))
const selectedEvent = computed(() => selectedLabel(templateKey, 'event_code'))
const selectedDictType = computed(() => selectedLabel(dictTypeKey, 'dict_type_code'))
function detailError(viewKey: string): string {
  void revision.value
  const target = view(viewKey)
  return target.requestState === RequestState.Failed ? target.loadingError?.message ?? '明细查询失败' : ''
}
watch([ready, tab], ([isReady, name]) => {
  if (!isReady) return
  const targets = workspaceViews[name], owner = session.runtime
  if (!targets) { message.value = `未知维度工作区 ${name}`; return }
  void Promise.all(targets.map(async viewKey => {
    const target = view(viewKey)
    if (target.requestState === RequestState.Idle) await target.requestData()
    if (target.requestState === RequestState.Failed) throw target.loadingError ?? new Error(`工作区视图加载失败 ${viewKey}`)
  })).catch(cause => {
    if (ready.value && session.runtime === owner && tab.value === name) message.value = failure(cause)
  })
}, {immediate: true})

const col = (field: string, label: string, minWidth = 120): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true}})
const status: SparkNode = {type: 'r-select', props: {field: 'status', label: '状态', readonly: true, minWidth: 80, options: [...FLAG_DISPLAY]}}
const flag = (field: string, label: string): SparkNode =>
  ({type: 'r-select', props: {field, label, readonly: true, minWidth: 70, options: [...YES_NO_DISPLAY]}})
const bindingColumns: SparkNode[] = [col('binding_code', '锚点编码', 160), col('source_application_id', '来源应用', 160), col('source_node_id', '来源节点', 160),
  {type: 'r-select', props: {field: 'source_kind', label: '来源类型', readonly: true, minWidth: 120,
    options: [{value: 'data-model', label: '节点数据模型'}, {value: 'platform-event', label: '平台注册事件'}]}},
  col('source_model_meta_name', '数据模型', 160), col('source_contract_id', '事件合同', 160), col('event_code', '事件编码', 160),
  col('payload_version', '载荷版本', 90), col('binding_version', '绑定版本', 90), status, col('description', '说明', 200)]
const mappingColumns: SparkNode[] = [col('sort_no', '顺序', 70), col('mapping_kind', '映射方式'), col('source_field_name', '来源字段', 160),
  col('target_definition_code', '目标维度', 160), col('target_member_code', '目标成员', 140), col('mapping_value', '映射值', 140),
  flag('required_flag', '必填'), col('version_no', '版本', 70)]
const templateColumns: SparkNode[] = [col('template_name', '事件名称', 180), col('event_code', '事件编码', 160), col('biz_category', '业务分类'),
  col('source_table', '来源表', 160), col('priority', '优先级', 80), status, col('description', '说明', 200)]
const ruleColumns: SparkNode[] = [col('rule_code', '规则编码', 160), col('rule_name', '规则名称', 180), col('event_code', '事件编码', 160),
  col('biz_category', '业务分类'), col('account_set_id', '账套'), col('priority', '优先级', 80), status, col('updatetime', '更新时间', 160),
  col('description', '说明', 200)]
const definitionColumns: SparkNode[] = [col('category_code', '维度分类'), col('definition_code', '维度编码', 160), col('definition_name', '维度名称', 160),
  col('value_type', '值类型', 90), col('cardinality', '基数', 80), col('null_policy', '空值策略', 90), col('version_no', '版本', 70), status,
  col('description', '说明', 200)]
const dictTypeColumns: SparkNode[] = [col('dict_type_code', '字典类型编码', 180), col('dict_type_name', '字典类型名称', 180), status]
const dictItemColumns: SparkNode[] = [col('item_code', '编码', 160), col('item_name', '名称', 160), col('item_value', '值', 160), status]
const categoryColumns: SparkNode[] = [col('biz_category_code', '分类编码', 160), col('biz_category_name', '分类名称', 160), col('sort_no', '排序', 70),
  status, col('description', '说明', 200)]

const ruleActions = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '编辑', disabled: busy.value || !!dialog.value || !!ruleDialog.value || !!deletion.value, onClick: (row: DataRow) => void editRule(row)}},
  {type: 'r-button', props: {label: '删除', disabled: busy.value || !!dialog.value || !!ruleDialog.value || !!deletion.value, onClick: (row: DataRow) => void removeRule(row)}},
]}))
function childActions(viewKey: string): RToolbarProps {
  return {children: [
    {type: 'r-button', props: {label: '编辑', disabled: busy.value || !!dialog.value || !!ruleDialog.value || !!deletion.value, onClick: (row: DataRow) => edit(viewKey, row)}},
    {type: 'r-button', props: {label: '删除', disabled: busy.value || !!dialog.value || !!ruleDialog.value || !!deletion.value, onClick: (row: DataRow) => void remove(viewKey, row)}},
  ]}
}

async function load(viewKey: string, context: Record<string, string>): Promise<DataView> {
  const target = view(viewKey)
  target.assertResultReplacementAllowed()
  target.queryContext = context
  await target.refresh()
  if (target.loadingError) throw target.loadingError
  return target
}
async function guarded(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true; message.value = ''
  try { await action() } catch (cause) { message.value = failure(cause) } finally { busy.value = false }
}
const retryDetail = (viewKey: string) => guarded(async () => {
  const target = view(viewKey)
  await target.refresh()
  if (target.loadingError) throw target.loadingError
})
async function loadRule(id: string | number): Promise<void> {
  await Promise.all([load(conditionKey, {ruleId: String(id)}), load(resultKey, {ruleId: String(id)})])
}
async function refreshAll(): Promise<void> {
  await guarded(async () => {
    const active = workspaceViews[tab.value]
    if (!active) throw new Error(`未知维度工作区 ${tab.value}`)
    for (const viewKey of [bindingKey, templateKey, ruleKey, definitionKey, dictTypeKey, categoryKey]) {
      if (view(viewKey).requestState !== RequestState.Idle || active.includes(viewKey)) await load(viewKey, {})
    }
  })
}

const DIALOGS: Record<string, Readonly<{title: string; specs: () => readonly FeatureFieldSpec[]; columns?: number
  defaults: () => Record<string, unknown>; validate?: (id: string | number, row: Readonly<DataRow>) => string | undefined}>> = {
  [definitionKey]: {title: '维度定义', specs: () => DEFINITION_SPECS,
    defaults: () => ({value_type: 'string', cardinality: 'single', null_policy: 'allow', version_no: 1, status: 1}),
    validate: (id, row) => unique(definitionKey, ['definition_code'])(id, row) ? undefined : '维度编码已存在'},
  [categoryKey]: {title: '业务分类', specs: () => CATEGORY_SPECS, defaults: () => ({status: true, sort_no: rows(categoryKey).length + 1}),
    validate: (id, row) => unique(categoryKey, ['biz_category_code'])(id, row) ? undefined : '分类编码已存在'},
}
function unique(viewKey: string, fields: readonly string[]): (id: string | number, row: Readonly<DataRow>) => boolean {
  const target = view(viewKey)
  return (id, row) => !target.rows.some(other => target.getPkKey(other) !== id && fields.every(field => text(other, field) === text(row, field)))
}
function open(viewKey: string, id: string | number, created: boolean): void {
  const meta = DIALOGS[viewKey]
  if (!meta) throw new Error(`维度中心未登记编辑视图 ${viewKey}`)
  const validate = meta.validate
  dialog.value = {key: viewKey, id, created, title: `${created ? '新增' : '编辑'}${meta.title}`, specs: meta.specs(), columns: meta.columns ?? 1,
    ...(validate ? {validate: (row: Readonly<DataRow>) => validate(id, row)} : {}), epoch: ++epoch}
}
const add = (viewKey: string) => guarded(async () => {
  const meta = DIALOGS[viewKey], target = view(viewKey)
  if (!meta) throw new Error(`维度中心未登记编辑视图 ${viewKey}`)
  const created = await target.addRow(meta.defaults())
  const id = target.getPkKey(created)
  if (id === undefined) throw new Error('新增记录缺少原生身份')
  open(viewKey, id, true)
})
const addRule = () => guarded(async () => {
  const rule = view(ruleKey)
  for (const target of [rule, view(conditionKey), view(resultKey)]) target.assertResultReplacementAllowed()
  const created = await rule.addRow({account_set_id: 'GLOBAL', priority: 0, voucher_required: false,
    auto_voucher_write: false, stop_after_match: false, status: false})
  const id = rule.getPkKey(created)
  if (id === undefined) throw new Error('新增规则缺少原生身份')
  try {
    await loadRule(id)
    if (view(conditionKey).rows.length || view(resultKey).rows.length) throw new Error('新增规则身份与已有子项冲突')
    ruleDialog.value = {id, created: true, epoch: ++epoch}
  } catch (cause) {
    rule.discardPendingChanges([id])
    throw cause
  }
})
function edit(viewKey: string, row: DataRow): void {
  const id = view(viewKey).getPkKey(row)
  if (id === undefined) { message.value = '记录缺少原生身份'; return }
  open(viewKey, id, false)
}
const editRule = (row: DataRow) => guarded(async () => {
  const rule = view(ruleKey), id = rule.getPkKey(row)
  if (id === undefined) throw new Error('规则缺少原生身份')
  for (const target of [rule, view(conditionKey), view(resultKey)]) target.assertResultReplacementAllowed()
  await loadRule(id)
  ruleDialog.value = {id, created: false, epoch: ++epoch}
})
async function closeDialog(): Promise<void> {
  const viewKey = dialog.value?.key
  dialog.value = undefined
  if (viewKey) await guarded(async () => { await view(viewKey).refresh() })
}
function closeRuleDialog(result?: string): void {
  ruleDialog.value = undefined
  if (result) message.value = result
}

async function confirmDelete(label: string): Promise<boolean> {
  try {
    if (!await pageService.showConfirm(`确定删除"${label}"吗？`, '删除确认', {type: 'warning'})) return false
    return true
  } catch (cause) {
    if (cause === 'cancel' || cause === 'close') return false
    throw cause
  }
}
async function referenced(viewKey: string, context: Record<string, string>): Promise<boolean> {
  return (await load(viewKey, context)).rows.length > 0
}
async function deleteGuard(viewKey: string, row: DataRow, id: string | number): Promise<string | undefined> {
  if (viewKey === definitionKey) {
    const code = text(row, 'definition_code')
    if (await referenced(key('Source_Mapping', 'byDefinition'), {definitionId: String(id), definitionCode: code})) return '该维度已被来源映射引用，不能删除'
    if (await referenced(key('Rule_Result', 'byDimCode'), {dimCode: code})) return '该维度已被规则结果引用，不能删除'
  }
  if (viewKey === categoryKey) {
    const code = text(row, 'biz_category_code')
    if (await referenced(key('Rule', 'byCategory'), {bizCategory: code})) return '该业务分类已被规则引用，不能删除'
    if (await referenced(key('Rule_Template', 'byCategory'), {bizCategory: code})) return '该业务分类已被事件合同引用，不能删除'
  }
  return undefined
}
const LABEL_FIELDS = ['definition_name', 'biz_category_name', 'field_code', 'dim_code']
const remove = (viewKey: string, row: DataRow) => guarded(async () => {
  const target = view(viewKey), id = target.getPkKey(row)
  if (id === undefined) throw new Error('记录缺少原生身份')
  const blocked = await deleteGuard(viewKey, row, id)
  if (blocked) throw new Error(blocked)
  if (!await confirmDelete(LABEL_FIELDS.map(field => text(row, field)).find(Boolean) ?? String(id))) return
  await target.removeRow(id)
  const result = await target.dataSet?.saveChanges({views: [{tableName: target.tableName, viewId: target.viewId, ids: [id]}]})
  if (!result?.success) {
    if (!target.hasUnconfirmedSave) target.discardPendingChanges([id])
    throw new Error(result?.error?.message ?? '删除结果未确认，请刷新核验')
  }
  message.value = '删除成功'
  await target.refresh()
})
const removeRule = (row: DataRow) => guarded(async () => {
  const rule = view(ruleKey), id = rule.getPkKey(row)
  if (id === undefined) throw new Error('规则缺少原生身份')
  for (const target of [rule, view(conditionKey), view(resultKey)]) target.assertResultReplacementAllowed()
  if (!await confirmDelete(text(row, 'rule_name') || String(id))) return
  await loadRule(id)
  const state = await stageRuleDeletion({rule, children: [view(conditionKey), view(resultKey)], id})
  deletion.value = state
  await submitRuleDeletion(state)
  updateDeletion(state)
})
function updateDeletion(state: DimensionRuleDeletion): void {
  revision.value++
  message.value = state.message
  if (state.phase === 'done') deletion.value = undefined
}
const verifyDelete = () => guarded(async () => {
  const state = deletion.value
  if (!state) return
  await verifyRuleDeletion(state)
  updateDeletion(state)
})
const continueDelete = () => guarded(async () => {
  const state = deletion.value
  if (!state) return
  await submitRuleDeletion(state)
  updateDeletion(state)
})
async function confirmRecovery(message: string): Promise<boolean> {
  try {
    if (!await pageService.showConfirm(message, '核对规则删除', {type: 'warning', confirmText: '继续', cancelText: '返回'})) return false
    return true
  } catch (cause) {
    if (cause === 'cancel' || cause === 'close') return false
    throw cause
  }
}
const settleDelete = () => guarded(async () => {
  const state = deletion.value
  if (!state || !await confirmRecovery('部分删除可能已生效。只放弃尚未提交的本地删除并回读，不撤销服务端记录。')) return
  await settleRuleDeletion(state)
  updateDeletion(state)
})
const abandonDelete = () => guarded(async () => {
  const state = deletion.value
  if (!state || !await confirmRecovery('原删除可能已部分或全部生效。放弃核验不会撤销服务端记录，将回读实际结果。')) return
  await abandonRuleDeletion(state)
  updateDeletion(state)
})
const retryDeleteReadback = () => guarded(async () => {
  const state = deletion.value
  if (!state) return
  await retryRuleDeletionReadback(state)
  updateDeletion(state)
})
function dismissDeleteReadback(): void {
  if (busy.value || deletion.value?.phase !== 'reload') return
  message.value = `删除回执已确认，但回读未完成；请核对规则 ${String(deletion.value.id)} 及其子项`
  deletion.value = undefined
}
</script>

<style scoped>
.dimension-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.dimension-page__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.dimension-page__header h1 {margin: 0; font-size: 20px}
.dimension-page__header p {margin: 4px 0 0; color: var(--el-text-color-secondary)}
.dimension-page__actions {display: flex; flex-wrap: wrap; gap: 8px}
.dimension-page h2 {margin: 16px 0 8px; font-size: 16px}
</style>
