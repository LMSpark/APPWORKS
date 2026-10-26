/**
 * @module app:views/app/dev-system/blueprint-workspace/blueprint-workspace-dataview
 * 职责：让蓝图阶段字段共用正式 Base_NavigationInfo DataView 的查询、编辑覆盖、取消和 DataSet 保存。
 * 边界：不扩展模型字段/输出，不复制业务草稿；字段读写仅由正式 DataView 查询结果授权。
 */
import {DataViewFilter, RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY, normalizeLowcodeProjectBlueprintRecords, validateLowcodeProjectBlueprintRecords} from '@spark-appworks/spark-lowcode-api'
import type {ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData} from '@spark-appworks/spark-project-model'

export const BLUEPRINT_WORKSPACE_FIELD_NAMES = Object.freeze([
  'rowid', 'SysId', 'prowid', 'FunOrderValue', 'name', 'funCode', 'FunName', 'memo', 'htmlDesc', 'conid', 'conType', 'NavigationUrl', 'VersionId',
  'DifficultyFactor', 'Manhour', 'Number', 'Sum', 'Total', 'personCharge', 'status', 'IsShowAtNav', 'NavigationType',
  'NavigationImageWxz', 'MobileUrl', 'IsShowChildItem', 'BeginGroup', 'NavigationShowType', 'ChildItemLocation',
  'HorizontalAlignment',
] as const)

const MODEL_NAME = 'Base_NavigationInfo'
const VIEW_NAME = 'default'
const MAX_BLUEPRINT_ROWS = 50_000

/** 一个已查询目标的 DataView 编辑入口；正式元数据和查询权限均由原 DataSpace owner 提供。 */
export class BlueprintWorkspaceDataView {
  readonly view: DataView
  #projectId: string
  #nodeId = ''
  #row: DataRow | undefined
  #revision = 0
  #disposed = false
  #treeQueryLoaded = false
  #loadInFlight: Promise<unknown> | undefined
  #unconfirmedIds: Array<string | number> = []
  #unconfirmedPatches = new Map<string | number, Record<string, unknown>>()
  #queryOutputFields: ReadonlySet<string>

  public constructor(
    public readonly dataSet: DataSet,
    projectId: string,
    private readonly assertCurrent: () => void,
  ) {
    this.#projectId = projectId.trim()
    if (!this.#projectId) throw new Error('蓝图 DataView 缺少项目身份')
    if (dataSet.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY) throw new Error('蓝图 DataView 场景身份不匹配')
    const table = dataSet.getTable(MODEL_NAME)
    const view = dataSet.getView(MODEL_NAME, VIEW_NAME)
    if (!table || !view || table.modelBinding?.modelName !== MODEL_NAME || !table.modelBinding.modelId.trim()) {
      throw new Error('蓝图 DataView 未绑定正式 Base_NavigationInfo 模型')
    }
    this.view = view
    this.view.commitMode = 'staged'
    const queryOutputFields = new Set(view.queryColumns.map(column => column.name))
    const queryFields = BLUEPRINT_WORKSPACE_FIELD_NAMES.filter(field => queryOutputFields.has(field))
    this.#queryOutputFields = new Set(queryFields)
    if (!queryOutputFields.has('rowid') || !queryOutputFields.has('SysId')) {
      throw new Error('蓝图 DataView 缺少正式可输出的 rowid 或 SysId')
    }
    this.view.autoLoad = false
    this.view.queryConfig = {...this.view.queryConfig, fields: queryFields, allPages: false, maxRows: MAX_BLUEPRINT_ROWS, autoQuery: false}
  }

  public get projectId(): string {return this.#projectId}
  public get nodeId(): string {return this.#nodeId}
  public get row(): DataRow | undefined {return this.#row}
  public get hasTreeProjection(): boolean {return this.#treeQueryLoaded}
  public get dirty(): boolean {
    if (this.hasUnconfirmedSave) return true
    return this.view.rows.some(row => {const id=this.view.getPkKey(row);return id!==undefined&&(this.view.hasEditingChanges(id)||this.view.dirtyTracking.hasPendingChanges(id))})
  }
  public get hasUnconfirmedSave(): boolean {return this.view.hasUnconfirmedSave}
  public get isBusy(): boolean {return this.view.mutating || this.view.requestState === RequestState.Loading}

  public async load(nodeId: string): Promise<void> {
    this.assertUsable()
    const targetNodeId = nodeId.trim()
    if (!targetNodeId) throw new Error('蓝图 DataView 缺少节点身份')
    // Advance the generation and clear the visible row before checking busy state:
    // even a rejected B selection must fence an in-flight A response.
    const revision = ++this.#revision
    if (this.dirty) throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    this.#nodeId = targetNodeId
    this.#row = undefined
    if(this.view.mutating)throw new Error('蓝图 DataView 正在保存；旧目标结果已失效')
    if(this.isBusy){
      const pending=this.#loadInFlight
      if(!pending)throw new Error('蓝图 DataView 正在查询且没有可等待的请求；旧目标结果已失效')
      await pending.catch(()=>undefined)
      this.assertTarget(revision,targetNodeId)
    }
    this.#treeQueryLoaded=false
    this.view.filterExpression = DataViewFilter.group({logic: 'and', filters: [
      DataViewFilter.condition({field: 'SysId', operator: 'eq', value: this.#projectId}).toJSON(),
      DataViewFilter.condition({field: 'rowid', operator: 'eq', value: targetNodeId}).toJSON(),
    ]}).toJSON()
    const pending=this.view.refresh()
    this.#loadInFlight=pending
    try{await pending}finally{if(this.#loadInFlight===pending)this.#loadInFlight=undefined}
    this.assertTarget(revision, targetNodeId)
    if (this.view.loadingError) throw this.view.loadingError
    if (this.view.rows.length !== 1) throw new Error(`蓝图 DataView 应返回唯一目标，实际返回 ${this.view.rows.length} 行`)
    const row = this.view.rows[0]
    if (row?.['rowid'] !== targetNodeId || row['SysId'] !== this.#projectId
      || this.view.fieldAccess(row, 'rowid').read !== 'visible' || this.view.fieldAccess(row, 'SysId').read !== 'visible') {
      throw new Error('蓝图 DataView 返回了身份不匹配或不可读的目标行')
    }
    this.#row = row
  }

  /** Load the displayed tree through the same bound DataView owner used by edits. */
  public async loadProjectTree(): Promise<ProjectBlueprintTreeData> {
    this.assertUsable()
    if (this.isBusy || this.hasUnconfirmedSave) throw new Error('蓝图 DataView 正在保存或回执待核验，不能加载项目树')
    if (this.dirty) throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    for (const field of ['prowid', 'FunOrderValue']) if (!this.hasOutput(field)) throw new Error(`蓝图 DataView 未正式输出树字段 ${field}`)
    const revision=++this.#revision, selectedNodeId=this.#nodeId
    try{
      await this.queryProjectRows(revision,selectedNodeId)
      this.#treeQueryLoaded=true
      this.#row=this.view.rows.find(row=>row['rowid']===selectedNodeId&&row['SysId']===this.#projectId)
      return this.treeProjection()
    }catch(error){this.#treeQueryLoaded=false;throw error}
  }

  /** Temporarily widens this same DataView to project rows and stages a permission-checked move. */
  public async moveNode(nodeId: string, parentId: string | null, index: number): Promise<void> {
    this.assertUsable()
    if (this.isBusy || this.hasUnconfirmedSave) throw new Error('蓝图 DataView 正在保存或回执待核验，不能移动节点')
    if (this.dirty) throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    if (!Number.isSafeInteger(index) || index < 0) throw new Error('蓝图节点位置无效')
    for (const field of ['prowid', 'FunOrderValue']) if (!this.hasOutput(field)) throw new Error(`蓝图 DataView 未正式输出树字段 ${field}`)
    const nodeKey=nodeId.trim(), revision=++this.#revision, projectId=this.#projectId, selectedNodeId=this.#nodeId
    const rows=await this.queryProjectRows(revision,selectedNodeId)
    this.#treeQueryLoaded=true
    this.#row=rows.find(row=>row['rowid']===selectedNodeId)
    try{this.treeProjection()}catch(error){this.#treeQueryLoaded=false;throw error}
    const byId=new Map(rows.map(row=>[String(row['rowid']),row]))
    const moving=byId.get(nodeKey);if(!moving)throw new Error(`蓝图 DataView 未返回待移动节点 ${nodeKey}`)
    const targetParentInput=parentId?.trim()??'000000'
    const targetParent=targetParentInput===`project-blueprint:${projectId}`?'000000':targetParentInput
    if(targetParent!=='000000'&&!byId.has(targetParent))throw new Error('蓝图 DataView 未返回目标父节点')
    if(targetParent===nodeKey)throw new Error('蓝图节点不能移动到自身下')
    let ancestor=targetParent;const visited=new Set<string>()
    while(ancestor!=='000000'){
      if(ancestor===nodeKey)throw new Error('蓝图节点不能移动到自身后代下')
      if(visited.has(ancestor))throw new Error('蓝图 DataView 父子关系存在循环')
      visited.add(ancestor);const parentRow=byId.get(ancestor);if(!parentRow)throw new Error('蓝图 DataView 父子关系不完整')
      ancestor=String(parentRow['prowid']??'000000').trim()||'000000'
    }
    const siblings=(siblingParent:string)=>rows.filter(row=>(String(row['prowid']??'000000').trim()||'000000')===siblingParent)
      .sort((a,b)=>Number(a['FunOrderValue']??0)-Number(b['FunOrderValue']??0)||String(a['rowid']).localeCompare(String(b['rowid'])))
    const sourceParent=String(moving['prowid']??'000000').trim()||'000000'
    const source=siblings(sourceParent).filter(row=>row!==moving)
    const destination=sourceParent===targetParent?source:siblings(targetParent).filter(row=>row!==moving)
    if(index>destination.length)throw new Error('蓝图节点位置超出目标范围')
    destination.splice(index,0,moving)
    const patches=new Map<DataRow,Record<string,unknown>>()
    const groups=sourceParent===targetParent?[[targetParent,destination] as const]:[[sourceParent,source] as const,[targetParent,destination] as const]
    for(const [groupParent,items] of groups)items.forEach((row,order)=>{
      const patch:Record<string,unknown>={}
      const parentValue=groupParent
      if((String(row['prowid']??'000000').trim()||'000000')!==parentValue)patch['prowid']=parentValue
      if(Number(row['FunOrderValue']??0)!==order)patch['FunOrderValue']=order
      if(Object.keys(patch).length)patches.set(row,{...patches.get(row),...patch})
    })
    for(const [row,patch] of patches){
      const id=this.view.getPkKey(row)
      if(id===undefined||this.view.editActionState(row)!=='enabled'||Object.keys(patch).some(field=>this.view.fieldAccess(row,field).write!=='allowed'))throw new Error(`蓝图 DataView 权限拒绝移动行 ${String(row['rowid'])}`)
    }
    for(const [row,patch] of patches){const id=this.view.getPkKey(row);if(id===undefined)throw new Error('蓝图 DataView 行缺少正式主键');for(const [field,value] of Object.entries(patch))this.view.updateEditingValue(id,field,value)}
    // Moving a non-selected tree row must never retarget the detail editor.
    this.#row=rows.find(row=>row['rowid']===selectedNodeId)
  }

  public hasOutput(field: string): boolean {
    return this.#queryOutputFields.has(field)
  }

  /** Build the display tree strictly from the current DataView rows and their edit overlays. */
  public treeProjection(): ProjectBlueprintTreeData {
    this.assertUsable()
    if(!this.#treeQueryLoaded)throw new Error('蓝图 DataView 尚未加载完整项目树行')
    for(const field of ['rowid','SysId','prowid','FunOrderValue'])if(!this.hasOutput(field))throw new Error(`蓝图 DataView 未输出树投影字段 ${field}`)
    if(!this.hasOutput('name')&&!this.hasOutput('FunName'))throw new Error('蓝图 DataView 未输出树节点名称')
    const fields=['rowid','SysId','prowid','FunOrderValue','name','funCode','FunName','conType','memo','personCharge','status',
      'NavigationUrl','NavigationImageWxz','MobileUrl','NavigationType','ChildItemLocation','NavigationShowType','HorizontalAlignment',
      'IsShowAtNav','IsShowChildItem','BeginGroup','conid','htmlDesc','VersionId']
    const rows=this.view.rows.map(row=>{
      for(const field of ['rowid','SysId','prowid','FunOrderValue'])if(this.view.fieldAccess(row,field).read!=='visible')throw new Error(`蓝图 DataView 无权读取树投影字段 ${field}`)
      if(!['name','FunName'].some(field=>this.hasOutput(field)&&this.view.fieldAccess(row,field).read==='visible'))throw new Error('蓝图 DataView 无权读取树节点名称')
      const key=this.view.getPkKey(row)
      const overlay=key===undefined?undefined:this.view.getEditingRow(key)
      const source=overlay??row
      const visible:Record<string,unknown>={}
      for(const field of fields)if(this.hasOutput(field)&&this.view.fieldAccess(row,field).read==='visible'&&Object.hasOwn(source,field))visible[field]=source[field]
      return visible
    })
    const ids=new Set(rows.map(row=>String(row['rowid']??'').trim()))
    for(const row of rows){
      const id=String(row['rowid']??'').trim(), parent=String(row['prowid']??'000000').trim()||'000000'
      if(!id)throw new Error('蓝图 DataView 返回了缺少 rowid 的树行')
      if(parent!=='000000'&&parent!=='0'&&!ids.has(parent))throw new Error(`蓝图 DataView 父节点闭包缺失：${id} -> ${parent}`)
    }
    const records=validateLowcodeProjectBlueprintRecords(this.#projectId,normalizeLowcodeProjectBlueprintRecords(rows))
    const byParent=new Map<string,Array<typeof records[number]>>()
    for(const record of records){const siblings=byParent.get(record.parentNodeId)??[];siblings.push(record);byParent.set(record.parentNodeId,siblings)}
    const toNode=(record:typeof records[number]):ProjectBlueprintTreeNodeData=>({
      nodeId:record.nodeId,parentNodeId:record.parentNodeId,projectId:record.projectId,kind:record.kind,
      capability:{...record.capability},...(record.navigation===undefined?{}:{navigation:{...record.navigation}}),
      ...(record.dataSpace===undefined?{}:{dataSpace:{...record.dataSpace,models:record.dataSpace.models.map(model=>({...model}))}}),
      ...(record.prototype===undefined?{}:{prototype:{...record.prototype}}),source:{...record.source},
      children:(byParent.get(record.nodeId)??[]).sort((a,b)=>(a.navigation?.order??0)-(b.navigation?.order??0)||a.nodeId.localeCompare(b.nodeId)).map(toNode),
    })
    const roots=records.filter(record=>record.parentNodeId===''||record.parentNodeId==='000000'||record.parentNodeId==='0')
      .sort((a,b)=>(a.navigation?.order??0)-(b.navigation?.order??0)||a.nodeId.localeCompare(b.nodeId)).map(toNode)
    const root=roots[0]
    if(!root)throw new Error('蓝图 DataView 没有可展示的正式根节点')
    if(roots.length===1)return {...root,children:root.children??[]}
    return {nodeId:`project-blueprint:${this.#projectId}`,parentNodeId:'',projectId:this.#projectId,kind:'module',capability:{name:this.#projectId},source:{},children:roots}
  }

  public canRead(field: string): boolean {
    this.assertUsable()
    const row = this.#row
    if (!row || !this.view.rows.includes(row) || row['rowid'] !== this.#nodeId || row['SysId'] !== this.#projectId) return false
    return this.hasOutput(field) && Object.hasOwn(row, field) && this.view.fieldAccess(row, field).read === 'visible'
  }

  public canWrite(field: string): boolean {
    if (!this.canRead(field)) return false
    const row = this.#row
    if (!row) return false
    const column = this.view.dataTable?.columns.find(candidate => candidate.name === field)
    return column !== undefined && !column.isComputed && !column.computeExpression
      && this.view.editActionState(row) === 'enabled' && this.view.fieldAccess(row, field).write === 'allowed'
  }

  public value(field: string): unknown {
    const row = this.#row
    if (!row || !this.canRead(field)) return undefined
    return this.canRead(field) ? this.view.getEditingRow(this.requireRowKey(row))?.[field] : undefined
  }

  public update(field: string, value: unknown): void {
    if (this.isBusy) throw new Error('查询或保存期间不能编辑蓝图字段')
    if (this.hasUnconfirmedSave) throw new Error('蓝图 DataView 保存结果未确认，请先通过原 DataSet 保存入口核验')
    const row = this.currentRow()
    if (!this.canWrite(field)) throw new Error(`蓝图字段 ${field} 不存在于正式输出或当前查询权限不允许写入`)
    this.view.updateEditingValue(this.requireRowKey(row), field, value)
  }

  /** 丢弃 DataView 编辑覆盖或已暂存行修改；没有页面副本需要清空。 */
  public cancel(): void {
    this.assertUsable()
    if (this.isBusy) throw new Error('保存或查询期间不能取消蓝图修改')
    if (this.hasUnconfirmedSave) throw new Error('保存结果未确认，不能取消；请先沿原 DataSet 保存入口核验')
    if (!this.dirty) return
    const ids=this.view.rows.map(row=>this.view.getPkKey(row)).filter((id):id is string|number=>id!==undefined)
      .filter(id=>this.view.hasEditingChanges(id)||this.view.dirtyTracking.hasPendingChanges(id))
    this.view.discardPendingChanges(ids)
    this.#row=this.view.rows.find(candidate=>candidate['rowid']===this.#nodeId&&candidate['SysId']===this.#projectId)
  }

  public async save(): Promise<void> {
    this.assertUsable()
    if (this.isBusy) throw new Error('蓝图 DataView 正在查询或保存')
    const targetNodeId=this.#nodeId, revision=this.#revision
    if (this.hasUnconfirmedSave) {
      const recovered = await this.dataSet.saveChanges({views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: this.#unconfirmedIds}]})
      this.assertTarget(revision, targetNodeId)
      if (!recovered.success) throw recovered.error ?? new Error(recovered.message ?? '蓝图 DataView 未确认保存仍无法核验')
      await this.view.refresh()
      this.assertTarget(revision, targetNodeId)
      if (this.view.loadingError) throw this.view.loadingError
      const recoveryTargetId=targetNodeId||String(this.#unconfirmedIds[0]??'')
      const recoveredRow = this.view.rows.find(candidate => candidate['rowid'] === recoveryTargetId && candidate['SysId'] === this.#projectId)
      if (!recoveredRow) throw new Error('蓝图 DataView 核验后未读回目标行')
      for(const [key,patch] of this.#unconfirmedPatches){const confirmed=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===key);if(!confirmed)throw new Error(`蓝图行 ${String(key)} 核验后未读回`);for(const [field,value] of Object.entries(patch))if(!Object.is(confirmed[field],value))throw new Error(`蓝图字段 ${field} 核验回读不一致`)}
      this.#row = targetNodeId?recoveredRow:undefined
      this.#unconfirmedIds=[];this.#unconfirmedPatches.clear()
      return
    }
    if(this.#nodeId)this.currentRow()
    const ids=this.view.rows.map(candidate=>this.view.getPkKey(candidate)).filter((key):key is string|number=>key!==undefined)
    const patches=new Map(ids.map(key=>[key,this.view.getEditingPatch(key)]).filter((entry):entry is [string|number,Record<string,unknown>]=>entry[1]!==undefined))
    if ([...patches].some(([key,patch])=>{const target=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===key);return !target||this.view.editActionState(target)!=='enabled'||Object.keys(patch).some(field=>this.view.fieldAccess(target,field).write!=='allowed')})) throw new Error('蓝图编辑包含当前查询不允许写入的字段')
    if (patches.size > 0) {
      const applied = await this.view.applyEditingRows([...patches.keys()])
      this.assertTarget(revision, targetNodeId)
      if (!applied.success || !applied.data || applied.data.failedCount > 0) throw new Error(Object.values(applied.data?.failedErrors ?? {})[0] ?? '蓝图 DataView 编辑应用失败')
    }
    const changedIds=ids.filter(key=>this.view.dirtyTracking.hasPendingChanges(key))
    if (changedIds.length===0) return
    this.#unconfirmedIds=[...changedIds]
    this.#unconfirmedPatches=new Map([...patches].filter(([key])=>changedIds.includes(key)))
    const result = await this.dataSet.saveChanges({views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: changedIds}]})
    this.assertTarget(revision, targetNodeId)
    if (!result.success) throw result.error ?? new Error(result.message ?? '蓝图 DataView 保存失败')
    await this.view.refresh()
    this.assertTarget(revision, targetNodeId)
    if (this.view.loadingError) throw this.view.loadingError
    const verificationId=targetNodeId||String(changedIds[0])
    const saved = this.view.rows.find(candidate => candidate['rowid'] === verificationId && candidate['SysId'] === this.#projectId)
    if (!saved) throw new Error('蓝图 DataView 保存后未读回目标行')
    this.#row = targetNodeId?saved:undefined
    for(const [key,patch] of patches){const confirmed=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===key);if(!confirmed)throw new Error(`蓝图行 ${String(key)} 保存后无法读回`);for(const [field,value] of Object.entries(patch))if(!Object.is(confirmed[field],value))throw new Error(`蓝图字段 ${field} 保存后读回不一致`)}
    this.#unconfirmedIds=[]
  }

  public dispose(): void {
    this.#disposed = true
    this.#revision++
    this.#row = undefined
    this.#nodeId = ''
  }

  private currentRow(): DataRow {
    this.assertUsable()
    const row = this.#row
    if (!row || !this.view.rows.includes(row) || row['rowid'] !== this.#nodeId || row['SysId'] !== this.#projectId) {
      throw new Error('蓝图 DataView 当前目标已失效')
    }
    return row
  }

  private async queryProjectRows(revision:number,selectedNodeId:string):Promise<DataRow[]> {
    const projectId=this.#projectId
    this.view.filterExpression=DataViewFilter.condition({field:'SysId',operator:'eq',value:projectId}).toJSON()
    this.view.queryConfig={...this.view.queryConfig,allPages:true,maxRows:MAX_BLUEPRINT_ROWS}
    await this.view.refresh();this.assertTarget(revision,selectedNodeId)
    if(this.view.loadingError)throw this.view.loadingError
    const rows=this.view.rows.filter(row=>row['SysId']===projectId&&typeof row['rowid']==='string')
    const ids=new Set(rows.map(row=>String(row['rowid']).trim()))
    if(rows.length!==this.view.rows.length)throw new Error('蓝图 DataView 返回了跨项目或缺少 rowid 的树行')
    if(!Number.isSafeInteger(this.view.total)||this.view.total<0||this.view.total!==rows.length)throw new Error(`蓝图 DataView 项目树总数与行数不一致或未确认：total=${this.view.total} rows=${rows.length}`)
    if(rows.some(row=>['rowid','SysId','prowid','FunOrderValue'].some(field=>this.view.fieldAccess(row,field).read!=='visible'))){
      throw new Error('蓝图 DataView 不可读取完整树结构或排序字段，拒绝使用项目树')
    }
    for(const row of rows){const parent=String(row['prowid']??'000000').trim()||'000000';if(parent!=='000000'&&parent!=='0'&&!ids.has(parent))throw new Error(`蓝图 DataView 父节点闭包缺失：${String(row['rowid'])} -> ${parent}`)}
    return [...rows]
  }

  private requireRowKey(row: DataRow): string | number {
    const id = this.view.getPkKey(row)
    if ((typeof id !== 'string' && typeof id !== 'number') || String(id) !== this.#nodeId) throw new Error('蓝图 DataView 正式主键与节点身份不匹配')
    return id
  }

  private assertTarget(revision: number, nodeId: string): void {
    this.assertUsable()
    if (revision !== this.#revision || this.#nodeId !== nodeId) throw new Error('蓝图 DataView 查询结果已过期')
  }

  private assertUsable(): void {
    if (this.#disposed) throw new Error('蓝图 DataView 已释放')
    this.assertCurrent()
    if (this.dataSet.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY || this.dataSet.getView(MODEL_NAME, VIEW_NAME) !== this.view) {
      throw new Error('蓝图 DataView 场景或视图身份已变化')
    }
  }
}
