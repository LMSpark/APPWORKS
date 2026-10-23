/**
 * @module lowcode/data-space/model-source/field-edit/lowcode-data-space-field-edit-session
 * 职责：编排正式字段配置提交；普通属性消费原生回执，结构变更与未知结果按领域核验（无独立命令类 FSM）。
 * 边界：原DataView持有编辑值和数据权限；不改来源身份或场景文件，不执行值函数。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceFieldValue} from '../field-value/lowcode-data-space-field-value'
import {DataSpaceDefinitionSave, definitionTargetDraftSignature, verifyDataSpaceDefinitionCapture, type DataSpaceDefinitionCaptureBatch, type DataSpaceDefinitionSavePart} from '../save/data-space-definition-save'
import type {FieldRemoveHandle} from '../removal/lowcode-data-space-field-remove-session'
import {LowcodeDataSpacePrimaryKey} from '../primary-key/lowcode-data-space-primary-key'

type FieldEditStatus = 'idle' | 'pending' | 'unsubmitted' | 'unknown' | 'readback'

export type FieldEditSessionInput = Readonly<{
  dataSet: DataSet
  targetId: string
  fieldId: string
  lifecycle: FieldEditLifecycle
  viewId?: 'default' | 'modelFields'
}>

type AssertEditableInput = Readonly<{
  expected?: 'idle' | 'pending'
  replacingValueFunction?: boolean
  fieldIds?: readonly string[]
  patch?: Readonly<Partial<DataRow>>
}>

export type FieldEditLifecycle = Readonly<{
  assertCurrent(): void
  onDispatch(): void
  readDefinition?(): DataSet | ScenarioViewConfig | null
  readModel(modelId: string, modelName: string): ReturnType<DataSpaceDesignApi['readModel']>
  validateOutputs(changes: ReadonlyArray<{original: DataRow; patch: Readonly<Record<string, unknown>>; creating?: boolean}>, modelPatch?: Readonly<Record<string, unknown>>): Promise<() => void>
  stagePrimaryKey?(modelId: string, name: string): void
  refreshDirectory?(): Promise<void>
  assertEditable?(): void
}>

/** 正式字段配置流程；所有数据、delta及权限留在原元数据视图。 */
export class FieldEditSession {
  readonly dataSet: DataSet
  readonly targetId: string
  readonly fieldId: string
  readonly lifecycle: FieldEditLifecycle
  readonly viewId: 'default' | 'modelFields'
  /** 这些列属性不改变字段身份、输出结构或查询语义，直接消费原数据层字段回执。 */
  private static readonly receiptFields = new Set(['description', 'Expression', 'allowAIAdd'])
  private static readonly fields = [
    {name: 'Name', label: '计算字段名称', kind: 'text'},
    {name: 'description', label: '字段说明', kind: 'text'},
    {name: 'FieldType', label: '字段类型', kind: 'text'},
    {name: 'AsName', label: '输出名称', kind: 'text'},
    {name: 'IsOutput', label: '参与输出', kind: 'binary'},
    {name: 'IsPKey', label: '正式主键', kind: 'binary'},
    {name: 'ValueFun', label: '值函数原文', kind: 'function'},
    {name: 'OrderType', label: '排序方向', kind: 'select'},
    {name: 'Order', label: '排序顺序', kind: 'number'},
    {name: 'Group', label: '分组标记', kind: 'number'},
    {name: 'Expression', label: '脱敏规则', kind: 'rule'},
    {name: 'allowAIAdd', label: 'AI操作', kind: 'binary'},
  ] as const
  readonly #view: DataView
  readonly #context: string
  readonly #modelId: string
  #identity: string | undefined
  #baseline: string
  #created: boolean
  #status: FieldEditStatus = 'idle'
  #recoveryCapture: DataSpaceDefinitionCaptureBatch | undefined

  /** 捕获当前字段及所属模型；派发提交后通知会话废弃旧目标投影。 */
  constructor(input: FieldEditSessionInput) {
    const viewId = input.viewId ?? 'default'
    this.dataSet = input.dataSet
    this.targetId = input.targetId
    this.fieldId = input.fieldId
    this.lifecycle = input.lifecycle
    this.viewId = viewId
    const view = input.dataSet.getView('Base_DataModel_Field', viewId)
    if (!view) throw new Error('DATA_SPACE_FIELD_CONTEXT: 缺少正式字段视图')
    this.#view = view; this.#context = JSON.stringify(view.queryContext)
    this.#created = view.dirtyTracking.isPendingCreate(input.fieldId)
    const row = this.current()
    this.#modelId = String(row['dataModelId'])
    this.#identity = this.identity(row); this.#baseline = this.snapshot(row)
  }

  private assertOwner(): void {
    this.lifecycle.assertCurrent()
    if (this.dataSet.destroyed || this.dataSet.getView('Base_DataModel_Field', this.viewId) !== this.#view
      || this.#view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field'
      || this.#view.queryContext['dataSpaceId'] !== this.targetId || JSON.stringify(this.#view.queryContext) !== this.#context) {
      throw new Error('DATA_SPACE_FIELD_CONTEXT: 字段查询或目标已变化')
    }
  }

  private identity(row: DataRow): string {
    const keys = ['rowid', 'dataSetId', 'dataModelId', 'type']
    if ([...keys, 'Name', 'FieldType'].some(key => this.#view.fieldAccess(row, key).read !== 'visible')) throw new Error('DATA_SPACE_FIELD_CONTEXT: 字段身份或输出映射不可读')
    const models = this.dataSet.getView('Base_DataModel', 'default')
    const matches = models?.rows.filter(item => models.getPkKey(item) === row['dataModelId']) ?? []
    const model = matches[0]
    const modelKeys = ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type']
    if (!models || !model || matches.length !== 1 || models.requestState !== RequestState.Loaded
      || models.mutating || models.queryContext['dataSpaceId'] !== this.targetId || models.dataTable?.modelBinding?.modelName !== 'Base_DataModel'
      || model['rowid'] !== row['dataModelId'] || model['dataSetId'] !== this.targetId
      || modelKeys.some(key => models.fieldAccess(model, key).read !== 'visible')) throw new Error('DATA_SPACE_FIELD_CONTEXT: 所属模型不可确认')
    return JSON.stringify([keys.map(key => row[key]), modelKeys.map(key => model[key]),
      row['FieldType'] === '计算字段' ? ['computed'] : ['source', row['Name']]])
  }

  private current(): DataRow {
    this.assertOwner()
    const rows = this.#view.rows.filter(row => this.#view.getPkKey(row) === this.fieldId), row = rows[0]
    if (!row || rows.length !== 1 || row['rowid'] !== this.fieldId || row['dataSetId'] !== this.targetId || row['type'] !== 'dataModel'
      || typeof row['dataModelId'] !== 'string' || !row['dataModelId'].trim() || typeof row['Name'] !== 'string' || !row['Name'].trim()
      || this.#view.requestState !== RequestState.Loaded || this.#view.total !== this.#view.rows.filter(item => !this.#view.dirtyTracking.isPendingCreate(this.#view.getPkKey(item) ?? '')).length + this.#view.dirtyTracking.pendingDeleteIds.size || this.#view.mutating) {
      throw new Error('DATA_SPACE_FIELD_CONTEXT: 字段身份、归属或完整读取状态无效')
    }
    const identity = this.identity(row)
    if (this.#identity !== undefined && identity !== this.#identity) throw new Error('DATA_SPACE_FIELD_CONTEXT: 字段或所属模型身份已变化，请重新打开')
    return row
  }

  private snapshot(row: DataRow): string {return JSON.stringify(FieldEditSession.fields.map(field => row[field.name]))}

  private writable(row: DataRow): boolean {
    return (this.#view.dirtyTracking.isPendingCreate(this.fieldId) ? this.#view.addActionState() : this.#view.editActionState(row)) === 'enabled'
  }

  private primaryWritable(row: DataRow): boolean {
    const models = this.dataSet.getView('Base_DataModel'), model = models?.rows.find(item => item['rowid'] === row['dataModelId'])
    return this.viewId === 'modelFields' && !!model && !!models && !!this.lifecycle.stagePrimaryKey
      && !LowcodeDataSpacePrimaryKey.sourceControlled(model) && !['计算字段', '引用'].includes(String(row['FieldType']))
      && models.editActionState(model) === 'enabled' && models.fieldAccess(model, 'PrimaryKeyFields').read === 'visible'
      && models.fieldAccess(model, 'PrimaryKeyFields').write === 'allowed'
  }

  /** 对外状态；`unknown` 优先消费 P1b `hasUnconfirmedSave`。 */
  private flowStatus(): FieldEditStatus {
    if (this.#status === 'pending') return 'pending'
    if (this.#status === 'readback') return 'readback'
    if (this.#status === 'unknown' || this.#view.hasUnconfirmedSave && this.#status !== 'idle') return 'unknown'
    return this.#status
  }

  /** 状态仅描述流程；未决提交即使没有delta仍需保留核验入口。 */
  getState() {return {status: this.flowStatus(), pending: this.#view.hasEditingChanges(this.fieldId) || this.#view.dirtyTracking.hasPendingChanges(this.fieldId)}}
  hasInvalidReceipt(): boolean {return this.#recoveryCapture?.receiptInvalid === true}
  getRecoveryCapture(): DataSpaceDefinitionCaptureBatch | undefined {return this.#recoveryCapture}

  /**
   * 读取可由正式查询消费的字段配置；不保存或改变模型定义。
   * default仅读取干净定义，当前元模型工作区还支持标题、输出收窄和排序草稿；结构、输出扩张及聚合定义须先保存。
   * 由会话捕获返回快照并投影到独立预览DataView，原权限失效或草稿改变后旧预览失效。
   */
  readPreview() {
    const original = this.current(), patch = this.#view.getEditingPatch(this.fieldId) ?? {}
    if (this.viewId !== 'modelFields' && this.#view.hasEditingChanges() || this.flowStatus() !== 'idle' || this.#view.dirtyTracking.hasPendingChanges()) throw new Error('字段定义存在新增、删除或未决提交，不能预览')
    if (this.snapshot(original) !== this.#baseline) throw new Error('字段定义基线已变化，请重新读取')
    for (const [field, value] of Object.entries(patch)) {
      if (!['description', 'IsOutput', 'Order', 'OrderType'].includes(field)) throw new Error(`字段定义${field}尚未保存，查询接口不支持该结构草稿预览`)
      this.validate(field, value)
    }
    const keys = ['Name', 'AsName', 'IsOutput', 'IsPKey', 'Order', 'OrderType', 'description']
    if (keys.some(key => this.#view.fieldAccess(original, key).read !== 'visible')) throw new Error('字段预览配置不可读')
    const row = this.#view.getEditingRow(this.fieldId) ?? original
    const output = Number(row['IsOutput']) === 1, formalOutput = Number(original['IsOutput']) === 1
    if (output && !formalOutput) throw new Error('字段新增输出须先保存正式模型，不能通过预览扩大输出')
    if (Number(original['IsPKey']) === 1 && !output) throw new Error('正式主键必须保留输出')
    const direction = row['OrderType'] === 'ascending' ? 'asc' as const : row['OrderType'] === 'descending' ? 'desc' as const : undefined
    if (direction && !formalOutput && ('Order' in patch || 'OrderType' in patch)) throw new Error('未输出字段的排序须先保存正式模型')
    const name = typeof original['AsName'] === 'string' && original['AsName'].trim() ? original['AsName'] : String(original['Name'])
    return {id: this.fieldId, modelId: this.#modelId, name, output, formalOutput, direction,
      order: typeof row['Order'] === 'number' ? row['Order'] : 0,
      label: typeof row['description'] === 'string' ? row['description'] : '',
      fingerprint: JSON.stringify([this.identity(original), keys.map(key => original[key]), patch])}
  }

  /** 提供当前允许呈现的配置项，不复制值；组件直接绑定原DataView。 */
  read() {
    const row = this.current(), editing = this.#view.getEditingRow(this.fieldId) ?? row
    return {fields: FieldEditSession.fields.filter(field => this.#view.columns.some(column => column.name === field.name)
      && (field.name !== 'Name' || row['FieldType'] === '计算字段')).map(field => {
      const access = this.#view.fieldAccess(row, field.name), value = access.read === 'visible' ? editing[field.name] : undefined
      const compatible = value === undefined || value === null || (field.kind === 'binary' ? value === 0 || value === 1
        : field.kind === 'number' ? typeof value === 'number' : typeof value === 'string')
      return {...field, readable: access.read === 'visible', writable: compatible && access.read === 'visible' && access.write === 'allowed'
        && this.writable(row) && !(field.name === 'FieldType' && ['计算字段', '引用'].includes(String(row['FieldType'])))
        && !(field.name === 'IsOutput' && Number(editing['IsPKey']) === 1) && (field.name !== 'IsPKey' || this.primaryWritable(row)),
        warning: compatible ? '' : '原值类型与编辑控件不一致，保留原值'}
    })}
  }

  /** 读取模型字段设置的可读写合同；计算字段弹窗只消费名称、描述，主键按正式来源和当次权限编辑。 */
  readContract() {
    const row = this.current(), editable = this.read().fields
    return [
      {name: 'Name', label: '名称'}, {name: 'description', label: '描述'},
      {name: 'FieldType', label: '字段类型'}, {name: 'AsName', label: '规范别名'},
      {name: 'IsOutput', label: '输出字段'}, {name: 'IsPKey', label: '正式主键'},
    ].map(field => ({...field, readable: this.#view.fieldAccess(row, field.name).read === 'visible',
      writable: editable.some(item => item.name === field.name && item.writable),
      warning: editable.find(item => item.name === field.name)?.warning ?? ''}))
  }

  /** 验证字段合同；计算字段名称与描述确认时去首尾空白，全部校验通过才写回原编辑覆盖，不派发保存。 */
  confirmContract(fieldIds: readonly string[] = [this.fieldId]): void {
    const originalPatch = this.#view.getEditingPatch(this.fieldId) ?? {}, patch = {...originalPatch}
    if (this.current()['FieldType'] === '计算字段') {
      for (const field of ['Name', 'description']) {
        const value = patch[field]
        if (typeof value === 'string') patch[field] = value.trim()
      }
    }
    this.assertEditable({fieldIds, patch})
    for (const field of ['Name', 'description', 'FieldType', 'AsName']) {
      if (!Object.hasOwn(patch, field)) continue
      const value = patch[field]
      if (typeof value !== 'string') throw new Error('字段合同必须使用文本值')
      if (value.length > (field === 'description' ? 200 : 100)) throw new Error(field === 'description' ? '描述不能超过200个字符' : '名称、字段类型及规范别名不能超过100个字符')
    }
    if (Object.hasOwn(patch, 'IsPKey')) {
      if (this.#view.rows.some(row => row['dataModelId'] === this.#modelId && ['Name', 'IsPKey'].some(key => this.#view.fieldAccess(row, key).read !== 'visible'))) throw new Error('主键候选字段不可读')
      const selected = this.#view.rows.filter(row => row['dataModelId'] === this.#modelId && row['type'] === 'dataModel'
        && Number((this.#view.getEditingRow(String(row['rowid'])) ?? row)['IsPKey']) === 1)
      if (selected.length > 1) throw new Error('模型已有另一个正式主键，请先取消旧主键')
      if (Number(patch['IsPKey']) === 1 && (this.#view.getEditingRow(this.fieldId) ?? this.current())['IsOutput'] !== 1) this.validate('IsOutput', 1)
      this.lifecycle.stagePrimaryKey?.(this.#modelId, String(selected[0]?.['Name'] ?? ''))
      this.ensurePrimaryOutput(fieldIds)
    }
    for (const field of ['Name', 'description']) {
      if (Object.hasOwn(patch, field) && patch[field] !== originalPatch[field]) this.#view.updateEditingValue(this.fieldId, field, patch[field])
    }
  }

  /** 复选框选中后在原编辑域自动输出；局部检查点可同时撤销两个标记。 */
  ensurePrimaryOutput(fieldIds: readonly string[] = [this.fieldId]): void {
    this.assertEditable({fieldIds})
    const row = this.#view.getEditingRow(this.fieldId) ?? this.current()
    if (Number(row['IsPKey']) !== 1 || row['IsOutput'] === 1) return
    this.validate('IsPKey', 1); this.validate('IsOutput', 1)
    this.#view.updateEditingValue(this.fieldId, 'IsOutput', 1)
  }

  private validate(field: string, value: unknown): void {
    const row = this.current()
    if (!FieldEditSession.fields.some(item => item.name === field) || !this.#view.columns.some(column => column.name === field)) {
      throw new Error('字段配置不能修改来源身份或其他属性')
    }
    if (this.#view.fieldAccess(row, field).read !== 'visible' || this.#view.fieldAccess(row, field).write !== 'allowed'
      || !this.writable(row)) throw new Error(`字段配置当前不可写：${field}`)
    if (field === 'description' && typeof value !== 'string') throw new Error('字段说明必须是文本')
    if (field === 'Name' && (row['FieldType'] !== '计算字段' || typeof value !== 'string' || value.length === 0
      || value !== value.trim() || value === '_pk' || /[\u0000-\u001f\u007f]/.test(value))) {
      throw new Error('仅计算字段名称可修改，名称必须是有效非空文本且不能为_pk')
    }
    if (field === 'FieldType' && (typeof value !== 'string' || value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)
      || ['计算字段', '引用'].includes(value) || ['计算字段', '引用'].includes(String(row['FieldType'])))) {
      throw new Error('字段类型必须是非空文本；计算字段与引用字段的种类需单独维护')
    }
    if (field === 'AsName' && (typeof value !== 'string' || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value))) throw new Error('输出名称必须是无首尾空白的文本，可留空')
    if (field === 'IsOutput' && value !== 0 && value !== 1) throw new Error('输出开关必须是0或1')
    if (field === 'IsPKey' && (value !== 0 && value !== 1 || !this.primaryWritable(row))) throw new Error('主键标记只能在可写模型工作区维护；来源主键、计算或引用字段不能修改')
    if (field === 'allowAIAdd' && value !== 0 && value !== 1) throw new Error('AI操作配置必须是0或1')
    if (field === 'Expression') {
      if (typeof value !== 'string') throw new Error('脱敏规则必须是规则ID文本，空文本表示不指定')
      if (value !== '') {
        const rules = this.dataSet.getView('Base_Desensitization_Rule', 'default')
        const matches = rules?.rows.filter(item => item['rowid'] === value) ?? []
        const rule = matches[0]
        if (!rule || rules?.requestState !== RequestState.Loaded || rules.total !== rules.rows.length || rules.mutating
          || matches.length !== 1 || ['rowid', 'name'].some(key => rules.fieldAccess(rule, key).read !== 'visible')) throw new Error('脱敏规则不存在或当前不可读取')
      }
    }
    if (field === 'ValueFun') new LowcodeDataSpaceFieldValue({
      dataSet: this.dataSet,
      targetId: this.targetId,
      modelId: String(row['dataModelId']),
      viewId: this.viewId === 'modelFields' ? 'modelFields' : 'default',
    }).validate(value)
    if (field === 'OrderType' && (typeof value !== 'string' || !['', 'ascending', 'descending'].includes(value))) throw new Error('排序方向必须是未配置、升序或降序')
    if ((field === 'Order' || field === 'Group') && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) {
      throw new Error('排序及分组顺序必须是非负安全整数')
    }
  }

  private assertEditable(input: AssertEditableInput = {}): void {
    const expected = input.expected ?? 'idle'
    const replacingValueFunction = input.replacingValueFunction ?? false
    const fieldIds = input.fieldIds ?? [this.fieldId]
    const patch = input.patch ?? this.#view.getEditingPatch(this.fieldId) ?? {}
    this.lifecycle.assertEditable?.()
    if (this.flowStatus() !== expected || this.#view.dirtyTracking.dirtyRowIds.size
      || [...this.#view.dirtyTracking.pendingCreateIds].some(id => !fieldIds.includes(String(id)))) throw new Error('请先核验未决字段修改')
    if (this.snapshot(this.current()) !== this.#baseline) throw new Error('字段配置基线已变化，请重新核验')
    if ((this.#created || Object.keys(patch).some(field => !FieldEditSession.receiptFields.has(field)))
      && this.#view.rows.some(row => !fieldIds.includes(String(this.#view.getPkKey(row))) && this.#view.hasEditingChanges(this.#view.getPkKey(row)))) {
      throw new Error('请先处理其他字段草稿，避免完整回读覆盖')
    }
    for (const [field, value] of Object.entries(patch)) {
      if (field !== 'ValueFun' || !replacingValueFunction) this.validate(field, value)
    }
  }

  /** 复杂值函数编辑器消费同一ValueFun编辑覆盖；隐藏值不返回给页面。 */
  readValueFunction() {
    const row = this.current(), access = this.#view.fieldAccess(row, 'ValueFun')
    if (access.read !== 'visible') return {value: null, context: {}, warning: ''}
    const value = (this.#view.getEditingRow(this.fieldId) ?? row)['ValueFun']
    const context = new LowcodeDataSpaceFieldValue({
      dataSet: this.dataSet,
      targetId: this.targetId,
      modelId: String(row['dataModelId']),
      viewId: this.viewId === 'modelFields' ? 'modelFields' : 'default',
    }).read(this.lifecycle.readDefinition)
    return {value: typeof value === 'string' ? value : null, ...context}
  }

  /** 专业编辑器确认后只更新原字段视图的编辑覆盖。 */
  stageValueFunction(value: string, fieldIds: readonly string[] = [this.fieldId]): void {
    this.assertEditable({replacingValueFunction: true, fieldIds}); this.validate('ValueFun', value)
    this.#view.updateEditingValue(this.fieldId, 'ValueFun', value)
  }

  /** 只取消尚未派发的当前字段编辑，其他记录保持原状。 */
  discard(): void {
    this.assertOwner()
    if (this.flowStatus() !== 'idle') throw new Error('已派发字段修改必须先核验')
    if (this.#created) this.#view.discardPendingChanges([this.fieldId])
    else this.#view.discardEditingRows([this.fieldId])
  }

  /** 单字段保存与批量保存共用校验和原生提交；结构命令保留必要回读。 */
  save(): Promise<void> {return FieldEditSession.saveBatch([this])}

  private static batch(owners: readonly FieldEditSession[], checkRows = true): FieldEditSession {
    const first = owners[0]
    if (!first || new Set(owners.map(owner => owner.fieldId)).size !== owners.length) throw new Error('字段批次为空或身份重复')
    for (const owner of owners) {
      owner.assertOwner()
      if (owner.dataSet !== first.dataSet || owner.#view !== first.#view || owner.targetId !== first.targetId
        || owner.#modelId !== first.#modelId) throw new Error('字段批次必须属于同一查询视图和模型')
      if (checkRows) owner.current()
    }
    return first
  }

  /**
   * 全部输出或反转当前编辑值，正式主键保持输出；仅暂存原DataView编辑覆盖。
   * @param owners 同一查询和模型的字段流程；身份、全部目标权限及旧编辑值先统一核验。
   * @param mode all将目标设为输出，invert反转非主键的0/1值；不转换未知旧值类型。
   * @returns 本次改变的字段数和保持输出的正式主键数；尚未保存，仍可取消。
   */
  static async stageOutputBatch(owners: readonly FieldEditSession[], mode: 'all' | 'invert'): Promise<{changedCount: number; primaryCount: number}> {
    if (!['all', 'invert'].includes(mode)) throw new Error('未知批量输出操作')
    const first = this.batch(owners), view = first.#view, ids = owners.map(owner => owner.fieldId)
    owners.forEach(owner => owner.assertEditable({fieldIds: ids}))
    const snapshot = () => JSON.stringify(owners.map(owner => [owner.identity(owner.current()), view.getEditingPatch(owner.fieldId)]))
    const before = snapshot()
    const modelRow = first.dataSet.getView('Base_DataModel', 'default')?.rows.find(row => row['rowid'] === first.#modelId)
    if (typeof modelRow?.['Name'] !== 'string') throw new Error('字段所属模型不可确认')
    owners.forEach(owner => {owner.#status = 'pending'})
    try {
      const model = await first.lifecycle.readModel(first.#modelId, modelRow['Name'])
      owners.forEach(owner => owner.assertEditable({expected: 'pending', fieldIds: ids}))
      if (snapshot() !== before) throw new Error('读取正式模型期间字段草稿已变化')
      if (model.id !== first.#modelId || model.metaName !== modelRow['Name'] || model.sourceName !== modelRow['MetaName']) throw new Error('正式模型身份或来源已变化')
      let primaryCount = 0
      const changes = owners.flatMap(owner => {
        const original = owner.current(), fields = model.fields.filter(field => field.id === owner.fieldId), field = fields[0]
        const creating = view.dirtyTracking.isPendingCreate(owner.fieldId)
        if (creating ? !owner.#created || fields.length !== 0 || original['FieldType'] !== '计算字段' || original['IsPKey'] !== 0
          : !field || fields.length !== 1 || field.modelId !== first.#modelId || field.name !== original['Name']
            || field.output !== (Number(original['IsOutput']) === 1)) throw new Error('字段正式输出已变化，请重新核验')
        if (view.fieldAccess(original, 'IsOutput').read !== 'visible') throw new Error('字段输出配置不可读')
        const value = (view.getEditingRow(owner.fieldId) ?? original)['IsOutput']
        if (value !== 0 && value !== 1) throw new Error('批量输出只接受0或1；请先明确处理旧值')
        const modelPatch = first.dataSet.getView('Base_DataModel')?.getEditingPatch(first.#modelId)
        const primary = first.viewId === 'modelFields' && modelPatch && Object.hasOwn(modelPatch, 'PrimaryKeyFields')
          ? original['Name'] === modelPatch['PrimaryKeyFields'] : field?.primaryKey === true
        if (primary) primaryCount++
        const next = primary || mode === 'all' ? 1 : value === 1 ? 0 : 1
        if (value === next) return []
        owner.validate('IsOutput', next)
        return [{id: owner.fieldId, value: next}]
      })
      for (const change of changes) view.updateEditingValue(change.id, 'IsOutput', change.value)
      return {changedCount: changes.length, primaryCount}
    } finally {owners.forEach(owner => {owner.#status = 'idle'})}
  }

  /** 同一模型的多个字段只调用一次原DataSet保存；流程状态仍留在各字段owner。 */
  static async saveBatch(owners: readonly FieldEditSession[], removals: readonly FieldRemoveHandle[] = []): Promise<void> {
    const removalParts = removals.map(owner => owner.prepareSave())
    const part = this.prepareSave(owners, undefined, removalParts.flatMap(removal => removal.targets().flatMap(target => target.ids)))
    await DataSpaceDefinitionSave.run([...(part ? [part] : []), ...removalParts])
  }

  /** 模型主键选择与字段窗口共用同一工作区编辑域；先核全部权限，再同步标记，不派发。 */
  static stagePrimaryKey(owners: readonly FieldEditSession[], name: string, scope: Readonly<{dataSet: DataSet; targetId: string; modelId: string}>): DataView {
    const first = this.batch(owners), view = first.#view, ids = owners.map(owner => owner.fieldId)
    if (first.dataSet !== scope.dataSet || first.targetId !== scope.targetId || first.#modelId !== scope.modelId) throw new Error('主键字段批次必须属于当前数据空间实例和模型')
    if (first.viewId !== 'modelFields' || view.rows.some(row => !ids.includes(String(row['rowid'])))) throw new Error('主键与字段修改必须在完整模型工作区统一保存')
    owners.forEach(owner => owner.assertEditable({fieldIds: ids}))
    const selected = owners.filter(owner => owner.current()['Name'] === name)
    if (name && selected.length !== 1) throw new Error('主键必须是当前模型唯一正式字段')
    const changes = owners.flatMap(owner => {
      const row = view.getEditingRow(owner.fieldId) ?? owner.current(), flag = name && row['Name'] === name ? 1 : 0
      if (view.fieldAccess(owner.current(), 'IsPKey').read !== 'visible' || ![undefined, null, 0, 1, '0', '1'].some(value => value === row['IsPKey'])) throw new Error('旧主键标记无法确认，请先核查原定义')
      const patch: Record<string, number> = {}
      if (Number(row['IsPKey'] ?? 0) !== flag) patch['IsPKey'] = flag
      if (flag && Number(row['IsOutput']) !== 1) patch['IsOutput'] = 1
      if (flag) owner.validate('IsPKey', 1)
      for (const [key, value] of Object.entries(patch)) owner.validate(key, value)
      return [{id: owner.fieldId, patch}]
    })
    for (const change of changes) for (const [key, value] of Object.entries(change.patch)) view.updateEditingValue(change.id, key, value)
    return view
  }

  /** 为模型工作区提供原字段批次的保存阶段；不提前应用或派发。ValueFun、OrderType或AsName显式清空允许回读为null，其他值保持精确核验。 */
  static prepareSave(owners: readonly FieldEditSession[], modelPatch?: Readonly<Record<string, unknown>>, removedIds: readonly string[] = []): DataSpaceDefinitionSavePart | undefined {
    if (!owners.length) return
    if (owners.some(owner => owner.flowStatus() !== 'idle')) throw new Error('请先核验未决字段修改')
    const first = this.batch(owners), view = first.#view, ids = owners.map(owner => owner.fieldId)
    owners.forEach(owner => owner.assertEditable({fieldIds: ids}))
    if ([...view.dirtyTracking.pendingDeleteIds].some(id => !removedIds.includes(String(id)))) throw new Error('字段删除必须与同一工作区统一保存')
    const changes = owners.map(owner => ({owner, creating: view.dirtyTracking.isPendingCreate(owner.fieldId),
      original: {...owner.current()}, patch: {...view.getEditingPatch(owner.fieldId)}})).filter(item => item.creating || Object.keys(item.patch).length > 0)
    if (!changes.length) return
    const requiresReadback = changes.some(({creating, patch}) => creating || Object.keys(patch).some(field => !this.receiptFields.has(field)))
    if (changes.some(change => Object.hasOwn(change.patch, 'IsPKey')) && (!modelPatch || !Object.hasOwn(modelPatch, 'PrimaryKeyFields'))) throw new Error('主键标记必须与模型声明统一保存')
    let assertOutputs: (() => void) | undefined
    const changedIds = changes.map(item => item.owner.fieldId)
    return {
      dataSet: first.dataSet, targetId: first.targetId, modelId: first.#modelId,
      prepare: async () => {
        owners.forEach(owner => {owner.#status = 'pending'})
        const outputs = changes.filter(({patch, creating}) => creating || 'Name' in patch || 'AsName' in patch || 'IsOutput' in patch || 'IsPKey' in patch || 'ValueFun' in patch || 'FieldType' in patch)
        assertOutputs = outputs.length ? await first.lifecycle.validateOutputs(changes.map(({original, patch, creating}) => ({original, patch, creating})), modelPatch) : undefined
        owners.forEach(owner => owner.assertEditable({expected: 'pending', fieldIds: ids}))
        for (const {owner, patch} of changes) if (JSON.stringify(patch) !== JSON.stringify(view.getEditingPatch(owner.fieldId) ?? {})) throw new Error('验证期间字段草稿已变化')
        assertOutputs?.()
      },
      apply: async () => {
        owners.forEach(owner => owner.assertEditable({expected: 'pending', fieldIds: ids}))
        for (const {owner, patch} of changes) if (JSON.stringify(patch) !== JSON.stringify(view.getEditingPatch(owner.fieldId) ?? {})) throw new Error('应用前字段草稿已变化')
        const editingIds = changes.filter(item => Object.keys(item.patch).length).map(item => item.owner.fieldId)
        const applied = await view.applyEditingRows(editingIds)
        if (!applied.success || applied.data?.appliedCount !== editingIds.length || applied.data.failedCount !== 0) throw new Error('字段配置尚未应用')
      },
      check: () => {
        for (const {owner, patch, original, creating} of changes) {
          owner.lifecycle.assertEditable?.()
          const row = owner.current()
          if ((requiresReadback ? view.hasEditingChanges() : changedIds.some(id => view.hasEditingChanges(id)))
            || Object.entries(patch).some(([field, value]) => row[field] !== value)) throw new Error('提交前字段草稿已变化')
          for (const [field, value] of Object.entries(patch)) owner.validate(field, value)
          if (creating && (!view.dirtyTracking.isPendingCreate(owner.fieldId) || !owner.writable(row)
            || Object.entries({...original, ...patch}).some(([field, value]) => row[field] !== value))) throw new Error('提交前新增定义或权限已变化')
        }
        assertOutputs?.()
      },
      targets: () => [{tableName: view.tableName, viewId: view.viewId, ids: changedIds}],
      dispatched: capture => {owners.forEach(owner => {owner.#recoveryCapture = capture}); first.lifecycle.onDispatch()},
      confirm: async () => {
        if (requiresReadback) await first.readback()
        else await first.lifecycle.refreshDirectory?.()
        for (const {owner, patch, original, creating} of changes) {
          const loaded = owner.current()
          const expected = creating ? {...original, ...patch} : patch
          if (Object.entries(expected).some(([field, value]) => {
            if (field === 'lingma_sys_key') return false
            // 值函数、排序方向和别名的显式空串与数据库null均表示未配置；不归一化缺项、空白或其他字段。
            const matches = loaded[field] === value || ((field === 'ValueFun' || field === 'OrderType' || field === 'AsName') && value === '' && loaded[field] === null)
            return view.fieldAccess(loaded, field).read !== 'visible' || !matches
          })) throw new Error('字段回读与提交值不一致')
        }
        owners.forEach(owner => {owner.#baseline = owner.snapshot(owner.current()); owner.#created = false; owner.#status = 'idle'})
      },
      settled: () => {owners.forEach(owner => {owner.#recoveryCapture = undefined})},
      failed: stage => {owners.forEach(owner => {
        owner.#status = stage === 'confirmed' ? 'readback'
          : stage === 'dispatched' ? (owner.#view.hasUnconfirmedSave ? 'unsubmitted' : 'unknown')
          : stage === 'applying' ? 'unsubmitted' : 'idle'
      })},
    }
  }

  private async readback(): Promise<void> {
    this.assertOwner()
    if (this.#view.hasEditingChanges() || this.#view.dirtyTracking.hasPendingChanges()) throw new Error('字段草稿仍未处理，不能用回读覆盖')
    const result = await this.#view.loadFromServer({filter: this.#view.filterExpression ?? {field: 'dataSetId', operator: 'eq', value: this.targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})
    this.assertOwner()
    if (!result.success || this.#view.loadingError || this.#view.rows.some(row => this.#view.fieldAccess(row, 'dataSetId').read !== 'visible' || row['dataSetId'] !== this.targetId)) throw new Error('字段回读失败或包含其他空间记录')
    if (this.viewId !== 'default' && this.#view.rows.some(row => row['dataModelId'] !== this.#modelId || row['type'] !== 'dataModel')) throw new Error('字段回读包含其他模型记录')
    await this.lifecycle.refreshDirectory?.()
  }

  /** 显式处理本行待提交差异后重新读取；不重放已经派发的请求。 */
  reload(discardPending: boolean): Promise<void> {return FieldEditSession.reloadBatch([this], discardPending)}

  /** 明确放弃所选字段本地差异后统一回读，不重复提交，不覆盖范围外草稿。 */
  static async reloadBatch(owners: readonly FieldEditSession[], discardPending: boolean): Promise<void> {
    await this.prepareReloadBatch(owners, discardPending)()
  }

  /** 按原捕获范围核验；等待期间字段草稿变化时拒绝迟到丢弃。 */
  static prepareReloadBatch(owners: readonly FieldEditSession[], discardPending: boolean): () => Promise<void> {
    owners = [...owners]
    const first = this.batch(owners, false), view = first.#view, ids = owners.map(owner => owner.fieldId)
    if (owners.some(owner => owner.#status === 'pending') || view.mutating || view.requestState === RequestState.Loading) throw new Error('字段请求仍在进行')
    if (owners.some(owner => owner.getState().pending) && !discardPending) throw new Error('本地字段修改尚未明确放弃')
    if (view.rows.some(row => !ids.includes(String(view.getPkKey(row)))
      && (view.hasEditingChanges(view.getPkKey(row)) || view.dirtyTracking.hasPendingChanges(view.getPkKey(row))))) throw new Error('请先处理其他字段草稿，避免完整回读覆盖')
    const capture = first.#recoveryCapture
    if (capture && !capture.verified && capture.targets.some(target => target.tableName !== view.tableName || target.viewId !== view.viewId
      || target.ids.some(id => !ids.includes(id)))) {
      throw new Error('原保存包含模型或其他字段目标；请从完整字段工作区统一核验')
    }
    const discardIds = capture ? capture.targets.filter(target => target.view === view).flatMap(target => target.ids) : ids
    const snapshot = () => definitionTargetDraftSignature(view, ids)
    const before = snapshot()
    return async () => {
      if (owners.some(owner => owner.#status === 'pending') || view.mutating || view.requestState === RequestState.Loading) throw new Error('字段请求仍在进行')
      owners.forEach(owner => {owner.#status = 'pending'})
      try {
        if (snapshot() !== before) throw new Error('准备回读后字段草稿已变化；保留修改，请重新核验')
        if (capture && !capture.verified && (capture.receiptInvalid || capture.targets.some(target => target.view.hasUnconfirmedSave))) {
          await verifyDataSpaceDefinitionCapture(first.dataSet, capture, discardPending)
        }
        if (discardPending && !(capture?.acceptedCurrent)) view.discardPendingChanges(discardIds)
        owners.forEach(owner => {owner.#recoveryCapture = undefined})
        await first.readback()
        owners.forEach(owner => {
          // 显式放弃并回读后，未落库的新增已撤销；不能把缺失当成新增成功，也不重放请求。
          if (!owner.#created || view.rows.some(row => row['rowid'] === owner.fieldId)) owner.#baseline = owner.snapshot(owner.current())
          owner.#created = false; owner.#status = 'idle'
        })
      } catch (cause) {owners.forEach(owner => {owner.#status = 'readback'}); throw cause}
    }
  }
}

export function createFieldEditHost(input: FieldEditSessionInput): FieldEditSession {
  return new FieldEditSession(input)
}

/** 页面与测试沿用的句柄；委托同一 host，不单独持有命令类 FSM。 */
export function createFieldEditHandle(host: FieldEditSession): FieldEditSession {
  return host
}

export async function fieldEditStageOutputBatch(owners: readonly FieldEditSession[], mode: 'all' | 'invert') {
  return FieldEditSession.stageOutputBatch(owners, mode)
}

export async function fieldEditSaveBatch(owners: readonly FieldEditSession[], removals: readonly FieldRemoveHandle[] = []) {
  return FieldEditSession.saveBatch(owners, removals)
}

export function fieldEditStagePrimaryKey(owners: readonly FieldEditSession[], name: string, scope: Readonly<{dataSet: DataSet; targetId: string; modelId: string}>) {
  return FieldEditSession.stagePrimaryKey(owners, name, scope)
}

export function fieldEditPrepareSave(owners: readonly FieldEditSession[], modelPatch?: Readonly<Record<string, unknown>>, removedIds: readonly string[] = []) {
  return FieldEditSession.prepareSave(owners, modelPatch, removedIds)
}

export async function fieldEditReloadBatch(owners: readonly FieldEditSession[], discardPending: boolean) {
  return FieldEditSession.reloadBatch(owners, discardPending)
}

export function fieldEditPrepareReloadBatch(owners: readonly FieldEditSession[], discardPending: boolean) {
  return FieldEditSession.prepareReloadBatch(owners, discardPending)
}
