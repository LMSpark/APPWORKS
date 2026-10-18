import type {DataSet, DataTable, DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceViewFields, type LowcodeDataSpaceViewFieldCatalog} from './lowcode-data-space-view-fields'

/** 定义视图及字段候选的业务接线；变更状态只由原DataView持有。 */
export class LowcodeDataSpaceViewMetadata {
  static readonly tableName = 'DataViewDefinition'
  readonly #view: DataView
  readonly #bindings: DataView
  readonly #fieldOptions: DataTable

  /** 使用所属元数据DataSet的文件定义视图，并接入可重建的字段候选。 */
  constructor(private readonly dataSet: DataSet) {
    const view = dataSet.getView(LowcodeDataSpaceViewMetadata.tableName, 'default')
    const bindings = dataSet.getView('DataTableBindingDefinition', 'default')
    if (!view || view.dataTable?.resourceType !== 'file' || !bindings || bindings.dataTable?.resourceType !== 'file') {
      throw new Error('DATA_SPACE_VIEW_METADATA_VIEW: 正式配置缺少文件定义视图或模型绑定视图')
    }
    this.#view = view; this.#bindings = bindings
    view.commitMode = 'staged'; bindings.commitMode = 'staged'
    this.#fieldOptions = dataSet.addTable('DataViewFieldOption', [
      ...['tableName', 'viewId', 'name'].map(name => ({name, type: 'string', isPrimaryKey: true})),
      {name: 'label', type: 'string'},
      {name: 'writableTarget', type: 'boolean'},
    ])
    this.#fieldOptions.resourceType = 'static-data'
    this.#fieldOptions.getOrCreateView('default').configure({valueField: 'name', labelField: 'label',
      queryContext: {tableName: '', viewId: ''}, filterExpression: {logic: 'and', filters: ['tableName', 'viewId'].map(field =>
        ({field, operator: 'eq', value: {Type: 'GetInputParam', ParamName: field}}))}})
    for (const targetField of ['labelField', 'valueField']) dataSet.addCascade({kind: 'field',
      cascadeId: `view-definition-${targetField}`, tableName: LowcodeDataSpaceViewMetadata.tableName, viewId: 'default',
      targetField, valueFormat: 'native', valuePolicy: {mode: 'retain'},
      parents: ['tableName', 'viewId'].map(field => ({tableName: LowcodeDataSpaceViewMetadata.tableName,
        viewId: 'default', field, parameter: field})),
      optionsView: {tableName: this.#fieldOptions.tableName, viewId: 'default'}})
  }

  /** Rebuild disposable candidates from the native definition; never persist them as target model data. */
  setFieldOptions(definition: DataSet | null): void {
    this.#fieldOptions.rows = definition ? Object.values(definition.tables).flatMap(table => table.viewList.flatMap(view =>
      LowcodeDataSpaceViewFields.selectionColumns(view).map(column => ({tableName: table.tableName, viewId: view.viewId,
        name: column.name, label: column.label ?? column.name,
        writableTarget: !view.effectivePkFields.includes(column.name) && column.computeExpression === undefined && !column.name.startsWith('lingma_sys_')})))) : []
    const view = this.#fieldOptions.getOrCreateView('default')
    view.replaceRows([])
    view.configure({queryContext: {tableName: '', viewId: ''}})
  }

  /**
   * 刷新所选视图的临时字段候选及已注册的字段级联，不修改其他视图定义或编辑。
   * @param tableName 当前配置中的模型表键。
   * @param viewId 所属模型的命名视图。
   * @param catalog 原生视图投影的字段和实际主键；主键及计算字段不可作为写入目标。
   */
  async setViewFieldOptions(tableName: string, viewId: string, catalog: LowcodeDataSpaceViewFieldCatalog): Promise<void> {
    this.#fieldOptions.rows = [...this.#fieldOptions.rows.filter(row => row['tableName'] !== tableName || row['viewId'] !== viewId),
      ...catalog.selectionColumns.filter(column => column.name !== '_pk' && !column.name.startsWith('lingma_sys_')).map(column => ({tableName, viewId, name: column.name, label: column.label ?? column.name,
        writableTarget: !catalog.primaryKeys.includes(column.name) && column.isPrimaryKey !== true && column.computeExpression === undefined}))]
    const view = this.#fieldOptions.getOrCreateView('default')
    view.replaceRows([])
    view.configure({queryContext: {tableName: '', viewId: ''}})
    // 字段级联拥有独立查询实例；刷新注册的级联，不能只刷新选项模板视图。
    await Promise.all((this.dataSet.viewCascades ?? []).flatMap(cascade => cascade.kind === 'field'
      && cascade.optionsView.tableName === this.#fieldOptions.tableName
      ? [this.dataSet.refreshFieldCascade({tableName: cascade.tableName, viewId: cascade.viewId, field: cascade.targetField})] : []))
  }

  assertClean(): void { this.#view.assertResultReplacementAllowed(); this.#bindings.assertResultReplacementAllowed() }
  /** 绑定删除命令允许继续合并绑定变更，但不能覆盖视图属性编辑。 */
  assertViewsClean(): void {this.#view.assertResultReplacementAllowed()}

  async reset(): Promise<void> {
    for (const view of [this.#view, this.#bindings]) {
      await view.refresh()
      if (view.loadingError) throw view.loadingError
    }
  }
}
