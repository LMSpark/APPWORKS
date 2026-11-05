/**
 * @module app:lowcode/resources/semi-structured/excel-import/configuration-removal
 * 职责：预览并删除单个Excel叶配置及所属字段、转换规则，精确保留兄弟配置。
 * 边界：通过原DataSet的查询克隆与联合捕获提交；不删除方案、模板或来源业务表。
 * AI用途：配置树删除确认及原批次核验；数据库已确认后只回读，不重复删除。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {isJsonObject,parseJsonDocument} from '@spark-appworks/spark-json-document'
import {excelLayoutTableKey,hasExcelLayoutReferences} from './layout/routes'
import {DataSpaceDefinitionSave, verifyDataSpaceDefinitionCapture, type DataSpaceDefinitionCaptureBatch} from '@/lowcode/data-space/model-source/data-space-definition-save'
/** 本次原Excel配置删除的唯一实例及目标输入。 */
type Input = Readonly<{
  /** 本次原生Excel设计实例。 */
  dataSet: DataSet
  /** 正式方案身份。 */
  schemeId: string
  /** 本次捕获的配置身份。 */
  nodeId: string
  /** 页面运行实例、方案及释放状态守卫。 */
  assertCurrent(): void
}>
/** 一个叶配置删除命令，仅保留身份、首轮只读证明及原公共提交捕获。 */
export class ExcelConfigurationRemoval {
  readonly #views: readonly [DataView, DataView, DataView]
  readonly #originals: readonly [DataView, DataView, DataView]
  readonly #modelId: string
  readonly #scenarioId: string
  #ids: [string[], string[], string[]] = [[], [], []]
  #baseline = ''
  #capture: DataSpaceDefinitionCaptureBatch | undefined
  #staged = false
  #databaseConfirmed = false
  #done = false
  #acceptedCurrent = false
  #busy = false
  /** 捕获正式模型与原视图，仅创建本次查询克隆，不执行删除。 */
  private constructor(private readonly input: Input) {
    const nodes=input.dataSet.getView('Base_ImportData_Config'),fields=input.dataSet.getView('Base_ImportData_Field'),rules=input.dataSet.getView('Base_Import_Transform_Rule')
    if(!nodes||!fields||!rules||[nodes,fields,rules].some(view=>view.commitMode!=='staged'))throw new Error('Excel删除需要正式暂存视图')
    this.#originals=[nodes,fields,rules]
    const binding = nodes.dataTable?.modelBinding
    if (input.dataSet.scenarioId !== '0F93B82141CF40852021D704B0E30BF4' || binding?.modelName !== 'Base_ImportData_Config' || typeof binding.modelId !== 'string') throw new Error('Excel删除模型身份不匹配')
    this.#modelId = binding.modelId
    this.#scenarioId=input.dataSet.scenarioId
    const prefix = `excelDelete_${crypto.randomUUID().replaceAll('-', '')}`
    this.#views = [nodes.createQueryView(prefix),fields.createQueryView(prefix),rules.createQueryView(prefix)]
    this.#views[0].filterExpression = {logic: 'or', filters: [{field: 'schemeid', operator: 'eq', value: input.schemeId}, {field: 'pid', operator: 'eq', value: input.nodeId}]}
    this.#views[1].filterExpression = {field: 'configid', operator: 'eq', value: input.nodeId}
    this.#views[2].filterExpression = {field: 'config_id', operator: 'eq', value: input.nodeId}
  }
  /** @param input 原实例与明确目标。 @returns 完成正式依赖读取的删除预览，不暂存或提交删除。 */
  static async open(input: Input): Promise<ExcelConfigurationRemoval> {
    const command = new ExcelConfigurationRemoval(input)
    try {command.guard(true); await command.load(); command.#ids = command.inspect(); command.#baseline = command.proof(); return command}
    catch (cause) {command.release(); throw cause}
  }
  private guard(requireTarget = !this.#databaseConfirmed): void {
    this.input.assertCurrent()
    const nodes = this.#originals[0], row = nodes.currentRow
    if (this.input.dataSet.destroyed || nodes.queryContext['importConfigId'] !== this.input.schemeId
      || requireTarget && (!row || nodes.getPkKey(row) !== this.input.nodeId || row['schemeid'] !== this.input.schemeId)) throw new Error('原Excel删除目标已变化')
  }
  private clean(allowQueries = false): void {
    for (const table of Object.values(this.input.dataSet.tables)) for (const view of table.viewList) if (!this.#views.includes(view)
      && (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges() || view.hasUnconfirmedSave || view.mutating || !allowQueries && (view.requestState === RequestState.Loading || view.requestState === RequestState.Preparing))) throw new Error('请先处理现有草稿或在途操作，删除不会覆盖它们')
  }
  private async load(): Promise<void> {
    this.clean()
    for (const view of this.#views) {await view.refresh(); this.guard(); this.clean(); if (view.loadingError || view.requestState !== RequestState.Loaded || !view.countReported || view.rows.length !== view.total) throw new Error(`Excel删除依赖未完整读取: ${view.tableName}`)}
  }
  private read(view: DataView, row: DataRow, field: string): unknown {
    if (view.fieldAccess(row, field).read !== 'visible') throw new Error(`Excel删除引用不可读: ${field}`)
    return row[field]
  }
  private inspect(): [string[],string[],string[]] {
    const [nodes, fields, rules] = this.#views, target = nodes.rows.filter(row => this.read(nodes, row, 'rowid') === this.input.nodeId),targetRow=target[0]
    if (target.length !== 1 || !targetRow || this.read(nodes, targetRow, 'schemeid') !== this.input.schemeId) throw new Error('删除配置不存在或归属异常')
    for (const row of nodes.rows) {
      if (this.read(nodes, row, 'pid') === this.input.nodeId) throw new Error(this.read(nodes, row, 'schemeid') === this.input.schemeId ? '当前配置存在子级，不能删除' : '存在跨方案子配置引用，不能删除')
      if (this.read(nodes, row, 'schemeid') !== this.input.schemeId) throw new Error('删除返回范围外配置')
    }
    let parent=this.read(nodes,targetRow,'pid')
    const visited=new Set<string>()
    while(parent!==this.input.schemeId){
      if(typeof parent!=='string'||!parent||visited.has(parent)||visited.size>=64)throw new Error('删除配置祖先链无法核定')
      visited.add(parent)
      const ancestors=nodes.rows.filter(row=>this.read(nodes,row,'rowid')===parent),ancestor=ancestors[0]
      if(ancestors.length!==1||!ancestor)throw new Error('删除配置祖先身份不唯一或缺失')
      parent=this.read(nodes,ancestor,'pid')
      const raw = this.read(nodes, ancestor, 'sheet_layout_json')
      if (!hasExcelLayoutReferences(raw)) continue
      if (typeof raw !== 'string') throw new Error('祖先配置布局引用无法核定')
      const layout = parseJsonDocument(raw)
      if (!isJsonObject(layout)||layout['version']!==3||!Array.isArray(layout['tables']))throw new Error('祖先配置布局引用合同无法核定')
      const tables=layout['tables'],route=this.read(nodes,targetRow,'table')
      if(typeof route!=='string'||!route||tables.some(table=>!isJsonObject(table)||typeof table['table']!=='string'||!table['table']))throw new Error('祖先配置布局物理来源无法核定')
      if(tables.some(table=>isJsonObject(table)&&excelLayoutTableKey(table['table'])===excelLayoutTableKey(route)))throw new Error('祖先配置布局仍声明引用本配置物理来源，不能删除')
    }
    const ids:[string[],string[],string[]] = [[this.input.nodeId], fields.rows.map(row => {
      if (this.read(fields, row, 'configid') !== this.input.nodeId) throw new Error('待删字段归属异常')
      return String(this.read(fields, row, 'rowid'))
    }), rules.rows.map(row => {
      if (this.read(rules, row, 'config_id') !== this.input.nodeId || this.read(rules, row, 'scheme_id') !== this.input.schemeId) throw new Error('待删规则归属异常')
      return String(this.read(rules, row, 'id'))
    })]
    this.#views.forEach((view, index) => {
      const selected=ids[index];if(!selected)throw new Error('删除范围缺失')
      if (new Set(selected).size !== selected.length || selected.some(id => !id || id === 'undefined' || id === 'null')) throw new Error('待删身份不唯一或缺失')
      for (const id of selected) {const found = view.rows.find(candidate => String(view.getPkKey(candidate)) === id); if (!found || view.deleteActionState(found) !== 'enabled') throw new Error('当前正式查询不允许删除配置依赖')}
    })
    return ids
  }
  private proof(): string {return JSON.stringify(this.#views.map(view => [...view.readSnapshot().rows].sort((a, b) => String(view.getPkKey(a)).localeCompare(String(view.getPkKey(b))))))}
  private release(): void {for (const view of this.#views) view.dataTable?.destroyView(view.viewId)}
  private selections(): Array<{view:DataView;ids:string[]}> {return this.#views.map((view,index)=>{const ids=this.#ids[index];if(!ids)throw new Error('原删除范围缺失');return{view,ids}})}
  /** 已读取的精确删除数量与原批次状态，不包含记录值。 */
  getState() {return {busy: this.#busy, done: this.#done, databaseConfirmed: this.#databaseConfirmed,
    acceptedCurrent: this.#acceptedCurrent, canAcceptCurrent: !this.#busy && !this.#done && (this.#capture?.receiptInvalid === true || this.#acceptedCurrent) && this.#views.every(view => !view.hasUnconfirmedSave),
    canCancel: !this.#busy && !this.#databaseConfirmed && (!this.#capture || this.#capture.resolution === 'not-applied'), fields: this.#ids[1].length, rules: this.#ids[2].length}}
  /** 原删除确认；已有捕获时只核验，数据库已确认后只回读及刷新。 */
  async save(): Promise<void> {
    if (this.#done) return
    this.guard(); if (this.#busy) throw new Error('Excel删除正在处理'); this.#busy = true
    try {
      if (!this.#databaseConfirmed) {
        if (this.#capture) {
          const outcome = await verifyDataSpaceDefinitionCapture(this.input.dataSet, this.#capture)
          if (outcome === 'not-applied') throw new Error('原删除已确认未生效，请取消后重新打开删除')
          if (outcome === 'accepted-current') throw new Error('采用当前结果不能证明删除成功')
          this.#databaseConfirmed = true
        } else {
          await DataSpaceDefinitionSave.run([{dataSet: this.input.dataSet, targetId: this.#scenarioId, modelId: this.#modelId,
            prepare: async () => {if(this.#staged)throw new Error('本地删除已暂存，请取消后重新打开'); await this.load(); this.inspect(); if(this.proof()!==this.#baseline)throw new Error('删除预览后配置或依赖已变化')},
            apply: async () => {this.#staged=true; for(const {view,ids} of this.selections())for(const id of ids){this.guard();this.clean();const removed=await view.removeRow(id);if(removed!==true)throw new Error('删除未完整暂存')}},
            check: () => {this.guard();this.clean()}, targets: () => this.selections().flatMap(({view,ids})=>ids.length?[{tableName:view.tableName,viewId:view.viewId,ids}]:[]),
            dispatched: capture => {this.#capture=capture}, confirm: () => {this.#databaseConfirmed=true;return Promise.resolve()}, failed: () => {},
          }])
        }
      }
      this.guard(false); this.clean(true)
      for(const view of this.#views){await view.refresh();this.guard(false);if(view.loadingError||view.rows.length!==view.total||!view.countReported)throw new Error('删除后依赖未完整回读')}
      if(this.#views[0].rows.some(row=>row['rowid']===this.input.nodeId||row['pid']===this.input.nodeId)||this.#views[1].rows.length>0||this.#views[2].rows.length>0)throw new Error('删除后仍有配置或关联记录，保留原核验入口')
      for(const view of this.#originals){this.clean(true);await view.refresh();this.guard(false);this.clean(true);if(view.loadingError)throw view.loadingError}
      this.#done=true;this.release()
    } finally {this.#busy=false}
  }
  /** 只取消未派发或已确认未生效的原删除；不修改原页面记录。 */
  cancel(): void {
    this.guard()
    if(!this.getState().canCancel)throw new Error('原删除尚未确认，不能取消')
    this.#views.forEach((view,index)=>view.discardPendingChanges(this.#ids[index]));this.#done=true;this.release()
  }
  /** 显式采用回执无效批次的当前正式结果并刷新原页面；不认定原删除成功，不重放删除。 */
  async acceptCurrent(): Promise<void> {
    this.guard(false)
    if (!this.getState().canAcceptCurrent || !this.#capture) throw new Error('原删除不能采用当前结果')
    this.#busy = true
    try {
      const outcome = await verifyDataSpaceDefinitionCapture(this.input.dataSet, this.#capture, true)
      if (outcome !== 'accepted-current') throw new Error('未取得明确采用的正式结果')
      this.#acceptedCurrent = true
      for (const view of this.#originals) {this.clean(true); await view.refresh(); this.guard(false); this.clean(true); if (view.loadingError) throw view.loadingError}
      this.#done = true; this.release()
    } finally {this.#busy = false}
  }
}
