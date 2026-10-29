/**
 * @module app:services/project/blueprint-workspace-dataview
 * 职责：通过当前项目的蓝图 DataView 统一查询、编辑覆盖、取消和 DataSet 保存，并提供同源树投影。
 * 边界：动态项目绑定正式 Base_NavigationInfo，仓内 AppWorks 绑定RepositoryBlueprintNode文件视图；不复制业务草稿。
 * 字段读写只依据当前 DataView 查询结果，不将仓内只读资源解释为数据库权限。
 */
import {buildDataViewKey, DataViewFilter, RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY, lowcodeProjectBlueprintFields, normalizeLowcodeProjectBlueprintRecords, validateLowcodeProjectBlueprintRecords, type LowcodeProjectBlueprintRecord} from '@spark-appworks/spark-lowcode-api'
import type {PageRuntime, ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData} from '@spark-appworks/spark-project-model'
import {getBuiltinApplicationDescriptor} from '@/registries/builtin-application-registry'
import {BUILTIN_BLUEPRINT_NODE_RESOURCE_ID, BUILTIN_BLUEPRINT_NODE_TABLE_NAME} from '@/lowcode/resources/shared/builtin-blueprint-node-resource'

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

/** Explicit pure move/reorder command emitted by the project-planning diff. */
export type BlueprintLeafMoveBatchCommand=Readonly<{
  /** `move` reparents an existing leaf; `reorder` changes only an existing sibling's formal order. */
  kind:'move'|'reorder'
  /** Existing rowid from the complete original project tree. */
  nodeId:string
  /** Parent identity in the target tree; must also exist in the original same-project tree. */
  parentNodeId:string
  /** Original parent identity captured by the replacement plan. */
  previousParentNodeId?:string
  /** Target depth and sibling position from the explicit replacement plan. */
  depth:number
  siblingIndex:number
  /** Exact formal wire fields for this command; only `prowid` and `FunOrderValue` are accepted. */
  fields:Readonly<Record<string,string|number>>
}>

/** Named inputs for one preflighted AI move/reorder batch. */
export type BlueprintLeafMoveBatchOptions=Readonly<{
  /** Complete original tree used by the planner. */
  beforeTree:ProjectBlueprintTreeData
  /** Explicit wire move/reorder commands from the plan. */
  commands:readonly BlueprintLeafMoveBatchCommand[]
  /** Complete target tree represented by those commands. */
  expectedTree:ProjectBlueprintTreeData
  /** Called after owner preflight and immediately before staging. */
  beforeStage?:()=>boolean
}>

type StageMoveFromRowsCommand=Readonly<{
  nodeKey:string
  parentId:string|null
  index:number
  rows:readonly DataRow[]
  projectId:string
}>

type PendingChildCreateBatch=Readonly<{
  children:readonly BlueprintChildNodeCreateAtParent[]
  updates:ReadonlyArray<Readonly<{nodeId:string;parentNodeId:string;patch:Readonly<Record<string,unknown>>}>>
  ids:ReadonlyArray<string|number>
  expected:ReadonlyMap<string|number,Readonly<Record<string,unknown>>>
  state:'unknown'|'accepted'|'not-applied'|'blocked'
  submitted:boolean
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
  #tableName = MODEL_NAME
  #viewId = VIEW_NAME
  #readOnlySource = false
  #nodeId = ''
  #revision = 0
  #disposed = false
  #treeQueryLoaded = false
  #loadInFlight: Promise<unknown> | undefined
  #unconfirmedIds: Array<string | number> = []
  #unconfirmedPatches = new Map<string | number, Record<string, unknown>>()
  #acceptedReceiptPending = false
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
    private assertCurrent: () => void,
  ) {
    this.#projectId = projectId.trim()
    if (!this.#projectId) throw new Error('蓝图 DataView 缺少项目身份')
    if (dataSet.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY) throw new Error('蓝图 DataView 场景身份不匹配')
    const repositoryTable=dataSet.getTable(BUILTIN_BLUEPRINT_NODE_TABLE_NAME)
    const repositoryView=dataSet.getView(BUILTIN_BLUEPRINT_NODE_TABLE_NAME,VIEW_NAME)
    if(this.#projectId===getBuiltinApplicationDescriptor().id){
      if(!repositoryTable||!repositoryView
        ||repositoryTable.resourceType!=='file'||repositoryTable.resourceId!==BUILTIN_BLUEPRINT_NODE_RESOURCE_ID||repositoryTable.modelBinding){
        throw new Error('BUILTIN_BLUEPRINT_IDENTITY: 仓内蓝图文件视图不能绑定到当前项目或模型')
      }
      this.#tableName=BUILTIN_BLUEPRINT_NODE_TABLE_NAME
      this.#readOnlySource=true
      this.view=repositoryView
    }else{
      const table = dataSet.getTable(MODEL_NAME)
      const view = dataSet.getView(MODEL_NAME, VIEW_NAME)
      if (!table || !view || table.modelBinding?.modelName !== MODEL_NAME || !table.modelBinding.modelId.trim()) {
        throw new Error('蓝图 DataView 未绑定正式 Base_NavigationInfo 模型')
      }
      this.view = view
    }
    this.view.commitMode = 'staged'
    const queryOutputFields = new Set(this.view.queryColumns.map(column => column.name))
    const queryFields = BLUEPRINT_WORKSPACE_FIELD_NAMES.filter(field => queryOutputFields.has(field))
    this.#queryOutputFields = new Set(queryFields)
    if (!queryOutputFields.has('rowid') || !queryOutputFields.has('SysId')) {
      throw new Error('蓝图 DataView 缺少正式可输出的 rowid 或 SysId')
    }
    this.view.autoLoad = false
    this.view.queryConfig = {...this.view.queryConfig, fields: queryFields, allPages: false, maxRows: MAX_BLUEPRINT_ROWS, autoQuery: false}
  }

  public get projectId(): string {return this.#projectId}
  /** Standard component binding for this owner: formal model key, or the exact trusted local-file DataView. */
  public get standardComponentBinding(): Readonly<{dataViewKey?: string}> {
    const scenarioId=this.view.dataSet?.scenarioId
    const modelName=this.view.dataTable?.modelBinding?.modelName
    if(scenarioId&&modelName)return {dataViewKey:buildDataViewKey(modelName,this.view.viewId,scenarioId)}
    if(this.#readOnlySource&&scenarioId===LOWCODE_APPLICATION_CATALOG_FORM_KEY
      &&this.view.tableName===BUILTIN_BLUEPRINT_NODE_TABLE_NAME
      &&this.view.dataTable?.resourceType==='file'
      &&this.view.dataTable.resourceId===BUILTIN_BLUEPRINT_NODE_RESOURCE_ID
      &&!this.view.dataTable.modelBinding)return {dataViewKey:buildDataViewKey(this.view.tableName,this.view.viewId,scenarioId)}
    return {}
  }
  /** Rebind the parked owner to a newly acquired same-project DevSystem scope. */
  public rebindScope(assertCurrent: () => void): void {
    if (this.#disposed) throw new Error('蓝图 DataView owner 已释放，不能重新绑定作用域')
    this.assertCurrent = assertCurrent
  }
  public get nodeId(): string {return this.#nodeId}
  public get row(): DataRow | undefined {
    const row=this.view.currentRow
    return row?.['rowid']===this.#nodeId&&row['SysId']===this.#projectId?row:undefined
  }
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
    this.view.setCurrentRow(null)
    if(this.#treeQueryLoaded){
      const row=this.view.rows.find(candidate=>candidate['rowid']===targetNodeId&&candidate['SysId']===this.#projectId)
      if(!row)throw new Error(`蓝图 DataView 项目树未返回目标行 ${targetNodeId}`)
      if(this.view.fieldAccess(row,'rowid').read!=='visible'||this.view.fieldAccess(row,'SysId').read!=='visible')throw new Error('蓝图 DataView 当前行身份不可读')
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
      this.synchronizeCurrentRow()
      return this.treeProjection()
    }catch(error){this.#treeQueryLoaded=false;throw error}
  }

  /** Load the same permission-filtered records for consumers that need rows instead of a tree. */
  public async loadProjectRecords(): Promise<readonly LowcodeProjectBlueprintRecord[]> {
    this.assertUsable()
    if (this.isBusy || this.hasUnconfirmedSave) throw new Error('蓝图 DataView 正在保存或回执待核验，不能加载项目记录')
    if (this.dirty) throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    for (const field of ['rowid', 'SysId', 'prowid', 'FunOrderValue']) if (!this.hasOutput(field)) throw new Error(`蓝图 DataView 未正式输出树字段 ${field}`)
    const revision = ++this.#revision, selectedNodeId = this.#nodeId
    await this.queryProjectRows(revision, selectedNodeId)
    this.#treeQueryLoaded = true
    return this.projectedRecords()
  }

  /** Delete one ordinary leaf through the current project tree DataView and confirm it by readback. */
  public async removeLeafNode(nodeId:string,expectedProjectId:string,expectedParentNodeId:string):Promise<ProjectBlueprintTreeData>{
    this.assertWritable()
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
      this.synchronizeCurrentRow()
      return this.treeProjection()
    }
    if(this.hasUnconfirmedSave)throw new Error('蓝图 DataView 存在其他未确认保存')
    if(this.dirty)throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    for(const field of ['prowid','FunOrderValue'])if(!this.hasOutput(field))throw new Error(`蓝图 DataView 未正式输出树字段 ${field}`)

    const revision=++this.#revision,selectedNodeId=this.#nodeId
    const rows=await this.queryProjectRows(revision,selectedNodeId)
    this.#treeQueryLoaded=true
    this.synchronizeCurrentRow()
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
    if(this.#nodeId===targetId)this.#nodeId=''
    this.synchronizeCurrentRow()
    return this.treeProjection()
  }

  /** Temporarily widens this same DataView to project rows and stages a permission-checked move. */
  public async moveNode(nodeId: string, parentId: string | null, index: number): Promise<void> {
    this.assertWritable()
    if (this.isBusy || this.hasUnconfirmedSave) throw new Error('蓝图 DataView 正在保存或回执待核验，不能移动节点')
    if (this.dirty) throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    if (!Number.isSafeInteger(index) || index < 0) throw new Error('蓝图节点位置无效')
    for (const field of ['prowid', 'FunOrderValue']) if (!this.hasOutput(field)) throw new Error(`蓝图 DataView 未正式输出树字段 ${field}`)
    const nodeKey=nodeId.trim(), revision=++this.#revision, projectId=this.#projectId, selectedNodeId=this.#nodeId
    const rows=await this.queryProjectRows(revision,selectedNodeId)
    this.#treeQueryLoaded=true
    this.synchronizeCurrentRow()
    try{this.treeProjection()}catch(error){this.#treeQueryLoaded=false;throw error}
    this.stageMoveFromRows({nodeKey,parentId,index,rows,projectId})
  }

  /** Resolve a renderer drop against fresh rows from this same DataView, then stage its permission-checked move. */
  public async moveNodeRelative(command:Readonly<{nodeId:string;targetNodeId:string;position:'before'|'after'|'inner'}>):Promise<void>{
    this.assertWritable()
    if(this.isBusy||this.hasUnconfirmedSave)throw new Error('蓝图 DataView 正在保存或回执待核验，不能移动节点')
    if(this.dirty)throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    for(const field of ['prowid','FunOrderValue'])if(!this.hasOutput(field))throw new Error(`蓝图 DataView 未正式输出树字段 ${field}`)
    const nodeKey=command.nodeId.trim(),targetKey=command.targetNodeId.trim(),projectId=this.#projectId
    if(!nodeKey||!targetKey||nodeKey===targetKey)throw new Error('蓝图节点相对位置命令身份无效')
    const revision=++this.#revision,selectedNodeId=this.#nodeId
    const rows=await this.queryProjectRows(revision,selectedNodeId)
    this.#treeQueryLoaded=true
    this.synchronizeCurrentRow()
    try{this.treeProjection()}catch(error){this.#treeQueryLoaded=false;throw error}
    const byId=new Map(rows.map(row=>[String(row['rowid']),row]))
    const moving=byId.get(nodeKey),target=byId.get(targetKey)
    if(!moving||!target)throw new Error('蓝图 DataView 未返回相对移动目标的正式行')
    const normalizedParent=(row:DataRow)=>String(row['prowid']??'000000').trim()||'000000'
    const targetParent=command.position==='inner'?targetKey:normalizedParent(target)
    const siblings=(parent:string)=>rows.filter(row=>normalizedParent(row)===parent&&row!==moving)
      .sort((a,b)=>Number(a['FunOrderValue']??0)-Number(b['FunOrderValue']??0)||String(a['rowid']).localeCompare(String(b['rowid'])))
    const destination=siblings(targetParent)
    let index=destination.length
    if(command.position!=='inner'){
      const targetIndex=destination.findIndex(row=>String(row['rowid'])===targetKey)
      if(targetIndex<0)throw new Error('蓝图 DataView 相对排序目标不是当前目标父级的正式子节点')
      index=targetIndex+(command.position==='after'?1:0)
    }
    this.stageMoveFromRows({nodeKey,parentId:targetParent,index,rows,projectId})
  }

  private stageMoveFromRows(command:StageMoveFromRowsCommand):void{
    const {nodeKey,parentId,index,rows,projectId}=command
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
    this.synchronizeCurrentRow()
  }

  /** Preflight, stage and save one AI pure leaf-move/reorder command through this DataView. */
  public async applyLeafMoveBatch(options:BlueprintLeafMoveBatchOptions):Promise<void>{
    const {beforeTree,commands,expectedTree,beforeStage}=options
    this.assertWritable()
    if(commands.length===0||!commands.some(command=>command.kind==='move'))throw new Error('蓝图 DataView 仅接受含移动命令的纯 move/reorder 批次')
    if(this.isBusy||this.hasUnconfirmedSave||this.#unconfirmedIds.length>0||this.#pendingChildBatch!==undefined||this.#unconfirmedDeleteId!==undefined)throw new Error('蓝图 DataView 正在保存或原命令待核验')
    if(this.dirty||!this.#treeQueryLoaded)throw new Error('蓝图 DataView 移动批次要求干净且已完整加载的项目树')
    for(const field of ['rowid','SysId','prowid','FunOrderValue'])if(!this.hasOutput(field))throw new Error(`蓝图 DataView 未正式输出树字段 ${field}`)
    const revision=++this.#revision,selectedNodeId=this.#nodeId
    const rows=await this.queryProjectRows(revision,selectedNodeId)
    this.#treeQueryLoaded=true
    this.synchronizeCurrentRow()
    const current=this.treeProjection()
    const flatten=(root:ProjectBlueprintTreeNodeData):ProjectBlueprintTreeNodeData[]=>[root,...(root.children??[]).flatMap(flatten)]
    const beforeNodes=flatten(beforeTree),currentNodes=flatten(current),targetNodes=flatten(expectedTree)
    const index=(nodes:readonly ProjectBlueprintTreeNodeData[])=>new Map(nodes.map(node=>[node.nodeId,node]))
    const wireFields=(node:ProjectBlueprintTreeNodeData):Record<string,string|number>=>{
      const record=normalizeLowcodeProjectBlueprintRecords([node.source])[0]
      if(!record)throw new Error(`蓝图 DataView 移动节点缺少正式 wire 投影：${node.nodeId}`)
      return lowcodeProjectBlueprintFields({...record,parentNodeId:node.parentNodeId,...(node.navigation===undefined?{}:{navigation:node.navigation})})
    }
    const stableValue=(value:unknown):string=>{
      if(Array.isArray(value))return `[${value.map(stableValue).join(',')}]`
      if(value!==null&&typeof value==='object')return `{${Object.entries(value).filter(([,entry])=>entry!==undefined).sort(([left],[right])=>left.localeCompare(right)
        ).map(([key,entry])=>`${JSON.stringify(key)}:${stableValue(entry)}`).join(',')}}`
      return String(JSON.stringify(value))
    }
    const beforeById=index(beforeNodes),currentById=index(currentNodes),targetById=index(targetNodes)
    if(beforeTree.projectId!==this.#projectId||expectedTree.projectId!==this.#projectId||beforeTree.nodeId!==current.nodeId||expectedTree.nodeId!==current.nodeId
      ||beforeById.size!==currentById.size||currentById.size!==targetById.size
      ||[...currentById.keys()].some(id=>!beforeById.has(id)||!targetById.has(id)))throw new Error('蓝图 DataView 移动批次项目或原树身份不匹配')
    const nodeFields=(node:ProjectBlueprintTreeNodeData)=>({nodeId:node.nodeId,projectId:node.projectId,kind:node.kind,capability:node.capability,
      navigation:node.navigation?{...node.navigation,order:0}:undefined,dataSpace:node.dataSpace,prototype:node.prototype,
      source:{...node.source,prowid:'',FunOrderValue:''}})
    for(const [id,currentNode] of currentById){const before=beforeById.get(id);if(before?.projectId!==this.#projectId||before.parentNodeId!==currentNode.parentNodeId
      ||String(wireFields(before)['FunOrderValue'])!==String(wireFields(currentNode)['FunOrderValue'])||stableValue(nodeFields(before))!==stableValue(nodeFields(currentNode))
      ||String(before.source['rowid'])!==id||String(before.source['SysId'])!==this.#projectId)throw new Error(`蓝图 DataView 移动批次原树已变化或身份无效：${id}`)}
    const commandById=new Map<string,BlueprintLeafMoveBatchCommand>()
    for(const command of commands){
      if(!command.nodeId||commandById.has(command.nodeId))throw new Error(`蓝图 DataView 移动批次目标重复或无效：${command.nodeId}`)
      commandById.set(command.nodeId,command)
    }
    const movingIds=new Set(commands.filter(command=>command.kind==='move').map(command=>command.nodeId))
    if(commands.some(command=>command.kind==='move'&&movingIds.has(command.parentNodeId)))throw new Error('蓝图 DataView 移动批次禁止目标父节点与移动叶节点同批')
    const changedIds=new Set<string>()
    for(const [id,before] of beforeById){
      const target=targetById.get(id);if(!target)throw new Error(`蓝图 DataView 移动批次目标树缺少原节点 ${id}`)
      if(before.parentNodeId!==target.parentNodeId||String(wireFields(before)['FunOrderValue'])!==String(wireFields(target)['FunOrderValue']))changedIds.add(id)
      const beforeRest=nodeFields(before),targetRest=nodeFields(target)
      if(stableValue(beforeRest)!==stableValue(targetRest))throw new Error(`蓝图 DataView 纯移动批次包含非位置字段修改：${id}`)
    }
    if(changedIds.size!==commandById.size||[...changedIds].some(id=>!commandById.has(id)))throw new Error('蓝图 DataView move/reorder 命令未精确覆盖目标父关系与排序变化')
    const patches:Array<{id:string;key:string|number;row:DataRow;patch:Record<string,unknown>}>=[]
    for(const [id,command] of commandById){
      const original=beforeById.get(id),target=targetById.get(id),row=rows.find(candidate=>candidate['rowid']===id&&candidate['SysId']===this.#projectId)
      if(!original||!target||!row||String(this.view.getPkKey(row))!==id||this.view.fieldAccess(row,'rowid').read!=='visible'||this.view.fieldAccess(row,'SysId').read!=='visible')throw new Error(`蓝图 DataView 移动目标身份无效：${id}`)
      const patch={...command.fields}
      const keys=Object.keys(patch)
      if(command.kind==='move'){
        if((original.children?.length??0)>0||command.previousParentNodeId!==original.parentNodeId||command.parentNodeId!==target.parentNodeId||command.parentNodeId===id
          ||!beforeById.has(command.parentNodeId)||!Object.hasOwn(patch,'prowid')||String(patch['prowid'])!==target.parentNodeId||keys.some(field=>field!=='prowid'&&field!=='FunOrderValue'))throw new Error(`蓝图 DataView 仅允许重挂原树叶节点到原树父节点：${id}`)
      }else if(command.previousParentNodeId!==original.parentNodeId||command.parentNodeId!==original.parentNodeId||target.parentNodeId!==original.parentNodeId
        ||keys.length!==1||keys[0]!=='FunOrderValue')throw new Error(`蓝图 DataView reorder 仅允许同父显式排序字段：${id}`)
      const depth=(nodeId:string):number|undefined=>{let cursor=targetById.get(nodeId),value=0;const visited=new Set<string>();while(cursor){if(visited.has(cursor.nodeId))return undefined;visited.add(cursor.nodeId);if(cursor.nodeId===expectedTree.nodeId)return value;value++;cursor=targetById.get(cursor.parentNodeId)}return undefined}
      const targetDepth=depth(id)
      const targetSiblings=targetNodes.filter(node=>node.parentNodeId===target.parentNodeId)
        .sort((a,b)=>Number(wireFields(a)['FunOrderValue']??0)-Number(wireFields(b)['FunOrderValue']??0)||a.nodeId.localeCompare(b.nodeId))
      if(command.depth!==targetDepth||command.siblingIndex!==targetSiblings.findIndex(node=>node.nodeId===id)||command.parentNodeId!==target.parentNodeId)throw new Error(`蓝图 DataView move/reorder 计划位置与正式目标树不一致：${id}`)
      const expectedFields:Record<string,unknown>={}
      if(original.parentNodeId!==target.parentNodeId)expectedFields['prowid']=target.parentNodeId
      if(String(wireFields(original)['FunOrderValue'])!==String(wireFields(target)['FunOrderValue']))expectedFields['FunOrderValue']=wireFields(target)['FunOrderValue']
      if(keys.length!==Object.keys(expectedFields).length||keys.some(field=>!Object.hasOwn(expectedFields,field)||!Object.is(patch[field],expectedFields[field])))throw new Error(`蓝图 DataView 命令字段与正式目标位置不一致：${id}`)
      const key=this.view.getPkKey(row)
      if((typeof key!=='string'&&typeof key!=='number')||String(key)!==id||this.view.editActionState(row)!=='enabled'||keys.some(field=>!this.hasOutput(field)||this.view.fieldAccess(row,field).read!=='visible'||this.view.fieldAccess(row,field).write!=='allowed'))throw new Error(`蓝图 DataView 权限拒绝移动行 ${id}`)
      const validation=this.view.validator?.validateColumns({...row,...patch},new Set(keys))
      if(validation&&!validation.valid)throw new Error(validation.errors[0]?.message??`蓝图 DataView 移动字段校验失败：${id}`)
      patches.push({id,key,row,patch})
    }
    // Verify that moves target only same-project original rows and the planned full tree is acyclic.
    for(const [id,node] of targetById){if(id===expectedTree.nodeId)continue;let cursor=node.parentNodeId;const visited=new Set([id]);while(cursor!==expectedTree.nodeId){if(visited.has(cursor))throw new Error(`蓝图 DataView 移动目标存在循环：${id}`);visited.add(cursor);const parent=targetById.get(cursor);if(parent?.projectId!==this.#projectId)throw new Error(`蓝图 DataView 移动目标父闭包无效：${id}`);cursor=parent.parentNodeId}}
    if(beforeStage&&!beforeStage())throw new Error('one DataView command per AI run is allowed; the additional blueprint plan change was rejected before staging')
    const ids=patches.map(item=>item.key)
    try{for(const item of patches)for(const [field,value] of Object.entries(item.patch))this.view.updateEditingValue(item.key,field,value)}catch(error){
      try{this.view.discardPendingChanges(ids);if(ids.some(id=>this.view.hasEditingChanges(id)||this.view.dirtyTracking.hasPendingChanges(id)))throw new Error('批量暂存回滚后仍有编辑覆盖');}
      catch(rollbackError){this.#batchStageBlocked=true;throw new Error(`蓝图移动批次暂存失败且回滚未确认，保存已阻断：${String(rollbackError)}`)}
      throw error
    }
    await this.saveIds(ids,ids.length)
    const confirmed=this.treeProjection()
    const confirmedById=index(flatten(confirmed))
    for(const [id,node] of targetById){const actual=confirmedById.get(id);if(actual?.parentNodeId!==node.parentNodeId
      ||String(wireFields(actual)['FunOrderValue'])!==String(wireFields(node)['FunOrderValue']))throw new Error(`蓝图 DataView 移动批次正式树回读不一致：${id}`)}
  }

  /** Create an unmounted root module through the current formal Base_NavigationInfo query owner. */
  public async addRootModule(): Promise<void> {
    this.assertWritable()
    if (this.isBusy) throw new Error('蓝图 DataView 正在查询或保存')
    if (this.hasUnconfirmedSave) {
      if (this.#unconfirmedRootId === undefined) throw new Error('蓝图 DataView 存在其他未确认保存')
      await this.saveIds([this.#unconfirmedRootId])
      await this.view.refresh()
      if (this.view.loadingError) throw this.view.loadingError
      this.synchronizeCurrentRow()
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
    this.synchronizeCurrentRow()
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
    this.assertWritable()
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
        this.#pendingChildBatch=Object.freeze({children:Object.freeze(children.map(child=>Object.freeze({...child,fields:Object.freeze({...child.fields})}))),updates:Object.freeze([]),
          ids:Object.freeze(ids),expected,state:'blocked',submitted:false})
        throw new Error(`蓝图批量新增暂存失败且草稿回滚未确认；原命令已锁定：${String(rollbackError)}`)
      }
      throw error
    }

    this.#pendingChildBatch=Object.freeze({
      children:Object.freeze(children.map(child=>Object.freeze({...child,fields:Object.freeze({...child.fields})}))),
      updates:Object.freeze([]),
      ids:Object.freeze(ids),expected,state:'unknown',submitted:true})
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

  /** Preflight, stage, and save creates plus existing leaf updates as one DataSet view batch. */
  public async addAndUpdateChildNodes(children:readonly BlueprintChildNodeCreateAtParent[],updates:readonly BlueprintNodeFormData[],beforeStage?:()=>boolean):Promise<ReadonlyArray<string|number>>{
    this.assertWritable()
    if(children.length===0||updates.length===0)throw new Error('蓝图 DataView 混合命令必须同时包含新增和更新')
    if(this.isBusy||this.hasUnconfirmedSave||this.#unconfirmedChildId!==undefined||this.#pendingChildBatch!==undefined)throw new Error('蓝图 DataView 正在保存或存在原子节点命令待核验')
    if(this.dirty||!this.#treeQueryLoaded)throw new Error('蓝图 DataView 混合命令要求干净且已完整加载的项目树')
    const createIds=new Set<string>(), existingIds=new Set(this.view.rows.filter(row=>row['SysId']===this.#projectId).map(row=>String(row['rowid']??'').trim()))
    const createExpected=new Map<string,Record<string,unknown>>()
    for(const child of children){
      const id=child.nodeId.trim(),parentId=child.parentNodeId.trim()
      if(!id||id!==child.nodeId||existingIds.has(id)||createIds.has(id))throw new Error(`蓝图 DataView 混合新增稳定 rowid 缺失或重复：${child.nodeId}`)
      if(!parentId||parentId!==child.parentNodeId)throw new Error('蓝图 DataView 混合新增父节点身份无效')
      const parent=this.requireCurrentParent(parentId)
      if(parent['SysId']!==this.#projectId||this.view.fieldAccess(parent,'rowid').read!=='visible'||this.view.fieldAccess(parent,'SysId').read!=='visible'
        ||this.view.createChildActionState(parent)!=='enabled')throw new Error(`蓝图 DataView 当前查询不允许在父节点 ${parentId} 下新增子节点`)
      const fields=this.preflightChildNode(parentId,{...child.fields})
      if(!this.hasOutput('rowid'))throw new Error('蓝图 DataView 未正式输出可读的稳定 rowid')
      createIds.add(id);createExpected.set(id,{...fields,rowid:id})
    }
    const prepared=updates.length>1?[...await this.preflightNodeDataBatch(updates)]:await (async()=>{
      const node=updates.at(0)
      if(node===undefined)throw new Error('蓝图 DataView 混合命令更新目标缺失')
      await this.load(node.nodeId)
      const patch=this.preflightNodeData(node),row=this.currentRow(),key=this.requireRowKey(row)
      return [{nodeId:node.nodeId,key,patch,node}]
    })()
    const updateIds=new Set(prepared.map(item=>item.nodeId))
    if(prepared.some(item=>createIds.has(item.nodeId))||[...createIds].some(id=>updateIds.has(id)))throw new Error('蓝图 DataView 混合命令新增和更新身份重复')
    if(children.some(child=>updateIds.has(child.parentNodeId)))throw new Error('蓝图 DataView 混合命令禁止新增父节点同时作为更新目标')
    for(const item of prepared){
      const row=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===item.key)
      if(row?.['SysId']!==this.#projectId||row['rowid']!==item.nodeId||this.view.rows.some(candidate=>candidate['SysId']===this.#projectId&&candidate['prowid']===item.nodeId))throw new Error(`蓝图 DataView 混合更新仅允许原树现存叶节点 ${item.nodeId}`)
      if(Object.keys(item.patch).length===0||Object.keys(item.patch).some(field=>field!=='name'&&field!=='memo'))throw new Error(`蓝图 DataView 混合更新只允许非空 name/memo：${item.nodeId}`)
      createExpected.set(item.nodeId,{...item.patch})
    }
    if(beforeStage&&!beforeStage())throw new Error('one DataView command per AI run is allowed; the additional blueprint plan change was rejected before staging')
    const ids=[...children.map(child=>child.nodeId),...prepared.map(item=>item.key)]
    const pendingChildren=children.map(child=>Object.freeze({...child,fields:Object.freeze({...child.fields})}))
    const pendingUpdates=prepared.map(item=>Object.freeze({nodeId:item.nodeId,parentNodeId:String(this.view.rows.find(row=>this.view.getPkKey(row)===item.key)?.['prowid']??''),patch:Object.freeze({...item.patch})}))
    const pending:PendingChildCreateBatch=Object.freeze({children:Object.freeze(pendingChildren),updates:Object.freeze(pendingUpdates),ids:Object.freeze(ids),expected:createExpected,state:'blocked',submitted:false})
    const singlePrepared=prepared.at(0)
    const created:string[]=[]
    try{
      if(prepared.length>1)this.updateNodeDataBatch(prepared)
      else if(singlePrepared)for(const [field,value] of Object.entries(singlePrepared.patch))this.view.updateEditingValue(singlePrepared.key,field,value)
      else throw new Error('蓝图 DataView 混合命令更新目标缺失')
      for(const child of children){
        const parent=this.requireCurrentParent(child.parentNodeId),expected=createExpected.get(child.nodeId)
        if(expected===undefined)throw new Error(`蓝图 DataView 混合命令新增字段快照缺失 ${child.nodeId}`)
        const row=await this.view.addChildRow({parentRow:parent,parentField:'rowid',childForeignKey:'prowid',identity:{field:'rowid',value:child.nodeId},
          data:Object.fromEntries(Object.entries(expected).filter(([field])=>field!=='prowid'&&field!=='rowid'))})
        if('success' in row)throw new Error(`蓝图 DataView 未准备混合新增行 ${child.nodeId}`)
        if(this.view.dirtyTracking.hasPendingChanges(child.nodeId))created.push(child.nodeId)
        if(this.view.getPkKey(row)!==child.nodeId||row['rowid']!==child.nodeId||row['SysId']!==this.#projectId||row['prowid']!==child.parentNodeId)throw new Error(`蓝图 DataView 混合新增身份不匹配 ${child.nodeId}`)
      }
    }catch(error){
      const rollbackErrors:string[]=[]
      const stagedCreateIds=[...new Set([...created,...children.map(child=>child.nodeId)])].reverse()
      for(const id of stagedCreateIds)try{
        if(!this.view.rows.some(row=>this.view.getPkKey(row)===id)&&!this.view.dirtyTracking.hasPendingChanges(id))continue
        const result=await this.view.removeRow(id)
        const succeeded=typeof result==='boolean'?result:result.success&&result.data!==false
        if(!succeeded||this.view.rows.some(row=>this.view.getPkKey(row)===id)||this.view.dirtyTracking.hasPendingChanges(id))rollbackErrors.push(`新增 ${id} 未确认移除`)
      }catch(cause){rollbackErrors.push(`新增 ${id} 移除失败：${cause instanceof Error?cause.message:String(cause)}`)}
      try{this.view.discardPendingChanges(prepared.map(item=>item.key))}catch(cause){rollbackErrors.push(`更新 overlay 清理失败：${cause instanceof Error?cause.message:String(cause)}`)}
      const unclearedUpdates=prepared.filter(item=>this.view.getEditingPatch(item.key)!==undefined||this.view.dirtyTracking.hasPendingChanges(item.key))
      if(unclearedUpdates.length)rollbackErrors.push(`更新 ${unclearedUpdates.map(item=>item.nodeId).join(',')} 仍有 overlay/pending`)
      if(rollbackErrors.length){this.#pendingChildBatch=pending;this.#batchStageBlocked=true}
      if(rollbackErrors.length)throw new Error(`蓝图混合暂存失败且清理未确认；原 IDs/patch 已锁定：${rollbackErrors.join('；')}`)
      throw error
    }
    this.#pendingChildBatch=Object.freeze({...pending,state:'unknown',submitted:true})
    try{
      const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[...ids]}]})
      this.assertBatchSaveCounts(result,children.length,prepared.length)
      this.#pendingChildBatch=Object.freeze({...this.#pendingChildBatch,state:'accepted'})
    }catch(error){
      this.#pendingChildBatch=Object.freeze({...this.#pendingChildBatch,state:this.view.hasUnconfirmedSave?'unknown':'blocked',submitted:true})
      throw error
    }
    await this.verifyPendingChildBatch()
    return children.map(child=>child.nodeId)
  }

  private assertBatchSaveCounts(result:Awaited<ReturnType<DataSet['saveChanges']>>,expectedCreated:number,expectedSaved=0):void{
    const data=result.data
    if(!result.success||!data)throw new Error(`蓝图 DataView 批次回执计数不完整：期望新增 ${expectedCreated}、更新 ${expectedSaved} 且无其他动作`)
    const viewResult=data.viewResults[0]
    if(data.viewCount!==1||data.viewResults.length!==1||!viewResult||data.appliedEditingRows<0||data.appliedEditingRows>expectedCreated+expectedSaved||data.createdCount!==expectedCreated
      ||data.savedCount!==expectedSaved||data.deletedCount!==0||data.failedCount!==0||data.failedEditingRows!==0
      ||data.failedViews.length!==0
      ||viewResult.tableName!==this.view.tableName||viewResult.viewId!==this.view.viewId
      ||viewResult.appliedEditingRows<0||viewResult.appliedEditingRows>expectedCreated+expectedSaved
      ||viewResult.createdCount!==expectedCreated||viewResult.savedCount!==expectedSaved||viewResult.deletedCount!==0
      ||viewResult.failedCount!==0||viewResult.failedEditingRows!==0||viewResult.failedIds.length!==0||Object.keys(viewResult.failedErrors).length!==0){
      throw new Error(`蓝图 DataView 批次回执计数不完整：期望新增 ${expectedCreated}、更新 ${expectedSaved} 且无其他动作`)
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
        this.assertBatchSaveCounts(result,pending.children.length,pending.updates.length)
        this.#pendingChildBatch=Object.freeze({...pending,state:'accepted'})
      }catch(error){
        if(error instanceof Error&&error.message.includes('SPARK_SAVE_NOT_APPLIED'))this.#pendingChildBatch=Object.freeze({...pending,state:'not-applied'})
        else this.#pendingChildBatch=Object.freeze({...pending,state:this.view.hasUnconfirmedSave?'unknown':'blocked'})
        throw error
      }
      return this.verifyPendingChildBatch()
    }
    if(pending.state==='blocked'){
      if(!pending.submitted||this.view.hasUnconfirmedSave)throw new Error('蓝图 DataView 原批次已阻断；保留原 IDs/patch，未解决的请求不得重放')
      const revision=this.#revision,selectedNodeId=this.#nodeId
      await this.queryProjectRows(revision,selectedNodeId);this.#treeQueryLoaded=true;this.treeProjection()
      let complete=true
      for(const id of pending.ids){
        const row=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===id&&candidate['SysId']===this.#projectId)
        const update=pending.updates.find(item=>item.nodeId===String(id)),create=pending.children.find(item=>item.nodeId===String(id))
        const expected=pending.expected.get(id)
        if(!row||!expected||(create&&row['prowid']!==create.parentNodeId)||(update&&row['prowid']!==update.parentNodeId)
          ||Object.entries(expected).some(([field,value])=>!Object.hasOwn(row,field)||!sameWireValue(row[field],value)))complete=false
      }
      if(!complete)throw new Error('蓝图 DataView 原批次刷新回读仍为部分或不可判明；owner 保持 blocked')
      this.#pendingChildBatch=undefined
      this.#unconfirmedIds=[];this.#unconfirmedPatches.clear();this.#batchStageBlocked=false
      return
    }
    if(pending.state==='unknown'){
      if(!this.view.hasUnconfirmedSave)throw new Error('蓝图 DataView 批量新增未知回执已失去原查询捕获；拒绝重放')
      try{
        const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[...pending.ids]}]})
        this.assertBatchSaveCounts(result,pending.children.length,pending.updates.length)
        this.#pendingChildBatch=Object.freeze({...pending,state:'accepted'})
      }catch(error){
        if(error instanceof Error&&error.message.includes('SPARK_SAVE_NOT_APPLIED'))this.#pendingChildBatch=Object.freeze({...pending,state:'not-applied'})
        else this.#pendingChildBatch=Object.freeze({...pending,state:error instanceof Error&&error.message.startsWith('蓝图 DataView 批次回执计数不完整')?'blocked':'unknown'})
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
      const update=pending.updates.find(item=>item.nodeId===String(id))
      if(command&&row['prowid']!==command.parentNodeId||update&&row['prowid']!==update.parentNodeId||!command&&!update){
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
      const update=pending.updates.find(item=>item.nodeId===String(id))
      const parent=command===undefined?undefined:parents.get(command.parentNodeId)
      const row=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===id)
      const expected=pending.expected.get(id)
      if(!row)throw new Error(`蓝图 DataView 原批次重试的稳定ID不存在：${String(id)}`)
      if(command&&!parent)throw new Error(`蓝图 DataView 原批次新增父节点缺失：${String(id)}`)
      if((!command&&!update)||(command&&!parent)||!expected||!this.view.dirtyTracking.hasPendingChanges(id)
        ||(update&&row['prowid']!==update.parentNodeId)
        ||Object.entries(expected).some(([field,value])=>!Object.hasOwn(row,field)||!sameWireValue(row[field],value))){
        throw new Error(`蓝图 DataView 原批次重试的稳定ID或字段快照已变化：${String(id)}`)
      }
      const validation=this.view.validator?.validateColumns(row,new Set(Object.keys(expected)))
      if(validation&&!validation.valid)throw new Error(validation.errors[0]?.message??`蓝图 DataView 原批次字段校验失败：${String(id)}`)
      if(command&&parent)for(const field of Object.keys(expected))if(field!=='rowid'&&this.view.fieldAccess(parent,field).write!=='allowed'){
        throw new Error(`蓝图 DataView 原批次重试权限已失效：${field}`)
      }
      if(update&&Object.keys(expected).some(field=>!this.hasOutput(field)||this.view.fieldAccess(row,field).read!=='visible'||this.view.fieldAccess(row,field).write!=='allowed'))throw new Error(`蓝图 DataView 原批次更新权限已失效：${String(id)}`)
    }
  }

  public assertCanAddChild(parentNodeId:string):void{
    this.assertWritable()
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
    this.assertWritable()
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
      this.synchronizeCurrentRow()
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
    this.synchronizeCurrentRow()
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
    this.assertWritable()
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
    this.assertWritable()
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
    this.assertWritable()
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
    const records=this.projectedRecords()
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

  private projectedRecords(): readonly LowcodeProjectBlueprintRecord[] {
    this.assertUsable()
    if(!this.#treeQueryLoaded)throw new Error('蓝图 DataView 尚未加载完整项目树行')
    for(const field of ['rowid','SysId','prowid','FunOrderValue'])if(!this.hasOutput(field))throw new Error(`蓝图 DataView 未输出树投影字段 ${field}`)
    if(!this.hasOutput('name')&&!this.hasOutput('FunName'))throw new Error('蓝图 DataView 未输出树节点名称')
    const fields=['Manhour','NavigationUrl','funCode','Sum','personCharge','FunName','IsShowChildItem','Number','conid',
      'MobileUrl','status','FunOrderValue','Total','memo','name','ChildItemLocation','SysId','NavigationShowType',
      'NavigationImageWxz','NavigationType','conType','rowid','VersionId','IsShowAtNav','BeginGroup','HorizontalAlignment',
      'DifficultyFactor','prowid','htmlDesc']
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
    return validateLowcodeProjectBlueprintRecords(this.#projectId,normalizeLowcodeProjectBlueprintRecords(rows))
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
    const row = this.row
    if (!row || !this.view.rows.includes(row) || row['rowid'] !== this.#nodeId || row['SysId'] !== this.#projectId) return false
    return this.hasOutput(field) && Object.hasOwn(row, field) && this.view.fieldAccess(row, field).read === 'visible'
  }

  public canWrite(field: string): boolean {
    if (!this.canRead(field)) return false
    const row = this.row
    if (!row) return false
    const column = this.view.dataTable?.columns.find(candidate => candidate.name === field)
    return column !== undefined && !column.isComputed && !column.computeExpression
      && this.view.editActionState(row) === 'enabled' && this.view.fieldAccess(row, field).write === 'allowed'
  }

  public canWriteFields(fields:readonly string[]):boolean{return fields.length>0&&fields.every(field=>this.canWrite(field))}

  public value(field: string): unknown {
    const row = this.row
    if (!row || !this.canRead(field)) return undefined
    return this.canRead(field) ? this.view.getEditingRow(this.requireRowKey(row))?.[field] : undefined
  }

  public update(field: string, value: unknown): void {
    this.assertWritable()
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
    if(this.#acceptedReceiptPending)throw new Error('蓝图 DataView 已收到保存回执但正式回读未完成，不能取消；请沿原 DataSet 查询与保存入口核验')
    if(this.#unconfirmedDeleteId!==undefined)throw new Error('蓝图 DataView 删除结果待核验，不能取消')
    if (!this.dirty) return
    const ids=this.view.rows.map(row=>this.view.getPkKey(row)).filter((id):id is string|number=>id!==undefined)
      .filter(id=>this.view.hasEditingChanges(id)||this.view.dirtyTracking.hasPendingChanges(id))
    this.view.discardPendingChanges(ids)
    if(ids.some(id=>this.view.hasEditingChanges(id)||this.view.dirtyTracking.hasPendingChanges(id)))throw new Error('蓝图 DataView 取消后仍有待提交修改')
    this.#unconfirmedIds=[];this.#unconfirmedPatches.clear()
    if(this.#batchStageBlocked){
      const blockedIds=this.view.rows.map(row=>this.view.getPkKey(row)).filter((id):id is string|number=>id!==undefined)
      if(blockedIds.some(id=>this.view.getEditingPatch(id)!==undefined||this.view.dirtyTracking.hasPendingChanges(id)))throw new Error('蓝图 DataView 批量失败状态仍有未清理目标')
      this.#batchStageBlocked=false
    }
    this.synchronizeCurrentRow()
  }

  public async save(): Promise<void> {
    this.assertWritable()
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
    this.assertWritable()
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
    this.assertWritable()
    if(this.#batchStageBlocked)throw new Error('蓝图 DataView 批量暂存回滚未确认，保存已阻断')
    if (this.isBusy) throw new Error('蓝图 DataView 正在查询或保存')
    const targetNodeId=this.#nodeId, revision=this.#revision
    if (this.hasUnconfirmedSave || this.#unconfirmedIds.length>0) {
      if(targetIds&&this.#unconfirmedIds.some(id=>!targetIds.includes(id)))throw new Error('蓝图 DataView 核验须包含原提交全部节点')
      if (this.hasUnconfirmedSave) {
        const recovered = await this.dataSet.saveChanges({views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: this.#unconfirmedIds}]})
        this.assertTarget(revision, targetNodeId)
        if (!recovered.success) throw recovered.error ?? new Error(recovered.message ?? '蓝图 DataView 未确认保存仍无法核验')
        this.#acceptedReceiptPending=true
      }
      await this.view.refresh()
      this.assertTarget(revision, targetNodeId)
      if (this.view.loadingError) throw this.view.loadingError
      this.synchronizeCurrentRow()
      const recoveryTargetId=targetNodeId||String(this.#unconfirmedIds[0]??'')
      const recoveredRow = this.view.rows.find(candidate => candidate['rowid'] === recoveryTargetId && candidate['SysId'] === this.#projectId)
      if (!recoveredRow) throw new Error('蓝图 DataView 核验后未读回目标行')
      for(const [key,patch] of this.#unconfirmedPatches){const confirmed=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===key);if(!confirmed)throw new Error(`蓝图行 ${String(key)} 核验后未读回`);for(const [field,value] of Object.entries(patch))if(!Object.is(confirmed[field],value))throw new Error(`蓝图字段 ${field} 核验回读不一致`)}
      this.#unconfirmedIds=[];this.#unconfirmedPatches.clear()
      this.#acceptedReceiptPending=false
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
    if(result.success||(result.data?.createdCount??0)>0||(result.data?.savedCount??0)>0||(result.data?.deletedCount??0)>0)this.#acceptedReceiptPending=true
    if (!result.success) throw result.error ?? new Error(result.message ?? '蓝图 DataView 保存失败')
    if(expectedSavedCount!==undefined)this.assertBatchSaveCounts(result,0,expectedSavedCount)
    await this.view.refresh()
    this.assertTarget(revision, targetNodeId)
    if (this.view.loadingError) throw this.view.loadingError
    this.synchronizeCurrentRow()
    const verificationId=targetNodeId||String(changedIds[0])
    const saved = this.view.rows.find(candidate => candidate['rowid'] === verificationId && candidate['SysId'] === this.#projectId)
    if (!saved) throw new Error('蓝图 DataView 保存后未读回目标行')
    for(const [key,patch] of patches){const confirmed=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===key);if(!confirmed)throw new Error(`蓝图行 ${String(key)} 保存后无法读回`);for(const [field,value] of Object.entries(patch))if(!Object.is(confirmed[field],value))throw new Error(`蓝图字段 ${field} 保存后读回不一致`)}
    this.#unconfirmedIds=[]
    this.#acceptedReceiptPending=false
  }

  public dispose(): void {
    this.#disposed = true
    this.#revision++
    this.#nodeId = ''
    this.view.setCurrentRow(null)
  }

  private currentRow(): DataRow {
    this.assertUsable()
    const row = this.view.currentRow
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
    this.synchronizeCurrentRow()
    return [...rows]
  }

  /** Align the selected project node with the DataView currentRow consumed by standard fields. */
  private synchronizeCurrentRow(): void {
    this.assertUsable()
    const targetNodeId=this.#nodeId
    if(!targetNodeId){this.view.setCurrentRow(null);return}
    const row=this.view.rows.find(candidate=>candidate['rowid']===targetNodeId&&candidate['SysId']===this.#projectId)
    if(row&&String(this.view.getPkKey(row))!==targetNodeId)throw new Error('蓝图 DataView 当前行主键与目标节点身份不匹配')
    this.view.setCurrentRow(row??null)
    const current=this.view.currentRow
    if(row
      ? current?.['rowid']!==targetNodeId||current['SysId']!==this.#projectId
      : current!==null)throw new Error('蓝图 DataView 当前行未同步到同一目标')
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
    const table=this.dataSet.getTable(this.#tableName)
    const tableValid=this.#readOnlySource
      ? table?.resourceType==='file'&&table.resourceId===BUILTIN_BLUEPRINT_NODE_RESOURCE_ID&&!table.modelBinding
      : table?.modelBinding?.modelName===MODEL_NAME&&Boolean(table.modelBinding.modelId.trim())
    if (this.dataSet.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY || !tableValid
      || this.dataSet.getView(this.#tableName, this.#viewId) !== this.view) {
      throw new Error('蓝图 DataView 场景或视图身份已变化')
    }
  }

  private assertWritable():void{
    this.assertUsable()
    if(this.#readOnlySource)throw new Error('BUILTIN_BLUEPRINT_READ_ONLY: 仓内蓝图来源当前只读，不能新增、移动、修改或删除')
  }
}

/** Confirm this exact workspace DataView is hosted by the PageRuntime DataSet for its scenario. */
export function isBlueprintViewAttachedToRuntime(runtime: PageRuntime, scenarioId: string, workspace: BlueprintWorkspaceDataView): boolean {
  const dataSet = runtime.getDataSet(scenarioId)
  const view = workspace.view
  return dataSet === workspace.dataSet && dataSet.getView(view.tableName, view.viewId) === view
}
