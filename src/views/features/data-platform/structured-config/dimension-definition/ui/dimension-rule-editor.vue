<template>
  <RendererDialog :model-value="true" :data-view-key="ruleKey" :title="created ? '新增维度规则' : '编辑维度规则'"
    :width="1060" :append-to-body="true" :close-disabled="!canClose" @update:model-value="open => {if (!open) cancel()}">
    <div class="rule-editor">
      <p v-if="hint" role="alert">{{ hint }}</p>
      <p v-if="!current" role="alert">原规则编辑身份已变化，不能处理本窗修改。</p>
      <p v-else-if="foreignUnknown" role="alert">存在其他操作的待核验提交，本窗不能接管。</p>
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
      <RendererButton v-if="reconcile" label="放弃未保存修改并回读" :disabled="busy || !current" @click="reconcileChanges" />
      <RendererButton v-if="!reconcile || preflightRetry" :label="saveLabel" button-type="primary"
        :disabled="busy || !current || foreignUnknown || blockedRecovery" @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef} from 'vue'
import {DataSetSavePreflightError, DataViewFilter, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, RendererDialog, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import FeatureRecordFields from '@/views/features/shared/record/feature-record-fields.vue'
import {missingFeatureField, type FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import {RESULT_SPECS, conditionSpecs, enabled, ruleSpecs, text, validateResult} from './dimension-field-spec'

type Id = string | number
type ExpectedRow = Readonly<{id: Id; action: 'added' | 'changed' | 'deleted'; values: Readonly<Record<string, unknown>>
  identity: Readonly<Record<string, unknown>>}>
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
const busy = ref(false), hint = ref(''), revision = ref(0), accepted = ref(false)
const proof = shallowRef<readonly SaveGroup[]>(), originalBatchId = shallowRef<string>()
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
const saveJournal = computed(() => {void revision.value; return dataSet.saveJournal})
function sameIds(left: readonly Id[], right: readonly Id[]): boolean {
  return left.length === right.length && left.every((id, index) => right[index] === id)
}
const ownsOriginalJournal = computed(() => {
  const journal = saveJournal.value, groups = proof.value
  if (!groups || !originalBatchId.value || journal.batchId !== originalBatchId.value || journal.views.length !== groups.length) return false
  return groups.every(group => journal.views.some(record => record.tableName === group.view.tableName
    && record.viewId === group.view.viewId && sameIds(record.ids, group.ids)))
})
const ownUnknown = computed(() => ownsOriginalJournal.value
  && saveJournal.value.currentRecoverableAction === 'verify-original-receipt'
  && editedViews.filter(item => item.hasUnconfirmedSave).every(item => saveJournal.value.views.some(record =>
    record.tableName === item.tableName && record.viewId === item.viewId)))
const foreignUnknown = computed(() => unknown.value && !ownUnknown.value)
const preflightRetry = computed(() => ownsOriginalJournal.value
  && saveJournal.value.currentRecoverableAction === 'discard-not-applied'
  && saveJournal.value.originalError instanceof DataSetSavePreflightError)
const reconcile = computed(() => !unknown.value && ownsOriginalJournal.value
  && saveJournal.value.currentRecoverableAction === 'discard-not-applied')
const blockedRecovery = computed(() => ownsOriginalJournal.value && !accepted.value
  && ['retain-draft', 'continue-phase'].includes(saveJournal.value.currentRecoverableAction))
const locked = computed(() => busy.value || !current.value || unknown.value || accepted.value || proof.value !== undefined)
const canClose = computed(() => !busy.value && current.value && !unknown.value && !reconcile.value
  && (!ownsOriginalJournal.value || accepted.value || saveJournal.value.completed))
const saveLabel = computed(() => ownUnknown.value ? '核验原保存结果' : preflightRetry.value ? '重试原保存' : accepted.value ? '重试回读' :
  '保存规则')

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
      const deleted = target.dirtyTracking.pendingDeleteIds.has(id)
      const row = deleted ? target.dirtyTracking.getPendingDeleteSnapshot(id) : target.getEditingRow(id)
      if (!row) throw new Error('待保存规则行已不存在')
      const added = target.dirtyTracking.isPendingCreate(id)
      const names = added ? [...specs.map(spec => spec.field), 'rule_id', 'account_set_id'] : Object.keys(target.getEditingPatch(id) ?? {})
      const values = Object.fromEntries([...new Set(names)].flatMap(name => row[name] === undefined ? [] : [[name, row[name]]]))
      const identity = Object.fromEntries(target.effectivePkFields.map(field => [field, row[field]]))
      return {id, action: deleted ? 'deleted' as const : added ? 'added' as const : 'changed' as const,
        values: deleted ? {} : values, identity}
    })
    return [{view: target, ids: candidates, rows}]
  })
}
function selectors(groups: readonly SaveGroup[]) {
  return groups.map(group => ({tableName: group.view.tableName, viewId: group.view.viewId, ids: [...group.ids]}))
}
function bindOriginalJournal(groups: readonly SaveGroup[]): void {
  if (proof.value === undefined) return
  const journal = dataSet.prepareSaveJournal({views: selectors(groups)})
  if (journal.batchId === null) throw new Error('规则保存缺少原 DataSet 批次身份')
  if (originalBatchId.value !== undefined && originalBatchId.value !== journal.batchId) {
    throw new Error('原 DataSet 保存批次已变化，不能重新派发')
  }
  if (journal.views.length !== groups.length || !groups.every(group => journal.views.some(record =>
    record.tableName === group.view.tableName && record.viewId === group.view.viewId && sameIds(record.ids, group.ids)))) {
    throw new Error('原 DataSet 保存目标已变化，不能重新派发')
  }
  originalBatchId.value = journal.batchId
}
function matchesCaptured(groups: readonly SaveGroup[]): boolean {
  let current: readonly SaveGroup[]
  try {current = capture()} catch {return false}
  const changedIds = (target: DataView) => new Set<Id>([
    ...target.dirtyTracking.pendingCreateIds,
    ...target.dirtyTracking.dirtyRowIds,
    ...target.dirtyTracking.pendingDeleteIds,
    ...target.editingRows.map(row => target.getPkKey(row)).filter((id): id is Id => id !== undefined
      && target.hasEditingChanges(id)),
  ])
  return editedViews.every(target => {
    const ids = changedIds(target), expected = groups.find(group => group.view === target)?.ids ?? []
    return ids.size === expected.length && expected.every(id => ids.has(id))
  }) && groups.every(group => {
    const found = current.find(item => item.view === group.view)
    return found !== undefined && JSON.stringify(found.ids) === JSON.stringify(group.ids)
      && JSON.stringify(found.rows) === JSON.stringify(group.rows)
  })
}
function identityFilterValue(expected: ExpectedRow, field: string): string | number {
  const value = expected.identity[field]
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`规则记录身份字段 ${field} 缺少有效值`)
  }
  return value
}
async function readback(groups: readonly SaveGroup[]): Promise<void> {
  const rows = new Map<DataView, readonly DataRow[]>()
  for (const group of groups) {
    const target = group.view
    if (target.hasPendingSavedRowPermissions) await target.refreshSavedRowPermissions()
    if (!isCurrent()) throw new Error('规则编辑身份已变化')
    const fields = [...new Set([
      ...target.effectivePkFields,
      ...group.rows.flatMap(expected => Object.keys(expected.values)),
    ])]
    const primaryKeyFields = target.effectivePkFields
    if (primaryKeyFields.length === 0) throw new Error('规则回读缺少正式记录身份字段')
    const filter = primaryKeyFields.length === 1
      ? DataViewFilter.condition({field: primaryKeyFields[0]!, operator: 'in',
        value: group.rows.map(expected => identityFilterValue(expected, primaryKeyFields[0]!))}).toJSON()
      : {logic: 'or' as const, filters: group.rows.map(expected => ({
        logic: 'and' as const,
        filters: primaryKeyFields.map(field => DataViewFilter.condition({
          field, operator: 'eq', value: identityFilterValue(expected, field),
        }).toJSON()),
      }))}
    try {
      rows.set(target, await target.queryOptionRows({fields, filter}))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const inaccessible = message.match(/DATA_VIEW_OPTIONS_FIELD: 字段缺失或不可读 (.+)$/)?.[1]
      if (inaccessible) throw new Error(`字段 ${inaccessible} 无法读取，不能核验保存结果`)
      throw cause
    }
    if (!isCurrent()) throw new Error('规则编辑身份已变化')
  }
  for (const group of groups) for (const expected of group.rows) {
    const row = rows.get(group.view)?.find(item => group.view.getPkKey(item) === expected.id)
    if (expected.action === 'deleted') {
      if (row) throw new Error(`已删除记录 ${String(expected.id)} 仍存在`)
      continue
    }
    if (!row) throw new Error(`已保存记录 ${String(expected.id)} 未回读`)
    for (const [field, value] of Object.entries(expected.values)) {
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
async function refreshAfterDiscard(): Promise<void> {
  for (const target of editedViews) {
    await target.refresh()
    if (target.loadingError) throw target.loadingError
    if (!isCurrent()) throw new Error('规则编辑身份已变化')
  }
  emit('close', `已放弃未保存的本地修改；请核对实际结果：${identities()}`)
}
async function reconcileChanges(): Promise<void> {
  if (busy.value || !isCurrent() || !reconcile.value) return
  busy.value = true
  try {
    if (!await confirmDiscard('原提交已确认未应用。只丢弃仍与原捕获一致的本地修改并回读，不撤销其他已提交记录。')) return
    if (!ownsOriginalJournal.value || saveJournal.value.currentRecoverableAction !== 'discard-not-applied') {
      throw new Error('原 DataSet 保存批次已变化，不能丢弃当前修改')
    }
    dataSet.discardSaveJournalNotApplied()
    await refreshAfterDiscard()
  } catch (cause) {hint.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
async function verifyOriginalReceipt(groups: readonly SaveGroup[]): Promise<void> {
  if (!ownsOriginalJournal.value || !ownUnknown.value) throw new Error('没有本次 DataSet 保存批次可核验')
  const journal = await dataSet.verifySaveJournal()
  changed()
  if (!isCurrent()) return
  if (journal.batchId !== originalBatchId.value) throw new Error('原 DataSet 保存批次已变化，不能接管')
  if (journal.currentRecoverableAction === 'verify-original-receipt' || journal.views.some(item => item.state === 'unknown')) {
    throw journal.originalError ?? new Error('原保存结果仍未确认')
  }
  if (!journal.completed) return
  accepted.value = true
  await readback(groups)
  emit('close', '规则已保存并回读确认')
}
async function submit(): Promise<void> {
  if (busy.value || !isCurrent() || foreignUnknown.value || blockedRecovery.value) return
  busy.value = true; hint.value = ''
  try {
    if (accepted.value) {
      if (!proof.value) throw new Error('缺少原规则保存证明')
      await readback(proof.value)
      emit('close', '规则已保存并回读确认')
      return
    }
    if (ownUnknown.value) {
      if (!proof.value) throw new Error('缺少原规则保存证明')
      await verifyOriginalReceipt(proof.value)
      return
    }
    if (!proof.value) {
      await validate()
      if (!isCurrent()) throw new Error('规则编辑身份已变化')
      proof.value = capture()
      if (!proof.value.length) {emit('close'); return}
    } else if (!isCurrent()) {
      throw new Error('规则编辑身份已变化')
    }
    const groups = proof.value
    if (!matchesCaptured(groups)) throw new Error('原规则保存目标或修改已变化，不能重新派发')
    bindOriginalJournal(groups)
    const response = await dataSet.saveChanges({views: selectors(groups)})
    changed()
    if (!isCurrent()) return
    if (!ownsOriginalJournal.value) throw new Error('原 DataSet 保存批次已变化，不能核对当前规则')
    if (!response.success || !saveJournal.value.completed) {
      throw new Error(response.error?.message ?? response.message ?? '规则保存未全部确认')
    }
    accepted.value = true
    await readback(groups)
    emit('close', '规则已保存并回读确认')
  } catch (cause) {
    if (!active) return
    changed()
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
