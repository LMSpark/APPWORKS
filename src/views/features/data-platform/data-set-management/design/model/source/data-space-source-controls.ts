/**
 * @module app:views/features/data-platform/data-set-management/design/model/source/data-space-source-controls
 * 职责：配置来源筛选到正式候选视图的多父值级联，以及迁移选择的绑定。
 * 边界：候选查询由DataView执行；原owner负责精确预览、差异和保存，不复制候选结果。
 * AI用途：来源组件的绑定、候选级联及生命周期释放。
 */
import {RequestState, buildDataViewKey, type DataColumn, type DataRow, type DataSet, type DataTable, type DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceSourceCatalog} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
type PageDataSpaceModelSourceType = Parameters<typeof LowcodeDataSpaceSourceCatalog.config>[0]
import type {LowcodeDataSpaceModelCreate} from '@/lowcode/data-space/model-source/lowcode-data-space-model-create'
import type {LowcodeDataSpaceModelSourceEdit} from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-edit'

/** 原操作owner提供的展示状态。 */
type SourceState = ReturnType<LowcodeDataSpaceModelCreate['getState'] | LowcodeDataSpaceModelSourceEdit['getState']>
/** 组件输入事件；不携带正式权限或保存指令。 */
type ControlChange = {
  /** 搜索输入、首次注册名、已有字段映射或新增输出选择。 */
  kind: 'search' | 'result' | 'name' | 'mapping' | 'addition' | 'removal' | 'parameter' | 'contract'
  /** 搜索行标识、原字段记录ID或新增来源字段名。 */
  id: string
  /** 原生绑定值；搜索事件不携带值，由搜索视图统一读取。 */
  value: unknown
}
/** 一条映射或新增选择的局部绑定资源。 */
type Choice = {table: DataTable; view: DataView; options?: DataTable; signature: string}

/** 同一元数据DataSet内的临时组件视图，不进入场景配置或正式提交。 */
export class DataSpaceSourceControls {
  /** 来源类型、名称、说明和库名筛选的唯一输入视图。 */
  readonly search: DataView
  /** 首次创建的注册名输入，候选及校验仍由ModelCreate持有。 */
  readonly registration: DataView
  readonly #candidates = new Map<PageDataSpaceModelSourceType, DataView>()
  /** 原owner精确预览提供的字段展示投影。 */
  readonly fields: DataView
  /** 来源替换的字段差异，仅作原owner结果展示。 */
  readonly differences: DataView
  /** 来源替换的模型引用改动，仅作原owner结果展示。 */
  readonly modelChanges: DataView
  /** 同一来源合同所需的命名视图投影变更，仅展示已核验的迁移计划。 */
  readonly viewChanges: DataView
  /** 已保存空间参数的候选投影；标准值函数字段按完整视图键读取。 */
  readonly inputParameters: DataView
  readonly #prefix = `ModelSourceControls_${crypto.randomUUID().replaceAll('-', '')}`
  readonly #tables: DataTable[] = []
  readonly #choices = new Map<string, Choice>()
  #syncing = false
  #active = true
  #sequence = 0
  #signature = ''

  /** 建立输入视图，所有外部副作用由调用方原owner处理。 */
  constructor(private readonly dataSet: DataSet, private readonly changed: (change: ControlChange) => void) {
    this.search = this.table('search', ['id', 'type', 'keyword', 'description', 'databaseName', 'open']).getOrCreateView('default')
    this.search.commitMode = 'staged'
    this.search.replaceRows([{id: 'search', type: 'table', keyword: '', description: '', databaseName: '', open: false}])
    this.search.setCurrentRowById('search')
    this.search.events.on('editingFieldChanged', ({field}) => {
      if (field === 'open' || !this.#active || this.#syncing) return
      if (field === 'type') this.resetSearch()
      this.changed({kind: 'search', id: 'search', value: undefined})
    })
    this.registration = this.table('registration', ['id', 'name']).getOrCreateView('default')
    this.registration.commitMode = 'staged'
    this.registration.events.on('editingFieldChanged', ({nextValue}) => {
      if (this.#active && !this.#syncing) this.changed({kind: 'name', id: 'registration', value: nextValue})
    })
    try {
      for (const {value: type} of LowcodeDataSpaceSourceCatalog.types) {
        const spec = LowcodeDataSpaceSourceCatalog.config(type)
        const original = dataSet.getView(spec.metaName, 'sourceCandidates')
        if (!original || original.dataTable?.modelBinding?.modelName !== spec.metaName) throw new Error(`来源目录缺少正式候选视图：${spec.metaName}`)
        const view = original.createQueryView(this.#prefix)
        view.configure({...view.toJson(), autoCurrentFirst: false, autoSelectFirst: false, selectionDelimiter: '', valueField: 'rowid', labelField: spec.name})
        this.#candidates.set(type, view)
        dataSet.addCascade({kind: 'query', cascadeId: `${this.#prefix}_${type}`,
          parentTable: this.search.tableName, parentViewId: this.search.viewId, childTable: view.tableName, childViewId: view.viewId,
          when: [{field: 'open', equals: true}, {field: 'type', equals: type}],
          filterBindings: [['keyword', spec.name], ['description', spec.description], ['databaseName', spec.databaseName]]
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            .map(([sourceField, targetField]) => ({sourceField, targetField, operator: 'contains', omitEmpty: true}))})
        for (const event of ['selectedRowsChanged', 'rowsChanged', 'requestStateChanged'] as const) {
          view.events.on(event, () => {if (this.#active) this.changed({kind: 'result', id: type, value: undefined})})
        }
      }
    } catch (error) {this.dispose(); throw error}
    this.fields = this.table('fields', ['id', 'Name', 'description', 'FieldType', 'purpose', 'primary', 'output']).getOrCreateView('default')
    this.differences = this.table('differences', ['id', 'name', 'result']).getOrCreateView('default')
    this.modelChanges = this.table('modelChanges', ['id', 'property', 'before', 'after']).getOrCreateView('default')
    this.viewChanges = this.table('viewChanges', ['id', 'tableName', 'viewId', 'fieldId', 'before', 'after']).getOrCreateView('default')
    this.inputParameters = this.table('inputParameters', ['id', 'value', 'label']).getOrCreateView('default')
    this.inputParameters.configure({valueField: 'value', labelField: 'label'})
    for (const view of [this.fields, this.differences, this.modelChanges, this.viewChanges]) view.configure({selectionDelimiter: ''})
  }

  private table(suffix: string, names: string[]): DataTable {
    const columns: DataColumn[] = names.map(name => ({name, type: ['included', 'open', 'removed', 'accepted'].includes(name) ? 'boolean' : 'string', isPrimaryKey: name === 'id'}))
    const table = this.dataSet.addTable(`${this.#prefix}_${suffix}`, columns)
    table.resourceType = 'static-data'; this.#tables.push(table)
    return table
  }

  /** 当前类型只定位所属正式模型的独立候选视图。 */
  get results(): DataView {
    const view = this.#candidates.get(this.read('type') as PageDataSpaceModelSourceType)
    if (!view) throw new Error('请选择有效来源类型')
    return view
  }
  /** 当前类型的字段映射只供标准子组件绑定。 */
  get specification() {return LowcodeDataSpaceSourceCatalog.config(this.read('type') as PageDataSpaceModelSourceType)}
  /** 弹窗开关也是父输入，关闭使查询和旧选择失效。 */
  setOpen(value: boolean): void {
    if (value) this.resetSearch()
    this.search.updateEditingValue('search', 'open', value)
  }

  private resetSearch(): void {
    this.#syncing = true
    try {
      for (const field of ['keyword', 'description', 'databaseName']) this.search.updateEditingValue('search', field, '')
    } finally {this.#syncing = false}
  }
  /** 消费列表选择值，随后仍由业务owner精确读取。 */
  selected() {return LowcodeDataSpaceSourceCatalog.selected(this.read('type') as PageDataSpaceModelSourceType, this.results)}
  /** 只有本次查询存在唯一可读选择值才可确认。 */
  get canSelect(): boolean {
    if (this.results.requestState !== RequestState.Loaded) return false
    try {return this.results.getSelectedValues().length === 1} catch {return false}
  }

  /** 读取搜索输入；空值只在调用正式查询时按原合同处理。 */
  read(field: string): string {
    const value = this.search.getEditingRow('search')?.[field]
    return typeof value === 'string' ? value : ''
  }

  /** 组件只通过同一元数据空间的完整命名视图键消费这些局部输入/展示视图。 */
  key(view: DataView): string {
    if (!this.dataSet.scenarioId || view.dataSet !== this.dataSet) throw new Error('来源视图不属于当前元数据空间')
    return buildDataViewKey(view.tableName, view.viewId, this.dataSet.scenarioId)
  }

  /** 按稳定的操作身份定位已有选择视图，不在渲染时新建资源。 */
  choice(kind: 'mapping' | 'addition' | 'removal' | 'parameter' | 'contract', id: string): DataView {
    const view = this.#choices.get(JSON.stringify([kind, id]))?.view
    if (!view) throw new Error('来源选择视图尚未就绪')
    return view
  }

  private syncChoice(input: {kind: 'mapping' | 'addition' | 'removal' | 'parameter' | 'contract'; id: string; row: DataRow; candidates?: readonly string[]}): void {
    const key = JSON.stringify([input.kind, input.id])
    let choice = this.#choices.get(key)
    if (!choice) {
      const table = this.table(`choice_${++this.#sequence}`, ['id', 'sourceId', 'fieldId', 'sourceName', 'included', 'removed', 'accepted', 'ValueFun'])
      const view = table.getOrCreateView('default'); view.commitMode = 'staged'
      choice = {table, view, signature: ''}; this.#choices.set(key, choice)
      view.events.on('editingFieldChanged', ({nextValue}) => {
        if (this.#active && !this.#syncing) this.changed({kind: input.kind, id: input.id, value: nextValue})
      })
      if (input.kind === 'mapping') {
        const options = this.table(`options_${this.#sequence}`, ['id', 'sourceId', 'fieldId', 'name'])
        choice.options = options
        options.getOrCreateView('default').configure({valueField: 'name', labelField: 'name', queryContext: {sourceId: '', fieldId: ''},
          filterExpression: {logic: 'and', filters: ['sourceId', 'fieldId'].map(field =>
            ({field, operator: 'eq', value: {Type: 'GetInputParam', ParamName: field}}))}})
        this.dataSet.addCascade({kind: 'field', cascadeId: options.tableName, tableName: table.tableName, viewId: 'default', targetField: 'sourceName',
          valueFormat: 'native', valuePolicy: {mode: 'retain'}, parents: ['sourceId', 'fieldId'].map(field =>
            ({tableName: table.tableName, viewId: 'default', field, parameter: field})), optionsView: {tableName: options.tableName, viewId: 'default'}})
      }
    }
    const signature = JSON.stringify([input.row, input.candidates])
    if (choice.signature === signature && !choice.view.hasEditingChanges()) return
    choice.signature = signature
    choice.view.discardEditingRows(); choice.view.replaceRows([input.row]); choice.view.setCurrentRowById(input.id)
    if (choice.options) {
      choice.options.rows = (input.candidates ?? []).map(name => ({id: name, name, sourceId: input.row['sourceId'], fieldId: input.id}))
      const options = choice.options.getOrCreateView('default')
      options.replaceRows([]); options.configure({queryContext: {sourceId: '', fieldId: ''}})
    }
  }

  /** 仅投影原owner接受的精确预览；正式来源候选直接由查询视图持有。 */
  sync(state: SourceState | null, force = false): void {
    if (!this.#active || this.dataSet.destroyed) return
    const signature = JSON.stringify(state?.preview)
    if (!force && this.#signature === signature) return
    // Publish the signature before rowsChanged can invalidate the parent revision.
    // Owner state is cloned on read; reference equality would keep this cycle alive.
    this.#signature = signature
    this.#syncing = true
    try {
      const preview = state?.preview
      this.registration.discardEditingRows()
      this.registration.replaceRows(preview ? [{id: 'registration', name: preview.name}] : [])
      this.registration.setCurrentRowById(preview ? 'registration' : null)
      this.fields.replaceRows((preview?.prepared.fields ?? []).map((field, index) => ({id: String(index), Name: field.Name,
        description: field.description, FieldType: field.FieldType, purpose: field.type === 'inputParams' ? '来源入参' : '数据字段',
        primary: field.IsPKey === 1 ? '是' : '否', output: field.IsOutput === 1 ? '是' : '否'})))
      const replacement = preview && 'differences' in preview ? preview : null
      this.inputParameters.replaceRows((replacement?.inputParams ?? []).map(item => ({id: item.value, ...item})))
      this.differences.replaceRows((replacement?.differences ?? []).map((item, index) => ({id: String(index), ...item})))
      this.modelChanges.replaceRows((replacement?.modelChanges ?? []).map(item => ({id: item.property,
        property: item.property === 'parentField' ? '父字段' : '主键字段', before: item.before, after: item.after})))
      this.viewChanges.replaceRows((replacement?.viewChanges ?? []).map(item => ({id: JSON.stringify([item.tableName, item.viewId, item.fieldId]), ...item})))
      const active = new Set<string>(), sourceId = preview ? JSON.stringify([preview.prepared.source.type, preview.prepared.source.id]) : ''
      if (preview && 'fieldChoices' in preview && preview.operation === 'replace') {
        for (const field of preview.fieldChoices) {
          active.add(JSON.stringify(['mapping', field.id]))
          this.syncChoice({kind: 'mapping', id: field.id, row: {id: field.id, sourceId, fieldId: field.id, sourceName: field.sourceName}, candidates: field.candidates})
        }
        for (const field of preview.additions) {
          active.add(JSON.stringify(['addition', field.sourceName]))
          this.syncChoice({kind: 'addition', id: field.sourceName, row: {id: field.sourceName, sourceId, included: field.included}})
        }
        for (const field of preview.removalChoices) {
          active.add(JSON.stringify(['removal', field.id]))
          this.syncChoice({kind: 'removal', id: field.id, row: {id: field.id, sourceId, removed: field.removed}})
        }
      }
      for (const change of replacement?.contractChanges ?? []) {
        active.add(JSON.stringify(['contract', change.id]))
        this.syncChoice({kind: 'contract', id: change.id, row: {id: change.id, sourceId, accepted: change.accepted}})
      }
      for (const input of replacement?.inputChoices ?? []) {
        active.add(JSON.stringify(['parameter', input.sourceName]))
        this.syncChoice({kind: 'parameter', id: input.sourceName, row: {id: input.sourceName, sourceId, ValueFun: input.value}})
      }
      for (const [key, choice] of this.#choices) if (!active.has(key)) {
        this.releaseChoice(choice); this.#choices.delete(key)
      }
    } finally {this.#syncing = false}
  }

  private releaseChoice(choice: Choice): void {
    for (const table of [choice.options, choice.table]) if (table) {
      if (table === choice.options) this.dataSet.removeCascade({cascadeId: table.tableName})
      this.dataSet.removeTable(table.tableName)
      this.#tables.splice(this.#tables.indexOf(table), 1)
    }
  }

  /** 卸载释放本实例输入、候选命名视图和级联，保留正式模型及原视图。 */
  dispose(): void {
    this.#active = false
    if (!this.dataSet.destroyed) {
      for (const [type, view] of this.#candidates) {
        const cascadeId = `${this.#prefix}_${type}`
        if (this.dataSet.viewCascades?.some(cascade => cascade.cascadeId === cascadeId)) this.dataSet.removeCascade({cascadeId})
        view.dataTable?.destroyView(view.viewId)
      }
      for (const choice of this.#choices.values()) this.releaseChoice(choice)
      for (const table of this.#tables) this.dataSet.removeTable(table.tableName)
    }
    this.#candidates.clear(); this.#choices.clear(); this.#tables.length = 0
  }
}
