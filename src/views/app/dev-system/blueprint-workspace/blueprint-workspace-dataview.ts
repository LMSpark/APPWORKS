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
    if(this.#treeQueryLoaded){
      const row=this.view.rows.find(candidate=>candidate['rowid']===targetNodeId&&candidate['SysId']===this.#projectId)
      if(!row)throw new Error(`蓝图 DataView 项目树未返回目标行 ${targetNodeId}`)
      if(this.view.fieldAccess(row,'rowid').read!=='visible'||this.view.fieldAccess(row,'SysId').read!=='visible')throw new Error('蓝图 DataView 当前行身份不可读')
      this.#row=row
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
    if (!this.dirty) return
    const ids=this.view.rows.map(row=>this.view.getPkKey(row)).filter((id):id is string|number=>id!==undefined)
      .filter(id=>this.view.hasEditingChanges(id)||this.view.dirtyTracking.hasPendingChanges(id))
    this.view.discardPendingChanges(ids)
    this.#row=this.view.rows.find(candidate=>candidate['rowid']===this.#nodeId&&candidate['SysId']===this.#projectId)
  }

  public async save(): Promise<void> {await this.saveIds()}

  /** Save only the selected node; any staged changes on other rows remain untouched. */
  public async saveSelectedNode():Promise<void>{
    if(this.hasUnconfirmedSave){
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

  private async saveIds(targetIds?:Array<string|number>): Promise<void> {
    this.assertUsable()
    if (this.isBusy) throw new Error('蓝图 DataView 正在查询或保存')
    const targetNodeId=this.#nodeId, revision=this.#revision
    if (this.hasUnconfirmedSave) {
      if(targetIds&&this.#unconfirmedIds.some(id=>!targetIds.includes(id)))throw new Error('蓝图 DataView 核验须包含原提交全部节点')
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
