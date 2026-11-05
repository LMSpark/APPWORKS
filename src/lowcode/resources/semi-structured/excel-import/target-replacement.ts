/**
 * @module app:lowcode/resources/semi-structured/excel-import/target-replacement
 * 职责：组合Excel目标与字段替换的原生变更，消费同一DataSet的联合捕获及精确回读。
 * 边界：不建立数据副本或请求通道；原视图持有草稿，公共定义提交器负责保存和未知核验。
 * AI用途：目标表确认后暂存、联合保存与取消；不能将节点和字段拆成两个独立提交。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDefinitionSave, definitionTargetDraftSignature, verifyDataSpaceDefinitionCapture, type DataSpaceDefinitionCaptureBatch} from '@/lowcode/data-space/model-source/data-space-definition-save'
import {projectExcelTarget, stageExcelTarget, type ExcelTarget, type ExcelTargetStaging} from './target-selection'
import {validateExcelTargetReferences} from './target-references'

/** 原页面本次明确的目标替换调用。 */
type Input = Readonly<{
  /** 原Excel设计实例。 */
  dataSet: DataSet
  /** 捕获的配置行身份。 */
  nodeId: string
  /** 本次正式来源实例，只读消费。 */
  source: DataSet
  /** 页面代次、运行实例及目标守卫。 */
  assertCurrent(): void
}>
/** 目标和字段的联合结构命令；状态仅描述原提交，不持有可编辑业务数据。 */
export class ExcelTargetReplacement {
  readonly #nodes: DataView
  readonly #fields: DataView
  #staged: ExcelTargetStaging | undefined
  #capture: DataSpaceDefinitionCaptureBatch | undefined
  #signature: string | undefined
  #applied = false
  #applyStarted = false
  #done = false
  #acceptedCurrent = false
  #busy = false
  readonly #referenceBaseline: string
  readonly #oldTable: string
  readonly #oldFields: readonly string[]
  readonly #schemeId: string
  readonly #modelId: string
  readonly #scenarioId: string
  readonly #fieldBaseline: string
  #selection: ExcelTarget | undefined
  #preparedSignature: string | undefined

  /** 捕获正式配置、映射与引用的首轮只读证明，不创建额外编辑真源。 */
  private constructor(private readonly input: Input) {
    const nodes = input.dataSet.getView('Base_ImportData_Config'), fields = input.dataSet.getView('Base_ImportData_Field')
    if (!nodes || !fields || nodes.dataTable?.modelBinding?.modelName !== 'Base_ImportData_Config' || typeof nodes.dataTable.modelBinding.modelId !== 'string') throw new Error('Excel目标替换缺少正式视图及模型绑定')
    this.#nodes = nodes; this.#fields = fields
    this.#modelId = nodes.dataTable.modelBinding.modelId
    const scenarioId = input.dataSet.scenarioId
    if (typeof scenarioId !== 'string' || scenarioId === '') throw new Error('Excel原实例缺少场景身份')
    this.#scenarioId = scenarioId
    const row = nodes.currentRow, rules = input.dataSet.getView('Base_Import_Transform_Rule')
    if (!row || nodes.getPkKey(row) !== input.nodeId || typeof row['schemeid'] !== 'string' || nodes.fieldAccess(row, 'schemeid').read !== 'visible'
      || nodes.queryContext['importConfigId'] !== row['schemeid'] || !rules) throw new Error('Excel原方案及引用视图身份不完整')
    this.#schemeId = row['schemeid']; this.#oldTable = String(row['table'] ?? '')
    this.#oldFields = fields.readSnapshot().rows.map(field => String(field['name']))
    this.#fieldBaseline = this.fieldProof(fields.readSnapshot().rows)
    this.#referenceBaseline = this.referenceProof(nodes.readSnapshot().rows, rules.readSnapshot().rows)
  }
  /** @param input 原实例、原配置及来源。 @returns 仅暂存在原视图中的替换命令，不发生保存。 */
  static async stage(input: Input): Promise<ExcelTargetReplacement> {
    const command = new ExcelTargetReplacement(input), selection = projectExcelTarget(input.source), signature = JSON.stringify(selection)
    command.#selection = selection
    command.#staged = await stageExcelTarget({nodes: command.#nodes, fields: command.#fields, nodeId: input.nodeId, selection,
      assertCurrent: () => {input.assertCurrent(); if (JSON.stringify(projectExcelTarget(input.source)) !== signature) throw new Error('来源选择已变化，请重新确认')}})
    return command
  }
  /** 本次原命令的交互状态，不包含行值。 */
  getState() {return {busy: this.#busy, done: this.#done, dispatched: !!this.#capture, applyStarted: this.#applyStarted,
    acceptedCurrent: this.#acceptedCurrent, canAcceptCurrent: !this.#busy && !this.#done && this.#capture?.receiptInvalid === true && !this.#nodes.hasUnconfirmedSave && !this.#fields.hasUnconfirmedSave,
    canCancel: !this.#busy && !this.#applyStarted && !this.#capture && !this.#done,
    canDiscard: !this.#busy && !this.#done && (!this.#capture || ['confirmed', 'not-applied'].includes(this.#capture.resolution ?? '')) && !this.#nodes.hasUnconfirmedSave && !this.#fields.hasUnconfirmedSave,
    canRetry: !this.#busy && this.#capture?.resolution === 'not-applied', verificationRequired: !!this.#capture && !this.#done}}
  private guard(): void {
    this.input.assertCurrent()
    if (this.input.dataSet.destroyed || this.#nodes.currentRow?.['rowid'] !== this.input.nodeId || !this.#staged) throw new Error('原Excel目标替换已失效')
  }
  private signature(): string {
    return definitionTargetDraftSignature(this.#nodes, [this.input.nodeId]) + definitionTargetDraftSignature(this.#fields, this.staged().fieldIds.map(String))
  }
  private staged(): ExcelTargetStaging {if (this.#staged === undefined) throw new Error('Excel来源替换尚未暂存'); return this.#staged}
  private selection(): ExcelTarget {if (this.#selection === undefined) throw new Error('Excel来源选择缺失'); return this.#selection}
  private unchanged(): void {
    this.guard()
    if (this.#signature !== undefined && this.signature() !== this.#signature) throw new Error('原来源替换提交后出现新修改，已保留，请先处理')
  }
  private complete(): void {this.staged().release(); this.#done = true}
  private referenceProof(nodes: ReadonlyArray<Readonly<Record<string, unknown>>>, rules: ReadonlyArray<Readonly<Record<string, unknown>>>): string {
    const pick = (row: Readonly<Record<string, unknown>>, names: readonly string[]) => Object.fromEntries(names.map(name => [name, row[name] ?? null]))
    const relevant = nodes.filter(row => row['rowid'] === this.input.nodeId || row['pid'] === this.input.nodeId)
      .map(row => pick(row, row['rowid'] === this.input.nodeId ? ['rowid','schemeid','pid','table','foreignKeyField','parentField','filters','sorted','sheet_layout_json'] : ['rowid','schemeid','pid','parentField']))
      .sort((a, b) => String(a['rowid']).localeCompare(String(b['rowid'])))
    const references = rules.filter(row => row['config_id'] === this.input.nodeId).map(row => pick(row, ['id','scheme_id','config_id','source_field','target_field','rule_type','phase','sort_order','enabled','condition_json','config_json','on_error']))
      .sort((a, b) => String(a['id']).localeCompare(String(b['id'])))
    return JSON.stringify([relevant, references])
  }
  private fieldProof(rows: ReadonlyArray<Readonly<Record<string, unknown>>>): string {return JSON.stringify([...rows].sort((a,b)=>String(a['rowid']).localeCompare(String(b['rowid']))))}
  private async preflightReferences(): Promise<void> {
    this.guard()
    const currentNode = this.#nodes.currentRow, name = this.#nodes.getEditingRow(this.input.nodeId)?.['sheetName']
    if (!currentNode || this.#nodes.fieldAccess(currentNode, 'sheetName').read !== 'visible' || typeof name !== 'string' || !name.trim()) throw new Error('请输入工作表名称')
    const originalDraft = this.signature()
    const rules = this.input.dataSet.getView('Base_Import_Transform_Rule')
    if (rules === undefined) throw new Error('Excel原规则视图缺失')
    if (rules.hasEditingChanges() || rules.dirtyTracking.hasPendingChanges()) throw new Error('请先保存或取消当前配置规则修改')
    const children = this.#nodes.rows.filter(row => row['pid'] === this.input.nodeId)
    validateExcelTargetReferences({node: {...this.#nodes.getEditingRow(this.input.nodeId), table: this.#oldTable}, children, rules: rules.readSnapshot().rows, oldFields: this.#oldFields, selection: this.selection()})
    const prefix = `excelSource_${crypto.randomUUID().replaceAll('-', '')}`, nodes = this.#nodes.createQueryView(prefix), references = rules.createQueryView(prefix), fields = this.#fields.createQueryView(prefix)
    nodes.filterExpression = {logic: 'or', filters: [{logic: 'and', filters: [{field: 'schemeid', operator: 'eq', value: this.#schemeId}, {field: 'rowid', operator: 'eq', value: this.input.nodeId}]}, {field: 'pid', operator: 'eq', value: this.input.nodeId}]}
    references.filterExpression = {field: 'config_id', operator: 'eq', value: this.input.nodeId}
    fields.filterExpression = {field: 'configid', operator: 'eq', value: this.input.nodeId}
    try {
      for (const view of [nodes, fields, references]) {await view.refresh(); this.guard(); if (this.signature() !== originalDraft) throw new Error('引用预检期间原草稿已变化，修改已保留'); if (view.loadingError || view.requestState !== RequestState.Loaded || !view.countReported || view.total !== view.rows.length) throw new Error('Excel换表引用未完整重读')}
      if(this.fieldProof(fields.readSnapshot().rows)!==this.#fieldBaseline)throw new Error('原字段映射已变化，保留本次替换意图')
      if(fields.addActionState()!=='enabled'||fields.rows.some(row=>fields.deleteActionState(row)!=='enabled'))throw new Error('当前正式字段查询不允许替换')
      const node=nodes.rows.find(row=>nodes.getPkKey(row)===this.input.nodeId), changed=[...new Set([...Object.keys(this.#nodes.getEditingPatch(this.input.nodeId)??{}),...Object.keys(this.#nodes.getDirtyChanges(this.input.nodeId))])]
      if(!node||changed.some(field=>nodes.fieldAccess(node,field).write!=='allowed'))throw new Error('当前正式配置查询不允许修改目标')
      if (this.referenceProof(nodes.readSnapshot().rows, references.readSnapshot().rows) !== this.#referenceBaseline) throw new Error('原配置、直接子级或转换规则引用已变化，保留原替换意图')
      this.#preparedSignature = originalDraft
    } finally {nodes.dataTable?.destroyView(nodes.viewId); fields.dataTable?.destroyView(fields.viewId); references.dataTable?.destroyView(references.viewId)}
  }
  /** 联合提交原配置与捕获字段；存在原捕获时只核验，不自动重放。 */
  async save(): Promise<void> {
    this.guard(); if (this.#done) return
    if (this.#busy) throw new Error('Excel来源替换正在处理')
    this.#busy = true
    let edited = false
    const changed = () => {edited = true}
    const changedDuringApply = (): boolean => edited
    for (const view of [this.#nodes, this.#fields]) view.events.on('editingFieldChanged', changed)
    try {
      if (this.#capture) {
        const result = await verifyDataSpaceDefinitionCapture(this.input.dataSet, this.#capture)
        if (result === 'not-applied') throw new Error('原来源替换已确认未生效；可明确重新提交，不能自动重放')
        if (result === 'accepted-current') throw new Error('采用当前正式结果不代表来源替换成功')
        if (this.#capture.targets.some(target => target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id)))) throw new Error('原替换已确认，但存在后续本地修改；请明确放弃本地修改后收尾')
        this.complete(); return
      }
      await DataSpaceDefinitionSave.run([{dataSet: this.input.dataSet, targetId: this.#scenarioId, modelId: this.#modelId,
        prepare: async () => {this.guard(); for (const view of [this.#nodes, this.#fields]) if (view.requestState !== RequestState.Loaded || view.loadingError || view.hasUnconfirmedSave) throw new Error('原Excel查询未就绪'); await this.preflightReferences()},
        apply: async () => {
          this.guard()
          if (edited || this.signature() !== this.#preparedSignature) throw new Error('已校验草稿发生变化，拒绝应用来源替换')
          if (!this.#applied) {
            this.#applyStarted = true
            for (const [view, ids] of [[this.#nodes, [this.input.nodeId]], [this.#fields, this.staged().fieldIds.map(String)]] as const) {
              const applied = await view.applyEditingRows([...ids]); this.guard(); if (changedDuringApply()) throw new Error('应用期间原草稿已变化，修改已保留'); if (!applied.success) throw new Error('Excel替换草稿未完整应用')
            }
            this.#applied = true
          }
          this.#signature = this.signature()
        }, check: () => {if (edited) throw new Error('派发前原草稿已变化'); this.unchanged()},
        targets: () => [{tableName: this.#fields.tableName, viewId: this.#fields.viewId, ids: this.staged().fieldIds.map(String)},
          ...(this.#nodes.dirtyTracking.hasPendingChanges(this.input.nodeId) ? [{tableName: this.#nodes.tableName, viewId: this.#nodes.viewId, ids: [this.input.nodeId]}] : [])],
        dispatched: capture => {this.#capture = capture}, confirm: () => {this.complete(); return Promise.resolve()}, failed: () => {},
      }])
    } finally {for (const view of [this.#nodes, this.#fields]) view.events.off('editingFieldChanged', changed); this.#busy = false}
  }
  /** 仅在公共核验已确认整个原批次未生效后，明确重新提交同一意图。 */
  async retry(): Promise<void> {
    this.unchanged()
    if (!this.getState().canRetry) throw new Error('原替换尚未确认未生效，不能重新提交')
    this.#capture = undefined; await this.save()
  }
  /** 显式读取并采用回执无效批次的当前正式结果；不将该结果标为原换源成功，不重发提交。 */
  async acceptCurrent(): Promise<void> {
    this.guard()
    if (!this.getState().canAcceptCurrent || !this.#capture) throw new Error('原换源不能采用当前结果')
    this.#busy = true
    try {
      const outcome = await verifyDataSpaceDefinitionCapture(this.input.dataSet, this.#capture, true)
      if (outcome !== 'accepted-current') throw new Error('未取得明确采用的正式结果')
      this.#acceptedCurrent = true; this.complete()
    } finally {this.#busy = false}
  }
  /** 派发前局部取消，仅恢复来源字段与替换集合，保留工作表名称等既有编辑。 */
  cancel(): void {
    this.guard()
    if (!this.getState().canCancel) throw new Error('来源替换已开始提交，必须从原批次核验')
    this.staged().cancel(); this.#done = true
  }
  /** 明确放弃本次配置行及字段的本地改动；只允许未派发或公共核验已确定的结果，不撤销正式写入。 */
  discardLocalChanges(): void {
    this.guard()
    if (this.#busy || this.#done || this.#capture && !['confirmed', 'not-applied'].includes(this.#capture.resolution ?? '')
      || this.#nodes.hasUnconfirmedSave || this.#fields.hasUnconfirmedSave) throw new Error('原联合批次仍未确认，不能丢弃')
    this.#fields.discardPendingChanges(this.staged().fieldIds); this.#nodes.discardPendingChanges([this.input.nodeId]); this.complete()
  }
}
