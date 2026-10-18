/**
 * @module app:views/features/data-platform/data-set-management/design/graph/data-space-layout-edit
 * 职责：通过正式布局资源DataView编辑画布布局，由同一DataSet提交变更。
 * 边界：节点/连线视图只读投影；唯一编辑态在DataSpaceLayoutDefinition，文件IO由存储适配承接。
 * AI用途：模型拖动、取消、保存与冲突恢复，不要求表/视图绑定，不写数据库或旧图文件。
 */
import {RequestState, type DataView, type DataSetMetadata} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {GraphLayout} from '@spark-appworks/spark-component'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceViewLayout} from '@/lowcode/data-space/view-design/lowcode-data-space-view-layout'
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 原会话公开的场景文件快照，布局不另持有持久owner。 */
type FileState = Omit<NonNullable<LowcodeDataSpaceDesignSession['viewState']>, 'text'> & {text: string | null}
/** 用户拖动一个正式模型后的画布中心坐标。 */
type DataSpaceLayoutPosition = Readonly<{
  /** 当前节点DataView中的模型主键。 */
  id: string | number
  /** 画布中心横坐标，须为有限数值。 */
  x: number
  /** 画布中心纵坐标，须为有限数值。 */
  y: number
}>
type RebuildPreview = Readonly<{
  positions: Readonly<Record<string, Readonly<{x: number; y: number}>>>
  modelCount: number
  relationCount: number
}>
type RebuildEdge = {rowid: string; source: string; target: string}
type RebuildState = {preview: RebuildPreview; fingerprint: string; file: FileState}

/** 布局是场景文件配置，模型DataView只提供当前可读身份，不以模型写权限代替文件保存合同。 */
export class DataSpaceLayoutEdit {
  static #sequence = 0
  readonly #view: DataView
  /** 未配置节点的本次局部视图；标题与坐标属于布局，不是正式模型记录。 */
  readonly nodes: DataView
  /** 未配置连线的布局视图；source/target为节点身份，parentTable/childTable只作画布映射键。 */
  readonly edges: DataView
  /** 重建预览的只读关系投影；不参与关系配置或布局保存。 */
  readonly rebuildEdges: DataView
  #rebuild: RebuildState | undefined
  #baseline: FileState | null = null
  #signature = ''
  #modelSignature = ''
  #ownedText: string | null = null
  #projectionSignature = ''
  #messages: string[] = []
  #referenceText: string | null | undefined
  #referencePositions: Record<string, {x: number; y: number}> = {}
  #initialized = false
  #loadError = ''
  #active = true
  #working = false
  #refreshing = false

  /** 取得正式布局资源；仅画布的只读形状投影保留在本次运行实例。 */
  constructor(private readonly session: LowcodeDataSpaceDesignSession) {
    const view = session.metadataDataSet.getView('DataSpaceLayoutDefinition', 'default')
    if (!view || view.dataTable?.resourceType !== 'file' || view.dataTable.resourceId !== 'pagedata:layout') throw new Error('正式元数据空间尚未声明布局资源')
    this.#view = view
    ++DataSpaceLayoutEdit.#sequence
    const nodes = session.metadataDataSet.addTable(`UnboundNodes_${DataSpaceLayoutEdit.#sequence}`, [
      ...['rowid', 'Name', 'description', 'Type'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
      {name: 'x', type: 'number'}, {name: 'y', type: 'number'},
    ])
    nodes.resourceType = 'static-data'
    this.nodes = nodes.getOrCreateView('default')
    const edges = session.metadataDataSet.addTable(`UnboundEdges_${DataSpaceLayoutEdit.#sequence}`,
      ['rowid', 'source', 'target', 'parentTable', 'childTable'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})))
    edges.resourceType = 'static-data'
    this.edges = edges.getOrCreateView('default')
    const preview = session.metadataDataSet.addTable(`LayoutRebuildEdges_${DataSpaceLayoutEdit.#sequence}`,
      ['rowid', 'source', 'target'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})))
    preview.resourceType = 'static-data'
    this.rebuildEdges = preview.getOrCreateView('default')
  }

  /** 准备与确认之间的只读预览；不算已修改文件或数据库。 */
  get rebuild(): RebuildPreview | undefined {return this.#rebuild?.preview}

  /** 打开时只读参考坐标；已有原生布局优先，不产生迁移草稿或持久化。 */
  async initialize(): Promise<void> {
    if (this.#initialized) return
    if (this.#working || this.pending) throw new Error('请先结束布局操作')
    const file = this.file()
    this.#working = true; this.#loadError = ''
    try {
      await Promise.all([this.#view.refresh(), this.session.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')?.refresh()])
      if (this.#view.loadingError) throw this.#view.loadingError
      this.layoutRow()
      const modelSignature = JSON.stringify(this.models())
      if (this.usesReferenceLayout()) {
        const text = await this.session.readReferenceLayout()
        const current = this.file()
        if (current.text !== file.text || current.revision !== file.revision || JSON.stringify(this.models()) !== modelSignature) {
          throw new Error('布局读取期间定义已变化，请重新打开')
        }
        const positions = text === null ? {} : LowcodeDataSpaceViewLayout.positions(text)
        if (Object.keys(positions).some(id => !this.models().includes(id))) throw new Error('参考布局节点不属于当前可读模型集合')
        this.#referenceText = text; this.#referencePositions = positions
      }
      this.#initialized = true; this.#signature = ''
    } catch (cause) {
      this.#loadError = cause instanceof Error ? cause.message : String(cause)
      throw cause
    } finally {this.#working = false}
    this.state()
  }

  private async assertReferenceCurrent(): Promise<void> {
    if (!this.#initialized) throw new Error(this.#loadError || '布局尚未读取')
    if (this.#referenceText === undefined || !this.usesReferenceLayout()) return
    const text = await this.session.readReferenceLayout()
    this.file()
    if (text !== this.#referenceText) throw new Error('参考布局已变化，请重新打开后处理')
  }

  private usesReferenceLayout(): boolean {return !Object.hasOwn(this.file().config, 'layout')}

  private hasLayout(): boolean {return this.hasNativeLayout() || this.usesReferenceLayout() && this.#referenceText !== undefined && this.#referenceText !== null}

  private hasNativeLayout(): boolean {
    // ScenarioViewFile已校验布局结构；坐标读取不依赖可销毁的运行投影。
    const layout = this.file().config['layout'] as DataSetMetadata['layout']
    return !!layout && [layout.modelPositions, layout.tablePositions, layout.unboundNodes, layout.unboundEdges]
      .some(value => value && Object.keys(value).length > 0)
  }

  private assertRebuildBase(file: FileState): void {
    if (!this.#initialized) throw new Error(this.#loadError || '布局尚未读取')
    const current = this.file()
    if (current.text !== file.text || current.revision !== file.revision) throw new Error('共享配置已变化，请重新预览')
    if (this.hasLayout()) throw new Error('已有布局，不能重建覆盖')
    if (this.pending || current.dirty || current.saveStatus !== 'idle') throw new Error('请先处理布局或共享配置草稿')
    if (this.session.hasPendingModelEdits() || this.session.hasPendingFieldEdits() || this.session.hasPendingSourceInputs()
      || this.session.hasPendingModelRemovals() || this.session.hasPendingModelCreate()
      || this.session.hasPendingModelSourceEdits()) throw new Error('请先处理其他定义草稿')
    for (const name of ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation',
      'DataTableBindingDefinition', 'DataViewDefinition', 'DataResourceRelationDefinition', 'DataViewCascadeDefinition']) {
      if (this.session.metadataDataSet.getTable(name)?.viewList.some(view => view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw new Error('请先处理其他定义草稿')
    }
  }

  private async readRebuildSources(file: FileState) {
    this.assertRebuildBase(file)
    const names = this.rebuildSourceNames()
    const views = names.map(name => {
      const view = this.session.metadataDataSet.getView(name, 'default')
      if (!view || view.destroyed || view.mutating || view.queryContext['dataSpaceId'] !== this.session.targetId) throw new Error('元数据查询身份失效')
      return view
    })
    const results = await Promise.all(views.map(view => view.loadFromServer({allPages: true})))
    this.assertRebuildBase(file)
    if (results.some(result => !result.success)) throw new Error('正式定义重读失败，请重新预览')
    if (this.configuredRelationIds().size) await this.session.loadGraphRelations()
    this.assertRebuildBase(file)
    return this.captureRebuildSources()
  }

  private rebuildSourceNames(): string[] {
    const file = this.file()
    const native = file.text !== null && new ScenarioViewConfig(this.session.targetId, file.text).usesNativeResourceRelations
    return ['Base_DataSet', 'Base_DataModel', ...(native ? [] : ['Base_DataModel_Relation'])]
  }

  private configuredRelationIds(): Set<string> {
    const configured = this.file().config['resourceRelations']
    return new Set(Array.isArray(configured) ? configured.filter(isRecord)
      .flatMap(relation => typeof relation['relationId'] === 'string' ? [relation['relationId']] : []) : [])
  }

  private captureRebuildSources() {
    const names = this.rebuildSourceNames()
    const snapshots = names.map((name, index) => {
      const view = this.session.metadataDataSet.getView(name, 'default')
      if (!view || view.destroyed || view.mutating) throw new Error('元数据查询身份失效')
      if (view.requestState !== RequestState.Loaded || view.total !== view.rows.length
        || view.queryContext['dataSpaceId'] !== this.session.targetId) throw new Error('正式定义查询不完整')
      const identities = new Set<string>()
      const required = index === 0 ? ['rowid'] : index === 1 ? ['rowid', 'dataSetId', 'Name'] : ['rowid', 'dataSetId', 'parentModId', 'childModId']
      return view.rows.map(row => {
        if (required.some(field => view.fieldAccess(row, field).read !== 'visible')
          || typeof row['rowid'] !== 'string' || !row['rowid'].trim() || row['rowid'].trim() !== row['rowid']
          || view.getPkKey(row) !== row['rowid'] || identities.has(row['rowid'])
          || (index === 0 ? row['rowid'] : row['dataSetId']) !== this.session.targetId) throw new Error('正式定义身份不完整或不可读')
        identities.add(row['rowid'])
        return Object.fromEntries(Object.keys(row).sort().filter(key => !key.startsWith('lingma_sys_')
          && view.fieldAccess(row, key).read === 'visible').map(key => [key, row[key]]))
      })
    })
    const [space, models, relations = []] = snapshots
    if (space?.length !== 1 || !models?.length) throw new Error('缺少当前空间或完整模型集合')
    const fileNodes = this.fileModels(), ids = [...models.map(row => String(row['rowid'])), ...fileNodes.keys()]
    const edges: RebuildEdge[] = relations.map(row => ({rowid: `backend:${String(row['rowid'])}`,
      source: String(row['parentModId']), target: String(row['childModId'])}))
    const tables = this.file().config['tables'], nativeIds = this.configuredRelationIds()
    const graph = this.session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')
    const endpoints = []
    if (nativeIds.size) {
      if (!graph || graph.destroyed || graph.mutating || graph.requestState !== RequestState.Loaded || graph.total !== graph.rows.length
        || graph.queryContext['dataSpaceId'] !== this.session.targetId) throw new Error('原生关系端点未完整读取')
      const endpoint = (tableName: unknown): string | undefined => {
        if (typeof tableName !== 'string') return undefined
        const table = isRecord(tables) ? tables[tableName] : undefined
        const modelId = isRecord(table) && isRecord(table['modelBinding']) ? table['modelBinding']['modelId'] : undefined
        return typeof modelId === 'string' ? modelId : [...fileNodes].find(([, name]) => name === tableName)?.[0]
      }
      for (const row of graph.rows) {
        if (typeof row['relationId'] !== 'string' || !nativeIds.has(row['relationId'])) continue
        if (row['dataSetId'] !== this.session.targetId || ['dataSetId', 'relationId', 'parentTable', 'childTable'].some(field => graph.fieldAccess(row, field).read !== 'visible')) throw new Error('原生模型关系端点不可读或范围不符')
        const source = endpoint(row['parentTable']), target = endpoint(row['childTable'])
        if (!source || !target) throw new Error('原生模型关系缺少正式模型端点')
        endpoints.push([row['relationId'], row['parentTable'], row['childTable']])
        edges.push({rowid: `native:${String(row['relationId'])}`, source, target})
      }
      if (endpoints.length !== nativeIds.size) throw new Error('原生模型关系端点不完整')
    }
    if (edges.some(edge => !ids.includes(edge.source) || !ids.includes(edge.target))) throw new Error('关系端点不属于当前完整模型集合')
    return {ids, edges, fingerprint: JSON.stringify([snapshots, [...fileNodes], endpoints])}
  }

  /** 重读正式定义并确认远端基线后生成只读全模型预览；不暂存文件。 */
  async prepareRebuild(): Promise<RebuildPreview> {
    if (this.#working || this.#rebuild) throw new Error('请先完成或取消当前布局预览')
    const file = this.file(); this.assertRebuildBase(file); this.#working = true
    try {
      await this.assertReferenceCurrent()
      const sources = await this.readRebuildSources(file)
      const remote = await this.session.previewRemoteViews()
      this.assertRebuildBase(file)
      if (remote !== file.text) throw new Error('远端共享配置已变化，请重新打开后预览')
      if (sources.fingerprint !== this.captureRebuildSources().fingerprint) throw new Error('正式定义已变化，请重新预览')
      const positions = Object.freeze(Object.fromEntries(GraphLayout.positions(sources.ids, sources.edges)
        .map(({id, x, y}) => [String(id), Object.freeze({x, y})])))
      const preview = Object.freeze({positions, modelCount: sources.ids.length, relationCount: sources.edges.length})
      this.rebuildEdges.replaceRows(sources.edges)
      this.#rebuild = {preview, fingerprint: sources.fingerprint, file}
      return preview
    } finally {this.#working = false}
  }

  /** 取消只读预览，不改变已保存或本地的布局坐标。 */
  cancelRebuild(): void {
    if (this.#working) throw new Error('布局操作进行中')
    this.#rebuild = undefined
    if (!this.rebuildEdges.destroyed) this.rebuildEdges.replaceRows([])
  }

  /** 确认前重新核对正式定义和共享文件；仅坐标进入已有布局暂存/保存/核验链。 */
  async confirmRebuild(preview: RebuildPreview): Promise<void> {
    const captured = this.#rebuild
    if (this.#working || captured?.preview !== preview) throw new Error('重建预览已失效，请重新预览')
    this.#working = true
    try {
      await this.assertReferenceCurrent()
      const sources = await this.readRebuildSources(captured.file)
      if (sources.fingerprint !== captured.fingerprint) throw new Error('正式定义已变化，请取消并重新预览')
      const remote = await this.session.previewRemoteViews()
      this.assertRebuildBase(captured.file)
      if (remote !== captured.file.text) throw new Error('远端共享配置已变化，请重新打开后预览')
      if (this.captureRebuildSources().fingerprint !== captured.fingerprint) throw new Error('正式定义已变化，请取消并重新预览')
    } finally {this.#working = false}
    this.cancelRebuild()
    this.sync(this.file())
    for (const [id, position] of Object.entries(preview.positions)) this.move({id, ...position})
    await this.save()
  }

  private file(): FileState {
    if (!this.#active) throw new Error('布局编辑已释放')
    return this.session.viewState ?? {scenarioId: this.session.targetId, text: null,
      config: {scenarioId: this.session.targetId, tables: {}}, persisted: false, dirty: false,
      revision: 0, saveStatus: 'idle', submittedText: null}
  }

  /** 文件节点身份直接来自正式C的命名视图，不创建后端模型ID。 */
  fileModels(): ReadonlyMap<string, string> {
    const view = this.session.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')
    if (!view || view.destroyed || view.mutating || view.requestState !== RequestState.Loaded
      || view.total !== view.rows.length || view.queryContext['dataSpaceId'] !== this.session.targetId) throw new Error('文件模型查询未确认')
    const result = new Map<string, string>()
    for (const row of view.rows) {
      const key = view.getPkKey(row)
      if (typeof key !== 'string' || typeof row['tableName'] !== 'string' || row['resourceType'] !== 'file'
        || row['dataSetId'] !== this.session.targetId || ['dataSetId', 'tableName', 'resourceType'].some(field => view.fieldAccess(row, field).read !== 'visible')) throw new Error('文件模型身份无效或不可读')
      result.set(key, row['tableName'])
    }
    return result
  }

  private models(): string[] {
    const view = this.session.metadataDataSet.getView('Base_DataModel', 'default')
    if (!view || view.destroyed || view.mutating || view.requestState !== RequestState.Loaded
      || view.total !== view.rows.length || view.queryContext['dataSpaceId'] !== this.session.targetId) throw new Error('模型查询未完整确认，暂不能编辑布局')
    return view.rows.flatMap(row => typeof row['rowid'] === 'string' && row['rowid'].trim() === row['rowid'] && !!row['rowid']
      && view.getPkKey(row) === row['rowid'] && row['dataSetId'] === this.session.targetId
      && ['rowid', 'dataSetId'].every(field => view.fieldAccess(row, field).read === 'visible') ? [row['rowid']] : []).concat([...this.fileModels().keys()])
  }

  private sync(file: FileState): void {
    if (this.#working || this.pending) return
    if (!this.#initialized) throw new Error(this.#loadError || '布局尚未读取')
    if (file.dirty || file.saveStatus !== 'idle') throw new Error('共享配置正在修改或等待提交确认')
    const persisted = isRecord(file.config['layout']) ? file.config['layout'] : {}
    const loaded = this.layout()
    if (['modelPositions', 'tablePositions', 'unboundNodes', 'unboundEdges'].some(field =>
      JSON.stringify(loaded[field as keyof typeof loaded]) !== JSON.stringify(persisted[field]))) {
      if (!this.#refreshing && !this.#loadError) {
        this.#refreshing = true
        void this.#view.refresh().then(() => {
          if (!this.#active) return
          if (this.#view.loadingError) throw this.#view.loadingError
          this.#signature = ''; this.project()
        }).catch(cause => {if (this.#active) this.#loadError = cause instanceof Error ? cause.message : String(cause)})
          .finally(() => {this.#refreshing = false})
      }
      throw new Error(this.#loadError || '布局定义已变化，正在重新查询')
    }
    const ids = this.models(), modelSignature = JSON.stringify(ids)
    // 结构提交的回读可能先触发渲染，后触发bindCreatedNode。
    // 保留命令前身份基线供精确核对；普通字段/说明保存不改变模型集合。
    if (this.#signature && modelSignature !== this.#modelSignature && this.session.definitionStatus !== 'ready') {
      throw new Error('模型集合已变化，请完成结构操作或按需读取模型定义')
    }
    if (this.usesReferenceLayout()) {
      if (this.#referenceText === undefined) throw new Error('参考布局尚未读取，请重新打开')
      if (Object.keys(this.#referencePositions).some(id => !ids.includes(id))) throw new Error('参考布局节点不属于当前可读模型集合')
    }
    const signature = JSON.stringify([file.text, file.revision, modelSignature])
    if (signature === this.#signature) return
    this.#signature = signature; this.#baseline = file; this.#modelSignature = modelSignature
    this.#messages = []
    const layout = this.layout(), tables = file.config['tables']
    for (const id of ids) {
      const bindings = Object.entries(isRecord(tables) ? tables : {}).filter(([, table]) =>
        isRecord(table) && isRecord(table['modelBinding']) && table['modelBinding']['modelId'] === id)
      if (!layout.modelPositions?.[id] && bindings.length > 1 && bindings.some(([name]) => layout.tablePositions?.[name])) {
        this.#messages.push(`模型 ${id} 对应多个旧表位置；拖动可明确指定模型的设计位置。`)
      }
    }
    this.project()
  }

  private layoutRow(requireReady = true) {
    const original = this.#view.rows[0]
    if (!original || this.#view.destroyed || requireReady && this.#view.requestState !== RequestState.Loaded || this.#view.rows.length !== 1
      || this.#view.queryContext['dataSpaceId'] !== this.session.targetId) throw new Error('布局查询身份失效或尚未完成')
    const key = this.#view.getPkKey(original)
    if (key === undefined || original['dataSetId'] !== this.session.targetId) throw new Error('布局记录身份不匹配')
    return {key, row: this.#view.getEditingRow(key) ?? original}
  }

  private layout(): NonNullable<DataSetMetadata['layout']> {
    if (!this.#initialized || !this.#view.rows.length) return {}
    const {row} = this.layoutRow(false)
    return Object.fromEntries(['modelPositions', 'tablePositions', 'unboundNodes', 'unboundEdges']
      .filter(field => row[field] !== undefined).map(field => [field, row[field]]))
  }

  private setLayout(field: keyof NonNullable<DataSetMetadata['layout']>, value: unknown): void {
    const {key} = this.layoutRow()
    // 撤销尚未保存的新节点/边时恢复该配置域原来的缺省值，不新增空配置。
    const next = isRecord(value) && !Object.keys(value).length && this.#view.rows[0]?.[field] === undefined ? undefined : value
    this.#view.updateEditingValue(key, field, structuredClone(next))
    this.project()
  }

  private positions(): Record<string, {x: number; y: number}> {
    const layout = this.layout(), tables = this.file().config['tables']
    const positions: Record<string, {x: number; y: number}> = {}
    for (const id of this.models()) {
      const bindings = Object.entries(isRecord(tables) ? tables : {}).filter(([, table]) =>
        isRecord(table) && isRecord(table['modelBinding']) && table['modelBinding']['modelId'] === id)
      const binding = bindings.length === 1 ? bindings[0] : undefined
      const fileTable = this.fileModels().get(id)
      const position = (fileTable ? layout.tablePositions?.[fileTable] : undefined) ?? layout.modelPositions?.[id] ?? (binding ? layout.tablePositions?.[binding[0]] : undefined)
        ?? (this.usesReferenceLayout() ? this.#referencePositions[id] : undefined)
      if (position) positions[id] = position
    }
    for (const [id, node] of Object.entries(this.unbound())) positions[id] = {x: node.x, y: node.y}
    return positions
  }

  private unbound(): NonNullable<NonNullable<DataSetMetadata['layout']>['unboundNodes']> {return structuredClone(this.layout().unboundNodes ?? {})}

  private unboundEdges(): NonNullable<NonNullable<DataSetMetadata['layout']>['unboundEdges']> {return structuredClone(this.layout().unboundEdges ?? {})}

  private replaceEdges(edges: NonNullable<NonNullable<DataSetMetadata['layout']>['unboundEdges']>): void {this.setLayout('unboundEdges', edges)}

  /** 图组件消费的节点形状由正式布局记录派生，无独立编辑态或保存入口。 */
  private project(): void {
    const nodes = this.unbound(), edges = this.unboundEdges(), signature = JSON.stringify([nodes, edges])
    if (signature === this.#projectionSignature) return
    this.#projectionSignature = signature
    this.nodes.replaceRows(Object.entries(nodes).map(([rowid, node]) => ({rowid, Name: node.label,
      description: '选择模型来源后自动替换', Type: '未配置', x: node.x, y: node.y})))
    this.edges.replaceRows(Object.entries(edges).map(([rowid, edge]) => ({rowid, ...edge,
      parentTable: JSON.stringify(['layout-node', edge.source]), childTable: JSON.stringify(['layout-node', edge.target])})))
  }

  /** 仅读取当前临时连线的明确节点身份。 */
  connection(id: string): Readonly<{source: string; target: string}> | undefined {return this.unboundEdges()[id]}

  /** 连线只保存用户的布局意图；不创建模型关系、条件或输入级联。重复手势复用原边。 */
  connect(source: string, target: string): string {
    const state = this.state()
    if (!state.editable || !state.draggableKeys.includes(source) || !state.draggableKeys.includes(target)) throw new Error(state.error || '连线端点不存在或不可读')
    const edges = this.unboundEdges(), existing = Object.entries(edges).find(([, edge]) => edge.source === source && edge.target === target)
    if (existing) return existing[0]
    const id = crypto.randomUUID().replaceAll('-', '').toUpperCase()
    this.replaceEdges({...edges, [id]: {source, target}})
    return id
  }

  /** 删除尚未成为正式关系的边；可由取消布局恢复。 */
  removeEdge(id: string): void {
    const state = this.state(), edges = this.unboundEdges()
    if (!state.editable || !Object.hasOwn(edges, id)) throw new Error(state.error || '待配置连线不存在或不可编辑')
    Reflect.deleteProperty(edges, id); this.replaceEdges(edges)
  }

  /** 本地坐标或本操作已暂存文件未结束；供页面关闭与切换保护。 */
  get pending(): boolean {return this.#ownedText !== null || this.#view.hasEditingChanges() || this.#view.dirtyTracking.hasPendingChanges()}

  /** 已暂存文件须显式核验/采用远端，不能冒充取消了服务端写入。 */
  get staged(): boolean {return this.#ownedText !== null}

  private assertDraft(file: FileState): void {
    if (!this.#baseline || file.text !== (this.#ownedText ?? this.#baseline.text)
      || this.#ownedText === null && file.revision !== this.#baseline.revision) throw new Error('共享配置已变化，请预览并明确采用远端后重试')
    if (JSON.stringify(this.models()) !== this.#modelSignature) throw new Error('当前模型身份或读取权限已变化，请取消本地布局后重试')
    if (this.nodes.rows.some(row => this.models().includes(String(row['rowid'])))) throw new Error('未配置节点与正式模型身份冲突，请核查布局')
    const ids = new Set([...this.models(), ...this.nodes.rows.map(row => String(row['rowid']))])
    if (Object.values(this.unboundEdges()).some(edge => !ids.has(edge.source) || !ids.has(edge.target))) throw new Error('待配置连线存在失效或不可读端点，请核查布局')
    for (const name of ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation',
      'DataViewDefinition', 'DataResourceRelationDefinition', 'DataViewCascadeDefinition']) {
      const view = this.session.metadataDataSet.getView(name, 'default')
      if (view?.hasEditingChanges() || view?.dirtyTracking.hasPendingChanges()) throw new Error('请先处理其他定义草稿，再编辑或保存布局')
    }
  }

  /** 读取受控坐标和显式拖动范围；错误时保留本地草稿供取消或恢复。 */
  state() {
    let error = '', status: FileState['saveStatus'] = 'idle', editable = false
    try {
      const file = this.file(); status = file.saveStatus; this.sync(file)
      this.assertDraft(file)
      editable = !this.#working && !this.#refreshing && this.#view.requestState === RequestState.Loaded
        && !this.#rebuild && status === 'idle' && !this.staged && !file.dirty
    } catch (cause) {error = cause instanceof Error ? cause.message : String(cause)}
    let positions: Record<string, {x: number; y: number}> = {}, ids: string[] = []
    try {this.project(); positions = this.positions(); ids = this.models()} catch (cause) {error ||= cause instanceof Error ? cause.message : String(cause); editable = false}
    return {positions, draggableKeys: editable ? [...ids, ...Object.keys(this.unbound())] : [],
      editable, rebuildAvailable: editable && !this.pending && !this.hasLayout() && ids.length > 0,
      pending: this.pending, staged: this.staged, status, error, messages: this.#messages}
  }

  /** 只接受当前布局可编辑节点；拖动不会写入任何持久来源。 */
  move(position: DataSpaceLayoutPosition): void {
    this.arrange([position])
  }

  /** 整批预检后写入原布局视图草稿；不读取字段目录、不保存文件，取消与保存沿原链。 */
  arrange(positions: readonly DataSpaceLayoutPosition[]): void {
    const state = this.state()
    if (!state.editable || new Set(positions.map(position => position.id)).size !== positions.length
      || positions.some(position => typeof position.id !== 'string' || !state.draggableKeys.includes(position.id)
        || !Number.isFinite(position.x) || !Number.isFinite(position.y))) throw new Error(state.error || '当前模型布局不可编辑')
    const layout = this.layout(), nodes = this.unbound(), modelPositions = {...(this.usesReferenceLayout() ? this.#referencePositions : {}), ...layout.modelPositions}
    const tablePositions = {...layout.tablePositions}, tables = this.file().config['tables']
    let modelsChanged = false, tablesChanged = false, nodesChanged = false
    for (const {id, x, y} of positions) {
      const node = nodes[String(id)], fileTable = this.fileModels().get(String(id))
      if (fileTable) {tablePositions[fileTable] = {x, y}; tablesChanged = true}
      else if (node) {nodes[String(id)] = {...node, x, y}; nodesChanged = true}
      else {
        modelPositions[String(id)] = {x, y}; modelsChanged = true
        for (const [name, table] of Object.entries(isRecord(tables) ? tables : {})) {
          if (isRecord(table) && isRecord(table['modelBinding']) && table['modelBinding']['modelId'] === id) Reflect.deleteProperty(tablePositions, name)
        }
      }
    }
    if (modelsChanged) {
      this.setLayout('modelPositions', modelPositions)
      if (layout.tablePositions) tablesChanged = true
    }
    if (tablesChanged) this.setLayout('tablePositions', tablePositions)
    if (nodesChanged) this.setLayout('unboundNodes', nodes)
  }

  /** 新增纯布局节点；在选择来源并确认前不创建模型、字段或运行DataTable。 */
  addNode(): string {
    const state = this.state()
    if (!state.editable) throw new Error(state.error || '当前布局不可编辑')
    const id = crypto.randomUUID().replaceAll('-', '').toUpperCase()
    const models = this.session.metadataDataSet.getView('Base_DataModel', 'default')
    const labels = new Set([...this.nodes.rows.map(row => row['Name']),
      ...(models?.rows ?? []).filter(row => models?.fieldAccess(row, 'Name').read === 'visible').map(row => row['Name'])])
    let label = '待配置模型', suffix = 0
    while (labels.has(label)) label = `待配置模型（${++suffix}）`
    const index = this.models().length + this.nodes.rows.length
    this.setLayout('unboundNodes', {...this.unbound(), [id]: {label, x: 150 + index % 3 * 310, y: 90 + Math.floor(index / 3) * 180}})
    return id
  }

  /** 只移除未配置的布局节点；正式模型删除不经过此入口。 */
  removeNode(id: string): void {
    const state = this.state()
    if (!state.editable || !Object.hasOwn(this.unbound(), id)) throw new Error(state.error || '未配置节点不存在或不可编辑')
    const nodes = this.unbound(); Reflect.deleteProperty(nodes, id); this.setLayout('unboundNodes', nodes)
    this.replaceEdges(Object.fromEntries(Object.entries(this.unboundEdges()).filter(([, edge]) => edge.source !== id && edge.target !== id)))
  }

  /** 正式新增已回读后替换布局身份并保留位置；文件保存失败保留坐标草稿，不重放数据库新增。 */
  bindCreatedNode(id: string, modelId: string): void {
    const file = this.file(), position = this.unbound()[id], models = this.models()
    const previous: unknown = JSON.parse(this.#modelSignature || '[]')
    if (!position || !this.#baseline || this.staged || file.dirty || file.saveStatus !== 'idle'
      || file.text !== this.#baseline.text || file.revision !== this.#baseline.revision
      || !Array.isArray(previous) || previous.includes(modelId) || models.filter(value => value === modelId).length !== 1
      || JSON.stringify(models.filter(value => value !== modelId)) !== JSON.stringify(previous)) throw new Error('新增模型已保存，布局基线或模型集合已变化；请核对后处理布局')
    this.setLayout('modelPositions', {...(this.usesReferenceLayout() ? this.#referencePositions : {}), ...this.layout().modelPositions, [modelId]: {x: position.x, y: position.y}})
    const nodes = this.unbound(); Reflect.deleteProperty(nodes, id); this.setLayout('unboundNodes', nodes)
    this.replaceEdges(Object.fromEntries(Object.entries(this.unboundEdges()).map(([key, edge]) => [key,
      {source: edge.source === id ? modelId : edge.source, target: edge.target === id ? modelId : edge.target}])))
    this.#modelSignature = JSON.stringify(models)
  }

  /** 放弃尚未进入文件owner的坐标草稿。 */
  cancel(): void {
    if (this.#working || this.staged) throw new Error('布局已暂存，请核验或明确采用远端')
    this.reset(); this.state()
  }

  /** 仅合入改动坐标；原文件owner负责并发检查、回执和精确回读。 */
  async save(): Promise<void> {
    if (this.#working) throw new Error('布局操作进行中')
    const file = this.file(); this.assertDraft(file)
    if (file.saveStatus !== 'idle') throw new Error('布局提交待核验，不会重复提交')
    if (!this.pending) return
    if (!this.staged && file.dirty) throw new Error('共享文件已有其他草稿')
    this.#working = true
    try {
      await this.assertReferenceCurrent()
      this.assertDraft(this.file())
      await this.submit()
      this.reset(false)
    } finally {this.#working = false}
  }

  private async submit(): Promise<void> {
    try {
      const result = await this.session.metadataDataSet.saveChanges({views: [{tableName: this.#view.tableName, viewId: this.#view.viewId}]})
      if (!result.success) throw new Error('布局保存未成功')
    } finally {
      const current = this.file()
      if (current.saveStatus === 'unknown') this.#ownedText = current.text
    }
  }

  /** 沿原DataSet核验已派发提交；未应用时不自动重放。 */
  async verify(): Promise<'confirmed' | 'not-applied'> {
    if (this.#working || !this.staged) throw new Error('没有本操作待核验的布局')
    this.assertDraft(this.file()); this.#working = true
    try {
      await this.submit()
      this.reset(false)
      return 'confirmed'
    } catch (cause) {
      if (cause instanceof Error && cause.message.startsWith('SCENARIO_DEFINITION_NOT_APPLIED:')) {
        this.#ownedText = this.file().text
        return 'not-applied'
      }
      throw cause
    } finally {this.#working = false}
  }

  /** 展示远端原文及当前草稿版本；缺文件与空文件不混同。 */
  async preview(): Promise<Readonly<{revision: number; text: string | null}>> {
    const revision = this.file().revision
    const text = await this.session.previewRemoteViews()
    if (this.file().revision !== revision) throw new Error('预览期间配置已变化，请重新预览')
    return {revision, text}
  }

  /** 用户明确采用刚预览的共享文件；由owner再次核对远端与版本。 */
  async adopt(preview: Readonly<{revision: number; text: string | null}>): Promise<void> {
    if (this.#working) throw new Error('布局操作进行中')
    this.#working = true
    try {
      await this.session.adoptViews({expectedRevision: preview.revision, previewText: preview.text,
        discardViews: [{tableName: 'DataSpaceLayoutDefinition', viewId: 'default'}]})
      this.reset(); this.#initialized = false; this.#referenceText = undefined; this.#referencePositions = {}
    } finally {this.#working = false}
    await this.initialize()
  }

  private reset(discardChanges = true): void {
    this.#rebuild = undefined; this.rebuildEdges.replaceRows([]); this.#ownedText = null
    // 保存只确认原捕获；期间的新编辑仍由同一DataView持有，不能按取消处理。
    if (discardChanges) this.#view.discardPendingChanges()
    this.#baseline = discardChanges ? null : this.file(); this.#signature = ''
  }

  /** 释放本实例局部表，不改变正式元数据或文件保存状态。 */
  dispose(): void {
    if (!this.#active) return
    this.#active = false
    this.#rebuild = undefined
    if (!this.session.metadataDataSet.destroyed) this.session.metadataDataSet.removeTable(this.nodes.tableName)
    if (!this.session.metadataDataSet.destroyed) this.session.metadataDataSet.removeTable(this.edges.tableName)
    if (!this.session.metadataDataSet.destroyed) this.session.metadataDataSet.removeTable(this.rebuildEdges.tableName)
  }
}
