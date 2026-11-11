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
      <RendererButton v-if="ready" label="刷新" :disabled="busy || !!dialog" @click="refreshAll" />
    </header>
    <p v-if="loading" role="status">正在加载维度配置…</p>
    <p v-if="error || message" role="alert">{{ error || message }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <RendererTabs v-if="ready" v-model="tab">
      <RendererTabPane label="来源锚点" name="binding" :index="0">
        <RendererTable :data-view-key="bindingKey" :children="bindingColumns" :current-page-search="search('binding_code', 'source_model_meta_name', 'event_code')" :highlight-current-row="true"
          :show-data-view-meta="false" :on-row-click="selectBinding" />
        <template v-if="selectedBinding">
          <h2>映射明细：{{ selectedBinding }}</h2>
          <RendererTable :data-view-key="mappingKey" :children="mappingColumns" :show-data-view-meta="false" />
        </template>
      </RendererTabPane>
      <RendererTabPane label="事件合同" name="event" :index="1">
        <RendererTable :data-view-key="templateKey" :children="templateColumns" :current-page-search="search('template_name', 'event_code')" :highlight-current-row="true"
          :show-data-view-meta="false" :on-row-click="selectEvent" />
        <template v-if="selectedEvent">
          <h2>蓝图锚点：{{ selectedEvent }}</h2>
          <RendererTable :data-view-key="eventBindingKey" :children="bindingColumns" :show-data-view-meta="false" />
        </template>
      </RendererTabPane>
      <RendererTabPane label="规则治理" name="rule" :index="2">
        <RendererButton label="新增规则" :disabled="busy || !!dialog" @click="addRule" />
        <RendererTable :data-view-key="ruleKey" :children="ruleColumns" :actions="ruleActions" :current-page-search="search('rule_code', 'rule_name', 'event_code')"
          :highlight-current-row="true" :show-data-view-meta="false" :on-row-click="selectRule" />
        <template v-if="selectedRule">
          <h2>条件：{{ selectedRuleCode }}</h2>
          <RendererButton label="新增条件" :disabled="busy || !!dialog" @click="addCondition" />
          <RendererTable :data-view-key="conditionKey" :children="conditionColumns" :actions="childActions(conditionKey)" :show-data-view-meta="false" />
          <h2>结果：{{ selectedRuleCode }}</h2>
          <RendererButton label="新增结果" :disabled="busy || !!dialog" @click="addResult" />
          <RendererTable :data-view-key="resultKey" :children="resultColumns" :actions="childActions(resultKey)" :show-data-view-meta="false" />
        </template>
      </RendererTabPane>
      <RendererTabPane label="维度定义" name="definition" :index="3">
        <RendererButton label="新增维度" :disabled="busy || !!dialog" @click="add(definitionKey)" />
        <RendererTable :data-view-key="definitionKey" :children="definitionColumns" :actions="childActions(definitionKey)"
          :current-page-search="search('definition_code', 'definition_name')" :show-data-view-meta="false" />
      </RendererTabPane>
      <RendererTabPane label="已有映射（只读）" name="dictionary" :index="4">
        <RendererTable :data-view-key="dictTypeKey" :children="dictTypeColumns" :highlight-current-row="true" :show-data-view-meta="false"
          :on-row-click="selectDictType" />
        <template v-if="selectedDictType">
          <h2>字典项：{{ selectedDictType }}</h2>
          <RendererTable :data-view-key="dictItemKey" :children="dictItemColumns" :show-data-view-meta="false" />
        </template>
      </RendererTabPane>
      <RendererTabPane label="业务分类" name="category" :index="5">
        <RendererButton label="新增分类" :disabled="busy || !!dialog" @click="add(categoryKey)" />
        <RendererTable :data-view-key="categoryKey" :children="categoryColumns" :actions="childActions(categoryKey)"
          :current-page-search="search('biz_category_code', 'biz_category_name')" :show-data-view-meta="false" />
      </RendererTabPane>
    </RendererTabs>
    <DimensionRecordDialog v-if="ready && dialog" :key="dialog.epoch" :data-view-key="dialog.key" :record-id="dialog.id" :created="dialog.created"
      :title="dialog.title" :specs="dialog.specs" :columns="dialog.columns" :width="dialog.columns === 2 ? 900 : 660" :validate="dialog.validate"
      @close="closeDialog" />
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {ElMessageBox} from 'element-plus'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererTable, RendererTabs, RendererTabPane, type RToolbarProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import DimensionRecordDialog from './dimension-record-dialog.vue'
import {CATEGORY_SPECS, DEFINITION_SPECS, FLAG_DISPLAY, RESULT_SPECS, YES_NO_DISPLAY, conditionSpecs, enabled, ruleSpecs, text, validateResult,
  type DimensionFieldSpec} from './dimension-field-spec'

const scenarioId = '88A4D51B01702C3856F4632E234BF34B'
const key = (model: string, view = 'default') => buildDataViewKey(`Bil_Dimension_${model}`, view, scenarioId)
const {viewKey: bindingKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Bil_Dimension_Source_Binding', componentType: 'dimension-design-page', title: '维度中心',
  optionModels: ['Rule_Template', 'Rule', 'Definition', 'Dict_Type', 'Biz_Category'].map(name => `Bil_Dimension_${name}`),
})
const templateKey = key('Rule_Template'), ruleKey = key('Rule'), definitionKey = key('Definition'), dictTypeKey = key('Dict_Type')
const categoryKey = key('Biz_Category'), mappingKey = key('Source_Mapping', 'byBinding'), eventBindingKey = key('Source_Binding', 'byEvent')
const conditionKey = key('Rule_Condition', 'byRule'), resultKey = key('Rule_Result', 'byRule'), dictItemKey = key('Dict_Item', 'byType')

type Dialog = Readonly<{key: string; id: string | number; created: boolean; title: string; specs: readonly DimensionFieldSpec[]
  columns: number; validate?: (row: Readonly<DataRow>) => string | undefined; epoch: number}>
const tab = ref('binding'), busy = ref(false), message = ref(''), revision = ref(0)
const dialog = shallowRef<Dialog>()
const selectedBinding = ref(''), selectedEvent = ref(''), selectedRule = ref<string | number>(), selectedDictType = ref('')
const search = (...fields: string[]) => ({fields, placeholder: '关键字'})
let epoch = 0, stop: (() => void) | undefined

function view(viewKey: string): DataView {
  const found = session.runtime?.resolveView(viewKey)
  if (!found) throw new Error(`维度中心缺少正式视图 ${viewKey}`)
  return found
}
watch(ready, value => {
  stop?.(); stop = undefined
  if (value) stop = view(bindingKey).dataSet?.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed, cleared: changed})
}, {immediate: true})
onBeforeUnmount(() => stop?.())
function changed(): void { revision.value++ }
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const rows = (viewKey: string): readonly DataRow[] => { void revision.value; return view(viewKey).rows }
const selectedRuleRow = computed(() => rows(ruleKey).find(row => view(ruleKey).getPkKey(row) === selectedRule.value))
const selectedRuleCode = computed(() => text(selectedRuleRow.value, 'rule_code'))

const col = (field: string, label: string, minWidth = 120): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true}})
const status: SparkNode = {type: 'r-select', props: {field: 'status', label: '状态', readonly: true, minWidth: 80, options: [...FLAG_DISPLAY]}}
const flag = (field: string, label: string): SparkNode =>
  ({type: 'r-select', props: {field, label, readonly: true, minWidth: 70, options: [...YES_NO_DISPLAY]}})
const bindingColumns: SparkNode[] = [col('binding_code', '锚点编码', 160), col('source_application_id', '来源应用', 160), col('source_node_id', '来源节点', 160),
  {type: 'r-select', props: {field: 'source_kind', label: '来源类型', readonly: true, minWidth: 120,
    options: [{value: 'data-model', label: '节点数据模型'}, {value: 'event', label: '平台注册事件'}]}},
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
const conditionColumns: SparkNode[] = [col('sort_no', '顺序', 70), col('result_id', '作用结果', 160), col('field_code', '字段', 160),
  col('operator', '运算符', 90), col('value_source', '来源', 80), col('compare_value', '比较值', 140), col('compare_field', '比较字段', 140),
  col('description', '说明', 160)]
const resultColumns: SparkNode[] = [col('sort_no', '顺序', 70), col('dim_category', '维度分类'), col('collection_path', '集合路径', 140),
  col('dim_code', '维度编码', 140), col('value_type', '取值类型', 90), col('value_expr', '取值表达式', 160), col('amount_type', '金额类型', 90),
  col('amount_expr', '金额表达式', 140), flag('required_flag', '必填'), col('description', '说明', 160)]
const definitionColumns: SparkNode[] = [col('category_code', '维度分类'), col('definition_code', '维度编码', 160), col('definition_name', '维度名称', 160),
  col('value_type', '值类型', 90), col('cardinality', '基数', 80), col('null_policy', '空值策略', 90), col('version_no', '版本', 70), status,
  col('description', '说明', 200)]
const dictTypeColumns: SparkNode[] = [col('dict_type_code', '字典类型编码', 180), col('dict_type_name', '字典类型名称', 180), status]
const dictItemColumns: SparkNode[] = [col('item_code', '编码', 160), col('item_name', '名称', 160), col('item_value', '值', 160), status]
const categoryColumns: SparkNode[] = [col('biz_category_code', '分类编码', 160), col('biz_category_name', '分类名称', 160), col('sort_no', '排序', 70),
  status, col('description', '说明', 200)]

const ruleActions = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '编辑', disabled: busy.value || !!dialog.value, onClick: (row: DataRow) => void editRule(row)}},
  {type: 'r-button', props: {label: '删除', disabled: busy.value || !!dialog.value, onClick: (row: DataRow) => void removeRule(row)}},
]}))
function childActions(viewKey: string): RToolbarProps {
  return {children: [
    {type: 'r-button', props: {label: '编辑', disabled: busy.value || !!dialog.value, onClick: (row: DataRow) => edit(viewKey, row)}},
    {type: 'r-button', props: {label: '删除', disabled: busy.value || !!dialog.value, onClick: (row: DataRow) => void remove(viewKey, row)}},
  ]}
}

async function load(viewKey: string, context: Record<string, string>): Promise<DataView> {
  const target = view(viewKey)
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
const selectBinding = (row: DataRow) => guarded(async () => {
  const id = text(row, 'id'); selectedBinding.value = text(row, 'binding_code') || id
  await load(mappingKey, {bindingId: id})
})
const selectEvent = (row: DataRow) => guarded(async () => {
  selectedEvent.value = text(row, 'event_code')
  await load(eventBindingKey, {eventCode: selectedEvent.value})
})
const selectDictType = (row: DataRow) => guarded(async () => {
  selectedDictType.value = text(row, 'dict_type_code')
  await load(dictItemKey, {dictTypeCode: selectedDictType.value})
})
async function loadRule(id: string | number): Promise<void> {
  selectedRule.value = id
  await Promise.all([load(conditionKey, {ruleId: String(id)}), load(resultKey, {ruleId: String(id)})])
}
const selectRule = (row: DataRow) => guarded(async () => {
  const id = view(ruleKey).getPkKey(row)
  if (id !== undefined) await loadRule(id)
})
async function refreshAll(): Promise<void> {
  await guarded(async () => {
    selectedBinding.value = ''; selectedEvent.value = ''; selectedRule.value = undefined; selectedDictType.value = ''
    for (const viewKey of [bindingKey, templateKey, ruleKey, definitionKey, dictTypeKey, categoryKey]) await load(viewKey, {})
  })
}

const DIALOGS: Record<string, Readonly<{title: string; specs: () => readonly DimensionFieldSpec[]; columns?: number
  defaults: () => Record<string, unknown>; validate?: (id: string | number, row: Readonly<DataRow>) => string | undefined}>> = {
  [definitionKey]: {title: '维度定义', specs: () => DEFINITION_SPECS,
    defaults: () => ({value_type: 'string', cardinality: 'single', null_policy: 'allow', version_no: 1, status: 1}),
    validate: (id, row) => unique(definitionKey, ['definition_code'])(id, row) ? undefined : '维度编码已存在'},
  [categoryKey]: {title: '业务分类', specs: () => CATEGORY_SPECS, defaults: () => ({status: true, sort_no: rows(categoryKey).length + 1}),
    validate: (id, row) => unique(categoryKey, ['biz_category_code'])(id, row) ? undefined : '分类编码已存在'},
  [ruleKey]: {title: '规则', specs: () => ruleSpecs(templateKey), columns: 2, validate: validateRule,
    defaults: () => ({account_set_id: 'GLOBAL', priority: 0, voucher_required: false, auto_voucher_write: false, stop_after_match: false, status: false})},
  [conditionKey]: {title: '规则条件', specs: () => conditionSpecs(resultKey), columns: 2, defaults: () => childDefaults(conditionKey,
    {operator: 'equal', value_source: 'CONST'})},
  [resultKey]: {title: '规则结果', specs: () => RESULT_SPECS, columns: 2, validate: (_id, row) => validateResult(row),
    defaults: () => childDefaults(resultKey, {dim_code_type: 'CONST', value_type: 'FIELD', amount_type: 'NONE', required_flag: true})},
}
function childDefaults(viewKey: string, values: Record<string, unknown>): Record<string, unknown> {
  const rule = selectedRuleRow.value
  if (!rule || selectedRule.value === undefined) throw new Error('请先选择规则')
  const sort = Math.max(0, ...rows(viewKey).map(row => Number(row['sort_no'] ?? 0)))
  return {...values, rule_id: String(selectedRule.value), account_set_id: text(rule, 'account_set_id') || 'GLOBAL', sort_no: sort + 1}
}
function unique(viewKey: string, fields: readonly string[]): (id: string | number, row: Readonly<DataRow>) => boolean {
  const target = view(viewKey)
  return (id, row) => !target.rows.some(other => target.getPkKey(other) !== id && fields.every(field => text(other, field) === text(row, field)))
}
function validateRule(id: string | number, row: Readonly<DataRow>): string | undefined {
  const event = rows(templateKey).find(item => text(item, 'event_code') === text(row, 'event_code'))
  if (!event) return '请选择已登记的事件'
  if (text(row, 'biz_category') !== text(event, 'biz_category')) view(ruleKey).updateEditingValue(id, 'biz_category', text(event, 'biz_category'))
  if (!unique(ruleKey, ['rule_code', 'account_set_id'])(id, row)) return '同一账套下规则编码已存在'
  if (!enabled(row, 'status')) return undefined
  if (!enabled(event, 'status')) return '启用规则须绑定已启用的事件'
  if (!rows(bindingKey).some(item => text(item, 'event_code') === text(row, 'event_code') && enabled(item, 'status'))) {
    return '启用规则前须先为该事件登记已启用的来源锚点'
  }
  if (selectedRule.value !== id || rows(resultKey).length === 0) return '启用规则须至少配置一条结果；新规则请先保存为停用并补充结果'
  return undefined
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
const addRule = () => add(ruleKey)
const addCondition = () => add(conditionKey)
const addResult = () => add(resultKey)
function edit(viewKey: string, row: DataRow): void {
  const id = view(viewKey).getPkKey(row)
  if (id === undefined) { message.value = '记录缺少原生身份'; return }
  open(viewKey, id, false)
}
const editRule = (row: DataRow) => guarded(async () => {
  const id = view(ruleKey).getPkKey(row)
  if (id === undefined) throw new Error('规则缺少原生身份')
  await loadRule(id)
  open(ruleKey, id, false)
})
async function closeDialog(): Promise<void> {
  const viewKey = dialog.value?.key
  dialog.value = undefined
  if (viewKey) await guarded(async () => { await view(viewKey).refresh() })
}

async function confirmDelete(label: string): Promise<boolean> {
  return ElMessageBox.confirm(`确定删除"${label}"吗？`, '删除确认', {type: 'warning'}).then(() => true, () => false)
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
  if (viewKey === resultKey && rows(conditionKey).some(item => text(item, 'result_id') === String(id))) return '该结果仍被条件引用，请先调整条件'
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
  if (!await confirmDelete(text(row, 'rule_name') || String(id))) return
  await loadRule(id)
  const children = [view(conditionKey), view(resultKey)]
  for (const child of children) for (const item of [...child.rows]) {
    const childId = child.getPkKey(item)
    if (childId !== undefined) await child.removeRow(childId)
  }
  await rule.removeRow(id)
  const dataSet = rule.dataSet
  if (!dataSet) throw new Error('规则视图缺少DataSet')
  const result = await dataSet.saveChangesInPhases([
    {views: children.map(child => ({tableName: child.tableName, viewId: child.viewId}))},
    {views: [{tableName: rule.tableName, viewId: rule.viewId, ids: [id]}]},
  ])
  if (!result.success) throw new Error('规则删除未全部确认，请刷新核验后重试')
  selectedRule.value = undefined
  message.value = '删除成功'
  await rule.refresh()
})
</script>

<style scoped>
.dimension-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.dimension-page__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.dimension-page__header h1 {margin: 0; font-size: 20px}
.dimension-page__header p {margin: 4px 0 0; color: var(--el-text-color-secondary)}
.dimension-page h2 {margin: 16px 0 8px; font-size: 16px}
</style>
