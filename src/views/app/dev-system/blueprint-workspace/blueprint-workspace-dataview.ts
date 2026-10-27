/**
 * @module app:views/app/dev-system/blueprint-workspace/blueprint-workspace-dataview
 * 职责：让蓝图阶段字段共用正式 Base_NavigationInfo DataView 的查询、编辑覆盖、取消和 DataSet 保存。
 * 边界：不扩展模型字段/输出，不复制业务草稿；字段读写仅由正式 DataView 查询结果授权。
 */
import {DataViewFilter, RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY, lowcodeProjectBlueprintFields, normalizeLowcodeProjectBlueprintRecords, validateLowcodeProjectBlueprintRecords, type LowcodeProjectBlueprintRecord} from '@spark-appworks/spark-lowcode-api'
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

/** Permission-filtered form projection; unreadable wire members are absent. */
type OptionalFormFields<T>={ [Key in keyof T]?: T[Key]|undefined }
export type BlueprintNodeFormData=Omit<ProjectBlueprintTreeNodeData,'capability'|'navigation'|'dataSpace'|'prototype'> & {
  capability:OptionalFormFields<ProjectBlueprintTreeNodeData['capability']>
  navigation?:OptionalFormFields<NonNullable<ProjectBlueprintTreeNodeData['navigation']>>|undefined
  dataSpace?:OptionalFormFields<NonNullable<ProjectBlueprintTreeNodeData['dataSpace']>>|undefined
  prototype?:OptionalFormFields<NonNullable<ProjectBlueprintTreeNodeData['prototype']>>|undefined
}

/** Stable row identity and wire fields for one preflighted leaf. */
export type BlueprintChildNodeCreate=Readonly<{
  /** Stable explicit row identity, unique within the current project and this command. */
  nodeId:string
  /** Candidate formal wire fields; the current DataView validates every field before staging. */
  fields:Readonly<Record<string,unknown>>
}>

/** A preflighted leaf row whose parent is an existing row in the current DataView. */
export type BlueprintChildNodeCreateAtParent=BlueprintChildNodeCreate&Readonly<{
  parentNodeId:string
}>

/** Fully preflighted target identity and patch, ready for synchronous overlay staging. */
export type BlueprintNodeDataBatchItem=Readonly<{nodeId:string;key:string|number;patch:Readonly<Record<string,unknown>>;node:BlueprintNodeFormData}>

type PendingChildCreateBatch=Readonly<{
  children:readonly BlueprintChildNodeCreateAtParent[]
  ids:ReadonlyArray<string|number>
  expected:ReadonlyMap<string|number,Readonly<Record<string,unknown>>>
  state:'unknown'|'accepted'|'not-applied'|'blocked'
}>

function sameWireValue(left:unknown,right:unknown):boolean{
  if(Object.is(left,right))return true
  if(typeof left==='number'||typeof right==='number')return Number(left??0)===Number(right??0)
  return String(left??'')===String(right??'')
}

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
  #unconfirmedRootId: string | number | undefined
  #unconfirmedDeleteId: string | number | undefined
  #unconfirmedDeleteParentId: string | undefined
  #unconfirmedChildId: string | number | undefined
  #pendingChildBatch:PendingChildCreateBatch|undefined
  #batchStageBlocked=false
  #childReceiptState: 'pending'|'unknown'|'accepted'|undefined
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
    if(this.#unconfirmedIds.length>0)return true
    if(this.#batchStageBlocked)return true
    if(this.#unconfirmedChildId!==undefined||this.#pendingChildBatch!==undefined)return true
    if(this.#unconfirmedDeleteId!==undefined)return true
    if (this.hasUnconfirmedSave) return true
    return this.view.rows.some(row => {const id=this.view.getPkKey(row);return id!==undefined&&(this.view.hasEditingChanges(id)||this.view.dirtyTracking.hasPendingChanges(id))})
  }
  public get hasUnconfirmedSave(): boolean {return this.view.hasUnconfirmedSave}
  /** Keep the owner mounted while a write receipt or its required readback is unresolved. */
  public get hasPendingBlueprintCommand(): boolean {
    return this.hasUnconfirmedSave || this.#unconfirmedRootId !== undefined || this.#unconfirmedChildId !== undefined
      || this.#pendingChildBatch !== undefined || this.#unconfirmedDeleteId !== undefined || this.#unconfirmedIds.length > 0 || this.#batchStageBlocked
  }
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
    this.view.setCurrentRow(null)
    if(this.#treeQueryLoaded){
      const row=this.view.rows.find(candidate=>candidate['rowid']===targetNodeId&&candidate['SysId']===this.#projectId)
      if(!row)throw new Error(`蓝图 DataView 项目树未返回目标行 ${targetNodeId}`)
      if(this.view.fieldAccess(row,'rowid').read!=='visible'||this.view.fieldAccess(row,'SysId').read!=='visible')throw new Error('蓝图 DataView 当前行身份不可读')
      this.#row=row
      this.view.setCurrentRow(row)
      return
    }
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
    this.view.setCurrentRow(row)
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
      this.view.setCurrentRow(this.#row??null)
      return this.treeProjection()
    }catch(error){this.#treeQueryLoaded=false;throw error}
  }

  /** Delete one ordinary leaf through the current project tree DataView and confirm it by readback. */
  public async removeLeafNode(nodeId:string,expectedProjectId:string,expectedParentNodeId:string):Promise<ProjectBlueprintTreeData>{
    this.assertUsable()
    const targetId=nodeId.trim(),projectId=expectedProjectId.trim(),parentId=expectedParentNodeId.trim()
    if(!targetId||!projectId||!parentId)throw new Error('蓝图 DataView 删除目标身份不完整')
    if(projectId!==this.#projectId)throw new Error('蓝图 DataView 删除目标项目身份不匹配')
    if(this.isBusy)throw new Error('蓝图 DataView 正在查询或保存，不能删除节点')
    if(this.#unconfirmedDeleteId!==undefined){
      if(this.#unconfirmedDeleteId!==targetId||this.#unconfirmedDeleteParentId!==parentId)throw new Error('蓝图 DataView 存在其他删除待核验目标')
      const id=this.#unconfirmedDeleteId
      if(this.hasUnconfirmedSave||this.view.dirtyTracking.hasPendingChanges(id)){
        const recovered=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[id]}]})
        if(!recovered.success)throw recovered.error??new Error(recovered.message??'蓝图 DataView 删除保存仍未确认')
      }
      const revision=++this.#revision,selectedNodeId=this.#nodeId
      const rows=await this.queryProjectRows(revision,selectedNodeId)
      this.#treeQueryLoaded=true
      if(rows.some(row=>row['rowid']===targetId&&row['SysId']===this.#projectId))throw new Error('蓝图 DataView 删除结果回读后目标仍存在')
      this.#unconfirmedDeleteId=undefined
      this.#unconfirmedDeleteParentId=undefined
      if(this.#nodeId===targetId)this.#nodeId=''
      this.#row=rows.find(row=>row['rowid']===selectedNodeId&&row['SysId']===this.#projectId)
      this.view.setCurrentRow(this.#row??null)
      return this.treeProjection()
    }
    if(this.hasUnconfirmedSave)throw new Error('蓝图 DataView 存在其他未确认保存')
    if(this.dirty)throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    for(const field of ['prowid','FunOrderValue'])if(!this.hasOutput(field))throw new Error(`蓝图 DataView 未正式输出树字段 ${field}`)

    const revision=++this.#revision,selectedNodeId=this.#nodeId
    const rows=await this.queryProjectRows(revision,selectedNodeId)
    this.#treeQueryLoaded=true
    this.#row=rows.find(row=>row['rowid']===selectedNodeId&&row['SysId']===this.#projectId)
    this.view.setCurrentRow(this.#row??null)
    this.treeProjection()

    const target=rows.find(row=>row['rowid']===targetId&&row['SysId']===this.#projectId)
    if(!target)throw new Error('蓝图 DataView 项目树未返回身份匹配的删除目标')
    if(target['rowid']!==targetId||target['SysId']!==projectId||String(target['prowid']??'').trim()!==parentId){
      throw new Error('蓝图 DataView 删除目标身份或父节点不匹配')
    }
    if(rows.some(row=>String(row['prowid']??'').trim()===targetId))throw new Error('蓝图 DataView 仅允许删除无子节点的普通叶子')
    if(this.view.deleteActionState(target)!=='enabled')throw new Error('蓝图 DataView 当前查询不允许删除目标节点')
    const id=this.view.getPkKey(target)
    if((typeof id!=='string'&&typeof id!=='number')||String(id)!==targetId)throw new Error('蓝图 DataView 正式主键与删除目标身份不匹配')

    const removed=await this.view.removeRow(id)
    if(removed!==true)throw new Error('蓝图 DataView 未准备目标删除变更')
    this.#unconfirmedDeleteId=id
    this.#unconfirmedDeleteParentId=parentId
    const saved=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[id]}]})
    if(!saved.success)throw saved.error??new Error(saved.message??'蓝图 DataView 删除保存失败')

    const readbackRevision=++this.#revision
    const confirmedRows=await this.queryProjectRows(readbackRevision,selectedNodeId)
    this.#treeQueryLoaded=true
    if(confirmedRows.some(row=>row['rowid']===targetId&&row['SysId']===this.#projectId))throw new Error('蓝图 DataView 删除保存后目标仍存在')
    this.#unconfirmedDeleteId=undefined
    this.#unconfirmedDeleteParentId=undefined
    if(this.#nodeId===targetId){this.#nodeId='';this.#row=undefined}
    else this.#row=confirmedRows.find(row=>row['rowid']===selectedNodeId&&row['SysId']===this.#projectId)
    this.view.setCurrentRow(this.#row??null)
    return this.treeProjection()
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
    this.view.setCurrentRow(this.#row??null)
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
    this.view.setCurrentRow(this.#row??null)
  }

  /** Create an unmounted root module through the current formal Base_NavigationInfo query owner. */
  public async addRootModule(): Promise<void> {
    this.assertUsable()
    if (this.isBusy) throw new Error('蓝图 DataView 正在查询或保存')
    if (this.hasUnconfirmedSave) {
      if (this.#unconfirmedRootId === undefined) throw new Error('蓝图 DataView 存在其他未确认保存')
      await this.saveIds([this.#unconfirmedRootId])
      await this.view.refresh()
      if (this.view.loadingError) throw this.view.loadingError
      this.treeProjection()
      return
    }
    if (this.#unconfirmedRootId !== undefined) {
      const id=this.#unconfirmedRootId
      const row=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===id)
      if (!row || !this.view.dirtyTracking.hasPendingChanges(id)) throw new Error('蓝图根模块已核验但当前没有可安全重试的原新增草稿')
      for (const field of Object.keys(this.#unconfirmedPatches.get(id)??{})) if (this.view.fieldAccess(row,field).write !== 'allowed') {
        throw new Error(`蓝图 DataView 当前查询不允许重试新增字段 ${field}`)
      }
      await this.commitRootModule(id,this.#unconfirmedPatches.get(id)??{})
      this.treeProjection()
      return
    }
    if (this.dirty) throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    if (!this.#treeQueryLoaded) throw new Error('蓝图 DataView 尚未加载项目树，不能新增根模块')
    if (this.view.addActionState() !== 'enabled') throw new Error('蓝图 DataView 当前查询不允许新增根模块')

    const input: Record<string, unknown> = {
      SysId: this.#projectId, prowid: '000000', name: '新模块', memo: '', funCode: '', personCharge: '', status: '',
      conType: 'Model', FunName: '新模块', FunOrderValue: '0', NavigationImageWxz: 'FolderOpened', NavigationUrl: '', MobileUrl: '',
      NavigationType: '', ChildItemLocation: 'Left', NavigationShowType: '', HorizontalAlignment: '',
      IsShowAtNav: '1', IsShowChildItem: '1', BeginGroup: '0', conid: '', htmlDesc: '',
    }
    for (const field of Object.keys(input)) {
      if (!this.hasOutput(field)) throw new Error(`蓝图 DataView 未正式输出根模块新增字段 ${field}`)
      const access = this.view.newRowFieldAccess(field)
      if (access.read !== 'visible' || access.write !== 'allowed') throw new Error(`蓝图 DataView 当前查询不允许新增字段 ${field}`)
    }
    const created = await this.view.addRow(input)
    if ('success' in created) throw new Error('蓝图 DataView 未准备出正式新增行')
    const row = created
    const id = this.view.getPkKey(row)
    if ((typeof id !== 'string' && typeof id !== 'number') || !String(id).trim() || row['rowid'] !== id
      || row['SysId'] !== this.#projectId || row['prowid'] !== '000000') throw new Error('蓝图 DataView owner 未准备有效根模块身份')
    if (this.view.rows.some(candidate => candidate !== row && this.view.getPkKey(candidate) === id)) throw new Error('蓝图 DataView owner 准备的根模块身份已存在')
    for (const field of Object.keys(input)) {
      const access = this.view.fieldAccess(row, field)
      if (access.read !== 'visible' || access.write !== 'allowed') throw new Error(`蓝图 DataView 新增行字段权限拒绝 ${field}`)
    }
    const validation = this.view.validator?.validateColumns(row, new Set(Object.keys(input)))
    if (validation && !validation.valid) throw new Error(validation.errors[0]?.message ?? '蓝图根模块字段校验失败')

    await this.commitRootModule(id,input)
  }

  private async commitRootModule(id:string|number,expected:Record<string,unknown>):Promise<void>{
    this.#unconfirmedIds = [id]
    this.#unconfirmedRootId = id
    this.#unconfirmedPatches = new Map([[id, {...expected}]])
    const saved = await this.dataSet.saveChanges({views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: [id]}]})
    if (!saved.success) throw saved.error ?? new Error(saved.message ?? '蓝图根模块保存失败')
    await this.view.refresh()
    if (this.view.loadingError) throw this.view.loadingError
    const confirmed = this.view.rows.find(candidate => this.view.getPkKey(candidate) === id && candidate['SysId'] === this.#projectId)
    if (!confirmed || Object.entries(expected).some(([field, value]) => !sameWireValue(confirmed[field], value))) {
      throw new Error('蓝图根模块保存后未通过 DataView 正式回读')
    }
    this.#row = this.view.rows.find(candidate => candidate['rowid'] === this.#nodeId && candidate['SysId'] === this.#projectId)
    this.#unconfirmedIds = []
    this.#unconfirmedPatches.clear()
    this.#unconfirmedRootId = undefined
  }

  public hasOutput(field: string): boolean {
    return this.#queryOutputFields.has(field)
  }

  public get hasPendingRootCreate(): boolean {return this.#unconfirmedRootId!==undefined}
  public get hasPendingChildCreate():boolean{return this.#unconfirmedChildId!==undefined||this.#pendingChildBatch!==undefined}

  /** Preflight and submit several stable leaf IDs under one existing parent in one DataSet batch. */
  public async addChildNodes(parentNodeId:string,children:readonly BlueprintChildNodeCreate[]):Promise<ReadonlyArray<string|number>>{
    const parentId=parentNodeId.trim()
    if(!parentId||parentId!==parentNodeId)throw new Error('蓝图 DataView 批量新增父节点身份无效')
    return this.addChildNodesAcrossParents(children.map(child=>({...child,parentNodeId:parentId})))
  }

  /** Preflight and submit stable leaf IDs under multiple existing parents in one DataSet batch. */
  public async addChildNodesAcrossParents(children:readonly BlueprintChildNodeCreateAtParent[]):Promise<ReadonlyArray<string|number>>{
    this.assertUsable()
    if(children.length<2)throw new Error('蓝图 DataView 批量新增至少需要两个叶节点')
    if(this.isBusy||this.hasUnconfirmedSave||this.#unconfirmedChildId!==undefined||this.#pendingChildBatch!==undefined)throw new Error('蓝图 DataView 正在保存或存在原子节点命令待核验')
    if(this.dirty)throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    if(!this.#treeQueryLoaded)throw new Error('蓝图 DataView 尚未加载完整项目树，不能批量新增')
    const parents=new Map<string,DataRow>()
    for(const child of children){
      const parentId=child.parentNodeId.trim()
      if(!parentId||parentId!==child.parentNodeId)throw new Error('蓝图 DataView 批量新增父节点身份无效')
      if(parents.has(parentId))continue
      const parent=this.requireCurrentParent(parentId)
      if(parent['SysId']!==this.#projectId||this.view.fieldAccess(parent,'rowid').read!=='visible'||this.view.fieldAccess(parent,'SysId').read!=='visible')throw new Error(`蓝图 DataView 未返回可识别的所选父节点 ${parentId}`)
      if(this.view.createChildActionState(parent)!=='enabled')throw new Error(`蓝图 DataView 当前查询不允许在父节点 ${parentId} 下新增子节点`)
      parents.set(parentId,parent)
    }

    const existingIds=new Set(this.view.rows.filter(row=>row['SysId']===this.#projectId).map(row=>String(row['rowid']??'').trim()))
    const seen=new Set<string>()
    const expectedEntries=children.map(child=>{
      const parentId=child.parentNodeId
      const parent=parents.get(parentId)
      if(!parent)throw new Error(`蓝图 DataView 批量新增父节点不在原查询行集中：${parentId}`)
      const id=child.nodeId.trim()
      if(!id||id!==child.nodeId||existingIds.has(id)||seen.has(id))throw new Error(`蓝图 DataView 批量新增稳定 rowid 缺失或重复：${child.nodeId}`)
      seen.add(id)
      const checked=this.preflightChildNode(parentId,{...child.fields})
      if(!this.hasOutput('rowid')||this.view.fieldAccess(parent,'rowid').read!=='visible')throw new Error('蓝图 DataView 未正式输出可读的稳定 rowid')
      const expected:Record<string,unknown>={...checked,rowid:id}
      if(expected['rowid']!==id||expected['SysId']!==this.#projectId||expected['prowid']!==parentId)throw new Error(`蓝图 DataView 批量新增目标身份或父节点不匹配：${id}`)
      return {id,parentId,parent,expected}
    })
    const ids=expectedEntries.map(item=>item.id)
    const expected=new Map(expectedEntries.map(item=>[item.id,Object.freeze({...item.expected})]))
    const added:string[]=[]
    try{
      for(const item of expectedEntries){
        const created=await this.view.addChildRow({parentRow:item.parent,parentField:'rowid',childForeignKey:'prowid',
          identity:{field:'rowid',value:item.id},data:Object.fromEntries(Object.entries(item.expected).filter(([field])=>field!=='prowid'&&field!=='rowid'))})
        if('success' in created)throw new Error(`蓝图 DataView 未准备批量新增行 ${item.id}`)
        const actualId=this.view.getPkKey(created)
        if((typeof actualId==='string'||typeof actualId==='number')&&this.view.dirtyTracking.hasPendingChanges(String(actualId)))added.push(String(actualId))
        if(actualId!==item.id||created['rowid']!==item.id||created['SysId']!==this.#projectId||created['prowid']!==item.parentId
          ||Object.entries(item.expected).some(([field,value])=>!sameWireValue(created[field],value))){
          throw new Error(`蓝图 DataView owner 未准备身份匹配的批量新增行 ${item.id}`)
        }
      }
    }catch(error){
      let rollbackError:unknown
      for(const id of added.reverse())try{
        const result=await this.view.removeRow(id)
        const succeeded=typeof result==='boolean'?result:result.success&&result.data!==false
        if(!succeeded||this.view.rows.some(row=>this.view.getPkKey(row)===id)
          ||this.view.dirtyTracking.hasPendingChanges(String(id))){
          rollbackError=new Error(`DataView removeRow 未确认清除新增草稿 ${id}`)
        }
      }catch(cause){rollbackError=cause}
      if(rollbackError!==undefined){
        this.#pendingChildBatch=Object.freeze({children:Object.freeze(children.map(child=>Object.freeze({...child,fields:Object.freeze({...child.fields})}))),
          ids:Object.freeze(ids),expected,state:'blocked'})
        throw new Error(`蓝图批量新增暂存失败且草稿回滚未确认；原命令已锁定：${String(rollbackError)}`)
      }
      throw error
    }

    this.#pendingChildBatch=Object.freeze({
      children:Object.freeze(children.map(child=>Object.freeze({...child,fields:Object.freeze({...child.fields})}))),
      ids:Object.freeze(ids),expected,state:'unknown'})
    try{
      const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[...ids]}]})
      this.assertBatchSaveCounts(result,ids.length)
      this.#pendingChildBatch=Object.freeze({...this.#pendingChildBatch,state:'accepted'})
    }catch(error){
      if(error instanceof Error&&error.message.includes('SPARK_SAVE_NOT_APPLIED'))this.#pendingChildBatch=Object.freeze({...this.#pendingChildBatch,state:'not-applied'})
      else if(!this.view.hasUnconfirmedSave)this.#pendingChildBatch=Object.freeze({...this.#pendingChildBatch,state:'blocked'})
      throw error
    }
    await this.verifyPendingChildBatch()
    return ids
  }

  private assertBatchSaveCounts(result:Awaited<ReturnType<DataSet['saveChanges']>>,expectedCount:number):void{
    const data=result.data
    if(!result.success||!data)throw new Error(`蓝图 DataView 批量新增回执计数不完整：期望 ${expectedCount} 个新增且无其他动作`)
    const viewResult=data.viewResults[0]
    if(data.viewCount!==1||data.viewResults.length!==1||!viewResult||data.createdCount!==expectedCount
      ||data.savedCount!==0||data.deletedCount!==0||data.failedCount!==0||data.failedEditingRows!==0
      ||data.appliedEditingRows!==0||viewResult.tableName!==this.view.tableName||viewResult.viewId!==this.view.viewId
      ||viewResult.createdCount!==expectedCount||viewResult.savedCount!==0||viewResult.deletedCount!==0
      ||viewResult.failedCount!==0||viewResult.failedEditingRows!==0){
      throw new Error(`蓝图 DataView 批量新增回执计数不完整：期望 ${expectedCount} 个新增且无其他动作`)
    }
  }

  private async verifyPendingChildBatch():Promise<void>{
    const pending=this.#pendingChildBatch
    if(!pending)throw new Error('蓝图 DataView 批量新增原命令缺失')
    if(pending.state==='not-applied'){
      this.assertPendingChildBatchReadyForRetry(pending)
      this.#pendingChildBatch=Object.freeze({...pending,state:'unknown'})
      try{
        const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[...pending.ids]}]})
        this.assertBatchSaveCounts(result,pending.ids.length)
        this.#pendingChildBatch=Object.freeze({...pending,state:'accepted'})
      }catch(error){
        if(error instanceof Error&&error.message.includes('SPARK_SAVE_NOT_APPLIED'))this.#pendingChildBatch=Object.freeze({...pending,state:'not-applied'})
        else this.#pendingChildBatch=Object.freeze({...pending,state:'blocked'})
        throw error
      }
      return this.verifyPendingChildBatch()
    }
    if(pending.state==='blocked')throw new Error('蓝图 DataView 批量新增原批次无法安全重放；请保留原ID和字段并重新读取实际结果')
    if(pending.state==='unknown'){
      if(!this.view.hasUnconfirmedSave)throw new Error('蓝图 DataView 批量新增未知回执已失去原查询捕获；拒绝重放')
      try{
        const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[...pending.ids]}]})
        this.assertBatchSaveCounts(result,pending.ids.length)
        this.#pendingChildBatch=Object.freeze({...pending,state:'accepted'})
      }catch(error){
        if(error instanceof Error&&error.message.includes('SPARK_SAVE_NOT_APPLIED'))this.#pendingChildBatch=Object.freeze({...pending,state:'not-applied'})
        else this.#pendingChildBatch=Object.freeze({...pending,state:'blocked'})
        throw error
      }
    }
    const revision=this.#revision,selectedNodeId=this.#nodeId
    await this.queryProjectRows(revision,selectedNodeId)
    this.#treeQueryLoaded=true
    this.treeProjection()
    for(const id of pending.ids){
      const matches=this.view.rows.filter(row=>row['rowid']===id&&row['SysId']===this.#projectId)
      const patch=pending.expected.get(id)
      const row=matches.at(0)
      if(matches.length!==1||!patch||!row)throw new Error(`蓝图 DataView 批量新增回读缺少唯一目标 ${String(id)}`)
      const command=pending.children.find(child=>child.nodeId===String(id))
      if(!command||row['prowid']!==command.parentNodeId){
        this.#pendingChildBatch=Object.freeze({...pending,state:'blocked'})
        throw new Error(`蓝图 DataView 批量新增正式回读父身份不一致：${String(id)}`)
      }
      if(Object.keys(patch).some(field=>this.view.fieldAccess(row,field).read!=='visible'||!Object.hasOwn(row,field)||!sameWireValue(row[field],patch[field]))){
        this.#pendingChildBatch=Object.freeze({...pending,state:'blocked'})
        throw new Error(`蓝图 DataView 批量新增逐行 wire 回读不一致：${String(id)}`)
      }
    }
    this.#pendingChildBatch=undefined
  }

  private assertPendingChildBatchReadyForRetry(pending:PendingChildCreateBatch):void{
    if(this.isBusy||this.hasUnconfirmedSave)throw new Error('蓝图 DataView 原批次重试前必须先核验任何未知回执')
    const parents=new Map<string,DataRow>()
    for(const child of pending.children){
      if(parents.has(child.parentNodeId))continue
      const parent=this.requireCurrentParent(child.parentNodeId)
      if(parent['SysId']!==this.#projectId||this.view.fieldAccess(parent,'rowid').read!=='visible'||this.view.fieldAccess(parent,'SysId').read!=='visible'
        ||this.view.createChildActionState(parent)!=='enabled')throw new Error(`蓝图 DataView 原批次重试的父身份或当次新增权限不可确认：${child.parentNodeId}`)
      parents.set(child.parentNodeId,parent)
    }
    const targetIds=new Set(pending.ids)
    for(const row of this.view.rows){
      const id=this.view.getPkKey(row)
      if(id!==undefined&&(this.view.hasEditingChanges(id)||this.view.dirtyTracking.hasPendingChanges(id))&&!targetIds.has(id)){
        throw new Error('蓝图 DataView 原批次重试不得夹带其他草稿')
      }
    }
    for(const id of pending.ids){
      const command=pending.children.find(child=>child.nodeId===String(id))
      const parent=command===undefined?undefined:parents.get(command.parentNodeId)
      const row=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===id)
      const expected=pending.expected.get(id)
      if(!row||!command||!parent||!expected||!this.view.dirtyTracking.hasPendingChanges(id)
        ||Object.entries(expected).some(([field,value])=>!Object.hasOwn(row,field)||!sameWireValue(row[field],value))){
        throw new Error(`蓝图 DataView 原批次重试的稳定ID或字段快照已变化：${String(id)}`)
      }
      const validation=this.view.validator?.validateColumns(row,new Set(Object.keys(expected)))
      if(validation&&!validation.valid)throw new Error(validation.errors[0]?.message??`蓝图 DataView 原批次字段校验失败：${String(id)}`)
      for(const field of Object.keys(expected))if(field!=='rowid'&&this.view.fieldAccess(parent,field).write!=='allowed'){
        throw new Error(`蓝图 DataView 原批次重试权限已失效：${field}`)
      }
    }
  }

  public assertCanAddChild(parentNodeId:string):void{
    this.assertUsable()
    if(this.isBusy||this.hasUnconfirmedSave)throw new Error('蓝图 DataView 正在保存或回执待核验')
    if(this.dirty)throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    const parent=this.requireCurrentParent(parentNodeId)
    if(this.view.fieldAccess(parent,'rowid').read!=='visible'||this.view.fieldAccess(parent,'SysId').read!=='visible')throw new Error('蓝图 DataView 未返回可识别的所选父节点')
    if(this.view.createChildActionState(parent)!=='enabled')throw new Error('蓝图 DataView 当前查询不允许在所选父节点下新增子节点')
  }

  private requireCurrentParent(parentNodeId:string):DataRow{
    const parent=this.view.rows.find(row=>row['rowid']===parentNodeId&&row['SysId']===this.#projectId)
    if(!parent)throw new Error('蓝图 DataView 未返回可识别的所选父节点')
    return parent
  }

  public preflightChildNode(parentNodeId:string,input:Record<string,unknown>):Record<string,unknown>{
    this.assertCanAddChild(parentNodeId)
    const parent=this.requireCurrentParent(parentNodeId)
    const expected={...input,SysId:this.#projectId,prowid:parentNodeId}
    for(const field of Object.keys(expected)){
      if(!this.hasOutput(field))throw new Error(`蓝图 DataView 未正式输出子节点新增字段 ${field}`)
      const access=this.view.fieldAccess(parent,field)
      if(access.write!=='allowed')throw new Error(`蓝图 DataView 当前查询不允许新增字段 ${field}`)
    }
    const validation=this.view.validator?.validateColumns(expected,new Set(Object.keys(expected)))
    if(validation&&!validation.valid)throw new Error(validation.errors[0]?.message??'蓝图子节点字段校验失败')
    return expected
  }

  public async addChildNode(parentNodeId:string,input:Record<string,unknown>,explicitNodeId?:string):Promise<string|number>{
    if(this.hasPendingChildCreate){
      const id=this.#unconfirmedChildId
      if(id===undefined)throw new Error('蓝图子节点待核验身份缺失')
      if(explicitNodeId!==undefined&&explicitNodeId!==id)throw new Error('蓝图子节点待核验身份与本次稳定节点ID不一致')
      const patch=this.#unconfirmedPatches.get(id)??{}
      if(this.#childReceiptState!=='accepted'){
        try{
          const recovered=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[id]}]})
          if(!recovered.success)throw recovered.error??new Error(recovered.message??'蓝图子节点回执仍未确认')
          this.#childReceiptState='accepted'
        }catch(error){if(this.view.hasUnconfirmedSave)this.#childReceiptState='unknown';else if(this.#childReceiptState==='pending')await this.clearPendingChildCreate(id);throw error}
      }
      await this.view.refresh();if(this.view.loadingError)throw this.view.loadingError
      const row=this.view.rows.find(item=>this.view.getPkKey(item)===id&&item['SysId']===this.#projectId&&item['prowid']===parentNodeId)
      if(!row||Object.entries(patch).some(([field,value])=>!sameWireValue(row[field],value)))throw new Error('蓝图子节点未知回执核验回读不一致')
      this.#unconfirmedIds=[];this.#unconfirmedPatches.clear();this.#unconfirmedChildId=undefined;this.#childReceiptState=undefined;return id
    }
    const expected=this.preflightChildNode(parentNodeId,input)
    const created=await this.view.addChildRow({
      parentRow:this.requireCurrentParent(parentNodeId),
      parentField:'rowid',childForeignKey:'prowid',
      ...(explicitNodeId===undefined?{}:{identity:{field:'rowid',value:explicitNodeId}}),
      data:Object.fromEntries(Object.entries(expected).filter(([field])=>field!=='prowid')),
    })
    if('success' in created)throw new Error('蓝图 DataView 未准备出正式新增行')
    const id=this.view.getPkKey(created)
    if((typeof id!=='string'&&typeof id!=='number')||!String(id).trim()||created['rowid']!==id||created['SysId']!==this.#projectId||created['prowid']!==parentNodeId){
      if((typeof id==='string'||typeof id==='number')&&this.view.rows.some(row=>this.view.getPkKey(row)===id&&this.view.dirtyTracking.hasPendingChanges(id)))await this.view.removeRow(id)
      throw new Error('蓝图 DataView owner 未准备有效子节点身份或父级绑定')
    }
    const validation=this.view.validator?.validateColumns(created,new Set(Object.keys(expected)))
    if(validation&&!validation.valid){await this.view.removeRow(id);throw new Error(validation.errors[0]?.message??'蓝图子节点字段校验失败')}
    this.#unconfirmedIds=[id];this.#unconfirmedPatches=new Map([[id,expected]]);this.#unconfirmedChildId=id;this.#childReceiptState='pending'
    let saved
    try{saved=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[id]}]})}
    catch(error){if(this.view.hasUnconfirmedSave)this.#childReceiptState='unknown';else await this.clearPendingChildCreate(id);throw error}
    if(!saved.success){await this.clearPendingChildCreate(id);throw saved.error??new Error(saved.message??'蓝图子节点保存失败')}
    this.#childReceiptState='accepted'
    await this.view.refresh();if(this.view.loadingError)throw this.view.loadingError
    const confirmed=this.view.rows.find(row=>this.view.getPkKey(row)===id&&row['SysId']===this.#projectId&&row['prowid']===parentNodeId)
    if(!confirmed||Object.entries(expected).some(([field,value])=>!sameWireValue(confirmed[field],value)))throw new Error('蓝图子节点保存后未通过 DataView 正式回读')
    this.#unconfirmedIds=[];this.#unconfirmedPatches.clear();this.#unconfirmedChildId=undefined;this.#childReceiptState=undefined
    return id
  }

  private async clearPendingChildCreate(id:string|number):Promise<void>{
    if(this.view.rows.some(row=>this.view.getPkKey(row)===id&&this.view.dirtyTracking.hasPendingChanges(id)))await this.view.removeRow(id)
    this.#unconfirmedIds=this.#unconfirmedIds.filter(item=>item!==id)
    this.#unconfirmedPatches.delete(id)
    if(this.#unconfirmedChildId===id){this.#unconfirmedChildId=undefined;this.#childReceiptState=undefined}
  }

  /** Read the selected editable node as a permission-filtered compatibility projection. */
  public nodeData(): BlueprintNodeFormData {
    const row=this.currentRow(),key=this.requireRowKey(row),overlay=this.view.getEditingRow(key)??row
    const visible:Record<string,unknown>={}
    for(const field of BLUEPRINT_WORKSPACE_FIELD_NAMES)if(this.hasOutput(field)&&this.view.fieldAccess(row,field).read==='visible'&&Object.hasOwn(overlay,field))visible[field]=overlay[field]
    const record=normalizeLowcodeProjectBlueprintRecords([visible])[0]
    if(!record)throw new Error('蓝图 DataView 当前行无法映射正式节点')
    const readable=(field:string):boolean=>Object.hasOwn(visible,field)
    const text=(field:string):string|undefined=>readable(field)?String(visible[field]??''):undefined
    const number=(field:string):number|undefined=>readable(field)?Number(visible[field]??0):undefined
    const flag=(field:string):boolean|undefined=>readable(field)?Number(visible[field]??0)!==0:undefined
    const navigationFields=['FunName','FunOrderValue','NavigationImageWxz','NavigationUrl','MobileUrl','NavigationType','ChildItemLocation',
      'NavigationShowType','HorizontalAlignment','IsShowAtNav','IsShowChildItem','BeginGroup']
    const hasNavigation=navigationFields.some(field=>readable(field)&&String(visible[field]??'').trim()!=='')
      ||(['IsShowAtNav','IsShowChildItem','BeginGroup'] as const).some(field=>readable(field)&&flag(field)===true)
    const navigation=hasNavigation?{
      ...(text('FunName')===undefined?{}:{title:text('FunName')}),
      ...(number('FunOrderValue')===undefined?{}:{order:number('FunOrderValue')}),
      ...(text('NavigationImageWxz')===undefined?{}:{icon:text('NavigationImageWxz')}),
      ...(text('NavigationUrl')===undefined?{}:{target:text('NavigationUrl')}),
      ...(text('MobileUrl')===undefined?{}:{mobileTarget:text('MobileUrl')}),
      ...(text('NavigationType')===undefined?{}:{openMode:record.navigation?.openMode}),
      ...(text('ChildItemLocation')===undefined?{}:{placement:record.navigation?.placement}),
      ...(text('NavigationShowType')===undefined?{}:{displayMode:text('NavigationShowType')}),
      ...(text('HorizontalAlignment')===undefined?{}:{horizontalAlignment:text('HorizontalAlignment')}),
      ...(flag('IsShowAtNav')===undefined?{}:{publishInMenu:flag('IsShowAtNav')}),
      ...(flag('IsShowChildItem')===undefined?{}:{showChildren:flag('IsShowChildItem')}),
      ...(flag('BeginGroup')===undefined?{}:{beginGroup:flag('BeginGroup')}),
    }:undefined
    const capability={
      ...(text('name')===undefined?{}:{name:text('name')}),
      ...(text('memo')===undefined?{}:{description:text('memo')}),
      ...(text('funCode')===undefined?{}:{code:text('funCode')}),
      ...(text('personCharge')===undefined?{}:{ownerId:text('personCharge')}),
      ...(text('status')===undefined?{}:{deliveryStatus:text('status')}),
    }
    return {
      nodeId:record.nodeId,parentNodeId:readable('prowid')?record.parentNodeId:'',projectId:record.projectId,
      kind:readable('conType')?record.kind:'unknown',
      capability,
      ...(navigation===undefined?{}:{navigation}),
      ...(record.dataSpace===undefined?{}:{dataSpace:{...record.dataSpace,models:record.dataSpace.models.map(model=>({...model}))}}),
      ...(record.prototype===undefined?{}:{prototype:{...record.prototype}}),source:{...record.source},
    }
  }

  /** Validate a domain projection without writing, so multi-owner commands can preflight before creating files. */
  public preflightNodeData(next:BlueprintNodeFormData):Record<string,unknown> {
    if(this.isBusy||this.hasUnconfirmedSave)throw new Error('蓝图 DataView 查询/保存期间或回执待核验时不能编辑')
    const row=this.currentRow(),before=this.nodeData()
    if(next.nodeId!==this.#nodeId||next.projectId!==this.#projectId||next.parentNodeId!==before.parentNodeId)throw new Error('蓝图节点编辑不得改变节点身份或父节点')
    if(next.kind!==before.kind&&!this.canWrite('conType'))throw new Error('蓝图 DataView 不允许写入正式字段 conType')
    const toRecord=(node:BlueprintNodeFormData):LowcodeProjectBlueprintRecord=>{
      const base=normalizeLowcodeProjectBlueprintRecords([node.source])[0]
      if(!base)throw new Error('蓝图 DataView 当前行缺少正式 wire 投影')
      const capability={name:node.capability.name??base.capability.name,...(node.capability.description===undefined?{}:{description:node.capability.description}),
        ...(node.capability.code===undefined?{}:{code:node.capability.code}),...(node.capability.ownerId===undefined?{}:{ownerId:node.capability.ownerId}),
        ...(node.capability.deliveryStatus===undefined?{}:{deliveryStatus:node.capability.deliveryStatus})}
      const navigation=node.navigation===undefined?undefined:{title:node.navigation.title??base.navigation?.title??'',order:node.navigation.order??base.navigation?.order??0,
        ...(node.navigation.icon===undefined?{}:{icon:node.navigation.icon}),...(node.navigation.placement===undefined?{}:{placement:node.navigation.placement}),
        ...(node.navigation.target===undefined?{}:{target:node.navigation.target}),...(node.navigation.mobileTarget===undefined?{}:{mobileTarget:node.navigation.mobileTarget}),
        ...(node.navigation.openMode===undefined?{}:{openMode:node.navigation.openMode}),...(node.navigation.displayMode===undefined?{}:{displayMode:node.navigation.displayMode}),
        ...(node.navigation.horizontalAlignment===undefined?{}:{horizontalAlignment:node.navigation.horizontalAlignment}),
        publishInMenu:node.navigation.publishInMenu??base.navigation?.publishInMenu??false,
        showChildren:node.navigation.showChildren??base.navigation?.showChildren??false,beginGroup:node.navigation.beginGroup??base.navigation?.beginGroup??false}
      const dataSpace=node.dataSpace===undefined?undefined:{scenarioId:node.dataSpace.scenarioId??base.dataSpace?.scenarioId??'',
        models:node.dataSpace.models??base.dataSpace?.models??[]}
      const prototype=node.prototype===undefined?undefined:{...(node.prototype.htmlDescription===undefined?{}:{htmlDescription:node.prototype.htmlDescription})}
      return {...base,kind:node.kind,capability,...(navigation===undefined?{}:{navigation}),...(dataSpace===undefined?{}:{dataSpace}),...(prototype===undefined?{}:{prototype})}
    }
    const beforeRecord=toRecord(before)
    const nextRecord=toRecord(next)
    const wireFields=BLUEPRINT_WORKSPACE_FIELD_NAMES.filter(field=>field!=='conType'||before.kind!=='unknown'||next.kind!=='unknown')
    const currentWire=lowcodeProjectBlueprintFields(beforeRecord,wireFields),nextWire=lowcodeProjectBlueprintFields(nextRecord,wireFields)
    const changed=Object.entries(nextWire).filter(([field,value])=>!sameWireValue(currentWire[field],value))
    for(const [field] of changed){
      if(!this.hasOutput(field)||!Object.hasOwn(row,field)||this.view.fieldAccess(row,field).read!=='visible'||!this.canWrite(field))throw new Error(`蓝图 DataView 不允许读写正式字段 ${field}`)
    }
    const patch=Object.fromEntries(changed)
    const validation=this.view.validator?.validateColumns({...row,...patch},new Set(changed.map(([field])=>field)))
    if(validation&&!validation.valid)throw new Error(validation.errors[0]?.message??'蓝图字段校验失败')
    return patch
  }

  /** Apply a domain projection by diffing through the canonical wire mapper and preflighting every changed field. */
  public updateNodeData(next:BlueprintNodeFormData):void {
    const patch=this.preflightNodeData(next),row=this.currentRow(),key=this.requireRowKey(row)
    for(const [field,value] of Object.entries(patch))this.view.updateEditingValue(key,field,value)
  }

  /** Preflight every requested existing node before applying any edit overlay. */
  public async preflightNodeDataBatch(nodes:readonly BlueprintNodeFormData[]):Promise<readonly BlueprintNodeDataBatchItem[]>{
    if(nodes.length<2)throw new Error('蓝图 DataView 多节点更新至少需要两个目标')
    const seen=new Set<string>()
    const prepared:BlueprintNodeDataBatchItem[]=[]
    for(const node of nodes){
      if(seen.has(node.nodeId))throw new Error(`蓝图 DataView 重复更新目标 ${node.nodeId}`)
      seen.add(node.nodeId)
      await this.load(node.nodeId)
      const patch=this.preflightNodeData(node),row=this.currentRow(),key=this.requireRowKey(row)
      prepared.push({nodeId:node.nodeId,key,patch,node})
    }
    return prepared
  }

  /** Stage preflighted existing-node updates on their formal DataView row identities. */
  public updateNodeDataBatch(prepared:readonly BlueprintNodeDataBatchItem[]):void{
    if(prepared.length<2||new Set(prepared.map(item=>item.nodeId)).size!==prepared.length)throw new Error('蓝图 DataView 多节点暂存身份无效')
    for(const item of prepared){const row=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===item.key);if(row?.['rowid']!==item.nodeId||row['SysId']!==this.#projectId)throw new Error(`蓝图 DataView 多节点暂存身份已变化 ${item.nodeId}`)}
    try{for(const {key,patch} of prepared)for(const [field,value] of Object.entries(patch))this.view.updateEditingValue(key,field,value)}
    catch(error){
      try{
        this.view.discardPendingChanges(prepared.map(item=>item.key))
        const remaining=prepared.filter(({key})=>this.view.getEditingPatch(key)!==undefined||this.view.dirtyTracking.hasPendingChanges(key))
        if(remaining.length>0)throw new Error(`蓝图批量编辑回滚未清理目标 ${remaining.map(item=>String(item.key)).join(', ')}`)
      }catch(rollbackError){
        this.#batchStageBlocked=true
        throw new Error(`蓝图批量暂存失败且原 DataView 目标仍待处理：${error instanceof Error?error.message:String(error)}；回滚失败：${rollbackError instanceof Error?rollbackError.message:String(rollbackError)}`)
      }
      throw error
    }
  }

  /** Save exactly the requested preflighted rows through this DataSet and verify every changed field. */
  public async saveNodes(nodeIds:readonly string[]):Promise<void>{
    if(nodeIds.length<2||new Set(nodeIds).size!==nodeIds.length)throw new Error('蓝图 DataView 多节点保存身份无效')
    const ids=nodeIds.map(nodeId=>{
      const row=this.view.rows.find(candidate=>candidate['rowid']===nodeId&&candidate['SysId']===this.#projectId)
      if(!row)throw new Error(`蓝图 DataView 保存目标不是当前项目正式行 ${nodeId}`)
      const key=this.view.getPkKey(row)
      if((typeof key!=='string'&&typeof key!=='number')||String(key)!==nodeId)throw new Error(`蓝图 DataView 正式主键与节点身份不匹配 ${nodeId}`)
      return key
    })
    await this.saveIds(ids,ids.length)
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

  public childCreateActionState(parentNodeId:string):'enabled'|'hidden'|'disabled'|'unknown'{
    this.assertUsable()
    if(!this.#treeQueryLoaded)return 'unknown'
    const parent=this.view.rows.find(row=>row['rowid']===parentNodeId&&row['SysId']===this.#projectId)
    if(!parent)return 'unknown'
    return this.view.createChildActionState(parent)
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

  public canWriteFields(fields:readonly string[]):boolean{return fields.length>0&&fields.every(field=>this.canWrite(field))}

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
    if(this.#unconfirmedDeleteId!==undefined)throw new Error('蓝图 DataView 删除结果待核验，不能取消')
    if (!this.dirty) return
    const ids=this.view.rows.map(row=>this.view.getPkKey(row)).filter((id):id is string|number=>id!==undefined)
      .filter(id=>this.view.hasEditingChanges(id)||this.view.dirtyTracking.hasPendingChanges(id))
    this.view.discardPendingChanges(ids)
    if(this.#batchStageBlocked){
      const blockedIds=this.view.rows.map(row=>this.view.getPkKey(row)).filter((id):id is string|number=>id!==undefined)
      if(blockedIds.some(id=>this.view.getEditingPatch(id)!==undefined||this.view.dirtyTracking.hasPendingChanges(id)))throw new Error('蓝图 DataView 批量失败状态仍有未清理目标')
      this.#batchStageBlocked=false
    }
    this.#row=this.view.rows.find(candidate=>candidate['rowid']===this.#nodeId&&candidate['SysId']===this.#projectId)
    this.view.setCurrentRow(this.#row??null)
  }

  public async save(): Promise<void> {
    this.assertUsable()
    if(this.isBusy)throw new Error('蓝图 DataView 正在查询或保存')
    if(this.#unconfirmedDeleteId!==undefined){
      const id=String(this.#unconfirmedDeleteId),parentId=this.#unconfirmedDeleteParentId
      if(!parentId)throw new Error('蓝图 DataView 删除待核验缺少原父节点身份')
      await this.removeLeafNode(id,this.#projectId,parentId)
      return
    }
    if(this.#pendingChildBatch!==undefined){await this.verifyPendingChildBatch();return}
    if(this.#unconfirmedChildId!==undefined){
      const id=this.#unconfirmedChildId
      const row=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===id)
      const expected=this.#unconfirmedPatches.get(id)
      if(!row||!expected)throw new Error('蓝图 DataView 子节点待核验缺少原命令行或字段快照')
      if(['rowid','SysId','prowid'].some(field=>this.view.fieldAccess(row,field).read!=='visible'))throw new Error('蓝图 DataView 子节点待核验身份字段不可读')
      const parentId=typeof expected['prowid']==='string'?expected['prowid'].trim():''
      if(!parentId||row['rowid']!==id||row['SysId']!==this.#projectId||row['prowid']!==parentId)throw new Error('蓝图 DataView 子节点待核验目标或父身份不匹配')
      const parent=this.view.rows.find(candidate=>candidate['rowid']===parentId&&candidate['SysId']===this.#projectId)
      if(!parent||this.view.fieldAccess(parent,'rowid').read!=='visible'||this.view.fieldAccess(parent,'SysId').read!=='visible')throw new Error('蓝图 DataView 子节点待核验父节点不可识别')
      await this.addChildNode(parentId,{})
      return
    }
    await this.saveIds()
  }

  /** Save only the selected node; any staged changes on other rows remain untouched. */
  public async saveSelectedNode():Promise<void>{
    if(this.hasUnconfirmedSave||this.#unconfirmedIds.length>0){
      if(this.#unconfirmedIds.length!==1||this.#unconfirmedIds[0]!==this.#nodeId)throw new Error('蓝图 DataView 核验须包含原提交全部节点')
      await this.saveIds([this.#nodeId])
      return
    }
    const id=this.requireRowKey(this.currentRow())
    const dirtyIds=this.view.rows.map(row=>this.view.getPkKey(row)).filter((key):key is string|number=>key!==undefined)
      .filter(key=>this.view.hasEditingChanges(key)||this.view.dirtyTracking.hasPendingChanges(key))
    if(dirtyIds.some(key=>key!==id))throw new Error('蓝图 DataView 存在其他节点的待保存修改，请先单独保存或取消')
    await this.saveIds([id])
  }

  private async saveIds(targetIds?:Array<string|number>,expectedSavedCount?:number): Promise<void> {
    this.assertUsable()
    if(this.#batchStageBlocked)throw new Error('蓝图 DataView 批量暂存回滚未确认，保存已阻断')
    if (this.isBusy) throw new Error('蓝图 DataView 正在查询或保存')
    const targetNodeId=this.#nodeId, revision=this.#revision
    if (this.hasUnconfirmedSave || this.#unconfirmedIds.length>0) {
      if(targetIds&&this.#unconfirmedIds.some(id=>!targetIds.includes(id)))throw new Error('蓝图 DataView 核验须包含原提交全部节点')
      if (this.hasUnconfirmedSave) {
        const recovered = await this.dataSet.saveChanges({views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: this.#unconfirmedIds}]})
        this.assertTarget(revision, targetNodeId)
        if (!recovered.success) throw recovered.error ?? new Error(recovered.message ?? '蓝图 DataView 未确认保存仍无法核验')
      }
      await this.view.refresh()
      this.assertTarget(revision, targetNodeId)
      if (this.view.loadingError) throw this.view.loadingError
      const recoveryTargetId=targetNodeId||String(this.#unconfirmedIds[0]??'')
      const recoveredRow = this.view.rows.find(candidate => candidate['rowid'] === recoveryTargetId && candidate['SysId'] === this.#projectId)
      if (!recoveredRow) throw new Error('蓝图 DataView 核验后未读回目标行')
      for(const [key,patch] of this.#unconfirmedPatches){const confirmed=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===key);if(!confirmed)throw new Error(`蓝图行 ${String(key)} 核验后未读回`);for(const [field,value] of Object.entries(patch))if(!Object.is(confirmed[field],value))throw new Error(`蓝图字段 ${field} 核验回读不一致`)}
      this.#row = targetNodeId?recoveredRow:undefined
      this.#unconfirmedIds=[];this.#unconfirmedPatches.clear()
      this.#unconfirmedRootId=undefined
      return
    }
    if(this.#nodeId)this.currentRow()
    const ids=targetIds??this.view.rows.map(candidate=>this.view.getPkKey(candidate)).filter((key):key is string|number=>key!==undefined)
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
    const saveData=result.data
    if(expectedSavedCount!==undefined&&(saveData?.savedCount!==expectedSavedCount||saveData.failedCount!==0))throw new Error(`蓝图 DataView 批量保存回执计数不匹配：expected=${expectedSavedCount} saved=${saveData?.savedCount??'unknown'} failed=${saveData?.failedCount??'unknown'}`)
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
