/**
 * @module app:views/features/data-platform/data-set-management/design/workbench/data-space-workbench
 * 职责：将已授权的空间定义投影为工作台概览，供标准字段绑定。
 * 边界：仅包含派生摘要；原模型和字段仍由正式元数据视图持有，不提交此视图。
 * AI用途：恢复参考设计器的主业务模型、模型数量、关系数量和来源摘要。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {RGraphProps} from '@spark-appworks/spark-component'

/** 数据空间设计的只读工作台投影，生命周期随元数据DataSet结束。 */
export class DataSpaceWorkbench {
  /** 参考页来源显示语义；画布与概览共用，不修改正式模型Type或资源适配合同。 */
  static readonly sourcePresentation: NonNullable<RGraphProps['nodeCaptionOptions']> = [
    ...['table', '表', '数据库表'].map(value => ({value, label: '数据库表', tone: 'primary' as const})),
    ...['databaseView', '数据库视图'].map(value => ({value, label: '数据库视图', tone: 'info' as const})),
    ...['interface', '接口'].map(value => ({value, label: '接口', tone: 'success' as const})),
    ...['logicView', '逻辑视图', '视图'].map(value => ({value, label: '视图', tone: 'success' as const})),
    ...['dict', '字典'].map(value => ({value, label: '字典', tone: 'warning' as const})),
    ...['json', 'JSON'].map(value => ({value, label: 'JSON', tone: 'warning' as const})),
    ...['file', '文件'].map(value => ({value, label: '文件', tone: 'info' as const})),
    {value: '数组', label: '数组', tone: 'info'},
  ]
  /** 标准组件绑定此命名视图，禁止当成正式配置保存。 */
  readonly view: DataView

  /** 在当前元数据空间创建独立摘要视图，目标ID只用于核对正式查询范围。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string) {
    const table = dataSet.addTable(`DesignWorkbench_${crypto.randomUUID().replaceAll('-', '')}`,
      ['id', 'title', 'subtitle', 'mainModels', 'mainNote', 'mainCount', 'modelCount', 'relationCount', 'parameterCount', 'sourceSummary',
        ...[0, 1, 2, 3].flatMap(index => [`type${index}`, `typeCount${index}`])].map(name => ({name, type: 'string', isPrimaryKey: name === 'id'})))
    table.resourceType = 'static-data'; this.view = table.getOrCreateView('default')
  }

  /** 从已加载的命名视图定位未归属字段；保留原视图权限，不补查全目录或复制记录。 */
  unplacedNamedFields(): ReadonlyArray<{view: DataView; recordIndex: number}> {
    const models = this.dataSet.getView('Base_DataModel', 'default'), fields = this.dataSet.getView('Base_DataModel_Field', 'default')
    if (this.dataSet.destroyed || !models || !fields || models.requestState !== RequestState.Loaded
      || models.queryContext['dataSpaceId'] !== this.targetId) return []
    const modelIds = new Set(models.rows.filter(row => models.fieldAccess(row, 'rowid').read === 'visible').map(row => row['rowid']))
    const seen = new Set(fields.rows.map(row => fields.getPkKey(row)))
    return Object.values(fields.dataTable?.views ?? {}).flatMap(view => {
      if (view === fields || view.destroyed || view.requestState !== RequestState.Loaded || view.mutating
        || view.queryContext['dataSpaceId'] !== this.targetId || view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field') return []
      return view.rows.flatMap((row, recordIndex) => {
        const key = view.getPkKey(row)
        if (view.fieldAccess(row, 'dataSetId').read !== 'visible' || row['dataSetId'] !== this.targetId || key !== undefined && seen.has(key)
          || view.fieldAccess(row, 'dataModelId').read === 'visible' && modelIds.has(row['dataModelId'])) return []
        if (key !== undefined) seen.add(key)
        return [{view, recordIndex}]
      })
    })
  }

  /** 仅从完整的当前查询刷新；隐藏字段不参与分组或主业务判定，不读取编辑覆盖。 */
  refresh(): void {
    const models = this.dataSet.getView('Base_DataModel', 'default'), spaces = this.dataSet.getView('Base_DataSet', 'default')
    if (this.dataSet.destroyed || !models || !spaces || models.queryContext['dataSpaceId'] !== this.targetId
      || spaces.queryContext['dataSpaceId'] !== this.targetId) {
      if (!this.view.destroyed && this.view.rows.length) this.view.replaceRows([])
      throw new Error('概览目标空间或查询已变化')
    }
    if ([models, spaces].some(view => view.requestState !== RequestState.Loaded || view.rows.length !== view.total)) {
      if (this.view.rows.length) this.view.replaceRows([])
      return
    }
    const visible = (view: DataView, row: Record<string, unknown>, field: string) => view.fieldAccess(row, field).read === 'visible'
    const mainFlagsVisible = models.rows.every(row => visible(models, row, 'IsBusinessMain'))
    const mains = mainFlagsVisible ? models.rows.filter(row => row['IsBusinessMain'] === 1 || row['IsBusinessMain'] === '1' || row['IsBusinessMain'] === true) : []
    const types = new Map<string, number>()
    for (const row of models.rows) {
      const rawType = visible(models, row, 'Type') ? String(row['Type'] ?? '') : undefined
      const name = rawType === undefined ? '未公开来源'
        : DataSpaceWorkbench.sourcePresentation.find(option => option.value === rawType)?.label ?? (rawType || '未设置来源')
      types.set(name, (types.get(name) ?? 0) + 1)
    }
    const files = this.dataSet.getView('DataTableBindingDefinition', 'fileModels')
    const fileCount = files && !files.destroyed && files.requestState === RequestState.Loaded
      && files.dataTable?.resourceType === 'file' && files.dataTable.resourceId === 'pagedata:tables'
      && files.queryContext['dataSpaceId'] === this.targetId && files.queryContext['definitionProjection'] === 'fileModels'
      && files.rows.every(row => row['dataSetId'] === this.targetId && ['dataSetId', 'tableName'].every(field => visible(files, row, field)))
      ? files.total : undefined
    if (fileCount) types.set('文件资源', fileCount)
    const modelCount = fileCount === undefined ? undefined : models.total + fileCount
    const relations = this.dataSet.getView('DataResourceRelationDefinition', 'graph')
    const relationCount = relations && !relations.destroyed && relations.requestState === RequestState.Loaded
      && relations.dataTable?.resourceType === 'file' && relations.dataTable.resourceId === 'pagedata:resourceRelations'
      && relations.queryContext['dataSpaceId'] === this.targetId && relations.queryContext['definitionProjection'] === 'endpoints'
      ? relations.total : undefined
    const space = spaces.rows.find(row => row['rowid'] === this.targetId)
    let parameterCount: number | string = '—'
    if (space && visible(spaces, space, 'inputParams')) {
      try {parameterCount = DataSpaceDesignApi.readInputParameters({value: space['inputParams']}).length} catch {parameterCount = '配置待核查'}
    }
    const caption = (field: string) => space && visible(spaces, space, field) ? String(space[field] ?? '') : ''
    const orderedTypes = [...types].sort((a, b) => b[1] - a[1])
    const summary: Record<string, string> = {id: 'summary', title: caption('Name') || '数据空间设计',
      subtitle: caption('description') || (modelCount === undefined ? '数据模型目录尚未完整确认，已读取的定义仍可查看。'
        : modelCount ? `当前已接入 ${modelCount} 个数据模型，可继续在画布中编排关系。` : '围绕数据模型、关系与输入参数组织数据空间，逐步搭出清晰的查询结构。'),
      mainNote: !mainFlagsVisible ? '数据权限未公开全部标记' : mains.length ? `当前已标记 ${mains.length} 张主业务表` : '可在节点设置中标记主业务表', mainModels: mainFlagsVisible
      ? mains.map(row => visible(models, row, 'Name') ? String(row['Name'] ?? '') || '未命名' : '名称未公开').join('、') || '未设置'
      : '主业务标记未完整公开', mainCount: mainFlagsVisible ? String(mains.length) : '—', modelCount: String(modelCount ?? '—'),
      relationCount: String(relationCount ?? '—'), parameterCount: String(parameterCount),
      sourceSummary: [...orderedTypes.map(([type, count]) => `${type} ${count}`), ...fileCount === undefined ? ['文件资源待确认'] : []].join(' · ') || '尚未接入来源'}
    for (const index of [0, 1, 2, 3]) {
      summary[`type${index}`] = orderedTypes[index]?.[0] ?? ''
      summary[`typeCount${index}`] = String(orderedTypes[index]?.[1] ?? 0)
    }
    // DataView adds its own row metadata; compare only the declared projection values.
    if (Object.entries(summary).every(([key, value]) => this.view.rows[0]?.[key] === value)) return
    this.view.replaceRows([summary]); this.view.setCurrentRowById('summary')
  }
}
