<template>
  <RendererDialog :model-value="true" :data-view-key="ruleKey" :title="created ? '新增维度规则' : '编辑维度规则'"
    :width="1060" :append-to-body="true" :close-disabled="!canClose" @update:model-value="open => {if (!open) cancel()}">
    <div class="rule-editor">
      <p v-if="hint" role="alert">{{ hint }}</p>
      <p v-if="!current" role="alert">原规则编辑身份已变化，不能处理本窗修改。</p>
      <p v-else-if="foreignUnknown" role="alert">存在其他操作的待核验提交，本窗不能接管。</p>
      <p v-else-if="interrupted" role="alert">核验状态已部分改变，请保留本窗并按原记录身份核对。</p>
      <p>规则引用既有事件合同。停用草稿也须至少配置一条结果；启用前须核实正式来源锚点。</p>
      <FeatureRecordFields :data-view-key="ruleKey" :record-id="ruleId" :row="editing(rule, ruleId)"
        :specs="ruleFields" :locked="locked" :columns="2" />

      <div class="rule-editor__heading"><h3>匹配条件</h3><RendererButton label="添加条件" :disabled="locked" @click="addCondition" /></div>
      <p v-if="conditionIds.length === 0">没有条件时，本规则适用于该事件的全部输入。</p>
      <p>条件可作用于根事实或某个结果行；集合结果可使用 root、item、parent 上下文。不为零包含负数。</p>
      <section v-for="(id, index) in conditionIds" :key="id" class="rule-editor__section">
        <div class="rule-editor__heading"><strong>条件 {{ index + 1 }}</strong>
          <RendererButton label="删除条件" :disabled="locked" @click="removeCondition(id)" /></div>
        <FeatureRecordFields :data-view-key="conditionKey" :record-id="id" :row="editing(condition, id)"
          :specs="conditionFields" :locked="locked" :columns="2" />
      </section>

      <div class="rule-editor__heading"><h3>结果明细</h3><RendererButton label="添加结果" :disabled="locked" @click="addResult" /></div>
      <p>集合路径使用 details[] 或 details[].auxiliaries[]；集合结果须配置稳定来源行 ID。</p>
      <section v-for="(id, index) in resultIds" :key="id" class="rule-editor__section">
        <div class="rule-editor__heading"><strong>结果 {{ index + 1 }} · {{ String(id) }}</strong>
          <RendererButton label="删除结果" :disabled="locked" @click="removeResult(id)" /></div>
        <FeatureRecordFields :data-view-key="resultKey" :record-id="id" :row="editing(result, id)"
          :specs="RESULT_SPECS" :locked="locked" :columns="2" />
      </section>
    </div>
    <template #footer>
      <RendererButton :label="accepted ? '返回并核对' : '取消'" :disabled="!canClose" @click="cancel" />
      <RendererButton v-if="ownUnknown && !interrupted" label="放弃核验并返回" :disabled="busy || !current" @click="abandon" />
      <RendererButton v-if="reconcile && !unknown" label="放弃未保存修改并回读" :disabled="busy || !current" @click="reconcileChanges" />
      <RendererButton v-else :label="saveLabel" button-type="primary"
        :disabled="busy || !current || foreignUnknown || interrupted || recoveryEnded" @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef} from 'vue'
import {DataSetSavePreflightError, DataViewSaveNotAppliedError, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {PAGE_SERVICE, PAGE_RUNTIME, RendererButton, RendererDialog, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import FeatureRecordFields from '@/views/features/shared/record/feature-record-fields.vue'
import {missingFeatureField, type FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import {RESULT_SPECS, conditionSpecs, enabled, ruleSpecs, text, validateResult} from './dimension-field-spec'

type Id = string | number
type ExpectedRow = Readonly<{id: Id; action: 'added' | 'changed' | 'deleted'; values: Readonly<Record<string, unknown>>
  snapshot?: Readonly<Record<string, unknown>>}>
type SaveGroup = Readonly<{view: DataView; ids: readonly Id[]; rows: readonly ExpectedRow[]}>
type RuleEditorProps = Readonly<{ruleKey: string; conditionKey: string; resultKey: string; eventKey: string; bindingKey: string
  ruleId: Id; created: boolean}>

const props = defineProps<RuleEditorProps>()
const emit = defineEmits<{close: [message?: string]}>()
const {sparkConsume} = useSparkComponent({type: 'dimension-rule-editor'})
const pageService = consumeRequiredPageService(sparkConsume, 'dimension-rule-editor')

const runtime = sparkConsume(PAGE_RUNTIME)
function view(key: string): DataView {
  const found = runtime?.resolveView(key)
  if (!found) throw new Error(`规则编辑器缺少正式视图 ${key}`)
  return found
}
const rule = view(props.ruleKey), condition = view(props.conditionKey), result = view(props.resultKey)
const events = view(props.eventKey), bindings = view(props.bindingKey), owner = rule.dataSet
if (!runtime || !owner || [condition, result, events, bindings].some(item => item.dataSet !== owner)) {
  throw new Error('规则编辑器缺少同一DataSet')
}
const page = runtime, dataSet = owner
const keys = [props.ruleKey, props.conditionKey, props.resultKey, props.eventKey, props.bindingKey]
const views = [rule, condition, result, events, bindings]
const editedViews = [rule, condition, result]
const contexts = views.map(item => JSON.stringify(item.queryContext))
const owned = new Map<DataView, Set<Id>>([[rule, new Set([props.ruleId])], [condition, new Set()], [result, new Set()]])
const binding = {...props}
const ruleFields = ruleSpecs(props.eventKey), conditionFields = conditionSpecs(props.resultKey)
const busy = ref(false), hint = ref(''), revision = ref(0), interrupted = ref(false), accepted = ref(false), reconcile = ref(false)
const failure = shallowRef<Error>(), captured = shallowRef<readonly SaveGroup[]>()
let active = true

for (const child of [condition, result]) {
  for (const row of child.rows) {
    const id = child.getPkKey(row)
    if (id === undefined || owned.get(child)?.has(id) || text(row, 'rule_id') !== String(props.ruleId)) {
      throw new Error('规则子项缺少唯一身份或不属于当前规则')
    }
    owned.get(child)?.add(id)
  }
}
if (!rule.getEditingRow(props.ruleId)) throw new Error('规则编辑器缺少当前规则')

function isCurrent(): boolean {
  return active && !page.destroyed && !dataSet.destroyed && sparkConsume(PAGE_RUNTIME) === page
    && props.ruleId === binding.ruleId && props.created === binding.created
    && props.ruleKey === binding.ruleKey && props.conditionKey === binding.conditionKey && props.resultKey === binding.resultKey
    && props.eventKey === binding.eventKey && props.bindingKey === binding.bindingKey
    && keys.every((key, index) => page.resolveView(key) === views[index] && JSON.stringify(views[index]?.queryContext) === contexts[index])
}
const current = computed(() => {void revision.value; return isCurrent()})
const unknown = computed(() => {void revision.value; return editedViews.some(item => item.hasUnconfirmedSave)})
const ownUnknown = computed(() => unknown.value && failure.value !== undefined && captured.value !== undefined
  && editedViews.filter(item => item.hasUnconfirmedSave).every(item =>
    captured.value?.some(group => group.view === item && item.hasUnconfirmedSaveFor(group.ids, failure.value))))
const foreignUnknown = computed(() => unknown.value && !ownUnknown.value)
const recoveryEnded = computed(() => failure.value !== undefined && !unknown.value)
const locked = computed(() => busy.value || !current.value || unknown.value || interrupted.value || accepted.value
  || reconcile.value || captured.value !== undefined)
const canClose = computed(() => !busy.value && current.value && !unknown.value && !interrupted.value
  && !recoveryEnded.value && !reconcile.value)
const saveLabel = computed(() => ownUnknown.value ? '核验原保存结果' : accepted.value ? '重试回读' :
  captured.value ? '重新保存原修改' : '保存规则')

function ids(target: DataView): Id[] {
  void revision.value
  return target.rows.map(row => {
    const id = target.getPkKey(row)
    if (id === undefined) throw new Error('规则子项缺少原生身份')
    return id
  })
}
const conditionIds = computed(() => ids(condition)), resultIds = computed(() => ids(result))
function editing(target: DataView, id: Id): Readonly<DataRow> | undefined {
  void revision.value
  return target.getEditingRow(id) ?? undefined
}
function changed(): void {revision.value++}
const stop = dataSet.onAnyViewChange({rowsChanged: changed, editingChanged: changed, editingDiscarded: changed,
  mutatingChanged: changed, requestStateChanged: changed, editingFieldChanged: (table, viewId, event) => {
    changed()
    if (table !== rule.tableName || viewId !== rule.viewId || event.rowId !== binding.ruleId || event.field !== 'event_code') return
    const matches = events.rows.filter(row => text(row, 'event_code') === String(event.nextValue ?? '').trim())
    if (matches.length !== 1) {hint.value = matches.length > 1 ? '事件编码不唯一，不能确定业务分类' : ''; return}
    const selected = matches[0]
    if (!selected || ['event_code', 'biz_category'].some(field => events.fieldAccess(selected, field).read !== 'visible')) {
      hint.value = '事件合同字段不可读取，不能确定业务分类'
      return
    }
    try {rule.updateEditingValue(binding.ruleId, 'biz_category', text(selected, 'biz_category'))}
    catch (cause) {hint.value = cause instanceof Error ? cause.message : String(cause)}
  }})
onBeforeUnmount(() => {active = false; stop()})

async function addChild(target: DataView, defaults: Record<string, unknown>): Promise<void> {
  if (locked.value || !isCurrent()) return
  busy.value = true; hint.value = ''
  try {
    const parent = rule.getEditingRow(binding.ruleId)
    if (!parent) throw new Error('规则已不存在')
    const sort = Math.max(0, ...target.rows.map(row => Number(row['sort_no'] ?? 0)))
    const row = await target.addRow({...defaults, rule_id: String(binding.ruleId),
      account_set_id: text(parent, 'account_set_id'), sort_no: sort + 1})
    if (!isCurrent()) return
    const id = target.getPkKey(row)
    if (id === undefined || owned.get(target)?.has(id)) throw new Error('新增规则子项缺少唯一身份')
    owned.get(target)?.add(id)
  } catch (cause) {hint.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
const addCondition = () => addChild(condition, {operator: 'equal', value_source: 'CONST'})
const addResult = () => addChild(result, {dim_code_type: 'CONST', value_type: 'FIELD', amount_type: 'NONE', required_flag: true})

async function removeChild(target: DataView, id: Id): Promise<void> {
  if (locked.value || !isCurrent()) return
  if (!owned.get(target)?.has(id)) {hint.value = '规则子项不属于本次编辑'; return}
  if (target === result && conditionIds.value.some(conditionId => text(condition.getEditingRow(conditionId) ?? undefined, 'result_id') === String(id))) {
    hint.value = '该结果仍被条件引用，请先调整或删除条件'
    return
  }
  busy.value = true; hint.value = ''
  try {
    if (await target.removeRow(id) !== true) throw new Error('规则子项删除未完成')
  } catch (cause) {hint.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
const removeCondition = (id: Id) => removeChild(condition, id)
const removeResult = (id: Id) => removeChild(result, id)

function validateFields(specs: readonly FeatureFieldSpec[], row: Readonly<DataRow>, label: string): void {
  const missing = missingFeatureField(specs, row)
  if (missing) throw new Error(`${label}请填写${missing.label}`)
}
function validateSelections(specs: readonly FeatureFieldSpec[], row: Readonly<DataRow>, label: string): void {
  for (const spec of specs) {
    const value = row[spec.field]
    if (!spec.options?.length || value === undefined || value === null || value === '') continue
    if (!spec.options.some(option => Object.is(option.value, value))) throw new Error(`${label}${spec.label}无效`)
  }
}
const draftExpressions = new Set(['compare_value', 'compare_field', 'value_name_expr', 'amount_expr',
  'direction_expr', 'currency_expr', 'period_expr'])
const anchorFields = ['id', 'binding_code', 'source_application_id', 'source_node_id', 'source_kind', 'source_model_id',
  'source_model_meta_name', 'source_contract_id', 'event_code', 'payload_version', 'binding_version', 'effective_from', 'effective_to', 'status']
function validAnchor(row: Readonly<DataRow>, eventCode: string, now: number): boolean {
  if (!enabled(row, 'status') || text(row, 'event_code') !== eventCode
    || !['id', 'binding_code', 'source_application_id', 'source_node_id'].every(field => text(row, field))) return false
  const kind = text(row, 'source_kind')
  if (kind === 'data-model') {
    if (!text(row, 'source_model_id') || !text(row, 'source_model_meta_name')) return false
  } else if (kind === 'platform-event') {
    if (!text(row, 'source_contract_id')) return false
  } else return false
  if (!['payload_version', 'binding_version'].every(field => {
    const value = Number(row[field])
    return Number.isInteger(value) && value >= 1
  })) return false
  const from = text(row, 'effective_from'), to = text(row, 'effective_to')
  return (!from || !Number.isNaN(Date.parse(from)) && Date.parse(from) <= now)
    && (!to || !Number.isNaN(Date.parse(to)) && Date.parse(to) >= now)
}
function normalizeOrder(target: DataView, currentIds: readonly Id[]): void {
  const membershipChanged = [...(owned.get(target) ?? [])].some(id =>
    target.dirtyTracking.isPendingCreate(id) || target.dirtyTracking.pendingDeleteIds.has(id))
  if (!membershipChanged) return
  for (const [index, id] of currentIds.entries()) {
    const row = target.getEditingRow(id)
    if (!row) throw new Error('规则子项已不存在')
    if (Number(row['sort_no']) !== index + 1) target.updateEditingValue(id, 'sort_no', index + 1)
  }
}
async function validate(): Promise<void> {
  const header = rule.getEditingRow(binding.ruleId)
  if (!header) throw new Error('规则已不存在')
  validateFields(ruleFields, header, '规则')
  const activeRule = enabled(header, 'status')
  if (rule.rows.some(other => rule.getPkKey(other) !== binding.ruleId
    && text(other, 'rule_code') === text(header, 'rule_code') && text(other, 'account_set_id') === text(header, 'account_set_id'))) {
    throw new Error('同一账套下规则编码已存在')
  }
  if (!Number.isFinite(Number(header['priority'] ?? 0))) throw new Error('规则优先级必须为有限数字')
  if (resultIds.value.length === 0) throw new Error('规则须至少配置一条结果')
  normalizeOrder(condition, conditionIds.value)
  normalizeOrder(result, resultIds.value)
  const resultSet = new Set(resultIds.value.map(String))
  for (const [index, id] of conditionIds.value.entries()) {
    const row = condition.getEditingRow(id)
    if (!row) throw new Error(`条件 ${index + 1} 已不存在`)
    validateFields(activeRule ? conditionFields : conditionFields.filter(spec => !draftExpressions.has(spec.field)), row, `条件 ${index + 1}`)
    validateSelections(conditionFields, row, `条件 ${index + 1}`)
    if (!['CONST', 'FIELD'].includes(text(row, 'value_source'))) throw new Error(`条件 ${index + 1}比较来源无效`)
    if (!Number.isFinite(Number(row['sort_no']))) throw new Error(`条件 ${index + 1} 排序必须为有限数字`)
    if (text(row, 'result_id') && !resultSet.has(text(row, 'result_id'))) throw new Error(`条件 ${index + 1} 引用的结果不存在`)
  }
  for (const [index, id] of resultIds.value.entries()) {
    let row = result.getEditingRow(id)
    if (!row) throw new Error(`结果 ${index + 1} 已不存在`)
    for (const [field, value] of [['dim_code_type', 'CONST'], ['amount_type', 'NONE']] as const) {
      if (!text(row, field)) result.updateEditingValue(id, field, value)
    }
    row = result.getEditingRow(id)
    if (!row) throw new Error(`结果 ${index + 1} 已不存在`)
    validateFields(activeRule ? RESULT_SPECS : RESULT_SPECS.filter(spec => !draftExpressions.has(spec.field)), row, `结果 ${index + 1}`)
    validateSelections(RESULT_SPECS, row, `结果 ${index + 1}`)
    if (!Number.isFinite(Number(row['sort_no']))) throw new Error(`结果 ${index + 1} 排序必须为有限数字`)
    const invalid = validateResult(row)
    if (invalid) throw new Error(`结果 ${index + 1}：${invalid}`)
  }
  if (activeRule) {
    const eventMatches = events.rows.filter(item => text(item, 'event_code') === text(header, 'event_code') && enabled(item, 'status'))
    if (eventMatches.length !== 1) throw new Error('启用规则须绑定唯一已启用的事件合同')
    const event = eventMatches[0]
    if (!event || ['event_code', 'biz_category', 'status'].some(field => events.fieldAccess(event, field).read !== 'visible')) {
      throw new Error('事件合同字段不可读取，无法校验规则')
    }
    if (!text(event, 'biz_category') || text(header, 'biz_category') !== text(event, 'biz_category')) {
      throw new Error('启用规则的业务分类须与事件合同一致')
    }
    const observed = revision.value
    let rows: DataRow[]
    try {
      rows = await bindings.queryOptionRows({fields: anchorFields, context: {eventCode: text(header, 'event_code')}})
    } catch (cause) {
      throw new Error(`无法完整读取正式来源锚点：${cause instanceof Error ? cause.message : String(cause)}`)
    }
    if (!isCurrent()) throw new Error('规则编辑身份已变化')
    if (revision.value !== observed) throw new Error('规则或事件合同在核验期间已变化，请重新保存')
    if (!rows.some(row => validAnchor(row, text(header, 'event_code'), Date.now()))) {
      throw new Error('启用规则须存在身份完整且在有效期内的已启用来源锚点')
    }
  }
  const account = text(rule.getEditingRow(binding.ruleId) ?? undefined, 'account_set_id')
  for (const child of [condition, result]) for (const id of owned.get(child) ?? []) {
    if (child.dirtyTracking.isPendingCreate(id) && text(child.getEditingRow(id) ?? undefined, 'account_set_id') !== account) {
      child.updateEditingValue(id, 'account_set_id', account)
    }
  }
}

function capture(): readonly SaveGroup[] {
  return editedViews.flatMap(target => {
    const candidates = [...(owned.get(target) ?? [])].filter(id => target.hasEditingChanges(id) || target.dirtyTracking.hasPendingChanges(id))
    if (!candidates.length) return []
    const specs = target === rule ? ruleFields : target === condition ? conditionFields : RESULT_SPECS
    const rows = candidates.map(id => {
      if (target.dirtyTracking.pendingDeleteIds.has(id)) return {id, action: 'deleted' as const, values: {}}
      const row = target.getEditingRow(id)
      if (!row) throw new Error('待保存规则行已不存在')
      const added = target.dirtyTracking.isPendingCreate(id)
      const names = added ? [...specs.map(spec => spec.field), 'rule_id', 'account_set_id'] : Object.keys(target.getEditingPatch(id) ?? {})
      const values = Object.fromEntries([...new Set(names)].flatMap(name => row[name] === undefined ? [] : [[name, row[name]]]))
      const snapshot = Object.fromEntries(target.columns.map(column => [column.name, row[column.name]]))
      return {id, action: added ? 'added' as const : 'changed' as const, values, snapshot}
    })
    return [{view: target, ids: candidates, rows}]
  })
}
function selectors(groups: readonly SaveGroup[]) {
  return groups.map(group => ({tableName: group.view.tableName, viewId: group.view.viewId, ids: [...group.ids]}))
}
function matchesCaptured(groups: readonly SaveGroup[]): boolean {
  const noOtherChanges = editedViews.every(target => [...(owned.get(target) ?? [])].every(id =>
    groups.some(group => group.view === target && group.ids.includes(id))
      || !target.hasEditingChanges(id) && !target.dirtyTracking.hasPendingChanges(id)))
  return noOtherChanges && groups.every(group => group.rows.every(expected => {
    const target = group.view, id = expected.id, row = target.getEditingRow(id)
    if (target.hasEditingChanges(id)) return false
    if (expected.action === 'deleted') return target.dirtyTracking.pendingDeleteIds.has(id)
    if (!row || !target.dirtyTracking.hasPendingChanges(id)
      || (expected.action === 'added') !== target.dirtyTracking.isPendingCreate(id)) return false
    return expected.snapshot !== undefined && Object.entries(expected.snapshot).every(([field, value]) => Object.is(row[field], value))
  }))
}
async function readback(groups: readonly SaveGroup[]): Promise<void> {
  for (const target of editedViews) {
    if (target.hasPendingSavedRowPermissions) await target.refreshSavedRowPermissions()
    if (!isCurrent()) throw new Error('规则编辑身份已变化')
    await target.refresh()
    if (target.loadingError) throw target.loadingError
    if (!isCurrent()) throw new Error('规则编辑身份已变化')
  }
  for (const group of groups) for (const expected of group.rows) {
    const row = group.view.rows.find(item => group.view.getPkKey(item) === expected.id)
    if (expected.action === 'deleted') {
      if (row) throw new Error(`已删除记录 ${String(expected.id)} 仍存在`)
      continue
    }
    if (!row) throw new Error(`已保存记录 ${String(expected.id)} 未回读`)
    for (const [field, value] of Object.entries(expected.values)) {
      if (group.view.fieldAccess(row, field).read !== 'visible') throw new Error(`字段 ${field} 无法读取，不能核验保存结果`)
      if (!Object.is(row[field], value)) throw new Error(`记录 ${String(expected.id)} 的 ${field} 回读不一致`)
    }
  }
}
function discardOwned(): void {
  for (const target of [...editedViews].reverse()) target.discardPendingChanges([...(owned.get(target) ?? [])])
}
function identities(): string {
  const children = [condition, result].map(target => `${target === condition ? '条件' : '结果'} ${[...(owned.get(target) ?? [])].join('、') || '无'}`)
  return `规则 ${String(binding.ruleId)}；${children.join('；')}`
}
function cancel(): void {
  if (!canClose.value || !isCurrent()) return
  try {
    if (!accepted.value) discardOwned()
    emit('close', accepted.value ? `保存回执已确认，但回读未完成；请核对正式数据：${identities()}` : undefined)
  } catch (cause) {hint.value = cause instanceof Error ? cause.message : String(cause)}
}
async function confirmDiscard(message: string): Promise<boolean> {
  try {
    if (!await pageService.showConfirm(message, '核对规则结果', {type: 'warning', confirmText: '继续', cancelText: '返回'})) return false
    return true
  } catch (cause) {
    if (cause === 'cancel' || cause === 'close') return false
    throw cause
  }
}
async function abandon(): Promise<void> {
  if (busy.value || !isCurrent() || !ownUnknown.value || !captured.value || !failure.value) return
  const original = failure.value, groups = captured.value
  busy.value = true
  let abandoned = false
  try {
    if (!await confirmDiscard('本次规则保存可能已部分或全部生效。放弃核验不会撤销服务端记录，将丢弃本窗本地修改并回读正式结果。')) return
    const pending = groups.filter(group => group.view.hasUnconfirmedSave)
    if (!isCurrent() || failure.value !== original || !pending.length
      || pending.some(group => !group.view.hasUnconfirmedSaveFor(group.ids, original))) throw new Error('原提交身份已变化，不能放弃核验')
    if (!matchesCaptured(groups)) throw new Error('原记录还有其他待处理修改，不能自动丢弃')
    for (const group of pending) {
      if (!group.view.abandonUnconfirmedSave()) throw new Error('原来源不支持放弃核验')
      abandoned = true
    }
    failure.value = undefined
    reconcile.value = true
    discardOwned()
    await refreshAfterDiscard()
  } catch (cause) {
    if (abandoned) interrupted.value = true
    hint.value = cause instanceof Error ? cause.message : String(cause)
  } finally {if (active) {busy.value = false; changed()}}
}
async function refreshAfterDiscard(): Promise<void> {
  for (const target of editedViews) {
    await target.refresh()
    if (target.loadingError) throw target.loadingError
    if (!isCurrent()) throw new Error('规则编辑身份已变化')
  }
  reconcile.value = false
  emit('close', `已放弃未保存的本地修改；请核对实际结果：${identities()}`)
}
async function reconcileChanges(): Promise<void> {
  if (busy.value || !isCurrent() || unknown.value || !reconcile.value) return
  busy.value = true
  try {
    if (!await confirmDiscard('部分修改可能已生效。只放弃尚未确认的本地修改并回读，不撤销已提交的记录。')) return
    discardOwned()
    await refreshAfterDiscard()
  } catch (cause) {hint.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
async function submit(): Promise<void> {
  if (busy.value || !isCurrent() || foreignUnknown.value || interrupted.value || recoveryEnded.value) return
  busy.value = true; hint.value = ''
  const recovering = ownUnknown.value
  try {
    if (accepted.value) {
      if (!captured.value) throw new Error('缺少原保存范围')
      await readback(captured.value)
      emit('close', '规则已保存并回读确认')
      return
    }
    if (!captured.value) {
      await validate()
      if (!isCurrent()) throw new Error('规则编辑身份已变化')
      captured.value = capture()
      if (!captured.value.length) {emit('close'); return}
    } else if (!recovering) {
      if (!matchesCaptured(captured.value)) {
        reconcile.value = true
        throw new Error('原修改已变化，不能重新提交')
      }
      await validate()
      if (!isCurrent()) throw new Error('规则编辑身份已变化')
      if (!matchesCaptured(captured.value)) {
        reconcile.value = true
        throw new Error('规则依赖变化，不能重新提交原修改')
      }
    }
    const groups = captured.value
    const response = await dataSet.saveChanges({views: selectors(groups)})
    if (!isCurrent()) return
    if (!response.data) throw new Error(response.error?.message ?? response.message ?? '规则保存缺少回执')
    const complete = groups.every(group => {
      const receipt = response.data?.viewResults.find(item => item.tableName === group.view.tableName && item.viewId === group.view.viewId)
      return receipt !== undefined && receipt.failedCount === 0 && receipt.failedEditingRows === 0
        && receipt.createdCount === group.rows.filter(row => row.action === 'added').length
        && receipt.savedCount === group.rows.filter(row => row.action === 'changed').length
        && receipt.deletedCount === group.rows.filter(row => row.action === 'deleted').length
    })
    if (!response.success || !complete) {
      reconcile.value = true
      throw new Error(response.error?.message ?? response.message ?? '规则保存未全部确认')
    }
    failure.value = undefined
    accepted.value = true
    await readback(groups)
    emit('close', '规则已保存并回读确认')
  } catch (cause) {
    if (!active) return
    if (cause instanceof Error && captured.value?.some(group => group.view.hasUnconfirmedSaveFor(group.ids, cause))) failure.value = cause
    else if (recovering && cause instanceof DataViewSaveNotAppliedError && !unknown.value) failure.value = undefined
    else if (cause instanceof DataSetSavePreflightError) captured.value = undefined
    else if (captured.value && !accepted.value && !unknown.value && !reconcile.value) reconcile.value = true
    hint.value = cause instanceof Error ? cause.message : String(cause)
    if (unknown.value) hint.value += ownUnknown.value ? '；请核验原保存结果' : '；存在其他待核验提交'
    else if (accepted.value) hint.value = `保存已确认，但回读失败：${hint.value}；不要重新提交`
  } finally {if (active) {busy.value = false; changed()}}
}
</script>

<style scoped>
.rule-editor {max-height: 72vh; overflow: auto; padding-right: 8px}
.rule-editor__heading {display: flex; align-items: center; justify-content: space-between; gap: 12px}
.rule-editor__section {border: 1px solid var(--el-border-color); border-radius: 6px; padding: 16px; margin-bottom: 12px}
</style>
