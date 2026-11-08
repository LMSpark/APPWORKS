import type {DataView} from '../data-view'
import {DataViewSaveNotAppliedError} from '../data-view'
import type {DataSet} from '../dataset'
import type {DataColumn} from '../types'
import {DataViewLocalQuery} from './data-view-local-query'
import type {DataViewSourceAdapter, DataViewSourceHistoryStatus} from './data-view-source'
import type {DataRow, QueryParams} from '../types'

export type FileResourceTarget=Readonly<{key:string;fields:Readonly<DataRow>}>
export type FileResourceSnapshot=Readonly<{text:string;revision:string|null;fields?:Readonly<DataRow>}>
export type FileResourceHistoryAttempt=Readonly<{version:string|number;fileName:string}>
export type FileResourceTransport=Readonly<{
  read(target:FileResourceTarget):Promise<FileResourceSnapshot|null>
  write(input:Readonly<{target:FileResourceTarget;text:string;baseline:FileResourceSnapshot|null}>):Promise<void>
  remove?(input:Readonly<{target:FileResourceTarget;baseline:FileResourceSnapshot}>):Promise<void>
  /** 投影已确认的工作文件结果；必须是同步、幂等的本地状态通知，不执行第二次保存。 */
  onWriteConfirmed?(target:FileResourceTarget,text:string,baseline:FileResourceSnapshot|null):void
  isUnknown(error:unknown):boolean
  history?:Readonly<{
    assertCanCreate?(target:FileResourceTarget):void|Promise<void>
    /** 只有明确的来源拒绝回执才能证明attempt未提交；其他捕获attempt后的异常视为结果未知。 */
    isDefiniteRejection?(error:unknown):boolean
    list(target:FileResourceTarget):Promise<ReadonlyArray<Readonly<{version:string|number;fileName:string;lastModified:number|null}>>>
    preview(target:FileResourceTarget,version:string|number):Promise<string>
    create(target:FileResourceTarget,text:string,onAttempt:(attempt:FileResourceHistoryAttempt)=>void):Promise<void>
    verify(target:FileResourceTarget,attempt:FileResourceHistoryAttempt,expectedText:string):Promise<boolean>
  }>
}>
export type BindFileResourceAdapterOptions=Readonly<{
  resourceId:string
  contentField:string
  revisionField?:string
  /** 由资源适配器按目标限制写入；用于只读快照及本地工具草稿冲突。 */
  canWrite?(target:FileResourceTarget):boolean
  /** 新增与更新分开授权；未配置时沿用 canWrite。 */
  canCreate?(target:FileResourceTarget):boolean
  /** 删除与内容写入分开授权；目录资源可只允许删除而不允许改正文。 */
  canDelete?(target:FileResourceTarget):boolean
  target(view:DataView):FileResourceTarget
  transport:FileResourceTransport
  assertCurrent?(target?:FileResourceTarget):void
}>
export type BindFileDirectoryQueryAdapterOptions=Readonly<{
  resourceId:string
  target(view:DataView):Readonly<{key:string;fields:Readonly<DataRow>}>
  list(target:Readonly<{key:string;fields:Readonly<DataRow>}>):Promise<readonly string[]>
  assertCurrent?():void
}>

type Executor=Parameters<DataView['bindQueryExecutor']>[0]
type SaveCommand=Parameters<NonNullable<Executor['save']>>[0]
type SaveReceipt=Awaited<ReturnType<NonNullable<Executor['save']>>>[number]
type PendingWrite=Readonly<{target:FileResourceTarget;operation:'write';baseline:FileResourceSnapshot|null;text:string;state:'unknown'|'confirmed'|'not-applied';message:string|null;projectionNotified:boolean}>
type PendingDelete=Readonly<{target:FileResourceTarget;operation:'delete';baseline:FileResourceSnapshot;state:'unknown'|'confirmed'|'not-applied';message:string|null}>
type PendingResourceChange=PendingWrite|PendingDelete
type HistoryAttempt=Readonly<{target:FileResourceTarget;attempt:FileResourceHistoryAttempt;text:string;state:'pending'|'unknown'|'confirmed'|'not-applied';message:string|null;deliveryPending:boolean}>
type SharedFileResourceState=Readonly<{pending:Map<string,PendingResourceChange>;owners:Map<string,Readonly<{view:DataView;context:SaveCommand['changes'][number]['context']}>>;historyAttempts:Map<string,HistoryAttempt>;saving:Set<string>}>
const sharedStates=new WeakMap<object,Map<string,SharedFileResourceState>>()
const fileResourceBindings=new WeakMap<DataView,FileResourceEngine>()

/**
 * Get a named file-resource view from its DataSet, creating its table and binding once.
 * queryContext supplies initial query inputs; reassembly checks explicit keys without replacing the existing context.
 */
export function getOrCreateFileResourceView(input:Readonly<{
  dataSet:DataSet
  tableName:string
  viewId:string
  columns:readonly DataColumn[]
  resourceId:string
  contentField:string
  revisionField?:string
  canWrite?(target:FileResourceTarget):boolean
  canCreate?(target:FileResourceTarget):boolean
  canDelete?(target:FileResourceTarget):boolean
  queryContext?:Readonly<Record<string,unknown>>
  target:(view:DataView)=>FileResourceTarget
  transport:FileResourceTransport
  assertCurrent?:(target?:FileResourceTarget)=>void
}>):DataView{
  if(input.dataSet.destroyed)throw new Error('FILE_RESOURCE_DATASET: 资源视图未绑定存活DataSet')
  if(!input.resourceId.trim())throw new Error('FILE_RESOURCE_IDENTITY: 文件资源身份不能为空')
  const originalTable=input.dataSet.getTable(input.tableName)
  if(originalTable&&(originalTable.modelBinding!==undefined||originalTable.resourceType!=='file'||originalTable.resourceId!==input.resourceId)){
    throw new Error('FILE_RESOURCE_IDENTITY: 表已绑定其他语义资源')
  }
  const columns=originalTable?.columns??input.columns
  const primary=columns.filter(column=>column.isPrimaryKey===true)
  if(new Set(columns.map(column=>column.name)).size!==columns.length||primary.length!==1||(primary[0]?.type??'string')!=='string'
    ||!columns.some(column=>column.name===input.contentField)||input.contentField===primary[0]?.name
    ||input.revisionField!==undefined&&(!columns.some(column=>column.name===input.revisionField)
      ||input.revisionField===input.contentField||input.revisionField===primary[0]?.name)){
    throw new Error('FILE_RESOURCE_COLUMNS: 文件正文、版本及唯一主键字段必须存在且互不重叠')
  }
  for(const expected of input.columns){
    const actual=columns.find(column=>column.name===expected.name)
    if(actual?.name!==expected.name||actual.type!==expected.type||Boolean(actual.isPrimaryKey)!==Boolean(expected.isPrimaryKey)){
      throw new Error('FILE_RESOURCE_COLUMNS: 文件字段声明与原表不一致')
    }
  }
  const table=originalTable??input.dataSet.addTable(input.tableName,[...input.columns])
  if(!originalTable){table.resourceType='file';table.resourceId=input.resourceId}
  const originalView=table.getView(input.viewId)
  const view=originalView??table.getOrCreateView(input.viewId),originalContext=view.queryContext
  const options:BindFileResourceAdapterOptions={resourceId:input.resourceId,contentField:input.contentField,
    ...(input.revisionField?{revisionField:input.revisionField}:{}),target:input.target,transport:input.transport,
    ...(input.canWrite?{canWrite:input.canWrite}:{}),...(input.canCreate?{canCreate:input.canCreate}:{}),
    ...(input.canDelete?{canDelete:input.canDelete}:{}),...(input.assertCurrent?{assertCurrent:input.assertCurrent}:{})}
  const existing=fileResourceBindings.get(view)
  try{
    if(view.primaryKey!==primary[0]?.name)throw new Error('FILE_RESOURCE_COLUMNS: 视图主键与文件目标键不一致')
    if(existing){
      if(input.queryContext&&Object.entries(input.queryContext).some(([name,value])=>
        !Object.hasOwn(originalContext,name)||JSON.stringify(originalContext[name])!==JSON.stringify(value))){
        throw new Error('FILE_RESOURCE_IDENTITY: 初始查询输入不可改绑')
      }
      existing.update(options,view)
      return view
    }
    const engine=createFileResourceEngine(options)
    view.assertCanBindQueryExecutor(engine.executor,{resource:{resourceType:'file',resourceId:input.resourceId}})
    if(input.queryContext)view.queryContext={...originalContext,...input.queryContext}
    engine.lockTarget(view)
    assertFileViewBinding(view,engine.executor,options)
    view.bindQueryExecutor(engine.executor,{resource:{resourceType:'file',resourceId:input.resourceId}})
    assertFileViewBinding(view,engine.executor,options)
    fileResourceBindings.set(view,engine)
    return view
  }catch(error){
    view.queryContext=originalContext
    if(!originalTable&&input.dataSet.getTable(input.tableName)===table)input.dataSet.removeTable(input.tableName)
    else if(originalTable&&!originalView&&table.getView(input.viewId)===view)table.destroyView(input.viewId)
    throw error
  }
}

/** 外部同步回调返回后的纯实例/字段/owner复核，不执行用户回调。 */
function assertFileViewBinding(view:DataView,executor:Executor,options:BindFileResourceAdapterOptions):void{
  const table=view.dataTable,dataSet=table?.dataSet,primary=table?.columns.filter(column=>column.isPrimaryKey===true)??[]
  if(view.destroyed||!table||!dataSet||dataSet.destroyed||dataSet.getTable(table.tableName)!==table||table.getView(view.viewId)!==view){
    throw new Error('FILE_RESOURCE_VIEW_STALE: 原文件DataView已释放或解绑')
  }
  if(primary.length!==1||primary[0]?.type!=='string'||view.primaryKey!==primary[0].name
    ||!table.columns.some(column=>column.name===options.contentField)
    ||options.revisionField!==undefined&&!table.columns.some(column=>column.name===options.revisionField)
    ||view.primaryKey===options.contentField||options.revisionField!==undefined&&(options.revisionField===view.primaryKey||options.revisionField===options.contentField)){
    throw new Error('FILE_RESOURCE_COLUMNS: 文件视图主键或字段合同已变化')
  }
  view.assertCanBindQueryExecutor(executor,{resource:{resourceType:'file',resourceId:options.resourceId}})
}

function sharedState(view:DataView,resourceId:string):SharedFileResourceState{
  const dataSet=view.dataSet
  if(!dataSet||dataSet.destroyed)throw new Error('FILE_RESOURCE_DATASET: 资源视图未绑定存活DataSet')
  let resources=sharedStates.get(dataSet)
  if(!resources){resources=new Map();sharedStates.set(dataSet,resources)}
  let state=resources.get(resourceId)
  if(!state){state={pending:new Map(),owners:new Map(),historyAttempts:new Map(),saving:new Set()};resources.set(resourceId,state)}
  return state
}

type FileResourceQueryContext=Readonly<{view:DataView;rows:readonly DataRow[];target:FileResourceTarget;primaryKey:string;output:ReadonlySet<string>;baseline:FileResourceSnapshot|null}>
type FileResourceSelection=ReturnType<typeof DataViewLocalQuery.select>&Readonly<{primaryKey:string;baseline:FileResourceSnapshot|null}>
type FileResourceEngine=Readonly<{executor:Executor;lockTarget(view:DataView):void;update(options:BindFileResourceAdapterOptions,view:DataView):void}>

type FileResourceHistory=NonNullable<DataViewSourceAdapter['history']>
/** One immutable rebind generation; every async operation keeps the generation it started with. */
type FileResourceBinding=Readonly<{options:BindFileResourceAdapterOptions;history:FileResourceHistory|undefined}>

function deepFreeze<T>(value:T):T{
  if(typeof value==='object'&&value!==null&&!Object.isFrozen(value)){for(const item of Object.values(value))deepFreeze(item);Object.freeze(value)}
  return value
}

/** Builds the single FileResource query/save engine; each view locks its target on first query. */
function createFileResourceEngine(initialOptions:BindFileResourceAdapterOptions,eagerView?:DataView):FileResourceEngine{
  const targets=new WeakMap<DataView,FileResourceTarget>()
  const targetSignatures=new WeakMap<DataView,string>()
  const contexts=new WeakMap<object,FileResourceQueryContext>()
  const resourceId=initialOptions.resourceId
  const targetIdentity=(target:FileResourceTarget)=>JSON.stringify([target.key,target.fields])
  const targetFor=(view:DataView,bound:FileResourceBinding=current):FileResourceTarget=>{
    const locked=targets.get(view),signature=targetSignatures.get(view)
    if(locked&&signature!==targetIdentity(bound.options.target(view)))throw new Error('FILE_RESOURCE_IDENTITY: 文件DataView目标不可改绑')
    if(locked)return locked
    const stable=deepFreeze(structuredClone(bound.options.target(view)))
    targets.set(view,stable);targetSignatures.set(view,targetIdentity(stable))
    return stable
  }
  /** View, target and the operation's own scope; does not by itself reject a later rebind. */
  const assertScope=(view:DataView,target:FileResourceTarget|undefined,bound:FileResourceBinding)=>{
    if(view.destroyed||view.dataTable?.getView(view.viewId)!==view)throw new Error('FILE_RESOURCE_VIEW_STALE: DataView已释放或解绑')
    const locked=targetFor(view,bound)
    if(target&&targetIdentity(locked)!==targetIdentity(target))throw new Error('FILE_RESOURCE_IDENTITY: 文件DataView目标不可改绑')
    bound.options.assertCurrent?.(locked)
  }
  const assertBinding=(bound:FileResourceBinding)=>{
    if(current!==bound)throw new Error('FILE_RESOURCE_BINDING_STALE: 文件DataView绑定已在本次操作期间替换')
  }
  /** The guard may rebind synchronously, so the generation is compared after it returns. */
  const assertCurrent=(view:DataView,target:FileResourceTarget|undefined,bound:FileResourceBinding)=>{assertScope(view,target,bound);assertBinding(bound)}
  const stateFor=(view:DataView)=>sharedState(view,resourceId)
  const formalSnapshotFields=(view:DataView,fields:Readonly<DataRow>|undefined):DataRow=>Object.fromEntries(
    Object.entries(fields??{}).filter(([name])=>view.columns.some(column=>column.name===name)))
  const canWrite=(options:BindFileResourceAdapterOptions,target:FileResourceTarget)=>options.canWrite?.(target)??true
  const canCreate=(options:BindFileResourceAdapterOptions,target:FileResourceTarget)=>options.canCreate?.(target)??canWrite(options,target)
  const canDelete=(options:BindFileResourceAdapterOptions,target:FileResourceTarget)=>options.canDelete?.(target)??canWrite(options,target)
  const assertWritable=(options:BindFileResourceAdapterOptions,target:FileResourceTarget)=>{if(!canWrite(options,target))throw new Error('FILE_RESOURCE_READ_ONLY: 文件目标只读')}
  const errorMessage=(error:unknown)=>error instanceof Error?error.message:String(error)
  /** Stored as confirmed before notifying, so a stale or failed projection keeps the proven result for later delivery. */
  const confirmWriteProjection=(view:DataView,attempt:PendingWrite,bound:FileResourceBinding):PendingWrite=>{
    const state=stateFor(view),confirmed={...attempt,state:'confirmed' as const,message:null,projectionNotified:false}
    state.pending.set(attempt.target.key,confirmed)
    if(!attempt.projectionNotified){
      const {target,text,baseline}=attempt
      assertCurrent(view,target,bound)
      bound.options.transport.onWriteConfirmed?.(target,text,baseline)
      assertCurrent(view,target,bound)
    }
    const delivered={...confirmed,projectionNotified:true}
    state.pending.set(attempt.target.key,delivered)
    return delivered
  }
  const historyFor=(bound:FileResourceBinding,transport:NonNullable<FileResourceTransport['history']>):FileResourceHistory=>({
    list:async view=>{const target=targetFor(view,bound);assertCurrent(view,target,bound);const items=await transport.list(target);assertCurrent(view,target,bound);return items.map(item=>({...item,label:item.fileName}))},
    preview:async(view,version)=>{const target=targetFor(view,bound);assertCurrent(view,target,bound);const text=await transport.preview(target,version);assertCurrent(view,target,bound);return text},
    status:(view):DataViewSourceHistoryStatus=>{const target=targetFor(view,bound),item=stateFor(view).historyAttempts.get(target.key)
      return item?{state:item.state,version:item.attempt.version,fileName:item.attempt.fileName,message:item.message}: {state:'idle',version:null,fileName:null,message:null}},
    isDeliveryPending:view=>{const target=targetFor(view,bound),item=stateFor(view).historyAttempts.get(target.key);return item?.state==='confirmed'&&item.deliveryPending},
    acknowledge:view=>{const target=targetFor(view,bound),state=stateFor(view),item=state.historyAttempts.get(target.key)
      if(item&&(item.state==='confirmed'||item.state==='not-applied'))state.historyAttempts.set(target.key,{...item,deliveryPending:false})},
    verify:async(view,hooks)=>{const target=targetFor(view,bound),state=stateFor(view),item=state.historyAttempts.get(target.key)
      if(item?.state !== 'unknown')return {state:item?.state??'idle',version:item?.attempt.version??null,fileName:item?.attempt.fileName??null,message:item?.message??null}
      hooks.assertCurrent();assertCurrent(view,target,bound)
      const applied=await transport.verify(target,item.attempt,item.text);hooks.assertCurrent();assertCurrent(view,target,bound)
      const next={...item,state:applied?'confirmed' as const:'not-applied' as const,message:null,deliveryPending:applied};state.historyAttempts.set(target.key,next)
      return {state:next.state,version:next.attempt.version,fileName:next.attempt.fileName,message:null}},
    create:async(view,hooks)=>{const target=targetFor(view,bound);assertCurrent(view,target,bound);assertWritable(bound.options,target);await transport.assertCanCreate?.(target);assertCurrent(view,target,bound)
      const snapshot=await bound.options.transport.read(target);assertCurrent(view,target,bound)
      if(!snapshot)throw new Error('FILE_RESOURCE_MISSING: 来源文件不存在')
      const matching=view.rows.filter(row=>String(row[view.primaryKey])===target.key)
      const baseline=matching[0]
      if(matching.length!==1||!baseline)throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件与当前DataView查询基线不同')
      if(baseline[bound.options.contentField]!==snapshot.text)throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件与当前DataView查询基线不同')
      if(bound.options.revisionField!==undefined&&String(baseline[bound.options.revisionField]??'')!==String(snapshot.revision??'')){
        throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件与当前DataView查询基线不同')
      }
      let captured:FileResourceHistoryAttempt|undefined
      try{await transport.create(target,snapshot.text,attempt=>{hooks.assertCurrent();assertCurrent(view,target,bound);if(captured)throw new Error('FILE_RESOURCE_ATTEMPT_INVALID: attempt重复捕获')
        captured=attempt;stateFor(view).historyAttempts.set(target.key,{target,attempt,text:snapshot.text,state:'pending',message:null,deliveryPending:true});hooks.onAttempt(attempt)})
        if(!captured)throw new Error('FILE_RESOURCE_ATTEMPT_MISSING: 创建来源历史未捕获attempt')
        stateFor(view).historyAttempts.set(target.key,{target,attempt:captured,text:snapshot.text,state:'confirmed',message:null,deliveryPending:true})
      }catch(error){if(captured){const state=stateFor(view),storedAttempt=state.historyAttempts.get(target.key)
        if(storedAttempt){const notApplied=transport.isDefiniteRejection?.(error)===true;state.historyAttempts.set(target.key,{...storedAttempt,state:notApplied?'not-applied':'unknown',deliveryPending:!notApplied,message:errorMessage(error)})}}
        throw error}},
  })
  const bindingFor=(options:BindFileResourceAdapterOptions):FileResourceBinding=>{
    const binding:{options:BindFileResourceAdapterOptions;history:FileResourceHistory|undefined}={options,history:undefined}
    if(options.transport.history)binding.history=historyFor(binding,options.transport.history)
    return binding
  }
  let current:FileResourceBinding=bindingFor(initialOptions)
  if(eagerView)targetFor(eagerView)
  const result=(view:DataView,selected:FileResourceSelection,target:FileResourceTarget):Awaited<ReturnType<Executor['executeQuery']>>=>{
    const {primaryKey}=selected
    // Policy for later operations follows the live binding; each save re-checks it with its own generation.
    const live=()=>current.options
    const assertQueryCurrent=()=>{assertScope(view,target,current);if(view.primaryKey!==primaryKey)throw new Error('FILE_RESOURCE_QUERY_IDENTITY: 本次查询主键已变化')}
    const keys=new Set(selected.rows.map(row=>String(row[primaryKey])))
    const rowKey=(row:Readonly<DataRow>)=>row[primaryKey],creating=selected.baseline===null
    const allowed=(key:unknown,field:string)=>keys.has(String(key))&&selected.output.has(field)
    const queryResult={rows:selected.rows,total:selected.total,rowKey,resultPrimaryKey:primaryKey,
      newRowFieldAccess:(field:string)=>{
        assertQueryCurrent()
        const visible=selected.output.has(field),writable=visible&&creating&&canCreate(live(),target)&&field!==primaryKey&&field!==live().revisionField
        return {read:visible?'visible' as const:'invisible' as const,write:writable?'allowed' as const:'denied' as const,required:false}
      },
      isFieldReadOnly:(field:string)=>!selected.output.has(field)||field===primaryKey||field===live().revisionField,
      prepareNewRow:(row:Readonly<DataRow>)=>{
        assertQueryCurrent()
        if(!creating||!canCreate(live(),target)||!selected.output.has(live().contentField))throw new Error('FILE_RESOURCE_CREATE_UNAVAILABLE: 本次文件查询不允许新增正文')
        for(const [field,value] of Object.entries(target.fields))if(Object.hasOwn(row,field)&&!Object.is(row[field],value))throw new Error('FILE_RESOURCE_SCOPE: 新文件身份与当前DataView目标不一致')
        return Object.fromEntries(Object.entries({...row,...target.fields,[primaryKey]:target.key}).filter(([field])=>selected.output.has(field)))
      },
      assertIdentity:assertQueryCurrent,
      fieldAccess:(key:unknown,field:string)=>{const existingRow=allowed(key,field),newTarget=creating&&key===target.key&&selected.output.has(field)
        const visible=existingRow||newTarget,writable=canWrite(live(),target),write=writable&&((existingRow&&field===live().contentField)
          ||(newTarget&&field!==primaryKey&&field!==live().revisionField))
        return {read:visible?'visible' as const:'invisible' as const,write:write?'allowed' as const:'denied' as const,
          component:!visible?'hidden' as const:write?'editable' as const:'readonly' as const,required:false,
          writeMode:write?'editable' as const:'readonly' as const}},
      readFieldAccess:(row:Readonly<DataRow>,field:string)=>selected.rows.includes(row)&&selected.output.has(field)?'visible' as const:'invisible' as const,
      addActionState:(available=true)=>creating&&available&&selected.output.has(live().contentField)&&canCreate(live(),target)?'enabled' as const:'disabled' as const,
      editActionState:(key:unknown)=>keys.has(String(key))&&canWrite(live(),target)?'enabled' as const:'disabled' as const,
      deleteActionState:(key:unknown,available=true)=>keys.has(String(key))&&available&&canDelete(live(),target)&&live().transport.remove?'enabled' as const:'disabled' as const,
      createChildActionState:()=> 'disabled' as const,
      viewActionState:(key:unknown)=>keys.has(String(key))?'enabled' as const:'disabled' as const}
    contexts.set(queryResult,{view,rows:selected.rows.map(row=>({...row})),target,primaryKey,output:selected.output,baseline:selected.baseline===null?null:{text:selected.baseline.text,revision:selected.baseline.revision}});return queryResult
  }
  const sameBaseline=(snapshot:FileResourceSnapshot|null,baseline:FileResourceSnapshot|null):boolean=>{
    if(snapshot===null||baseline===null)return false
    return snapshot.text===baseline.text&&snapshot.revision===baseline.revision
  }
  const receiptResult=(origin:FileResourceQueryContext,rows:readonly DataRow[],baseline:FileResourceSnapshot|null)=>{
    const selected=DataViewLocalQuery.select({rows,fields:origin.output,primaryKeys:[origin.primaryKey],params:{page:1,allPages:true,treeMode:'flat'}})
    return result(origin.view,{...selected,primaryKey:origin.primaryKey,baseline},origin.target)
  }
  const source:DataViewSourceAdapter={
    views:view=>{const currentTarget=targetFor(view);return view.dataTable?.viewList.filter(candidate=>{
      try{return targetIdentity(targets.get(candidate)??current.options.target(candidate))===targetIdentity(currentTarget)}catch{return false}
    })??[]},
    preview:async view=>{const bound=current,target=targetFor(view,bound);assertCurrent(view,target,bound);const snapshot=await bound.options.transport.read(target);assertCurrent(view,target,bound)
      if(snapshot===null)throw new Error('FILE_RESOURCE_MISSING: 来源文件不存在')
      return {version:snapshot.revision,content:snapshot.text}},
    adopt:async(view,snapshot,hooks)=>{const bound=current,target=targetFor(view,bound);assertCurrent(view,target,bound);assertWritable(bound.options,target)
      const remote=await bound.options.transport.read(target);assertCurrent(view,target,bound);hooks.assertCurrent()
      if(remote?.text !== snapshot.content||remote.revision!==snapshot.version)throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件已变化')
      hooks.beforeApply()},
    get history(){return current.history},
    verifyWriteAttempt:async(view,hooks)=>{
      const bound=current,target=targetFor(view,bound),state=stateFor(view),attempt=state.pending.get(target.key)
      if(!attempt)return {state:'idle',text:null,message:null}
      hooks.assertCurrent();assertCurrent(view,target,bound)
      const remote=await bound.options.transport.read(attempt.target);hooks.assertCurrent();assertCurrent(view,target,bound)
      if(state.pending.get(target.key)!==attempt)throw new Error('FILE_RESOURCE_VERIFY_STALE: 原文件提交已接纳或替换')
      if(attempt.state==='confirmed'&&(attempt.operation==='delete'?remote!==null:remote?.text!==attempt.text)){
        return {state:'unknown',text:attempt.operation==='write'?attempt.text:null,message:'原提交已确认，但来源随后变化'}
      }
      if(attempt.operation==='delete'){
        if(remote===null){state.pending.set(target.key,{...attempt,state:'confirmed',message:null});return {state:'confirmed',text:null,message:null}}
        if(remote.text===attempt.baseline.text&&remote.revision===attempt.baseline.revision){state.pending.set(target.key,{...attempt,state:'not-applied',message:null});return {state:'not-applied',text:null,message:null}}
        return {state:'unknown',text:null,message:'远端文件与删除前来源均不一致'}
      }
      if(remote?.text===attempt.text){confirmWriteProjection(view,attempt,bound)
        return {state:'confirmed',text:attempt.text,message:null}}
      if(attempt.baseline===null?remote===null:remote?.text===attempt.baseline.text&&remote.revision===attempt.baseline.revision){const notApplied={...attempt,state:'not-applied' as const,message:null};state.pending.set(target.key,notApplied)
        return {state:'not-applied',text:attempt.text,message:null}}
      return {state:'unknown',text:attempt.text,message:'远端文件与原提交及原基线均不一致'}
    },
    acknowledgeWriteAttempt:view=>{
      const target=targetFor(view),state=stateFor(view),attempt=state.pending.get(target.key)
      const owner=state.owners.get(target.key)
      if(attempt?.state==='not-applied'||attempt?.state==='confirmed'&&(!owner||owner.view.destroyed)){
        state.pending.delete(target.key);state.owners.delete(target.key)
      }
    },
  }
  const executor:Executor={localAggregates:false,saveIndependently:true,source,
    executeQuery:async(currentView,params:QueryParams)=>{
      const bound=current,{options}=bound
      const primaryKey=currentView.primaryKey,fields=new Set(currentView.columns.filter(column=>!column.computeExpression&&column.name!=='_pk').map(column=>column.name))
      const captured=DataViewLocalQuery.captureParams({fields,primaryKeys:[primaryKey],params})
      const target=targetFor(currentView,bound);assertCurrent(currentView,target,bound)
      const snapshot=await options.transport.read(target);assertCurrent(currentView,target,bound)
      if(currentView.primaryKey!==primaryKey)throw new Error('FILE_RESOURCE_QUERY_IDENTITY: 本次查询主键已变化')
      const revisionField=options.revisionField
      const rows:DataRow[]=snapshot===null?[]:[{...target.fields,...snapshot.fields,[primaryKey]:target.key,[options.contentField]:snapshot.text,
        ...(revisionField?{[revisionField]:snapshot.revision??''}:{})}]
      const selected=DataViewLocalQuery.select({rows,fields,primaryKeys:[primaryKey],params:captured})
      return result(currentView,{...selected,primaryKey,baseline:snapshot},target)
    },
    save:async(command:SaveCommand)=>{
      // One generation for the whole command: a rebind between changes stops later changes before any I/O.
      const bound=current,{options}=bound,transport=options.transport
      const receipts:SaveReceipt[]=[]
      /** After dispatch: only the dispatching binding may prove the result; a later rebind keeps the proven confirmation undelivered. */
      const readBackWrite=async(input:Readonly<{view:DataView;target:FileResourceTarget;baseline:FileResourceSnapshot|null;text:string;mismatch:string}>):Promise<FileResourceSnapshot>=>{
        const {view,target,baseline,text}=input,state=stateFor(view)
        const confirmed=await (async()=>{
          try{const readback=await transport.read(target);assertScope(view,target,bound)
            if(readback?.text!==text)throw new Error(input.mismatch)
            return readback
          }catch(error){state.pending.set(target.key,{target,operation:'write',baseline,text,state:'unknown',message:errorMessage(error),projectionNotified:false});throw error}
        })()
        const attempt:PendingWrite={target,operation:'write',baseline,text,state:'confirmed',message:null,projectionNotified:false}
        state.pending.set(target.key,attempt)
        assertBinding(bound)
        confirmWriteProjection(view,attempt,bound)
        return confirmed
      }
      for(const change of command.changes){
        const context=contexts.get(change.context),original=context?.rows[0]
        const added=change.changes.added??[],changed=change.changes.changed??[],deleted=change.changes.deleted??[]
        const operationCount=Number(added.length>0)+Number(changed.length>0)+Number(deleted.length>0)
        if(!context||operationCount!==1||added.length+changed.length+deleted.length!==1){throw new Error('FILE_RESOURCE_CHANGE: 每次文件资源保存只允许一个新增、更新或删除行')}
        const {view,target}=context,state=stateFor(view)
        const rejectNotApplied=(message:string):never=>{
          state.pending.delete(target.key);state.owners.delete(target.key)
          throw new DataViewSaveNotAppliedError([change],message)
        }
        assertCurrent(view,target,bound)
        if(!deleted.length)assertWritable(options,target)
        if(state.saving.has(target.key))throw new Error('FILE_RESOURCE_SAVE_PENDING: 文件目标正在提交')
        const owner=state.owners.get(target.key)
        if(state.pending.has(target.key)&&owner&&!owner.view.destroyed&&owner.context!==change.context)throw new Error('FILE_RESOURCE_SAVE_OWNER: 原文件提交须由原查询上下文接纳')
        if(!state.pending.has(target.key))state.owners.set(target.key,{view,context:change.context})
        state.saving.add(target.key)
        try{
        const prior=state.pending.get(target.key)
        let confirmedSnapshot:FileResourceSnapshot|null=null
        if(added.length){
          const submitted=added[0]
          const writeText=submitted?.[options.contentField]
          if(!canCreate(options,target))throw new Error('FILE_RESOURCE_READ_ONLY: 文件来源不允许新增')
          if(!submitted||context.rows.length!==0||submitted[view.primaryKey]!==target.key||typeof writeText!=='string'
            ||Object.entries(target.fields).some(([field,value])=>context.output.has(field)&&!Object.is(submitted[field],value)))throw new Error('FILE_RESOURCE_SCOPE: 文件新增身份或内容无效')
          if(prior){
            if(prior.operation!=='write')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原文件提交与当前新增操作不一致')
            const remote=await transport.read(prior.target);assertCurrent(view,target,bound)
            if(state.pending.get(target.key)!==prior)throw new Error('FILE_RESOURCE_VERIFY_STALE: 原文件提交核验状态已变化')
            if(remote?.text===prior.text){
              confirmWriteProjection(view,prior,bound)
              if(prior.text!==writeText)throw new Error('FILE_RESOURCE_UNKNOWN_DELIVERY: 原提交已确认，须先交付原回执再提交新文本')
              confirmedSnapshot=remote
            }
            else if(prior.state==='confirmed')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原新增已确认，但来源随后变化')
            else if(remote===null)rejectNotApplied('FILE_RESOURCE_NOT_APPLIED: 原文件新增未确认生效')
            else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与原提交及空基线均不一致')
          }else{
            const baseline=await transport.read(target);assertCurrent(view,target,bound)
            if(baseline!==null)throw new Error('FILE_RESOURCE_CONFLICT: 新增目标文件已存在')
            try{await transport.write({target,text:writeText,baseline:null})}
            catch(error){if(transport.isUnknown(error))state.pending.set(target.key,{target,operation:'write',baseline:null,text:writeText,state:'unknown',message:errorMessage(error),projectionNotified:false});throw error}
            confirmedSnapshot=await readBackWrite({view,target,baseline:null,text:writeText,mismatch:'FILE_RESOURCE_READBACK: 文件新增回读不一致'})
          }
          const saved=confirmedSnapshot
          if(saved?.text!==writeText)throw new Error('FILE_RESOURCE_RECEIPT: 文件新增回执无法确认')
          const snapshotFields=formalSnapshotFields(view,saved.fields)
          const accepted=Object.fromEntries(Object.entries({...submitted,...snapshotFields,...(options.revisionField?{[options.revisionField]:saved.revision??''}:{})}).filter(([field])=>context.output.has(field)))
          state.owners.set(target.key,{view,context:change.context})
          receipts.push({metaName:change.identity.metaName,added:[accepted],changed:[],deleted:[],changedFields:[],context:receiptResult(context,[accepted],saved)})
          continue
        }
        if(changed.length){
          const submitted=changed[0]
          const writeText=submitted?.[options.contentField]
          if(!submitted||!original||submitted[view.primaryKey]!==original[view.primaryKey]||typeof writeText!=='string')throw new Error('FILE_RESOURCE_SCOPE: 文件更新行身份或内容无效')
          if(prior){
            if(prior.operation!=='write')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原文件提交与当前更新操作不一致')
            const remote=await transport.read(prior.target);assertCurrent(view,target,bound)
            if(state.pending.get(target.key)!==prior)throw new Error('FILE_RESOURCE_VERIFY_STALE: 原文件提交核验状态已变化')
            if(remote?.text===prior.text){
              confirmWriteProjection(view,prior,bound)
              if(prior.text!==writeText)throw new Error('FILE_RESOURCE_UNKNOWN_DELIVERY: 原提交已确认，须先交付原回执再提交新文本')
              confirmedSnapshot=remote
            }
            else if(prior.state==='confirmed')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原更新已确认，但来源随后变化')
            else if(prior.baseline!==null&&remote?.text===prior.baseline.text&&remote.revision===prior.baseline.revision)rejectNotApplied('FILE_RESOURCE_NOT_APPLIED: 原文件提交确认未生效')
            else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与原提交及原基线均不一致')
          }else{
            const baseline=await transport.read(target);assertCurrent(view,target,bound)
            if(!sameBaseline(baseline,context.baseline))throw new Error('FILE_RESOURCE_CONFLICT: 远端文件已不同于DataView查询基线')
            try{await transport.write({target,text:writeText,baseline})}
            catch(error){if(transport.isUnknown(error))state.pending.set(target.key,{target,operation:'write',baseline,text:writeText,state:'unknown',message:errorMessage(error),projectionNotified:false});throw error}
            confirmedSnapshot=await readBackWrite({view,target,baseline,text:writeText,mismatch:'FILE_RESOURCE_READBACK: 文件保存回读不一致'})
          }
          const saved=confirmedSnapshot
          if(saved?.text!==writeText)throw new Error('FILE_RESOURCE_RECEIPT: 文件保存回执无法确认')
          const snapshotFields=formalSnapshotFields(view,saved.fields)
          const accepted=Object.fromEntries(Object.entries({...submitted,...snapshotFields,...(options.revisionField?{[options.revisionField]:saved.revision??''}:{})}).filter(([field])=>context.output.has(field)))
          state.owners.set(target.key,{view,context:change.context})
          receipts.push({metaName:change.identity.metaName,added:[],changed:[accepted],deleted:[],
            changedFields:[[options.contentField,...(options.revisionField?[options.revisionField]:[]),...Object.keys(snapshotFields)]
              .filter(field=>context.output.has(field))],context:receiptResult(context,[accepted],saved)})
          continue
        }
        const submitted=deleted[0]
        if(!canDelete(options,target))throw new Error('FILE_RESOURCE_READ_ONLY: 文件目标只读')
        const remove=transport.remove
        if(!submitted||!original||!remove||submitted[view.primaryKey]!==original[view.primaryKey])throw new Error('FILE_RESOURCE_DELETE_UNSUPPORTED: 来源不支持或无法确认目标文件行删除')
        if(prior){
          if(prior.operation!=='delete')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原文件提交与当前删除操作不一致')
          const remote=await transport.read(prior.target);assertCurrent(view,target,bound)
            if(state.pending.get(target.key)!==prior)throw new Error('FILE_RESOURCE_VERIFY_STALE: 原文件提交核验状态已变化')
          if(remote===null){state.pending.set(target.key,{...prior,state:'confirmed',message:null})}
          else if(prior.state==='confirmed')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原删除已确认，但来源随后变化')
          else if(remote.text===prior.baseline.text&&remote.revision===prior.baseline.revision)rejectNotApplied('FILE_RESOURCE_NOT_APPLIED: 文件删除未确认生效')
          else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与删除前来源均不一致')
        }else{
          const baseline=await transport.read(target);assertCurrent(view,target,bound)
          if(!sameBaseline(baseline,context.baseline)||!baseline)throw new Error('FILE_RESOURCE_CONFLICT: 远端文件已不同于DataView删除基线')
          try{await remove.call(transport,{target,baseline})}
          catch(error){if(transport.isUnknown(error))state.pending.set(target.key,{target,operation:'delete',baseline,state:'unknown',message:errorMessage(error)});throw error}
          try{const readback=await transport.read(target);assertScope(view,target,bound)
            if(readback!==null)throw new Error('FILE_RESOURCE_READBACK: 文件删除回读仍存在')
          }catch(error){state.pending.set(target.key,{target,operation:'delete',baseline,state:'unknown',message:errorMessage(error)});throw error}
          state.pending.set(target.key,{target,operation:'delete',baseline,state:'confirmed',message:null})
          assertBinding(bound)
        }
        state.owners.set(target.key,{view,context:change.context})
        receipts.push({metaName:change.identity.metaName,added:[],changed:[],deleted:[submitted],changedFields:[],context:receiptResult(context,[],null)})
        }finally{state.saving.delete(target.key);if(!state.pending.has(target.key))state.owners.delete(target.key)}
      }
      return receipts
    },
    hasUnconfirmedSave:context=>{const captured=contexts.get(context);if(!captured)return false
      const state=stateFor(captured.view),owner=state.owners.get(captured.target.key)
      return state.pending.has(captured.target.key)&&(!owner||owner.view.destroyed||owner.context===context)},
    acknowledgeSave:context=>{
      const captured=contexts.get(context)
      if(captured){const state=stateFor(captured.view),owner=state.owners.get(captured.target.key)
        if(state.pending.get(captured.target.key)?.state==='confirmed'&&owner?.context===context){state.pending.delete(captured.target.key);state.owners.delete(captured.target.key)}}
      return undefined
    },
    abandonUnconfirmedSave:context=>{const captured=contexts.get(context);if(captured){const state=stateFor(captured.view)
      const owner=state.owners.get(captured.target.key)
      if(owner&&!owner.view.destroyed&&owner.context!==context)throw new Error('FILE_RESOURCE_SAVE_OWNER: 不能放弃其他查询上下文的文件提交')
      if(state.pending.get(captured.target.key)?.state!=='confirmed'){state.pending.delete(captured.target.key);state.owners.delete(captured.target.key)}}},
  }
  const update=(next:BindFileResourceAdapterOptions,view:DataView)=>{
    const before=current,{options}=before
    view.assertCanBindQueryExecutor(executor,{resource:{resourceType:'file',resourceId}})
    if(next.resourceId!==resourceId||next.contentField!==options.contentField||next.revisionField!==options.revisionField){
      throw new Error('FILE_RESOURCE_IDENTITY: DataView 已绑定另一资源或字段合同')
    }
    assertCurrent(view,undefined,before)
    if(targetIdentity(next.target(view))!==targetSignatures.get(view))throw new Error('FILE_RESOURCE_IDENTITY: DataView 已绑定另一文件目标')
    next.assertCurrent?.(targetFor(view,before))
    assertFileViewBinding(view,executor,next)
    assertBinding(before)
    current=bindingFor(next)
  }
  return {executor,update,lockTarget:view=>{targetFor(view);assertCurrent(view,undefined,current)}}
}

/** Creates the shared DataView executor for a declared file resource table, including named query clones. */
export function createFileResourceAdapterExecutor(options:BindFileResourceAdapterOptions):Parameters<DataView['bindQueryExecutor']>[0]{
  return createFileResourceEngine(options).executor
}

/** Binds an already identified DataView immediately; a different target requires a new DataView. */
export function bindFileResourceAdapter(view:DataView,options:BindFileResourceAdapterOptions):void{
  const existing=fileResourceBindings.get(view)
  if(existing){existing.update(options,view);return}
  const engine=createFileResourceEngine(options,view)
  assertFileViewBinding(view,engine.executor,options)
  view.bindQueryExecutor(engine.executor,{resource:{resourceType:'file',resourceId:options.resourceId}})
  assertFileViewBinding(view,engine.executor,options)
  fileResourceBindings.set(view,engine)
}

export {bindFileDirectoryQueryAdapter} from './file-resource/directory'
