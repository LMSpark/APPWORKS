/**
 * @module app:views/features/application/application-function-management/ui/use-application-function-dimension-source
 * 职责：项目蓝图页“维度来源设计”入口：已保存主数据空间门禁、按需装配 88A4 维度设计空间、来源绑定对话框及其
 *   “数据模型事件”“来源提交协议”子对话框的状态与代次丢弃。
 * 边界：装载、校验、保存与回读由 DimensionSourceBindingEditor / DimensionSourceEventEditor / DimensionSourceCommitPolicyEditor 承担；
 *   本模块只组合标准组件所需的视图键与子组件配置，候选、回填与级联由场景 pagedata 声明。切换节点、上下文或主数据空间时
 *   关闭全部对话框并丢弃迟到结果与本次草稿。
 * AI用途：调整入口门禁或对话框交互时修改本模块，不在页面另建查询或保存链。
 */
import {computed, ref, shallowRef, watch, type Ref} from 'vue'
import type {DataRow, DataView, SparkNode} from '@spark-appworks/spark-data'
import {DimensionSourceBindingEditor, type DimensionSourceBindingEditorInput, type DimensionSourceKind}
  from '@/lowcode/resources/structured-config/dimension-source/binding-editor'
import {DimensionSourceCommitPolicyEditor} from '@/lowcode/resources/structured-config/dimension-source/commit-policy-editor'
import {DimensionSourceEventEditor} from '@/lowcode/resources/structured-config/dimension-source/event-editor'
import {viewKey, type DimensionSourceTarget, type Id} from '@/lowcode/resources/structured-config/dimension-source/view-support'
import {BLUEPRINT_DIMENSION_DESIGN_SCENARIO_ID} from '@/views/app/dev-system/useDevState'
import type {FeatureFieldOption, FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import type {BlueprintTreeContext} from './use-application-function-page'

type FieldLabels = Readonly<Record<string, Omit<FeatureFieldSpec, 'field'>>>

const MAPPING_KIND_OPTIONS = [{value: 'direct', label: '直接映射'}, {value: 'constant', label: '常量映射'}]
const PROJECTION_ROLE_OPTIONS = [{value: 'business-result', label: '普通业务结果'}, {value: 'source-voucher', label: '来源凭证投影'}]
const VALUE_TYPE_OPTIONS = [{value: 'string', label: '字符串'}, {value: 'number', label: '数字'}, {value: 'boolean', label: '布尔值'},
  {value: 'datetime', label: 'UTC 时间'}]
const BINDING_FIELD_LABELS: FieldLabels = {
  binding_code: {label: '来源绑定编码', required: true},
  event_code: {label: '事件编码', required: true},
  payload_version: {label: '载荷版本', kind: 'number', required: true},
  binding_version: {label: '绑定版本', kind: 'number', required: true},
  projection_role: {label: '投影角色', kind: 'select', required: true, options: PROJECTION_ROLE_OPTIONS},
  account_field_id: {label: '根模型账套字段（来源凭证投影必填）', kind: 'select'},
  status: {label: '启用'},
  effective_from: {label: '生效时间'},
  effective_to: {label: '失效时间'},
  description: {label: '说明', kind: 'textarea'},
}
const EVENT_FIELD_LABELS: FieldLabels = {
  event_code: {label: '事件编码', readonly: true},
  source_table: {label: '来源资源', readonly: true},
  source_pk_field: {label: '来源主键', readonly: true},
  template_code: {label: '模板编码', required: true},
  template_name: {label: '事件名称', required: true},
  biz_category: {label: '业务分类', kind: 'select', required: true},
  priority: {label: '优先级', kind: 'number'},
  status: {label: '状态'},
  biz_no_field: {label: '业务编号字段', kind: 'select'},
  biz_date_field: {label: '业务日期字段（启用时必填）', kind: 'select'},
  description: {label: '说明', kind: 'textarea'},
}
const COMMIT_MODEL_ROLES: ReadonlyArray<readonly [string, string]> = [['source_meta_name', '来源业务模型'], ['root_meta_name', '对象根模型'],
  ['intent_meta_name', '提交意图模型'], ['successor_meta_name', '后继登记模型'], ['fact_meta_name', '提交事实模型'], ['head_meta_name', '当前状态视图']]
const textColumn = (field: string, label: string, minWidth: number): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true}})
/** 来源模型候选表（7AB Base_DataModel）的展示列。 */
export const DIMENSION_SOURCE_MODEL_COLUMNS: readonly SparkNode[] = Object.freeze([
  textColumn('Name', '注册名', 200), textColumn('MetaName', '来源名', 200), textColumn('rowid', '模型 ID', 260),
])
/** 平台注册事件合同候选表（DataViewOptionCatalog）的展示列。 */
export const DIMENSION_SOURCE_CONTRACT_COLUMNS: readonly SparkNode[] = Object.freeze([
  textColumn('name', '合同名称', 180), textColumn('eventCode', '事件编码', 200), textColumn('payloadVersion', '载荷版本', 100),
  textColumn('value', '合同 ID', 220),
])
const COLLECTION_COLUMNS: readonly SparkNode[] = Object.freeze([
  textColumn('sort_no', '顺序', 70), textColumn('collection_name', '集合名称', 140), textColumn('source_model_meta_name', '子模型', 180),
  textColumn('parent_key_field_name', '父主键', 140), textColumn('child_key_field_name', '子外键', 140), textColumn('child_pk_field_name', '子主键', 140),
])
const COMMIT_POLICY_COLUMNS: readonly SparkNode[] = Object.freeze([
  textColumn('policy_version', '版本', 80), textColumn('status', '状态', 80), textColumn('field_count', '事实数', 80),
  ...COMMIT_MODEL_ROLES.map(([field, label]) => textColumn(field, label, 160)),
])
const COMMIT_FIELD_COLUMNS: readonly SparkNode[] = Object.freeze([
  textColumn('field_id', '事实标识', 150), textColumn('source_field', '来源字段', 150), textColumn('source_path', '结构化路径', 180),
  textColumn('value_type', '值类型', 100),
])

/** 页面向维度来源设计流程提供的上下文、已保存主数据空间、模型读取与台账引用核验入口。 */
export type ApplicationFunctionDimensionSourceInput = Readonly<{
  /** 当前有效蓝图树上下文；无上下文时返回 undefined。 */
  context: () => BlueprintTreeContext | undefined
  /** 上下文仍是当前树且选中节点仍为 nodeId。 */
  isLive: (context: BlueprintTreeContext, nodeId: string) => boolean
  /** 当前选中的蓝图节点身份。 */
  selectedNodeId: Readonly<Ref<string>>
  /** 当前节点正式回读的 conid；未绑定或不可读为空串。 */
  persistedDataSpaceId: Readonly<Ref<string>>
  /** conid 编辑覆盖尚未保存回读。 */
  bindingPending: Readonly<Ref<boolean>>
  /** 读取数据空间正式模型（含字段），只用于保存前的结构核验。 */
  readModels: DimensionSourceBindingEditorInput['readModels']
  /** 来源绑定已被正式维度结果引用时为 true；无法核验时抛错。 */
  hasLedgerRecords: (context: BlueprintTreeContext, bindingId: string, assertCurrent: () => void) => Promise<boolean>
  /** 页面错误提示。 */
  error: Ref<string>
  /** 页面成功提示。 */
  notice: Ref<string>
}>

type DimensionSourceSession = Readonly<{dataSet: DimensionSourceBindingEditorInput['dataSet']; target: DimensionSourceTarget}>

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
function columnType(view: DataView, field: string): string {
  return view.columns.find(column => column.name === field)?.type.toLowerCase() ?? ''
}
function isBoolean(view: DataView, field: string): boolean {
  return ['boolean', 'bool'].includes(columnType(view, field))
}
/** 0/1 标志候选值按正式列类型取数字或数字文本，避免 DataView 类型校验拒绝。 */
function isText(view: DataView, field: string): boolean {
  return ['string', 'varchar', 'text'].includes(columnType(view, field))
}
function flagOptions(view: DataView, field: string, labels: readonly [string, string]): FeatureFieldOption[] {
  const text = isText(view, field)
  return [{value: text ? '1' : 1, label: labels[0]}, {value: text ? '0' : 0, label: labels[1]}]
}
/** 按正式列类型调整数字与启停标志字段的组件种类。 */
function typedSpec(view: DataView, field: string, spec: Omit<FeatureFieldSpec, 'field'>): FeatureFieldSpec {
  if (spec.kind === 'number' && isText(view, field)) return {field, ...spec, kind: 'text'}
  if (field !== 'status') return {field, ...spec}
  return isBoolean(view, field) ? {field, ...spec, kind: 'switch'} : {field, ...spec, kind: 'select', options: flagOptions(view, field, ['启用', '停用'])}
}
function labelOf(labels: FieldLabels, field: string): Omit<FeatureFieldSpec, 'field'> {
  const spec = labels[field]
  if (!spec) throw new Error(`维度来源字段缺少表单配置：${field}`)
  return spec
}
function rowId(view: DataView, row: Readonly<DataRow>, label: string): Id {
  const id = view.getPkKey(row)
  if (id === undefined) throw new Error(`${label}缺少身份`)
  return id
}
function currentId(view: DataView): Id | undefined {
  const row = view.currentRow
  return row ? view.getPkKey(row) : undefined
}

/** 维度来源设计对话框及其事件、提交协议子对话框的状态与动作。 */
export function useApplicationFunctionDimensionSource(input: ApplicationFunctionDimensionSourceInput) {
  const open = ref(false)
  const loading = ref(false)
  const busy = ref(false)
  const dialogError = ref('')
  const dialogNotice = ref('')
  const editor = shallowRef<DimensionSourceBindingEditor>()
  const candidateKind = ref<DimensionSourceKind>('data-model')
  const eventOpen = ref(false)
  const eventError = ref('')
  const eventEditor = shallowRef<DimensionSourceEventEditor>()
  const commitOpen = ref(false)
  const commitError = ref('')
  const commitNotice = ref('')
  const commitEditor = shallowRef<DimensionSourceCommitPolicyEditor>()
  const commitLoaded = ref(false)
  const selectedPolicyId = ref<Id>()
  /** 编辑器内部状态非响应式；每次动作结束后递增以刷新派生配置。 */
  const generation = ref(0)
  let revision = 0
  let session: DimensionSourceSession | undefined

  const disabledReason = computed(() => input.bindingPending.value ? '数据空间绑定尚未保存回读，不能进行维度来源设计'
    : input.persistedDataSpaceId.value === '' ? '当前节点未绑定主数据空间，不能进行维度来源设计' : '')
  const canOpen = computed(() => disabledReason.value === '')

  /** 编辑器实例不变时 computed 不会通知下游；派生值须直接依赖 generation 才能读到最新的非响应式状态。 */
  const active = (): DimensionSourceBindingEditor | undefined => { void generation.value; return editor.value }
  const activeEvent = (): DimensionSourceEventEditor | undefined => { void generation.value; return eventEditor.value }
  const activeCommit = (): DimensionSourceCommitPolicyEditor | undefined => {
    void generation.value
    return commitLoaded.value ? commitEditor.value : undefined
  }
  const keyOf = <T>(owner: T | undefined, pick: (owner: T) => DataView): string => owner === undefined ? '' : viewKey(pick(owner))

  const modelViewKey = computed(() => keyOf(active(), current => current.models))
  const contractViewKey = computed(() => keyOf(active(), current => current.contracts))
  const bindingViewKey = computed(() => keyOf(active(), current => current.binding))
  const mappingViewKey = computed(() => keyOf(active(), current => current.mapping))
  const collectionViewKey = computed(() => keyOf(active(), current => current.collection))
  const collectionId = computed(() => { const current = active(); return current ? currentId(current.collection) : undefined })
  const bindingId = computed(() => active()?.bindingId)
  const sourceKind = computed(() => active()?.sourceKind)
  const modelCount = computed(() => active()?.modelCount ?? 0)
  const sourceLabel = computed(() => {
    const current = active()
    if (current?.sourceKind === 'platform-event' && current.contract) return `平台注册事件：${current.contract.name} · v${current.contract.payloadVersion}`
    return current?.model ? `数据模型：${current.model.name}（${current.model.sourceName}）` : ''
  })
  const platformNonDimensionFields = computed(() => active()?.platformNonDimensionFields() ?? [])
  const unknown = computed(() => active()?.unknown ?? false)
  const subOpen = computed(() => eventOpen.value || commitOpen.value)
  const locked = computed(() => busy.value || loading.value || unknown.value || subOpen.value)
  const savedBinding = computed(() => active()?.savedBinding())
  const eventEntryReason = computed(() => savedBinding.value ? '' : '请先保存并回读当前数据模型来源绑定，再维护其事件。')
  const commitEntryReason = computed(() => savedBinding.value ? '' : '请先保存并回读当前来源绑定，再维护来源提交协议。')

  const bindingSpecs = computed<readonly FeatureFieldSpec[]>(() => {
    const current = active()
    if (!current) return []
    const platform = current.sourceKind === 'platform-event'
    return current.bindingFormFields().map(field => {
      const spec = typedSpec(current.binding, field, labelOf(BINDING_FIELD_LABELS, field))
      if (field === 'account_field_id') return {...spec, optionKey: viewKey(current.accountFields)}
      return platform && (field === 'event_code' || field === 'payload_version') ? {...spec, readonly: true} : spec
    })
  })

  const mappingColumns = computed<readonly SparkNode[]>(() => {
    const current = active()
    if (!current) return []
    const readonly = () => locked.value
    const sourceFields = current.sourceKind === 'platform-event' ? current.contractFields : current.sourceFields
    const flag: SparkNode = isBoolean(current.mapping, 'required_flag')
      ? {type: 'r-switch', props: {field: 'required_flag', label: '必填', width: 80, showCellControl: true, cellReadonly: readonly}}
      : {type: 'r-select', props: {field: 'required_flag', label: '必填', width: 100, showCellControl: true, cellReadonly: readonly,
        options: flagOptions(current.mapping, 'required_flag', ['是', '否'])}}
    return [
      {type: 'r-text', props: {field: 'sort_no', label: '顺序', width: 70, readonly: true}},
      {type: 'r-select', props: {field: 'source_field_id', label: '来源字段', minWidth: 200, showCellControl: true, cellReadonly: readonly,
        optionDataViewKey: viewKey(sourceFields), filterable: true}},
      {type: 'r-select', props: {field: 'target_definition_id', label: '目标维度', minWidth: 220, showCellControl: true, cellReadonly: readonly,
        optionDataViewKey: viewKey(current.definition), optionValueField: 'id', optionLabelFields: ['definition_name', 'definition_code'],
        optionLabelJoiner: ' · ', filterable: true}},
      {type: 'r-select', props: {field: 'mapping_kind', label: '映射类型', width: 130, showCellControl: true, cellReadonly: readonly,
        options: MAPPING_KIND_OPTIONS}},
      {type: 'r-text', props: {field: 'mapping_value', label: '映射值', minWidth: 150, showCellControl: true,
        cellReadonly: (row: Readonly<DataRow>) => locked.value || row['mapping_kind'] !== 'constant'}},
      flag,
      isText(current.mapping, 'version_no')
        ? {type: 'r-text', props: {field: 'version_no', label: '映射版本', width: 120, showCellControl: true, cellReadonly: readonly}}
        : {type: 'r-number', props: {field: 'version_no', label: '映射版本', width: 120, precision: 0, showCellControl: true, cellReadonly: readonly}},
    ]
  })

  /** 当前子集合详情：子外键与子主键候选由场景字段级联按子模型重新查询，名称由列回填。 */
  const collectionSpecs = computed<readonly FeatureFieldSpec[]>(() => {
    const current = active()
    if (!current) return []
    return [
      {field: 'collection_name', label: '集合名称', required: true},
      {field: 'parent_collection_id', label: '父集合（空为根记录；须先保存）', kind: 'select', optionKey: viewKey(current.collectionParents)},
      {field: 'source_model_id', label: '子模型', kind: 'select', required: true, optionKey: viewKey(current.models),
        labelFields: ['Name', 'MetaName'], labelJoiner: ' · '},
      {field: 'parent_key_field_id', label: '父主键', kind: 'select', required: true, optionKey: viewKey(current.spacePrimaryFields)},
      {field: 'child_key_field_id', label: '子外键', kind: 'select', required: true},
      {field: 'child_pk_field_id', label: '子主键', kind: 'select', required: true},
    ]
  })

  const eventViewKey = computed(() => keyOf(activeEvent(), current => current.template))
  const eventId = computed(() => activeEvent()?.eventId)
  const eventUnknown = computed(() => activeEvent()?.unknown ?? false)
  const eventSpecs = computed<readonly FeatureFieldSpec[]>(() => {
    const current = activeEvent()
    if (!current) return []
    return ['event_code', 'source_table', 'source_pk_field', ...current.formFields()].map(field => {
      const spec = typedSpec(current.template, field, labelOf(EVENT_FIELD_LABELS, field))
      if (field === 'biz_category') {
        return {...spec, optionKey: viewKey(current.categories), labelFields: ['biz_category_name', 'biz_category_code'], labelJoiner: ' · '}
      }
      return field === 'biz_no_field' || field === 'biz_date_field' ? {...spec, optionKey: viewKey(current.outputFields)} : spec
    })
  })

  const commitUnknown = computed(() => activeCommit()?.unknown ?? false)
  const commitPolicyViewKey = computed(() => keyOf(activeCommit(), current => current.policies))
  const commitFieldViewKey = computed(() => keyOf(activeCommit(), current => current.fields))
  const commitDraftViewKey = computed(() => keyOf(activeCommit(), current => current.draft))
  const commitFactViewKey = computed(() => keyOf(activeCommit(), current => current.facts))
  const commitModelViewKey = computed(() => keyOf(activeCommit(), current => current.models))
  const commitSourceSelectable = computed(() => activeCommit()?.sourceSelectable ?? false)
  const commitDraftId = computed(() => activeCommit()?.draftId)
  const commitFactCount = computed(() => activeCommit()?.factIds().length ?? 0)
  const commitDraftSpecs = computed<readonly FeatureFieldSpec[]>(() => {
    const current = activeCommit()
    if (!current) return []
    const models = {kind: 'select' as const, required: true, optionKey: viewKey(current.models)}
    return [
      {field: 'policy_version', label: '新版本号', readonly: true},
      ...COMMIT_MODEL_ROLES.map(([field, label]) => field === 'source_meta_name' ? {field, label, readonly: true} : {field, label, ...models}),
      {field: 'source_key_field', label: '来源主键', readonly: true},
      {field: 'source_commit_field', label: '提交引用字段', kind: 'select', required: true, optionKey: viewKey(current.sourceFields)},
    ]
  })
  const commitFactColumns = computed<readonly SparkNode[]>(() => {
    const current = activeCommit()
    if (!current) return []
    const readonly = () => commitLocked.value
    return [
      {type: 'r-text', props: {field: 'field_id', label: '事实标识', minWidth: 150, showCellControl: true, cellReadonly: readonly}},
      {type: 'r-select', props: {field: 'source_field', label: '来源字段', minWidth: 170, showCellControl: true, cellReadonly: readonly,
        optionDataViewKey: viewKey(current.sourceFields), filterable: true}},
      {type: 'r-text', props: {field: 'source_path', label: '结构化路径（可选，如 ["task","status"]）', minWidth: 220, showCellControl: true,
        cellReadonly: readonly}},
      {type: 'r-select', props: {field: 'value_type', label: '值类型', width: 140, showCellControl: true, cellReadonly: readonly,
        options: VALUE_TYPE_OPTIONS}},
      {type: 'r-select', props: {field: 'required_flag', label: '必填', width: 100, showCellControl: true, cellReadonly: readonly,
        options: flagOptions(current.facts, 'required_flag', ['是', '否'])}},
    ]
  })
  const commitLocked = computed(() => busy.value || loading.value || commitUnknown.value)

  const modelActions = computed(() => ({children: [{type: 'r-button', props: {label: '选择', disabled: locked.value,
    onClick: (row: DataRow) => void selectModel(row)}}]}))
  const contractActions = computed(() => ({children: [{type: 'r-button', props: {label: '选择', disabled: locked.value,
    onClick: (row: DataRow) => void selectContract(row)}}]}))
  const mappingActions = computed(() => ({children: [{type: 'r-button', props: {label: '移除', disabled: locked.value,
    onClick: (row: DataRow) => void removeMapping(row)}}]}))
  const collectionActions = computed(() => ({children: [
    {type: 'r-button', props: {label: '编辑', disabled: locked.value, onClick: (row: DataRow) => void selectCollection(row)}},
    {type: 'r-button', props: {label: '移除', disabled: locked.value, onClick: (row: DataRow) => void removeCollection(row)}},
  ]}))
  const commitPolicyActions = computed(() => ({children: [{type: 'r-button', props: {label: '查看', disabled: commitLocked.value,
    onClick: (row: DataRow) => void selectPolicy(row)}}]}))
  const commitFactActions = computed(() => ({children: [{type: 'r-button', props: {label: '移除', disabled: commitLocked.value,
    onClick: (row: DataRow) => void removeFact(row)}}]}))
  const commitModelActions = computed(() => ({children: [{type: 'r-button', props: {label: '选择', disabled: commitLocked.value,
    onClick: (row: DataRow) => void chooseCommitSource(row)}}]}))

  /** 关闭事件子对话框：丢弃事件草稿（结果未知时拒绝并返回原因）。 */
  function releaseEvent(): string {
    const current = eventEditor.value
    eventEditor.value = undefined
    eventOpen.value = false
    eventError.value = ''
    generation.value++
    if (!current) return ''
    try {
      current.discard()
      return ''
    } catch (cause) {
      return describe(cause)
    }
  }

  /** 关闭提交协议子对话框：丢弃草稿与事实行（结果未知时保留原提交并返回原因）。 */
  function releaseCommit(): string {
    const current = commitEditor.value
    commitEditor.value = undefined
    commitLoaded.value = false
    commitOpen.value = false
    commitError.value = ''
    commitNotice.value = ''
    selectedPolicyId.value = undefined
    generation.value++
    if (!current) return ''
    try {
      current.discard()
      return ''
    } catch (cause) {
      return describe(cause)
    }
  }

  /** 释放全部编辑器：代次递增使迟到结果失效，丢弃本次草稿；返回丢弃失败原因。 */
  function release(): string {
    revision++
    const failures = [releaseEvent(), releaseCommit()]
    const current = editor.value
    editor.value = undefined
    session = undefined
    open.value = false
    loading.value = false
    busy.value = false
    dialogError.value = ''
    dialogNotice.value = ''
    generation.value++
    if (current) {
      try {
        current.discard()
      } catch (cause) {
        failures.push(describe(cause))
      } finally {
        current.dispose()
      }
    }
    return failures.filter(Boolean).join('；')
  }

  watch(() => [input.context()?.key, input.selectedNodeId.value, input.persistedDataSpaceId.value], () => {
    if (!open.value && !editor.value) return
    const failure = release()
    if (failure) input.error.value = failure
  })

  /** 打开维度来源设计：按需装配 88A4 空间并读取节点已保存数据空间的正式模型候选。 */
  async function openEditor(): Promise<void> {
    const context = input.context()
    const nodeId = input.selectedNodeId.value
    if (!context || !nodeId || !canOpen.value) {
      if (disabledReason.value) input.error.value = disabledReason.value
      return
    }
    const failure = release()
    if (failure) {input.error.value = failure; return}
    const request = ++revision
    const dataSpaceId = input.persistedDataSpaceId.value
    const assertCurrent = (): void => {
      if (request !== revision || !input.isLive(context, nodeId) || input.persistedDataSpaceId.value !== dataSpaceId) {
        throw new Error('维度来源设计目标已切换')
      }
    }
    open.value = true
    loading.value = true
    try {
      const dataSet = await context.runtime.ensureScenarioLoaded(BLUEPRINT_DIMENSION_DESIGN_SCENARIO_ID)
      assertCurrent()
      const target: DimensionSourceTarget = {applicationId: context.projectId, nodeId, dataSpaceId, assertCurrent}
      const created = new DimensionSourceBindingEditor({dataSet, target, readModels: input.readModels,
        hasLedgerRecords: (id, check) => input.hasLedgerRecords(context, id, check)})
      editor.value = created
      session = {dataSet, target}
      await created.loadModels()
      candidateKind.value = created.modelCount > 0 ? 'data-model' : 'platform-event'
    } catch (cause) {
      if (request === revision) dialogError.value = describe(cause)
    } finally {
      if (request === revision) {loading.value = false; generation.value++}
    }
  }

  async function run(action: (current: DimensionSourceBindingEditor) => Promise<void> | void, report: Ref<string> = dialogError): Promise<void> {
    const current = editor.value
    if (!current || busy.value || loading.value) return
    const request = revision
    busy.value = true
    report.value = ''
    dialogNotice.value = ''
    try {
      await action(current)
    } catch (cause) {
      if (request === revision) report.value = describe(cause)
    } finally {
      if (request === revision) {busy.value = false; generation.value++}
    }
  }

  /** 切换候选来源类别（只切换候选表，选择后才装载或新建绑定）。 */
  function chooseCandidateKind(kind: DimensionSourceKind): void {
    if (locked.value || (kind === 'data-model' && modelCount.value === 0)) return
    candidateKind.value = kind
  }
  const selectModel = (row: Readonly<DataRow>) => run(current => current.selectSource('data-model', String(row['rowid'] ?? '')))
  const selectContract = (row: Readonly<DataRow>) => run(current => current.selectSource('platform-event', String(row['value'] ?? '')))
  const addMapping = () => run(current => current.addMapping())
  const removeMapping = (row: Readonly<DataRow>) => run(current => current.removeMapping(rowId(current.mapping, row, '来源字段映射')))
  const addCollection = () => run(current => current.addCollection())
  const selectCollection = (row: Readonly<DataRow>) => run(current => current.selectCollection(rowId(current.collection, row, '来源子集合')))
  const removeCollection = (row: Readonly<DataRow>) => run(current => current.removeCollection(rowId(current.collection, row, '来源子集合')))

  /** 一次保存绑定、映射与子集合并回读核验；成功后保持打开，以便继续维护事件与提交协议。 */
  const save = () => run(async current => {
    const saved = await current.save()
    const message = saved ? '维度来源绑定已保存并回读确认' : '维度来源绑定没有修改'
    dialogNotice.value = message
    input.notice.value = message
  })

  /** 关闭：丢弃本次草稿，不写入任何数据。 */
  function close(value = false): void {
    if (value || busy.value) return
    const failure = release()
    if (failure) input.error.value = failure
  }

  /** 打开“维护数据模型事件”：绑定须已保存、回读一致且为数据模型来源。 */
  async function openEventEditor(): Promise<void> {
    const binding = savedBinding.value
    const current = session
    if (!binding || !current || binding.sourceKind !== 'data-model' || locked.value) return
    eventOpen.value = true
    await run(async () => {
      const created = new DimensionSourceEventEditor({...current, binding})
      eventEditor.value = created
      await created.load()
    }, eventError)
  }

  const saveEvent = () => {
    const current = eventEditor.value
    if (!current) return Promise.resolve()
    return run(async () => {
      const saved = await current.save()
      const failure = releaseEvent()
      if (failure) throw new Error(failure)
      const message = saved ? '数据模型事件已保存并回读确认' : '数据模型事件没有修改'
      dialogNotice.value = message
      input.notice.value = message
    }, eventError)
  }

  function closeEvent(value = false): void {
    if (value || busy.value) return
    const failure = releaseEvent()
    if (failure) dialogError.value = failure
  }

  /** 打开“维护来源提交协议”：绑定须已保存且回读一致。 */
  async function openCommitEditor(): Promise<void> {
    const binding = savedBinding.value
    const current = session
    if (!binding || !current || locked.value) return
    commitOpen.value = true
    await run(async () => {
      const created = new DimensionSourceCommitPolicyEditor({...current, binding, readModels: input.readModels})
      commitEditor.value = created
      await created.load()
      commitLoaded.value = true
    }, commitError)
  }

  const withCommit = (action: (current: DimensionSourceCommitPolicyEditor) => Promise<void> | void) => run(async () => {
    const current = activeCommit()
    if (!current) return
    commitNotice.value = ''
    await action(current)
  }, commitError)
  const selectPolicy = (row: Readonly<DataRow>) => withCommit(async current => {
    const id = rowId(current.policies, row, '来源提交协议版本')
    await current.selectVersion(id)
    selectedPolicyId.value = id
  })
  const backToDraft = () => { selectedPolicyId.value = undefined }
  const chooseCommitSource = (row: Readonly<DataRow>) => withCommit(current => current.chooseSource(String(row['rowid'] ?? '')))
  const addFact = () => withCommit(current => current.addFact())
  const removeFact = (row: Readonly<DataRow>) => withCommit(current => current.removeFact(rowId(current.facts, row, '来源事实草稿行')))
  const saveCommitDraft = () => withCommit(async current => {
    await current.saveDraft()
    commitNotice.value = '来源提交协议草稿已保存并回读确认'
  })

  function closeCommit(value = false): void {
    if (value || busy.value) return
    const failure = releaseCommit()
    if (failure) dialogError.value = failure
  }

  function dispose(): void {
    release()
  }

  return {
    open, loading, busy, dialogError, dialogNotice, canOpen, disabledReason, unknown, locked,
    candidateKind, modelCount, sourceKind, sourceLabel, platformNonDimensionFields,
    modelViewKey, contractViewKey, bindingViewKey, mappingViewKey, collectionViewKey, collectionId, bindingId,
    bindingSpecs, mappingColumns, collectionColumns: COLLECTION_COLUMNS, collectionSpecs,
    modelColumns: DIMENSION_SOURCE_MODEL_COLUMNS, contractColumns: DIMENSION_SOURCE_CONTRACT_COLUMNS,
    modelActions, contractActions, mappingActions, collectionActions,
    eventEntryReason, commitEntryReason,
    openEditor, chooseCandidateKind, selectModel, selectContract, addMapping, removeMapping, addCollection, selectCollection, removeCollection, save, close,
    eventOpen, eventError, eventViewKey, eventId, eventUnknown, eventSpecs, openEventEditor, saveEvent, closeEvent,
    commitOpen, commitError, commitNotice, commitUnknown, commitLocked, selectedPolicyId,
    commitPolicyViewKey, commitFieldViewKey, commitDraftViewKey, commitFactViewKey, commitModelViewKey, commitSourceSelectable,
    commitDraftId, commitFactCount, commitDraftSpecs,
    commitPolicyColumns: COMMIT_POLICY_COLUMNS, commitFieldColumns: COMMIT_FIELD_COLUMNS, commitFactColumns,
    commitPolicyActions, commitFactActions, commitModelActions, openCommitEditor, backToDraft, chooseCommitSource, addFact, saveCommitDraft, closeCommit,
    dispose,
  }
}
