/**
 * @module app:lowcode/data-space/model-source/array/lowcode-data-space-array-edit
 * 职责：已有数组的名称、表头、数据成员及正式引用差异共同保存与核验。
 * 边界：原DataView持有正式数据与权限；局部表头只承载未确认输入，不重置已有字段属性。
 * AI用途：数组设置表头、确认、取消与未知回执核验，复用DataSet定义批次。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataSpaceArrayDraft, type ArrayDefinition} from './lowcode-data-space-array-draft'
import {DataSpaceDefinitionSave} from '../save/data-space-definition-save'
import {LowcodeDataSpaceModelRenameReferences, type ModelNameChange} from '../rename/lowcode-data-space-model-rename-references'
import type {ModelRenameFilePlan} from '../rename/lowcode-data-space-model-rename'
import {LowcodeDataSpaceFieldRemoveReferences, type FieldRename} from '../removal/lowcode-data-space-field-remove-references'
import {LowcodeDataSpaceModelDependencies} from '../lowcode-data-space-model-dependencies'

/** 一条已有数组字段的差异；不改变其他属性或正式身份。 */
type ArrayFieldChange = {
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

/** 单个已存在数组的编辑事务；数据库批次仍由原元数据DataSet执行。 */
export class LowcodeDataSpaceArrayEdit {
  readonly #models:DataView
  readonly #fields:DataView
  readonly #views:DataView[]
  readonly #contexts:string[]
  #dependencies:LowcodeDataSpaceModelDependencies|undefined
  #identity:string
  #renamedIdentity:string|undefined
  #rename:{plan:ModelRenameFilePlan;before:string;after:string}|undefined
  #baseline:string
  /** 本次表头命令涉及的字段身份；所有可编辑值及增删状态归原字段DataView。 */
  readonly #fieldIds=new Set<string>()
  #status:'idle'|'saving'|'unknown'|'readback'|'different'|'configuration'='idle'
  #staged:Array<{view:DataView;id:string;after:string;values:Record<string,unknown>|null;created?:true}>=[]
  #confirmed=false
  #verified=''
  #verification:string[]=[]
  #fieldRenames:FieldRename[]=[]
  #referenceSnapshot=''

  /** 捕获原查询范围；校验和提交前仍检查实时数据权限。 */
  constructor(private readonly dataSet:DataSet,private readonly targetId:string,private readonly modelId:string,
    private readonly lifecycle:{assertCurrent():void;onDispatch():void;completed():void;validate(change:ArrayDefinitionChange,views:readonly DataView[]):Promise<()=>void>;
      prepareRename(change:ArrayDefinitionChange):Promise<ModelRenameFilePlan>}, fieldViewId:'default'|'modelFields'='default') {
    const models=dataSet.getView('Base_DataModel'),fields=dataSet.getView('Base_DataModel_Field',fieldViewId)
    if(!models||!fields)throw new Error('缺少数组正式定义视图')
    if(fieldViewId!=='default'&&(fields.queryContext['modelId']!==modelId||fields.requestState!==RequestState.Loaded))throw new Error('数组字段视图未读取或所属模型不符')
    this.#models=models;this.#fields=fields;this.#views=[models,fields];this.#contexts=this.#views.map(v=>JSON.stringify(v.queryContext))
    this.#identity=this.identity();this.#baseline=this.snapshot()
  }
  private assertOwner():void {
    this.lifecycle.assertCurrent()
    this.#dependencies?.assertOwner()
    for(const [index,view] of this.#views.entries()) {
      if(this.dataSet.destroyed||this.dataSet.getView(view.tableName,view.viewId)!==view||view.dataTable?.modelBinding?.modelName!==view.tableName
        ||view.queryContext['dataSpaceId']!==this.targetId||index<2&&JSON.stringify(view.queryContext)!==this.#contexts[index]
        ||view.requestState===RequestState.Loading||view.mutating)throw new Error('数组正式查询或目标已变化')
    }
  }
  private model():DataRow {
    this.assertOwner()
    const rows=this.#models.rows.filter(r=>r['rowid']===this.modelId),row=rows[0]
    if(rows.length!==1||row?.['dataSetId']!==this.targetId||row['Type']!=='数组'||this.#models.getPkKey(row)!==this.modelId)throw new Error('数组模型身份或来源无效')
    return row
  }
  private identity(name?:string):string {const row=this.model();return JSON.stringify(['rowid','dataSetId','Name','MetaName','Type'].map(key=>key==='Name'&&name!==undefined?name:this.read(this.#models,row,key)))}
  private rows(view=this.#fields):DataRow[] {
    const ids=new Set<string>()
    for(const row of view.rows) {
      for(const key of ['rowid','dataSetId','dataModelId','type'])this.read(view,row,key)
      const id=view.getPkKey(row)
      if(typeof id!=='string'||id!==row['rowid']||ids.has(id)||row['dataSetId']!==this.targetId
        ||view.queryContext['modelId']!==undefined&&(row['dataModelId']!==this.modelId||row['type']!=='dataModel'))throw new Error('数组字段身份或归属不完整')
      ids.add(id)
    }
    return view.rows.filter(r=>r['dataModelId']===this.modelId&&r['type']==='dataModel')
  }
  private read(view:DataView,row:DataRow,key:string):unknown {
    if(view.columns.some(c=>c.name===key)&&view.fieldAccess(row,key).read!=='visible')throw new Error(`数组定义不可读：${key}`)
    return row[key]
  }
  private values(view:DataView,row:DataRow):Record<string,unknown> {
    return Object.fromEntries(view.columns.filter(c=>!['updatetime','updateuser'].includes(c.name)).map(c=>[c.name,this.read(view,row,c.name)]))
  }
  private originalRows():DataRow[] {
    const tracking=this.#fields.dirtyTracking
    const rows=this.rows().filter(row=>!this.#fieldIds.has(String(row['rowid']))||!tracking.isPendingCreate(String(row['rowid'])))
      .map(row=>{
        const id=String(row['rowid'])
        if(!this.#fieldIds.has(id)||!tracking.isDirty(id))return row
        const original=tracking.getOriginal(id)
        if(!original)throw new Error('数组字段原查询基线不可确认')
        return original
      })
    for(const id of this.#fieldIds)if(tracking.pendingDeleteIds.has(id)) {
      const original=tracking.getPendingDeleteSnapshot(id)
      if(!original)throw new Error('数组字段删除基线不可确认')
      rows.push(original)
    }
    return rows.sort((a,b)=>String(a['rowid']).localeCompare(String(b['rowid'])))
  }
  private fieldPending():boolean{return [...this.#fieldIds].some(id=>this.#fields.hasEditingChanges(id)||this.#fields.dirtyTracking.hasPendingChanges(id))}
  private fieldFingerprint():string{return JSON.stringify([this.headers(),[...this.#fieldIds].sort().map(id=>[id,this.#fields.getEditingPatch(id),this.#fields.dirtyTracking.isPendingCreate(id),this.#fields.dirtyTracking.pendingDeleteIds.has(id)])])}
  private snapshot():string{return JSON.stringify([this.values(this.#models,this.model()),this.originalRows().map(row=>this.values(this.#fields,row))])}
  private referenceSnapshot(projected=false):string{return JSON.stringify(this.referenceViews().map(view=>view.rows
    .filter(row=>!this.#staged.some(item=>item.view.tableName===view.tableName&&item.id===row['rowid']&&(item.created===true||projected&&item.values===null)))
    .map(row=>({...this.values(view,row),...projected?this.#staged.find(item=>item.view.tableName===view.tableName&&item.id===row['rowid'])?.values:{}}))
    .sort((a,b)=>String(a['rowid']).localeCompare(String(b['rowid'])))))}
  private clean(owned=false,readback=false):void {
    this.assertOwner()
    if(!readback&&([this.#models,this.#fields].some(view=>view.requestState!==RequestState.Loaded)
      ||this.#fields.total!==this.#fields.rows.length-this.#fields.dirtyTracking.pendingCreateIds.size+this.#fields.dirtyTracking.pendingDeleteIds.size))throw new Error('数组正式查询未完整读取')
    if(this.identity()!==this.#identity&&!(owned&&this.identity()===this.#renamedIdentity))throw new Error('数组模型注册名或来源已变化，请重新打开')
    for(const table of this.#views.map(view=>view.dataTable))for(const view of Object.values(table?.views??{})) {
      for(const id of new Set([...view.rows.map(r=>view.getPkKey(r)),...view.dirtyTracking.pendingDeleteIds])) {
        if(id===undefined)throw new Error('数组编辑记录身份无效')
        const header=view===this.#fields&&this.#fieldIds.has(String(id))
        const own=view===this.#models&&id===this.modelId||header||owned&&this.#staged.some(s=>s.view===view&&s.id===id)
        if((view.hasEditingChanges(id)||view.dirtyTracking.hasPendingChanges(id))&&!own)throw new Error('请先处理其他模型或字段草稿')
        if(!owned&&!header&&view.dirtyTracking.hasPendingChanges(id))throw new Error('请先核验未决数组修改')
      }
    }
  }
  /** 流程状态；数组名称、值与描述始终在原正式模型视图。 */
  getState(){return{status:this.#status,pending:this.#status!=='idle'||this.fieldPending()||this.#models.hasEditingChanges(this.modelId),verification:[...this.#verification]}}
  /** 已确认表头包含正式字段身份；已有类型用于标准字段子组件渲染。 */
  headers():Array<ArrayDefinition['headers'][number]&{type:string}> {
    const rows=this.rows().map(row=>this.#fields.getEditingRow(String(row['rowid']))??row)
    const headers=rows.map(row=>({id:String(row['rowid']),name:String(this.read(this.#fields,row,'Name')),
      label:String(this.read(this.#fields,row,'description')??''),order:Number(this.read(this.#fields,row,'Order')??0),primary:Number(this.read(this.#fields,row,'IsPKey'))===1}))
    return headers.map(h=>{const row=rows.find(r=>r['rowid']===h.id);return{...h,type:String(row?this.read(this.#fields,row,'FieldType'):'varchar')}}).sort((a,b)=>a.order-b.order)
  }
  /** 为一次表头窗口建立局部输入；取消窗口不触碰正式模型编辑域。 */
  beginHeaders():LowcodeDataSpaceArrayDraft {
    this.editable();const row=this.#models.getEditingRow(this.modelId)??this.model()
    return new LowcodeDataSpaceArrayDraft(this.dataSet,{name:String(row['Name']),description:String(row['description']??''),items:String(row['items']),headers:this.headers()})
  }
  private editable():void {
    this.clean()
    if(this.#status!=='idle')throw new Error('请先核验未决数组修改')
    if(this.snapshot()!==this.#baseline)throw new Error('数组正式定义已变化，请重新打开')
  }
  /** 确认表头及已按稳定身份迁移的items；尚不发送写入。 */
  async applyHeaders(definition:ArrayDefinition):Promise<void> {
    this.editable();LowcodeDataSpaceArrayDraft.prepare(definition)
    const model=this.model()
    if(definition.name!==(this.#models.getEditingRow(this.modelId)??model)['Name'])throw new Error('表头窗口所属模型名称已变化，请重新打开')
    const patch={items:definition.items,PrimaryKeyFields:definition.headers.find(h=>h.primary)?.name??''}
    const plan=this.plan(definition.headers,{...this.#models.getEditingPatch(this.modelId),...patch},true,false)
    const current=this.rows(),before=this.originalRows(),keep=new Set(definition.headers.map(header=>header.id))
    for(const header of definition.headers) {
      const original=current.find(row=>row['rowid']===header.id)
      if(original) {
        const baseline=before.find(row=>row['rowid']===header.id),delta=plan.changes.find(change=>change.id===header.id)?.patch??{}
        const desired={Name:header.name,description:header.label,Order:header.order,IsPKey:header.primary?1:0,...header.primary?{IsOutput:1}:{}}
        const values=Object.fromEntries(Object.entries(desired).map(([key,value])=>[key,baseline&&!Object.hasOwn(delta,key)?baseline[key]:value]))
        this.#fieldIds.add(header.id)
        for(const [key,value]of Object.entries(values))if(value!==(this.#fields.getEditingRow(header.id)??original)[key])this.#fields.updateEditingValue(header.id,key,value)
      } else {
        const prepared=LowcodeDataSpaceArrayDraft.prepare(definition).fields.find(field=>field.Name===header.name)
        if(!prepared)throw new Error('新增表头未形成有效定义')
        const createdBefore=new Set(this.#fields.dirtyTracking.pendingCreateIds)
        try {await this.#fields.addRow({...prepared,dataSetId:this.targetId,dataModelId:this.modelId})}
        finally {for(const id of this.#fields.dirtyTracking.pendingCreateIds)if(!createdBefore.has(id))this.#fieldIds.add(String(id))}
        this.assertOwner()
      }
    }
    for(const row of current)if(!keep.has(String(row['rowid']))) {
      const id=String(row['rowid']);this.#fieldIds.add(id)
      if(await this.#fields.removeRow(id)!==true)throw new Error('数组字段删除未暂存')
      this.assertOwner()
    }
    for(const [key,value] of Object.entries(patch)) {
      const next=key==='PrimaryKeyFields'&&value===(model[key]??'')?model[key]:value
      if(next!==(this.#models.getEditingRow(this.modelId)??model)[key])this.#models.updateEditingValue(this.modelId,key,next)
    }
  }
  private permissions(view:DataView,row:DataRow,patch:Record<string,unknown>):void {
    if(!Object.keys(patch).length)return
    const id=view.getPkKey(row)
    if((id!==undefined&&view.dirtyTracking.isPendingCreate(id)?view.addActionState():view.editActionState(row))!=='enabled'||Object.keys(patch).some(key=>view.fieldAccess(row,key).read!=='visible'||view.fieldAccess(row,key).write!=='allowed'))throw new Error('数组定义字段当前不可写')
  }
  private referenceViews():DataView[] {
    if(!this.#dependencies)throw new Error('数组引用尚未按命令读取')
    return this.#dependencies.views
  }
  private referenceView(reference:ModelNameChange):DataView|undefined {
    if(reference.table===this.#models.tableName&&reference.id===this.modelId)return this.#models
    if(reference.table===this.#fields.tableName&&this.rows().some(row=>row['rowid']===reference.id))return this.#fields
    return this.referenceViews().find(view=>view.tableName===reference.table&&view.rows.some(row=>row['rowid']===reference.id))
  }
  private plan(headers:ArrayDefinition['headers']=this.headers(),modelPatch:Record<string,unknown>={...this.#models.getEditingPatch(this.modelId)},structural=this.fieldPending(),withReferences=true) {
    const model=this.model(),rows=this.originalRows(),prepared=LowcodeDataSpaceArrayDraft.prepare({name:String(model['Name']),description:String(modelPatch['description']??model['description']??''),
      items:String(modelPatch['items']??model['items']),headers})
    if(!structural&&prepared.model.PrimaryKeyFields!==(model['PrimaryKeyFields']??''))throw new Error('数组主键声明与表头不一致，请先通过设置表头确认')
    if(Object.keys(modelPatch).some(key=>!['Name','description','items','PrimaryKeyFields'].includes(key)))throw new Error('请先处理数组窗口以外的模型修改')
    const patch:Record<string,unknown>=Object.fromEntries(Object.entries({...modelPatch,PrimaryKeyFields:prepared.model.PrimaryKeyFields})
      .filter(([key,value])=>value!==(key==='PrimaryKeyFields'?model[key]??'':model[key])))
    this.permissions(this.#models,model,patch)
    const changes:ArrayFieldChange[]=[],additions:Array<Record<string,unknown>>=[],removals=rows.filter(r=>!headers.some(h=>h.id===r['rowid']))
    for(const header of headers) {
      const original=rows.find(r=>r['rowid']===header.id)
      if(!original) {
        const staged=this.#fields.dirtyTracking.isPendingCreate(header.id)&&this.#fieldIds.has(header.id)
        if(this.#fields.rows.some(r=>r['rowid']===header.id)&&!staged)throw new Error('表头不能借用其他模型字段身份')
        const field=prepared.fields.find(f=>f.Name===header.name)
        if(!field)throw new Error('新增表头未形成有效定义')
        additions.push({...field,dataSetId:this.targetId,dataModelId:this.modelId,...staged?{rowid:header.id}:{}});continue
      }
      const values:Record<string,unknown>={Name:header.name,description:header.label,Order:header.order,IsPKey:header.primary?1:0,...header.primary?{IsOutput:1}:{}}
      const delta=Object.fromEntries(Object.entries(values).filter(([key,value])=>key==='Order'||key==='IsPKey'||key==='IsOutput'?Number(original[key]??0)!==value:key==='description'?String(original[key]??'')!==value:original[key]!==value))
      if(Object.keys(delta).length){this.permissions(this.#fields,original,delta);changes.push({id:header.id,original,patch:delta})}
    }
    if(additions.length&&this.#fields.addActionState()!=='enabled')throw new Error('当前查询不允许新增数组字段')
    if(removals.some(row=>this.#fields.deleteActionState(row)!=='enabled'))throw new Error('当前查询不允许删除数组字段')
    const candidateRows=rows.filter(r=>!removals.includes(r)).map(r=>({...r,...changes.find(c=>c.id===r['rowid'])?.patch}))
    const candidate=DataSpaceDesignApi.projectModel({...model,...patch},[...candidateRows,...additions.map((r,index)=>({...r,rowid:`new:${index}`}))],'')
    if(structural)DataSpaceDesignApi.resolveFields(candidate)
    const fieldRenames=changes.filter(change=>Object.hasOwn(change.patch,'Name')).map(change=>({id:change.id,name:String(change.patch['Name'])}))
    const references:ModelNameChange[]=withReferences&&fieldRenames.length?LowcodeDataSpaceFieldRemoveReferences.prepareRenames(this.referenceViews(),this.modelId,fieldRenames,prepared.model.PrimaryKeyFields):[]
    const projected=[...references,...fieldRenames.map(item=>({table:this.#fields.tableName,id:item.id,property:'Name',before:String(rows.find(row=>row['rowid']===item.id)?.['Name']),after:item.name}))]
    if(withReferences&&Object.hasOwn(patch,'Name'))for(const change of LowcodeDataSpaceModelRenameReferences.prepare(this.referenceViews(),this.modelId,String(patch['Name']),undefined,projected)) {
      const previous=references.findIndex(item=>item.table===change.table&&item.id===change.id&&item.property===change.property)
      const original=references[previous]
      if(!original)references.push(change);else references[previous]={...change,before:original.before}
    }
    for(const reference of references) {
      const view=this.referenceView(reference),row=view?.rows.find(item=>item['rowid']===reference.id)
      if(!view||!row)throw new Error('数组引用定义身份丢失')
      this.permissions(view,row,{[reference.property]:reference.after})
    }
    return{original:DataSpaceDesignApi.projectModel(model,rows,''),candidate,changes,removals,additions,patch,references,fieldRenames}
  }
  /** 放弃本次未提交表头与模型数据编辑。 */
  discard():void{this.editable();this.#models.discardEditingRows([this.modelId]);this.#fields.discardPendingChanges([...this.#fieldIds]);this.#fieldIds.clear()}
  private queryFilter(view:DataView,modelOnly=false) {
    const space={field:'dataSetId',operator:'eq' as const,value:this.targetId},filters=[space]
    if(modelOnly||view.queryContext['modelId']!==undefined)filters.push({field:view===this.#models?'rowid':'dataModelId',operator:'eq',value:this.modelId})
    if(view.queryContext['modelId']!==undefined)filters.push({field:'type',operator:'eq',value:'dataModel'})
    return filters.length===1?space:{logic:'and' as const,filters}
  }
  private async fresh(plan:ReturnType<LowcodeDataSpaceArrayEdit['plan']>):Promise<void> {
    if(this.#dependencies) {
      const before=this.referenceSnapshot()
      await this.#dependencies.load(true);this.clean()
      if(this.referenceSnapshot()!==before)throw new Error('数组引用定义已变化，请重新保存前核验')
    }
    for(const source of [this.#models,this.#fields]) {
      const query=source.createQueryView(`arrayCheck_${crypto.randomUUID().replaceAll('-','')}`)
      try {
        const loaded=await query.loadFromServer({filter:this.queryFilter(source,true),allPages:true,maxRows:50000})
        this.clean()
        if(!loaded.success||query.total!==query.rows.length)throw new Error('数组定义未完整读取')
        const before=source===this.#models?[this.model()]:this.originalRows(),after=source===this.#models?query.rows.filter(r=>r['rowid']===this.modelId):this.rows(query)
        if(before.length!==after.length||before.some(row=>{const current=after.find(r=>r['rowid']===row['rowid']);return !current||JSON.stringify(this.values(source,row))!==JSON.stringify(this.values(query,current))}))throw new Error('数组正式定义已变化，请重新打开')
        const current=(id:string):DataRow=>{const row=after.find(r=>r['rowid']===id);if(!row)throw new Error('数组正式记录已消失');return row}
        if(source===this.#models)this.permissions(query,current(this.modelId),plan.patch)
        else if(source===this.#fields) {
          for(const change of plan.changes)this.permissions(query,current(change.id),change.patch)
          if(plan.additions.length&&query.addActionState()!=='enabled'||plan.removals.some(r=>query.deleteActionState(current(String(r['rowid'])))!=='enabled'))throw new Error('数组字段增删权限已变化')
        }
        for(const reference of plan.references.filter(item=>this.referenceView(item)===source))this.permissions(query,current(reference.id),{[reference.property]:reference.after})
      }finally{source.dataTable?.destroyView(query.viewId)}
    }
    for(const reference of plan.references) {
      const view=this.referenceViews().find(candidate=>candidate.tableName===reference.table),row=view?.rows.find(item=>item['rowid']===reference.id)
      if(!view||!row)throw new Error('数组引用身份已变化')
      this.permissions(view,row,{[reference.property]:reference.after})
    }
  }
  private async update(view:DataView,id:string,patch:Record<string,unknown>):Promise<void> {
    for(const [key,value]of Object.entries(patch))view.updateEditingValue(id,key,value)
    try {
      const result=await view.applyEditingRows([id])
      if(!result.success||result.data?.appliedCount!==1||result.data.failedCount)throw new Error('数组定义编辑未完整应用')
    } finally {
      const row=view.rows.find(r=>view.getPkKey(r)===id)
      if(row)this.#staged.push({view,id,after:JSON.stringify(row),values:patch})
    }
  }
  /** 所有预检通过后，同一DataSet批次保存模型items、表头增改删及正式引用。 */
  async save():Promise<void> {
    this.editable();const local=this.plan(undefined,undefined,undefined,false),draft=JSON.stringify(this.#models.getEditingPatch(this.modelId)),headers=this.fieldFingerprint()
    this.#status='saving'
    let plan:ReturnType<LowcodeDataSpaceArrayEdit['plan']>
    try {
      if(Object.hasOwn(local.patch,'Name')||local.fieldRenames.length||local.removals.length) {
        if(!this.#dependencies) {
          this.#dependencies=new LowcodeDataSpaceModelDependencies(this.dataSet,this.targetId,this.modelId,`array:${this.#fields.viewId}`,
            ()=>this.lifecycle.assertCurrent(),{view:this.#models,id:this.modelId},undefined,
            ()=>[{view:this.#fields,ids:[...this.#fieldIds].filter(id=>this.#fields.hasEditingChanges(id)||this.#fields.dirtyTracking.hasPendingChanges(id)),allowPending:true}])
          this.#views.push(...this.#dependencies.views)
        }
        await this.#dependencies.load()
      }
      this.clean()
      if(this.snapshot()!==this.#baseline||draft!==JSON.stringify(this.#models.getEditingPatch(this.modelId))||headers!==this.fieldFingerprint())throw new Error('数组预检期间输入已变化')
      plan=this.plan()
    }catch(cause){this.#status='idle';throw cause}
    const modelBefore=this.values(this.#models,this.model()),fieldsBefore=this.originalRows().map(row=>this.values(this.#fields,row))
    if(!Object.keys(plan.patch).length&&!plan.changes.length&&!plan.additions.length&&!plan.removals.length){this.#fieldIds.clear();this.#status='idle';return}
    const structural=Object.hasOwn(plan.patch,'Name')||Object.hasOwn(plan.patch,'PrimaryKeyFields')
      ||plan.changes.length>0||plan.additions.length>0||plan.removals.length>0
    const updates:Array<{view:DataView;id:string;patch:Record<string,unknown>}>=[]
    if(Object.keys(plan.patch).length)updates.push({view:this.#models,id:this.modelId,patch:{...plan.patch}})
    for(const change of plan.changes)updates.push({view:this.#fields,id:change.id,patch:{...change.patch}})
    for(const reference of plan.references) {
      if(reference.table===this.#fields.tableName&&plan.removals.some(row=>row['rowid']===reference.id))continue
      const view=this.referenceView(reference)
      if(!view)throw new Error('改名引用所属元模型无效')
      const existing=updates.find(item=>item.view===view&&item.id===reference.id)
      if(existing)existing.patch[reference.property]=reference.after
      else updates.push({view,id:reference.id,patch:{[reference.property]:reference.after}})
    }
    this.#status='saving';this.#staged=[];this.#confirmed=false;this.#rename=undefined;this.#renamedIdentity=undefined;this.#fieldRenames=plan.fieldRenames;this.#referenceSnapshot=''
    let guard=()=>{}
    await DataSpaceDefinitionSave.run([{
      dataSet:this.dataSet,targetId:this.targetId,modelId:this.modelId,
      prepare:async()=>{
        if(Object.hasOwn(plan.patch,'Name')||plan.fieldRenames.length||plan.changes.some(change=>Object.hasOwn(change.patch,'IsPKey'))) {
          this.#rename={plan:await this.lifecycle.prepareRename(plan),before:plan.original.name,after:plan.candidate.name}
          this.#renamedIdentity=this.identity(plan.candidate.name)
        }
        guard=await this.lifecycle.validate(plan,this.#dependencies?.views??[this.#models,this.#fields])
        if(structural)await this.fresh(plan)
        if(this.snapshot()!==this.#baseline||draft!==JSON.stringify(this.#models.getEditingPatch(this.modelId))||headers!==this.fieldFingerprint())throw new Error('数组预检期间输入已变化')
        if(JSON.stringify(this.plan().references)!==JSON.stringify(plan.references))throw new Error('数组改名引用已变化，请重新保存前核验')
      },
      apply:async()=>{
        for(const item of updates)await this.update(item.view,item.id,item.patch)
        for(const values of plan.additions) {
          const id=values['rowid']
          if(typeof id!=='string'||!this.#fieldIds.has(id)||!this.#fields.dirtyTracking.isPendingCreate(id))throw new Error('新增数组字段未取得唯一身份')
          try {
            const result=await this.#fields.applyEditingRows([id])
            if(!result.success)throw new Error('新增数组字段编辑未完整应用')
          } finally {
            const row=this.#fields.rows.find(candidate=>candidate['rowid']===id)
            if(!row||Object.entries(values).some(([key,value])=>row[key]!==value))throw new Error('新增数组字段草稿已变化')
            this.#staged.push({view:this.#fields,id,after:JSON.stringify(row),values,created:true})
          }
        }
        for(const row of plan.removals) {
          const id=String(row['rowid'])
          if(!this.#fields.dirtyTracking.pendingDeleteIds.has(id))throw new Error('数组字段删除未暂存')
          this.#staged.push({view:this.#fields,id,after:JSON.stringify(this.#fields.dirtyTracking.getPendingDeleteSnapshot(id)),values:null})
        }
      },
      check:async()=>{
        await this.#rename?.plan.assertCurrent()
        this.assertStaged();guard()
        if(this.#models.hasEditingChanges()||this.#fields.hasEditingChanges()
          ||Object.entries({...modelBefore,...updates.find(item=>item.view===this.#models&&item.id===this.modelId)?.patch}).some(([key,value])=>this.model()[key]!==value))throw new Error('数组提交前定义已变化')
        const remaining=fieldsBefore.filter(row=>!plan.removals.some(r=>r['rowid']===row['rowid']))
        if(this.rows().length!==remaining.length+plan.additions.length||remaining.some(row=>{
          const current=this.rows().find(r=>r['rowid']===row['rowid']),patch=updates.find(c=>c.view===this.#fields&&c.id===row['rowid'])?.patch
          return !current||Object.entries({...row,...patch}).some(([key,value])=>current[key]!==value)
        }))throw new Error('数组提交前字段定义已变化')
        if(plan.fieldRenames.length)this.#referenceSnapshot=this.referenceSnapshot(true)
      },
      targets:()=>this.#views.map(view=>({tableName:view.tableName,viewId:view.viewId,ids:this.#staged.filter(s=>s.view===view).map(s=>s.id)})).filter(v=>v.ids.length),
      dispatched:()=>this.lifecycle.onDispatch(),
      confirm:async()=>{
        this.#confirmed=true
        if(structural){if(!await this.readback())throw new Error('数组正式回读与提交定义不一致')}
        else {
          const row=this.model()
          if(Object.entries(plan.patch).some(([key,value])=>!Object.is(this.read(this.#models,row,key),value)))throw new Error('数组保存结果与提交值不一致')
        }
        await this.completeRename(false);this.finish()
      },
      failed:stage=>{if(this.#status!=='configuration')this.#status=stage==='dispatched'?'unknown':'readback';if(stage==='preparing'||stage==='applying'){
        const applied=this.#staged.filter(item=>!item.created&&item.values!==null)
        for(const item of applied) {
          const row=item.view.rows.find(candidate=>item.view.getPkKey(candidate)===item.id)
          if(item.view.hasEditingChanges(item.id)||JSON.stringify(row)!==item.after)throw new Error('数组未提交草稿已变化，不能覆盖')
        }
        for(const item of applied) {
          item.view.discardPendingChanges([item.id])
          const patch=item.view===this.#models&&item.id===this.modelId?plan.patch:item.view===this.#fields?plan.changes.find(change=>change.id===item.id)?.patch:undefined
          for(const [key,value]of Object.entries(patch??{}))item.view.updateEditingValue(item.id,key,value)
        }
        this.#staged=[];this.#rename=undefined;this.#renamedIdentity=undefined;this.#fieldRenames=[];this.#referenceSnapshot=''
        this.#status='idle'
      }},
    }])
  }
  private assertStaged():void {
    this.clean(true)
    for(const item of this.#staged) {
      const row=item.values===null?item.view.dirtyTracking.getPendingDeleteSnapshot(item.id):item.view.rows.find(r=>item.view.getPkKey(r)===item.id)
      if(!row||item.view.hasEditingChanges(item.id)||JSON.stringify(row)!==item.after)throw new Error('数组提交草稿被其他操作改变')
      if(item.values===null){if(item.view.deleteActionState(row)!=='enabled')throw new Error('数组字段删除权限已变化')}
      else if(item.view.dirtyTracking.pendingCreateIds.has(item.id)){if(item.view.addActionState()!=='enabled')throw new Error('数组字段新增权限已变化')}
      else this.permissions(item.view,row,item.values)
    }
  }
  private discardOwned(readback=false):void {
    this.clean(true,readback)
    for(const item of this.#staged) {
      const row=item.values===null?item.view.dirtyTracking.getPendingDeleteSnapshot(item.id):item.view.rows.find(r=>item.view.getPkKey(r)===item.id)
      if(item.view.hasEditingChanges(item.id)||item.view.dirtyTracking.hasPendingChanges(item.id)&&JSON.stringify(row)!==item.after)throw new Error('数组未决草稿已变化，不能覆盖')
    }
    for(const item of this.#staged)item.view.discardPendingChanges([item.id])
  }
  private async readback():Promise<boolean> {
    this.clean(true,true)
    for(const view of [this.#models,this.#fields]) {
      if(view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw new Error('数组定义仍有未决草稿，不能覆盖')
      const result=await view.loadFromServer(view===this.#fields?{filter:this.queryFilter(view),sort:'rowid:asc',allPages:true,maxRows:50000}:{})
      this.assertOwner();if(!result.success||view.loadingError)throw new Error('数组定义回读失败')
    }
    await this.#dependencies?.load(true)
    this.clean(true)
    this.#verification=this.#staged.flatMap(item=>{
      const rows=item.view.rows.filter(r=>r['rowid']===item.id),row=rows[0]
      const ok=item.values===null?!row&&this.#confirmed:rows.length===1&&row&&Object.entries(item.values).every(([key,value])=>item.view.fieldAccess(row,key).read==='visible'&&Object.is(row[key],value))
      return ok?[]:[`${item.view.tableName}(${item.id})：${item.values===null&&!row?'删除结果缺少正式回执':'正式记录与提交值不一致'}`]
    })
    if(this.#rename&&this.#rename.before!==this.#rename.after) {
      const remaining=LowcodeDataSpaceModelRenameReferences.prepare(this.referenceViews(),this.modelId,this.#rename.after,this.#rename.before)
      this.#verification.push(...remaining.map(change=>`${change.table}(${change.id}).${change.property}：仍有旧注册名或引用；未自动补写`))
    }
    if(this.#fieldRenames.length&&this.referenceSnapshot()!==this.#referenceSnapshot)this.#verification.push('字段改名涉及的正式定义集合已变化；未自动改写并发引用')
    this.#dependencies?.invalidate(this.#staged.map(item=>({table:item.view.tableName,id:item.id})),[this.#models,this.#fields])
    this.#verified=this.snapshot();return this.#verification.length===0
  }
  private async completeRename(reconcile:boolean):Promise<void> {
    if(this.#rename){this.#status='configuration';await this.#rename.plan.complete(reconcile)}
  }
  private finish():void{this.#fieldIds.clear();this.#identity=this.identity();this.#baseline=this.snapshot();this.#staged=[];this.#status='idle';this.#verification=[];this.#verified='';this.#rename=undefined;this.#renamedIdentity=undefined;this.#fieldRenames=[];this.#referenceSnapshot='';this.lifecycle.completed()}
  /** 只重新查询，不重放未知批次；删除缺失时仍须正式回执才能确认。 */
  async verify():Promise<boolean> {
    if(!['unknown','readback','different','configuration'].includes(this.#status))throw new Error('没有待核验的数组提交')
    const reconcile=this.#status==='configuration'
    this.discardOwned(true);this.#status='saving'
    try{const confirmed=await this.readback();if(confirmed){await this.completeRename(reconcile);this.finish()}else this.#status='different';return confirmed}catch(cause){if(this.getState().status!=='configuration')this.#status='readback';throw cause}
  }
  /** 显式接受刚回读的实际定义，不补写、补删或宣称原批次成功。 */
  acceptCurrent():void{this.clean(true);if(this.#status!=='different'||this.snapshot()!==this.#verified)throw new Error('请先核验当前正式结果');this.finish()}
  /** 关闭已完成或已取消的窗口，释放独立依赖查询；未决提交保留原入口。 */
  release():void {
    if(this.getState().pending)throw new Error('数组修改尚未结束，不能释放')
    this.#dependencies?.release();this.#dependencies=undefined;this.#views.splice(2)
  }
}
