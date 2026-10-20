/**
 * @module lowcode/data-space/model-source/array/lowcode-data-space-array-session
 * 职责：已有数组的名称、表头、数据成员及正式引用差异共同保存与核验（无独立命令类 FSM）。
 * 边界：原DataView持有正式数据与权限；局部表头只承载未确认输入，不重置已有字段属性。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataSpaceArrayDraft, type ArrayDefinition} from './lowcode-data-space-array-draft'
import {DataSpaceDefinitionSave} from '../save/data-space-definition-save'
import {LowcodeDataSpaceModelRenameReferences, type ModelNameChange} from '../rename/lowcode-data-space-model-rename-references'
import type {ModelRenameFilePlan} from '../rename/lowcode-data-space-model-rename-session'
import {LowcodeDataSpaceFieldRemoveReferences, type FieldRename} from '../removal/lowcode-data-space-field-remove-references'
import {LowcodeDataSpaceModelDependencies} from '../lowcode-data-space-model-dependencies'


/** 一条已有数组字段的差异；不改变其他属性或正式身份。 */
export type ArrayFieldChange = {
  /** 原Base_DataModel_Field的rowid。 */
  id:string
  /** 原视图持有的正式记录，仅用于校验。 */
  original:DataRow
  /** 本次明确修改的属性和值。 */
  patch:Record<string,unknown>
}
/** 表头批次最终定义及差异，供会话核对配置依赖，不携带权限凭据。 */
export type ArrayDefinitionChange = {
  /** 正式模型原定义。 */
  original:ReturnType<typeof DataSpaceDesignApi.projectModel>
  /** 含本次新增、改名、删除和主键变更的最终定义。 */
  candidate:ReturnType<typeof DataSpaceDesignApi.projectModel>
  /** 已有字段的实际差异。 */
  changes:readonly ArrayFieldChange[]
  /** 本次明确移除的正式字段。 */
  removals:readonly DataRow[]
  /** 同批模型/字段改名的结构化引用变更，由原引用责任方解析。 */
  references:readonly ModelNameChange[]
}

export type ArrayEditStatus = 'idle' | 'saving' | 'unknown' | 'readback' | 'different' | 'configuration'


export type ArraySessionLifecycle = Readonly<{
  assertCurrent(): void
  onDispatch(): void
  completed(): void
  validate(change: ArrayDefinitionChange, views: readonly DataView[]): Promise<() => void>
  prepareRename(change: ArrayDefinitionChange): Promise<ModelRenameFilePlan>
}>

export type ArraySessionFlow = {
  status: ArrayEditStatus
  identity: string
  renamedIdentity: string | undefined
  rename: {plan: ModelRenameFilePlan; before: string; after: string} | undefined
  baseline: string
  fieldIds: Set<string>
  staged: Array<{view: DataView; id: string; after: string; values: Record<string, unknown> | null; created?: true}>
  confirmed: boolean
  verified: string
  verification: string[]
  fieldRenames: FieldRename[]
  referenceSnapshot: string
}

export type ArraySessionHost = {
  readonly dataSet: DataSet
  readonly targetId: string
  readonly modelId: string
  readonly fieldViewId: 'default' | 'modelFields'
  readonly models: DataView
  readonly fields: DataView
  views: DataView[]
  readonly contexts: string[]
  readonly lifecycle: ArraySessionLifecycle
  dependencies: LowcodeDataSpaceModelDependencies | undefined
  flow: ArraySessionFlow
}

type ArrayPlan = ReturnType<typeof arrayPlan>

export function createArrayHost(dataSet: DataSet, targetId: string, modelId: string, lifecycle: ArraySessionLifecycle,
  fieldViewId: 'default' | 'modelFields' = 'default'): ArraySessionHost {
  const models = dataSet.getView('Base_DataModel'), fields = dataSet.getView('Base_DataModel_Field', fieldViewId)
  if (!models || !fields) throw new Error('缺少数组正式定义视图')
  if (fieldViewId !== 'default' && (fields.queryContext['modelId'] !== modelId || fields.requestState !== RequestState.Loaded)) {
    throw new Error('数组字段视图未读取或所属模型不符')
  }
  const views = [models, fields]
  const contexts = views.map(v => JSON.stringify(v.queryContext))
  const host: ArraySessionHost = {
    dataSet, targetId, modelId, fieldViewId, models, fields, views, contexts, lifecycle, dependencies: undefined,
    flow: {
      status: 'idle', identity: '', renamedIdentity: undefined, rename: undefined, baseline: '', fieldIds: new Set(),
      staged: [], confirmed: false, verified: '', verification: [], fieldRenames: [], referenceSnapshot: '',
    },
  }
  host.flow.identity = arrayIdentity(host)
  host.flow.baseline = arraySnapshot(host)
  return host
}

function arrayAssertOwner(host: ArraySessionHost): void {
  host.lifecycle.assertCurrent()
  host.dependencies?.assertOwner()
  for(const [index,view] of host.views.entries()) {
    if(host.dataSet.destroyed||host.dataSet.getView(view.tableName,view.viewId)!==view||view.dataTable?.modelBinding?.modelName!==view.tableName
      ||view.queryContext['dataSpaceId']!==host.targetId||index<2&&JSON.stringify(view.queryContext)!==host.contexts[index]
      ||view.requestState===RequestState.Loading||view.mutating)throw new Error('数组正式查询或目标已变化')
  }
}
function arrayModel(host: ArraySessionHost): DataRow {
  arrayAssertOwner(host)
  const rows=host.models.rows.filter(r=>r['rowid']===host.modelId),row=rows[0]
  if(rows.length!==1||row?.['dataSetId']!==host.targetId||row['Type']!=='数组'||host.models.getPkKey(row)!==host.modelId)throw new Error('数组模型身份或来源无效')
  return row
}
function arrayIdentity(host: ArraySessionHost, name?: string): string {const row=arrayModel(host);return JSON.stringify(['rowid','dataSetId','Name','MetaName','Type'].map(key=>key==='Name'&&name!==undefined?name:arrayRead(host.models,row,key)))}
function arrayRows(host: ArraySessionHost, view: DataView = host.fields): DataRow[] {
  const ids=new Set<string>()
  for(const row of view.rows) {
    for(const key of ['rowid','dataSetId','dataModelId','type'])arrayRead(view,row,key)
    const id=view.getPkKey(row)
    if(typeof id!=='string'||id!==row['rowid']||ids.has(id)||row['dataSetId']!==host.targetId
      ||view.queryContext['modelId']!==undefined&&(row['dataModelId']!==host.modelId||row['type']!=='dataModel'))throw new Error('数组字段身份或归属不完整')
    ids.add(id)
  }
  return view.rows.filter(r=>r['dataModelId']===host.modelId&&r['type']==='dataModel')
}
function arrayRead(view: DataView, row: DataRow, key: string): unknown {
  if(view.columns.some(c=>c.name===key)&&view.fieldAccess(row,key).read!=='visible')throw new Error(`数组定义不可读：${key}`)
  return row[key]
}
function arrayValues(view: DataView, row: DataRow): Record<string, unknown> {
  return Object.fromEntries(view.columns.filter(c=>!['updatetime','updateuser'].includes(c.name)).map(c=>[c.name,arrayRead(view,row,c.name)]))
}
function arrayOriginalRows(host: ArraySessionHost): DataRow[] {
  const tracking=host.fields.dirtyTracking
  const rows=arrayRows(host).filter(row=>!host.flow.fieldIds.has(String(row['rowid']))||!tracking.isPendingCreate(String(row['rowid'])))
    .map(row=>{
      const id=String(row['rowid'])
      if(!host.flow.fieldIds.has(id)||!tracking.isDirty(id))return row
      const original=tracking.getOriginal(id)
      if(!original)throw new Error('数组字段原查询基线不可确认')
      return original
    })
  for(const id of host.flow.fieldIds)if(tracking.pendingDeleteIds.has(id)) {
    const original=tracking.getPendingDeleteSnapshot(id)
    if(!original)throw new Error('数组字段删除基线不可确认')
    rows.push(original)
  }
  return rows.sort((a,b)=>String(a['rowid']).localeCompare(String(b['rowid'])))
}
function arrayFieldPending(host: ArraySessionHost): boolean{return [...host.flow.fieldIds].some(id=>host.fields.hasEditingChanges(id)||host.fields.dirtyTracking.hasPendingChanges(id))}
/** 对外状态；派发失败时优先消费 P1b `hasUnconfirmedSave`。 */
function arrayFlowStatus(host: ArraySessionHost): ArrayEditStatus {
  if (host.flow.status === 'saving') return 'saving'
  if (host.flow.status === 'readback' || host.flow.status === 'different' || host.flow.status === 'configuration') return host.flow.status
  if (host.flow.status !== 'idle' && (host.models.hasUnconfirmedSave || host.fields.hasUnconfirmedSave)) return 'unknown'
  if (host.flow.status === 'unknown') return 'unknown'
  return host.flow.status
}
function arrayFieldFingerprint(host: ArraySessionHost): string{return JSON.stringify([arrayHeaders(host),[...host.flow.fieldIds].sort().map(id=>[id,host.fields.getEditingPatch(id),host.fields.dirtyTracking.isPendingCreate(id),host.fields.dirtyTracking.pendingDeleteIds.has(id)])])}
function arraySnapshot(host: ArraySessionHost): string{return JSON.stringify([arrayValues(host.models,arrayModel(host)),arrayOriginalRows(host).map(row=>arrayValues(host.fields,row))])}
function arrayReferenceSnapshot(host: ArraySessionHost, projected?: boolean): string{return JSON.stringify(arrayReferenceViews(host).map(view=>view.rows
  .filter(row=>!host.flow.staged.some(item=>item.view.tableName===view.tableName&&item.id===row['rowid']&&(item.created===true||projected&&item.values===null)))
  .map(row=>({...arrayValues(view,row),...projected?host.flow.staged.find(item=>item.view.tableName===view.tableName&&item.id===row['rowid'])?.values:{}}))
  .sort((a,b)=>String(a['rowid']).localeCompare(String(b['rowid'])))))}
function arrayClean(host: ArraySessionHost, owned?: boolean, readback?: boolean): void {
  arrayAssertOwner(host)
  if(!readback&&([host.models,host.fields].some(view=>view.requestState!==RequestState.Loaded)
    ||host.fields.total!==host.fields.rows.length-host.fields.dirtyTracking.pendingCreateIds.size+host.fields.dirtyTracking.pendingDeleteIds.size))throw new Error('数组正式查询未完整读取')
  if(arrayIdentity(host)!==host.flow.identity&&!(owned&&arrayIdentity(host)===host.flow.renamedIdentity))throw new Error('数组模型注册名或来源已变化，请重新打开')
  for(const table of host.views.map(view=>view.dataTable))for(const view of Object.values(table?.views??{})) {
    for(const id of new Set([...view.rows.map(r=>view.getPkKey(r)),...view.dirtyTracking.pendingDeleteIds])) {
      if(id===undefined)throw new Error('数组编辑记录身份无效')
      const header=view===host.fields&&host.flow.fieldIds.has(String(id))
      const own=view===host.models&&id===host.modelId||header||owned&&host.flow.staged.some(s=>s.view===view&&s.id===id)
      if((view.hasEditingChanges(id)||view.dirtyTracking.hasPendingChanges(id))&&!own)throw new Error('请先处理其他模型或字段草稿')
      if(!owned&&!header&&view.dirtyTracking.hasPendingChanges(id))throw new Error('请先核验未决数组修改')
    }
  }
}
/** 流程状态；数组名称、值与描述始终在原正式模型视图。 */
export function arrayGetState(host: ArraySessionHost) {const status=arrayFlowStatus(host);return{status,pending:status!=='idle'||arrayFieldPending(host)||host.models.hasEditingChanges(host.modelId),verification:[...host.flow.verification]}}
/** 已确认表头包含正式字段身份；已有类型用于标准字段子组件渲染。 */
export function arrayHeaders(host: ArraySessionHost) {
  const rows=arrayRows(host).map(row=>host.fields.getEditingRow(String(row['rowid']))??row)
  const headers=rows.map(row=>({id:String(row['rowid']),name:String(arrayRead(host.fields,row,'Name')),
    label:String(arrayRead(host.fields,row,'description')??''),order:Number(arrayRead(host.fields,row,'Order')??0),primary:Number(arrayRead(host.fields,row,'IsPKey'))===1}))
  return headers.map(h=>{const row=rows.find(r=>r['rowid']===h.id);return{...h,type:String(row?arrayRead(host.fields,row,'FieldType'):'varchar')}}).sort((a,b)=>a.order-b.order)
}
/** 为一次表头窗口建立局部输入；取消窗口不触碰正式模型编辑域。 */
export function arrayBeginHeaders(host: ArraySessionHost) {
  arrayEditable(host);const row=host.models.getEditingRow(host.modelId)??arrayModel(host)
  return new LowcodeDataSpaceArrayDraft(host.dataSet,{name:String(row['Name']),description:String(row['description']??''),items:String(row['items']),headers:arrayHeaders(host)})
}
function arrayEditable(host: ArraySessionHost): void {
  arrayClean(host)
  if(arrayFlowStatus(host)!=='idle')throw new Error('请先核验未决数组修改')
  if(arraySnapshot(host)!==host.flow.baseline)throw new Error('数组正式定义已变化，请重新打开')
}
/** 确认表头及已按稳定身份迁移的items；尚不发送写入。 */
export async function arrayApplyHeaders(host: ArraySessionHost, definition: ArrayDefinition): Promise<void> {
  arrayEditable(host);LowcodeDataSpaceArrayDraft.prepare(definition)
  const model=arrayModel(host)
  if(definition.name!==(host.models.getEditingRow(host.modelId)??model)['Name'])throw new Error('表头窗口所属模型名称已变化，请重新打开')
  const patch={items:definition.items,PrimaryKeyFields:definition.headers.find(h=>h.primary)?.name??''}
  const plan=arrayPlan(host, definition.headers,{...host.models.getEditingPatch(host.modelId),...patch},true,false)
  const current=arrayRows(host),before=arrayOriginalRows(host),keep=new Set(definition.headers.map(header=>header.id))
  for(const header of definition.headers) {
    const original=current.find(row=>row['rowid']===header.id)
    if(original) {
      const baseline=before.find(row=>row['rowid']===header.id),delta=plan.changes.find(change=>change.id===header.id)?.patch??{}
      const desired={Name:header.name,description:header.label,Order:header.order,IsPKey:header.primary?1:0,...header.primary?{IsOutput:1}:{}}
      const values=Object.fromEntries(Object.entries(desired).map(([key,value])=>[key,baseline&&!Object.hasOwn(delta,key)?baseline[key]:value]))
      host.flow.fieldIds.add(header.id)
      for(const [key,value]of Object.entries(values))if(value!==(host.fields.getEditingRow(header.id)??original)[key])host.fields.updateEditingValue(header.id,key,value)
    } else {
      const prepared=LowcodeDataSpaceArrayDraft.prepare(definition).fields.find(field=>field.Name===header.name)
      if(!prepared)throw new Error('新增表头未形成有效定义')
      const createdBefore=new Set(host.fields.dirtyTracking.pendingCreateIds)
      try {await host.fields.addRow({...prepared,dataSetId:host.targetId,dataModelId:host.modelId})}
      finally {for(const id of host.fields.dirtyTracking.pendingCreateIds)if(!createdBefore.has(id))host.flow.fieldIds.add(String(id))}
      arrayAssertOwner(host)
    }
  }
  for(const row of current)if(!keep.has(String(row['rowid']))) {
    const id=String(row['rowid']);host.flow.fieldIds.add(id)
    if(await host.fields.removeRow(id)!==true)throw new Error('数组字段删除未暂存')
    arrayAssertOwner(host)
  }
  for(const [key,value] of Object.entries(patch)) {
    const next=key==='PrimaryKeyFields'&&value===(model[key]??'')?model[key]:value
    if(next!==(host.models.getEditingRow(host.modelId)??model)[key])host.models.updateEditingValue(host.modelId,key,next)
  }
}
function arrayPermissions(view: DataView, row: DataRow, patch: Record<string, unknown>): void {
  if(!Object.keys(patch).length)return
  const id=view.getPkKey(row)
  if((id!==undefined&&view.dirtyTracking.isPendingCreate(id)?view.addActionState():view.editActionState(row))!=='enabled'||Object.keys(patch).some(key=>view.fieldAccess(row,key).read!=='visible'||view.fieldAccess(row,key).write!=='allowed'))throw new Error('数组定义字段当前不可写')
}
function arrayReferenceViews(host: ArraySessionHost): DataView[] {
  if(!host.dependencies)throw new Error('数组引用尚未按命令读取')
  return host.dependencies.views
}
function arrayReferenceView(host: ArraySessionHost, reference: ModelNameChange): DataView | undefined {
  if(reference.table===host.models.tableName&&reference.id===host.modelId)return host.models
  if(reference.table===host.fields.tableName&&arrayRows(host).some(row=>row['rowid']===reference.id))return host.fields
  return arrayReferenceViews(host).find(view=>view.tableName===reference.table&&view.rows.some(row=>row['rowid']===reference.id))
}
function arrayPlan(host: ArraySessionHost, headers: ArrayDefinition['headers'] = arrayHeaders(host), modelPatch: Record<string, unknown> = {...host.models.getEditingPatch(host.modelId)}, structural = arrayFieldPending(host), withReferences = true) {
  const model=arrayModel(host),rows=arrayOriginalRows(host),prepared=LowcodeDataSpaceArrayDraft.prepare({name:String(model['Name']),description:String(modelPatch['description']??model['description']??''),
    items:String(modelPatch['items']??model['items']),headers})
  if(!structural&&prepared.model.PrimaryKeyFields!==(model['PrimaryKeyFields']??''))throw new Error('数组主键声明与表头不一致，请先通过设置表头确认')
  if(Object.keys(modelPatch).some(key=>!['Name','description','items','PrimaryKeyFields'].includes(key)))throw new Error('请先处理数组窗口以外的模型修改')
  const patch:Record<string,unknown>=Object.fromEntries(Object.entries({...modelPatch,PrimaryKeyFields:prepared.model.PrimaryKeyFields})
    .filter(([key,value])=>value!==(key==='PrimaryKeyFields'?model[key]??'':model[key])))
  arrayPermissions(host.models,model,patch)
  const changes:ArrayFieldChange[]=[],additions:Array<Record<string,unknown>>=[],removals=rows.filter(r=>!headers.some(h=>h.id===r['rowid']))
  for(const header of headers) {
    const original=rows.find(r=>r['rowid']===header.id)
    if(!original) {
      const staged=host.fields.dirtyTracking.isPendingCreate(header.id)&&host.flow.fieldIds.has(header.id)
      if(host.fields.rows.some(r=>r['rowid']===header.id)&&!staged)throw new Error('表头不能借用其他模型字段身份')
      const field=prepared.fields.find(f=>f.Name===header.name)
      if(!field)throw new Error('新增表头未形成有效定义')
      additions.push({...field,dataSetId:host.targetId,dataModelId:host.modelId,...staged?{rowid:header.id}:{}});continue
    }
    const values:Record<string,unknown>={Name:header.name,description:header.label,Order:header.order,IsPKey:header.primary?1:0,...header.primary?{IsOutput:1}:{}}
    const delta=Object.fromEntries(Object.entries(values).filter(([key,value])=>key==='Order'||key==='IsPKey'||key==='IsOutput'?Number(original[key]??0)!==value:key==='description'?String(original[key]??'')!==value:original[key]!==value))
    if(Object.keys(delta).length){arrayPermissions(host.fields,original,delta);changes.push({id:header.id,original,patch:delta})}
  }
  if(additions.length&&host.fields.addActionState()!=='enabled')throw new Error('当前查询不允许新增数组字段')
  if(removals.some(row=>host.fields.deleteActionState(row)!=='enabled'))throw new Error('当前查询不允许删除数组字段')
  const candidateRows=rows.filter(r=>!removals.includes(r)).map(r=>({...r,...changes.find(c=>c.id===r['rowid'])?.patch}))
  const candidate=DataSpaceDesignApi.projectModel({...model,...patch},[...candidateRows,...additions.map((r,index)=>({...r,rowid:`new:${index}`}))],'')
  if(structural)DataSpaceDesignApi.resolveFields(candidate)
  const fieldRenames=changes.filter(change=>Object.hasOwn(change.patch,'Name')).map(change=>({id:change.id,name:String(change.patch['Name'])}))
  const references:ModelNameChange[]=withReferences&&fieldRenames.length?LowcodeDataSpaceFieldRemoveReferences.prepareRenames(arrayReferenceViews(host),host.modelId,fieldRenames,prepared.model.PrimaryKeyFields):[]
  const projected=[...references,...fieldRenames.map(item=>({table:host.fields.tableName,id:item.id,property:'Name',before:String(rows.find(row=>row['rowid']===item.id)?.['Name']),after:item.name}))]
  if(withReferences&&Object.hasOwn(patch,'Name'))for(const change of LowcodeDataSpaceModelRenameReferences.prepare(arrayReferenceViews(host),host.modelId,String(patch['Name']),undefined,projected)) {
    const previous=references.findIndex(item=>item.table===change.table&&item.id===change.id&&item.property===change.property)
    const original=references[previous]
    if(!original)references.push(change);else references[previous]={...change,before:original.before}
  }
  for(const reference of references) {
    const view=arrayReferenceView(host, reference),row=view?.rows.find(item=>item['rowid']===reference.id)
    if(!view||!row)throw new Error('数组引用定义身份丢失')
    arrayPermissions(view,row,{[reference.property]:reference.after})
  }
  return{original:DataSpaceDesignApi.projectModel(model,rows,''),candidate,changes,removals,additions,patch,references,fieldRenames}
}
/** 放弃本次未提交表头与模型数据编辑。 */
export function arrayDiscard(host: ArraySessionHost): void {arrayEditable(host);host.models.discardEditingRows([host.modelId]);host.fields.discardPendingChanges([...host.flow.fieldIds]);host.flow.fieldIds.clear()}
function arrayQueryFilter(host: ArraySessionHost, view: DataView, modelOnly?: boolean) {
  const space={field:'dataSetId',operator:'eq' as const,value:host.targetId},filters=[space]
  if(modelOnly||view.queryContext['modelId']!==undefined)filters.push({field:view===host.models?'rowid':'dataModelId',operator:'eq',value:host.modelId})
  if(view.queryContext['modelId']!==undefined)filters.push({field:'type',operator:'eq',value:'dataModel'})
  return filters.length===1?space:{logic:'and' as const,filters}
}
async function arrayFresh(host: ArraySessionHost, plan: ArrayPlan): Promise<void> {
  if(host.dependencies) {
    const before=arrayReferenceSnapshot(host)
    await host.dependencies.load(true);arrayClean(host)
    if(arrayReferenceSnapshot(host)!==before)throw new Error('数组引用定义已变化，请重新保存前核验')
  }
  for(const source of [host.models,host.fields]) {
    const query=source.createQueryView(`arrayCheck_${crypto.randomUUID().replaceAll('-','')}`)
    try {
      const loaded=await query.loadFromServer({filter:arrayQueryFilter(host, source,true),allPages:true,maxRows:50000})
      arrayClean(host)
      if(!loaded.success||query.total!==query.rows.length)throw new Error('数组定义未完整读取')
      const before=source===host.models?[arrayModel(host)]:arrayOriginalRows(host),after=source===host.models?query.rows.filter(r=>r['rowid']===host.modelId):arrayRows(host, query)
      if(before.length!==after.length||before.some(row=>{const current=after.find(r=>r['rowid']===row['rowid']);return !current||JSON.stringify(arrayValues(source,row))!==JSON.stringify(arrayValues(query,current))}))throw new Error('数组正式定义已变化，请重新打开')
      const current=(id:string):DataRow=>{const row=after.find(r=>r['rowid']===id);if(!row)throw new Error('数组正式记录已消失');return row}
      if(source===host.models)arrayPermissions(query,current(host.modelId),plan.patch)
      else if(source===host.fields) {
        for(const change of plan.changes)arrayPermissions(query,current(change.id),change.patch)
        if(plan.additions.length&&query.addActionState()!=='enabled'||plan.removals.some(r=>query.deleteActionState(current(String(r['rowid'])))!=='enabled'))throw new Error('数组字段增删权限已变化')
      }
      for(const reference of plan.references.filter(item=>arrayReferenceView(host, item)===source))arrayPermissions(query,current(reference.id),{[reference.property]:reference.after})
    }finally{source.dataTable?.destroyView(query.viewId)}
  }
  for(const reference of plan.references) {
    const view=arrayReferenceViews(host).find(candidate=>candidate.tableName===reference.table),row=view?.rows.find(item=>item['rowid']===reference.id)
    if(!view||!row)throw new Error('数组引用身份已变化')
    arrayPermissions(view,row,{[reference.property]:reference.after})
  }
}
async function arrayUpdate(host: ArraySessionHost, view: DataView, id: string, patch: Record<string, unknown>): Promise<void> {
  for(const [key,value]of Object.entries(patch))view.updateEditingValue(id,key,value)
  try {
    const result=await view.applyEditingRows([id])
    if(!result.success||result.data?.appliedCount!==1||result.data.failedCount)throw new Error('数组定义编辑未完整应用')
  } finally {
    const row=view.rows.find(r=>view.getPkKey(r)===id)
    if(row)host.flow.staged.push({view,id,after:JSON.stringify(row),values:patch})
  }
}
/** 所有预检通过后，同一DataSet批次保存模型items、表头增改删及正式引用。 */
export async function arraySave(host: ArraySessionHost): Promise<void> {
  arrayEditable(host);const local=arrayPlan(host, undefined,undefined,undefined,false),draft=JSON.stringify(host.models.getEditingPatch(host.modelId)),headers=arrayFieldFingerprint(host)
  host.flow.status='saving'
  let plan:ArrayPlan
  try {
    if(Object.hasOwn(local.patch,'Name')||local.fieldRenames.length||local.removals.length) {
      if(!host.dependencies) {
        host.dependencies=new LowcodeDataSpaceModelDependencies(host.dataSet,host.targetId,host.modelId,`array:${host.fields.viewId}`,
          ()=>host.lifecycle.assertCurrent(),{view:host.models,id:host.modelId},undefined,
          ()=>[{view:host.fields,ids:[...host.flow.fieldIds].filter(id=>host.fields.hasEditingChanges(id)||host.fields.dirtyTracking.hasPendingChanges(id)),allowPending:true}])
        host.views.push(...host.dependencies.views)
      }
      await host.dependencies.load()
    }
    arrayClean(host)
    if(arraySnapshot(host)!==host.flow.baseline||draft!==JSON.stringify(host.models.getEditingPatch(host.modelId))||headers!==arrayFieldFingerprint(host))throw new Error('数组预检期间输入已变化')
    plan=arrayPlan(host)
  }catch(cause){host.flow.status='idle';throw cause}
  const modelBefore=arrayValues(host.models,arrayModel(host)),fieldsBefore=arrayOriginalRows(host).map(row=>arrayValues(host.fields,row))
  if(!Object.keys(plan.patch).length&&!plan.changes.length&&!plan.additions.length&&!plan.removals.length){host.flow.fieldIds.clear();host.flow.status='idle';return}
  const structural=Object.hasOwn(plan.patch,'Name')||Object.hasOwn(plan.patch,'PrimaryKeyFields')
    ||plan.changes.length>0||plan.additions.length>0||plan.removals.length>0
  const updates:Array<{view:DataView;id:string;patch:Record<string,unknown>}>=[]
  if(Object.keys(plan.patch).length)updates.push({view:host.models,id:host.modelId,patch:{...plan.patch}})
  for(const change of plan.changes)updates.push({view:host.fields,id:change.id,patch:{...change.patch}})
  for(const reference of plan.references) {
    if(reference.table===host.fields.tableName&&plan.removals.some(row=>row['rowid']===reference.id))continue
    const view=arrayReferenceView(host, reference)
    if(!view)throw new Error('改名引用所属元模型无效')
    const existing=updates.find(item=>item.view===view&&item.id===reference.id)
    if(existing)existing.patch[reference.property]=reference.after
    else updates.push({view,id:reference.id,patch:{[reference.property]:reference.after}})
  }
  host.flow.status='saving';host.flow.staged=[];host.flow.confirmed=false;host.flow.rename=undefined;host.flow.renamedIdentity=undefined;host.flow.fieldRenames=plan.fieldRenames;host.flow.referenceSnapshot=''
  let guard=()=>{}
  await DataSpaceDefinitionSave.run([{
    dataSet:host.dataSet,targetId:host.targetId,modelId:host.modelId,
    prepare:async()=>{
      if(Object.hasOwn(plan.patch,'Name')||plan.fieldRenames.length||plan.changes.some(change=>Object.hasOwn(change.patch,'IsPKey'))) {
        host.flow.rename={plan:await host.lifecycle.prepareRename(plan),before:plan.original.name,after:plan.candidate.name}
        host.flow.renamedIdentity=arrayIdentity(host, plan.candidate.name)
      }
      guard=await host.lifecycle.validate(plan,host.dependencies?.views??[host.models,host.fields])
      if(structural)await arrayFresh(host, plan)
      if(arraySnapshot(host)!==host.flow.baseline||draft!==JSON.stringify(host.models.getEditingPatch(host.modelId))||headers!==arrayFieldFingerprint(host))throw new Error('数组预检期间输入已变化')
      if(JSON.stringify(arrayPlan(host).references)!==JSON.stringify(plan.references))throw new Error('数组改名引用已变化，请重新保存前核验')
    },
    apply:async()=>{
      for(const item of updates)await arrayUpdate(host, item.view,item.id,item.patch)
      for(const values of plan.additions) {
        const id=values['rowid']
        if(typeof id!=='string'||!host.flow.fieldIds.has(id)||!host.fields.dirtyTracking.isPendingCreate(id))throw new Error('新增数组字段未取得唯一身份')
        try {
          const result=await host.fields.applyEditingRows([id])
          if(!result.success)throw new Error('新增数组字段编辑未完整应用')
        } finally {
          const row=host.fields.rows.find(candidate=>candidate['rowid']===id)
          if(!row||Object.entries(values).some(([key,value])=>row[key]!==value))throw new Error('新增数组字段草稿已变化')
          host.flow.staged.push({view:host.fields,id,after:JSON.stringify(row),values,created:true})
        }
      }
      for(const row of plan.removals) {
        const id=String(row['rowid'])
        if(!host.fields.dirtyTracking.pendingDeleteIds.has(id))throw new Error('数组字段删除未暂存')
        host.flow.staged.push({view:host.fields,id,after:JSON.stringify(host.fields.dirtyTracking.getPendingDeleteSnapshot(id)),values:null})
      }
    },
    check:async()=>{
      await host.flow.rename?.plan.assertCurrent()
      arrayAssertStaged(host);guard()
      if(host.models.hasEditingChanges()||host.fields.hasEditingChanges()
        ||Object.entries({...modelBefore,...updates.find(item=>item.view===host.models&&item.id===host.modelId)?.patch}).some(([key,value])=>arrayModel(host)[key]!==value))throw new Error('数组提交前定义已变化')
      const remaining=fieldsBefore.filter(row=>!plan.removals.some(r=>r['rowid']===row['rowid']))
      if(arrayRows(host).length!==remaining.length+plan.additions.length||remaining.some(row=>{
        const current=arrayRows(host).find(r=>r['rowid']===row['rowid']),patch=updates.find(c=>c.view===host.fields&&c.id===row['rowid'])?.patch
        return !current||Object.entries({...row,...patch}).some(([key,value])=>current[key]!==value)
      }))throw new Error('数组提交前字段定义已变化')
      if(plan.fieldRenames.length)host.flow.referenceSnapshot=arrayReferenceSnapshot(host, true)
    },
    targets:()=>host.views.map(view=>({tableName:view.tableName,viewId:view.viewId,ids:host.flow.staged.filter(s=>s.view===view).map(s=>s.id)})).filter(v=>v.ids.length),
    dispatched:()=>host.lifecycle.onDispatch(),
    confirm:async()=>{
      host.flow.confirmed=true
      if(structural){if(!await arrayReadback(host))throw new Error('数组正式回读与提交定义不一致')}
      else {
        const row=arrayModel(host)
        if(Object.entries(plan.patch).some(([key,value])=>!Object.is(arrayRead(host.models,row,key),value)))throw new Error('数组保存结果与提交值不一致')
      }
      await arrayCompleteRename(host, false);arrayFinish(host)
    },
    failed:stage=>{if(host.flow.status!=='configuration')host.flow.status=stage==='dispatched'?'unknown':'readback';if(stage==='preparing'||stage==='applying'){
      const applied=host.flow.staged.filter(item=>!item.created&&item.values!==null)
      for(const item of applied) {
        const row=item.view.rows.find(candidate=>item.view.getPkKey(candidate)===item.id)
        if(item.view.hasEditingChanges(item.id)||JSON.stringify(row)!==item.after)throw new Error('数组未提交草稿已变化，不能覆盖')
      }
      for(const item of applied) {
        item.view.discardPendingChanges([item.id])
        const patch=item.view===host.models&&item.id===host.modelId?plan.patch:item.view===host.fields?plan.changes.find(change=>change.id===item.id)?.patch:undefined
        for(const [key,value]of Object.entries(patch??{}))item.view.updateEditingValue(item.id,key,value)
      }
      host.flow.staged=[];host.flow.rename=undefined;host.flow.renamedIdentity=undefined;host.flow.fieldRenames=[];host.flow.referenceSnapshot=''
      host.flow.status='idle'
    }},
  }])
}
function arrayAssertStaged(host: ArraySessionHost): void {
  arrayClean(host, true)
  for(const item of host.flow.staged) {
    const row=item.values===null?item.view.dirtyTracking.getPendingDeleteSnapshot(item.id):item.view.rows.find(r=>item.view.getPkKey(r)===item.id)
    if(!row||item.view.hasEditingChanges(item.id)||JSON.stringify(row)!==item.after)throw new Error('数组提交草稿被其他操作改变')
    if(item.values===null){if(item.view.deleteActionState(row)!=='enabled')throw new Error('数组字段删除权限已变化')}
    else if(item.view.dirtyTracking.pendingCreateIds.has(item.id)){if(item.view.addActionState()!=='enabled')throw new Error('数组字段新增权限已变化')}
    else arrayPermissions(item.view,row,item.values)
  }
}
function arrayDiscardOwned(host: ArraySessionHost, readback?: boolean): void {
  arrayClean(host, true,readback)
  for(const item of host.flow.staged) {
    const row=item.values===null?item.view.dirtyTracking.getPendingDeleteSnapshot(item.id):item.view.rows.find(r=>item.view.getPkKey(r)===item.id)
    if(item.view.hasEditingChanges(item.id)||item.view.dirtyTracking.hasPendingChanges(item.id)&&JSON.stringify(row)!==item.after)throw new Error('数组未决草稿已变化，不能覆盖')
  }
  for(const item of host.flow.staged)item.view.discardPendingChanges([item.id])
}
async function arrayReadback(host: ArraySessionHost): Promise<boolean> {
  arrayClean(host, true,true)
  for(const view of [host.models,host.fields]) {
    if(view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw new Error('数组定义仍有未决草稿，不能覆盖')
    const result=await view.loadFromServer(view===host.fields?{filter:arrayQueryFilter(host, view),sort:'rowid:asc',allPages:true,maxRows:50000}:{})
    arrayAssertOwner(host);if(!result.success||view.loadingError)throw new Error('数组定义回读失败')
  }
  await host.dependencies?.load(true)
  arrayClean(host, true)
  host.flow.verification=host.flow.staged.flatMap(item=>{
    const rows=item.view.rows.filter(r=>r['rowid']===item.id),row=rows[0]
    const ok=item.values===null?!row&&host.flow.confirmed:rows.length===1&&row&&Object.entries(item.values).every(([key,value])=>item.view.fieldAccess(row,key).read==='visible'&&Object.is(row[key],value))
    return ok?[]:[`${item.view.tableName}(${item.id})：${item.values===null&&!row?'删除结果缺少正式回执':'正式记录与提交值不一致'}`]
  })
  if(host.flow.rename&&host.flow.rename.before!==host.flow.rename.after) {
    const remaining=LowcodeDataSpaceModelRenameReferences.prepare(arrayReferenceViews(host),host.modelId,host.flow.rename.after,host.flow.rename.before)
    host.flow.verification.push(...remaining.map(change=>`${change.table}(${change.id}).${change.property}：仍有旧注册名或引用；未自动补写`))
  }
  if(host.flow.fieldRenames.length&&arrayReferenceSnapshot(host)!==host.flow.referenceSnapshot)host.flow.verification.push('字段改名涉及的正式定义集合已变化；未自动改写并发引用')
  host.dependencies?.invalidate(host.flow.staged.map(item=>({table:item.view.tableName,id:item.id})),[host.models,host.fields])
  host.flow.verified=arraySnapshot(host);return host.flow.verification.length===0
}
async function arrayCompleteRename(host: ArraySessionHost, reconcile: boolean): Promise<void> {
  if(host.flow.rename){host.flow.status='configuration';await host.flow.rename.plan.complete(reconcile)}
}
function arrayFinish(host: ArraySessionHost): void {host.flow.fieldIds.clear();host.flow.identity=arrayIdentity(host);host.flow.baseline=arraySnapshot(host);host.flow.staged=[];host.flow.status='idle';host.flow.verification=[];host.flow.verified='';host.flow.rename=undefined;host.flow.renamedIdentity=undefined;host.flow.fieldRenames=[];host.flow.referenceSnapshot='';host.lifecycle.completed()}
/** 只重新查询，不重放未知批次；删除缺失时仍须正式回执才能确认。 */
export async function arrayVerify(host: ArraySessionHost): Promise<boolean> {
  const recovery = arrayFlowStatus(host)
  if (!['unknown', 'readback', 'different', 'configuration'].includes(recovery)) throw new Error('没有待核验的数组提交')
  const reconcile = recovery === 'configuration'
  host.dataSet.abandonUnconfirmedSaves()
  arrayDiscardOwned(host, true); host.flow.status = 'saving'
  try {
    const confirmed = await arrayReadback(host)
    if (confirmed) {await arrayCompleteRename(host, reconcile); arrayFinish(host)} else host.flow.status = 'different'
    return confirmed
  } catch (cause) {
    if (arrayGetState(host).status !== 'configuration') host.flow.status = 'readback'
    throw cause
  }
}
/** 显式接受刚回读的实际定义，不补写、补删或宣称原批次成功。 */
export function arrayAcceptCurrent(host: ArraySessionHost): void {arrayClean(host, true);if(host.flow.status!=='different'||arraySnapshot(host)!==host.flow.verified)throw new Error('请先核验当前正式结果');arrayFinish(host)}
/** 关闭已完成或已取消的窗口，释放独立依赖查询；未决提交保留原入口。 */
export function arrayRelease(host: ArraySessionHost): void {
  if(arrayGetState(host).pending)throw new Error('数组修改尚未结束，不能释放')
  host.dependencies?.release();host.dependencies=undefined;host.views.splice(2)
}
export type ArrayEditHandle = {
  getState(): ReturnType<typeof arrayGetState>
  headers(): ReturnType<typeof arrayHeaders>
  beginHeaders(): ReturnType<typeof arrayBeginHeaders>
  applyHeaders(definition: ArrayDefinition): Promise<void>
  discard(): void
  save(): Promise<void>
  verify(): Promise<boolean>
  acceptCurrent(): void
  release(): void
}

export function createArrayHandle(host: ArraySessionHost): ArrayEditHandle {
  return {
    getState: () => arrayGetState(host),
    headers: () => arrayHeaders(host),
    beginHeaders: () => arrayBeginHeaders(host),
    applyHeaders: definition => arrayApplyHeaders(host, definition),
    discard: () => arrayDiscard(host),
    save: () => arraySave(host),
    verify: () => arrayVerify(host),
    acceptCurrent: () => arrayAcceptCurrent(host),
    release: () => arrayRelease(host),
  }
}
