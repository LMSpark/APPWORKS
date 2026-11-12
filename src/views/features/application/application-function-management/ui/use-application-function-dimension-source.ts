/**
 * @module app:views/features/application/application-function-management/ui/use-application-function-dimension-source
 * 职责：项目蓝图页“维度来源设计”入口：已保存主数据空间门禁、按需装配 88A4 维度设计空间、对话框状态与代次丢弃。
 * 边界：绑定/映射的装载、校验、保存与回读由 DimensionSourceBindingEditor 承担；本模块只组合标准组件所需的视图键与列配置，
 *   切换节点、上下文或主数据空间时关闭对话框并丢弃迟到结果与本次草稿。
 * AI用途：调整入口门禁或对话框交互时修改本模块，不在页面另建查询或保存链。
 */
import {computed, ref, shallowRef, watch, type Ref} from 'vue'
import type {DataRow, DataView, SparkNode} from '@spark-appworks/spark-data'
import {DimensionSourceBindingEditor, type DimensionSourceBindingEditorInput} from '@/lowcode/resources/structured-config/dimension-source/binding-editor'
import {BLUEPRINT_DIMENSION_DESIGN_SCENARIO_ID} from '@/views/app/dev-system/useDevState'
import type {FeatureFieldOption, FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import type {BlueprintTreeContext} from './use-application-function-page'

const MAPPING_KIND_OPTIONS = [{value: 'direct', label: '直接字段'}, {value: 'constant', label: '常量'}]
const BINDING_FIELD_LABELS: Readonly<Record<string, Omit<FeatureFieldSpec, 'field'>>> = {
  binding_code: {label: '来源绑定编码', required: true},
  event_code: {label: '来源事件编码', required: true},
  payload_version: {label: '事件载荷版本', kind: 'number', required: true},
  binding_version: {label: '绑定版本', kind: 'number', required: true},
  status: {label: '启用'},
  effective_from: {label: '生效开始'},
  effective_to: {label: '生效结束'},
  description: {label: '说明', kind: 'textarea'},
}
const modelColumn = (field: string, label: string, minWidth: number): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true}})
/** 来源模型候选表的展示列。 */
export const DIMENSION_SOURCE_MODEL_COLUMNS: readonly SparkNode[] = Object.freeze([
  modelColumn('name', '模型名称', 200), modelColumn('metaName', '注册名', 200), modelColumn('id', '模型 ID', 260),
])

/** 页面向维度来源设计流程提供的上下文、已保存主数据空间与模型读取入口。 */
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
  /** 读取数据空间正式模型（含字段）。 */
  readModels: DimensionSourceBindingEditorInput['readModels']
  /** 页面错误提示。 */
  error: Ref<string>
  /** 页面成功提示。 */
  notice: Ref<string>
}>

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

/** 维度来源设计对话框状态及动作。 */
export function useApplicationFunctionDimensionSource(input: ApplicationFunctionDimensionSourceInput) {
  const open = ref(false)
  const loading = ref(false)
  const busy = ref(false)
  const dialogError = ref('')
  const editor = shallowRef<DimensionSourceBindingEditor>()
  /** 编辑器内部状态（绑定 ID、映射集合）非响应式；每次动作结束后递增以刷新派生配置。 */
  const generation = ref(0)
  let revision = 0

  const disabledReason = computed(() => input.bindingPending.value ? '数据空间绑定尚未保存回读，不能进行维度来源设计'
    : input.persistedDataSpaceId.value === '' ? '当前节点未绑定主数据空间，不能进行维度来源设计' : '')
  const canOpen = computed(() => disabledReason.value === '')

  /** 编辑器实例不变时 computed 不会通知下游；派生值须直接依赖 generation 才能读到最新的非响应式状态。 */
  const active = (): DimensionSourceBindingEditor | undefined => { void generation.value; return editor.value }
  const modelViewKey = computed(() => { const current = active(); return current ? current.viewKey(current.modelOptions) : '' })
  const bindingViewKey = computed(() => { const current = active(); return current ? current.viewKey(current.binding) : '' })
  const mappingViewKey = computed(() => { const current = active(); return current ? current.viewKey(current.mapping) : '' })
  const bindingId = computed(() => active()?.bindingId)
  const modelLabel = computed(() => {
    const model = active()?.model
    return model ? `${model.name}（${model.metaName}）` : ''
  })
  const unknown = computed(() => active()?.unknown ?? false)
  const locked = computed(() => busy.value || loading.value || unknown.value)

  const bindingSpecs = computed<readonly FeatureFieldSpec[]>(() => {
    const current = active()
    if (!current) return []
    return current.bindingFormFields().map(field => {
      const spec = BINDING_FIELD_LABELS[field]
      if (!spec) throw new Error(`维度来源绑定字段缺少表单配置：${field}`)
      if (spec.kind === 'number' && isText(current.binding, field)) return {field, ...spec, kind: 'text'}
      if (field !== 'status') return {field, ...spec}
      return isBoolean(current.binding, field) ? {field, ...spec, kind: 'switch'} : {field, ...spec, kind: 'select', options: flagOptions(current.binding, field, ['启用', '停用'])}
    })
  })

  const mappingColumns = computed<readonly SparkNode[]>(() => {
    const current = active()
    if (!current) return []
    const readonly = () => locked.value
    const flag: SparkNode = isBoolean(current.mapping, 'required_flag')
      ? {type: 'r-switch', props: {field: 'required_flag', label: '必填', width: 80, showCellControl: true, cellReadonly: readonly}}
      : {type: 'r-select', props: {field: 'required_flag', label: '必填', width: 100, showCellControl: true, cellReadonly: readonly,
        options: flagOptions(current.mapping, 'required_flag', ['是', '否'])}}
    return [
      {type: 'r-text', props: {field: 'sort_no', label: '顺序', width: 70, readonly: true}},
      {type: 'r-select', props: {field: 'source_field_id', label: '来源字段', minWidth: 200, showCellControl: true, cellReadonly: readonly,
        optionDataViewKey: current.viewKey(current.fieldOptions), optionValueField: 'id', optionLabelField: 'canonicalName', filterable: true}},
      {type: 'r-select', props: {field: 'target_definition_id', label: '目标维度', minWidth: 220, showCellControl: true, cellReadonly: readonly,
        optionDataViewKey: current.viewKey(current.definition), optionValueField: 'id', optionLabelFields: ['definition_code', 'definition_name'],
        filterable: true}},
      {type: 'r-select', props: {field: 'mapping_kind', label: '映射类型', width: 120, showCellControl: true, cellReadonly: readonly,
        options: MAPPING_KIND_OPTIONS}},
      {type: 'r-text', props: {field: 'mapping_value', label: '常量值', minWidth: 140, showCellControl: true,
        cellReadonly: (row: Readonly<DataRow>) => locked.value || row['mapping_kind'] !== 'constant'}},
      flag,
      isText(current.mapping, 'version_no')
        ? {type: 'r-text', props: {field: 'version_no', label: '映射版本', width: 110, showCellControl: true, cellReadonly: readonly}}
        : {type: 'r-number', props: {field: 'version_no', label: '映射版本', width: 110, precision: 0, showCellControl: true, cellReadonly: readonly}},
    ]
  })

  const modelActions = computed(() => ({children: [{type: 'r-button', props: {label: '选择', disabled: locked.value,
    onClick: (row: DataRow) => void selectModel(row)}}]}))
  const mappingActions = computed(() => ({children: [{type: 'r-button', props: {label: '删除', disabled: locked.value,
    onClick: (row: DataRow) => void removeMapping(row)}}]}))

  /** 释放当前编辑器：代次递增使迟到结果失效，丢弃本次草稿；返回丢弃失败原因。 */
  function release(): string {
    revision++
    const current = editor.value
    editor.value = undefined
    open.value = false
    loading.value = false
    busy.value = false
    dialogError.value = ''
    generation.value++
    if (!current) return ''
    try {
      current.discard()
      return ''
    } catch (cause) {
      return describe(cause)
    } finally {
      current.dispose()
    }
  }

  watch(() => [input.context()?.key, input.selectedNodeId.value, input.persistedDataSpaceId.value], () => {
    if (!open.value && !editor.value) return
    const failure = release()
    if (failure) input.error.value = failure
  })

  /** 打开维度来源设计：按需装配 88A4 空间并读取节点已保存数据空间的正式模型。 */
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
      const created = new DimensionSourceBindingEditor({dataSet, readModels: input.readModels,
        target: {applicationId: context.projectId, nodeId, dataSpaceId, assertCurrent}})
      editor.value = created
      await created.loadModels()
    } catch (cause) {
      if (request === revision) dialogError.value = describe(cause)
    } finally {
      if (request === revision) {loading.value = false; generation.value++}
    }
  }

  async function run(action: (current: DimensionSourceBindingEditor) => Promise<void>): Promise<void> {
    const current = editor.value
    if (!current || busy.value || loading.value) return
    const request = revision
    busy.value = true
    dialogError.value = ''
    try {
      await action(current)
    } catch (cause) {
      if (request === revision) dialogError.value = describe(cause)
    } finally {
      if (request === revision) {busy.value = false; generation.value++}
    }
  }

  const selectModel = (row: Readonly<DataRow>) => run(current => current.selectModel(String(row['id'] ?? '')))
  const addMapping = () => run(current => current.addMapping())
  const removeMapping = (row: Readonly<DataRow>) => run(async current => {
    const id = current.mapping.getPkKey(row)
    if (id === undefined) throw new Error('来源字段映射缺少身份')
    await current.removeMapping(id)
  })

  /** 一次保存绑定与映射并回读核验；成功后关闭对话框。 */
  const save = () => run(async current => {
    const request = revision
    const saved = await current.save()
    if (request !== revision) return
    const failure = release()
    if (failure) throw new Error(failure)
    input.notice.value = saved ? '维度来源绑定已保存并回读确认' : '维度来源绑定没有修改'
  })

  /** 取消：丢弃本次草稿并关闭，不写入任何数据。 */
  function close(value = false): void {
    if (value) return
    if (busy.value) return
    const failure = release()
    if (failure) input.error.value = failure
  }

  function dispose(): void {
    release()
  }

  return {
    open,
    loading,
    busy,
    dialogError,
    canOpen,
    disabledReason,
    unknown,
    locked,
    modelViewKey,
    bindingViewKey,
    mappingViewKey,
    bindingId,
    modelLabel,
    bindingSpecs,
    mappingColumns,
    modelColumns: DIMENSION_SOURCE_MODEL_COLUMNS,
    modelActions,
    mappingActions,
    openEditor,
    selectModel,
    addMapping,
    removeMapping,
    save,
    close,
    dispose,
  }
}
