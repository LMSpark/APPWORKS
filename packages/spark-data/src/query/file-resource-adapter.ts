import type {DataView} from '../data-view'
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
type SharedFileResourceState=Readonly<{pending:Map<string,PendingResourceChange>;historyAttempts:Map<string,HistoryAttempt>;saving:Set<string>}>
const sharedStates=new WeakMap<object,Map<string,SharedFileResourceState>>()
const boundViews=new WeakMap<DataView,string>()
const fileResourceBindings=new WeakMap<DataView,(options:BindFileResourceAdapterOptions)=>void>()
const fileDirectoryBindings=new WeakMap<DataView,(options:BindFileDirectoryQueryAdapterOptions)=>void>()

/** Get a named file-resource view from its DataSet, creating its table and binding once. */
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
  const table=input.dataSet.getTable(input.tableName)??input.dataSet.addTable(input.tableName,[...input.columns])
  if(table.modelBinding!==undefined||(table.resourceType!==undefined&&table.resourceType!=='file'))throw new Error('FILE_RESOURCE_IDENTITY: 表不是文件资源')
  table.resourceType='file';table.resourceId=input.resourceId
  const view=table.getOrCreateView(input.viewId),boundResource=boundViews.get(view)
  if(boundResource!==undefined&&boundResource!==input.resourceId)throw new Error('FILE_RESOURCE_IDENTITY: DataView 已绑定另一资源')
  if(input.queryContext)view.queryContext={...view.queryContext,...input.queryContext}
  bindFileResourceAdapter(view,{resourceId:input.resourceId,contentField:input.contentField,
    ...(input.revisionField?{revisionField:input.revisionField}:{}),target:input.target,transport:input.transport,
    ...(input.canWrite?{canWrite:input.canWrite}:{}),
    ...(input.canCreate?{canCreate:input.canCreate}:{}),
    ...(input.canDelete?{canDelete:input.canDelete}:{}),
    ...(input.assertCurrent?{assertCurrent:input.assertCurrent}:{})})
  boundViews.set(view,input.resourceId)
  return view
}

function sharedState(view:DataView,resourceId:string):SharedFileResourceState{
  const dataSet=view.dataSet
  if(!dataSet||dataSet.destroyed)throw new Error('FILE_RESOURCE_DATASET: 资源视图未绑定存活DataSet')
  let resources=sharedStates.get(dataSet)
  if(!resources){resources=new Map();sharedStates.set(dataSet,resources)}
  let state=resources.get(resourceId)
  if(!state){state={pending:new Map(),historyAttempts:new Map(),saving:new Set()};resources.set(resourceId,state)}
  return state
}

type FileResourceQueryContext=Readonly<{view:DataView;rows:readonly DataRow[];target:FileResourceTarget}>
type FileResourceEngine=Readonly<{executor:Executor;update(options:BindFileResourceAdapterOptions):void}>

/** Builds the single FileResource query/save engine; each view locks its target on first query. */
function createFileResourceEngine(initialOptions:BindFileResourceAdapterOptions,eagerView?:DataView):FileResourceEngine{
  let currentOptions=initialOptions
  const targets=new WeakMap<DataView,FileResourceTarget>()
  const targetSignatures=new WeakMap<DataView,string>()
  const contexts=new WeakMap<object,FileResourceQueryContext>()
  const targetIdentity=(target:FileResourceTarget)=>JSON.stringify([target.key,target.fields])
  const targetFor=(view:DataView):FileResourceTarget=>{
    const bound=targets.get(view),signature=targetSignatures.get(view)
    if(bound&&signature!==targetIdentity(currentOptions.target(view)))throw new Error('FILE_RESOURCE_IDENTITY: 文件DataView目标不可改绑')
    if(bound)return bound
    const target=currentOptions.target(view),stable=structuredClone(target)
    targets.set(view,stable);targetSignatures.set(view,targetIdentity(stable))
    return stable
  }
  const assertCurrent=(view:DataView,target?:FileResourceTarget)=>{
    if(view.destroyed||view.dataTable?.getView(view.viewId)!==view)throw new Error('FILE_RESOURCE_VIEW_STALE: DataView已释放或解绑')
    const bound=targetFor(view)
    if(target&&targetIdentity(bound)!==targetIdentity(target))throw new Error('FILE_RESOURCE_IDENTITY: 文件DataView目标不可改绑')
    currentOptions.assertCurrent?.(bound)
  }
  if(eagerView)targetFor(eagerView)
  const stateFor=(view:DataView)=>sharedState(view,currentOptions.resourceId)
  const formalSnapshotFields=(view:DataView,fields:Readonly<DataRow>|undefined):DataRow=>Object.fromEntries(
    Object.entries(fields??{}).filter(([name])=>view.columns.some(column=>column.name===name)))
  const canWrite=(target:FileResourceTarget)=>currentOptions.canWrite?.(target)??true
  const canCreate=(target:FileResourceTarget)=>currentOptions.canCreate?.(target)??canWrite(target)
  const canDelete=(target:FileResourceTarget)=>currentOptions.canDelete?.(target)??canWrite(target)
  const assertWritable=(target:FileResourceTarget)=>{if(!canWrite(target))throw new Error('FILE_RESOURCE_READ_ONLY: 文件目标只读')}
  const notifyWriteConfirmed=(input:Readonly<{view:DataView;attempt:PendingWrite}>)=>{
    const {view,attempt}=input,{target,text,baseline}=attempt
    assertCurrent(view,target)
    currentOptions.transport.onWriteConfirmed?.(target,text,baseline)
    assertCurrent(view,target)
  }
  const confirmWriteProjection=(view:DataView,attempt:PendingWrite):PendingWrite=>{
    const state=stateFor(view),confirmed={...attempt,state:'confirmed' as const,message:null,projectionNotified:false}
    state.pending.set(attempt.target.key,confirmed)
    if(!attempt.projectionNotified)notifyWriteConfirmed({view,attempt})
    const delivered={...confirmed,projectionNotified:true}
    state.pending.set(attempt.target.key,delivered)
    return delivered
  }
  const requireHistoryTransport=()=>{
    const transport=currentOptions.transport.history
    if(!transport)throw new Error('FILE_RESOURCE_HISTORY_UNAVAILABLE: 来源历史适配器不可用')
    return transport
  }
  const result=(view:DataView,rows:readonly DataRow[],target:FileResourceTarget):Awaited<ReturnType<Executor['executeQuery']>>=>{
    const primaryKey=view.primaryKey
    const fields=new Set(view.columns.map(column=>column.name)),selected=DataViewLocalQuery.select({rows:[...rows],fields,primaryKeys:[primaryKey],params:{page:1,allPages:true,treeMode:'flat'}})
    const keys=new Set(selected.rows.map(row=>String(row[primaryKey])))
    const rowKey=(row:Readonly<DataRow>)=>row[primaryKey],creating=rows.length===0
    const allowed=(key:unknown,field:string)=>keys.has(String(key))&&selected.output.has(field)
    const queryResult={rows:selected.rows,total:selected.total,rowKey,resultPrimaryKey:primaryKey,
      prepareNewRow:(row:Readonly<DataRow>)=>{
        for(const [field,value] of Object.entries(target.fields))if(Object.hasOwn(row,field)&&!Object.is(row[field],value))throw new Error('FILE_RESOURCE_SCOPE: 新文件身份与当前DataView目标不一致')
        return {...row,...target.fields,[primaryKey]:target.key}
      },
      assertIdentity:()=>assertCurrent(view,target),
      fieldAccess:(key:unknown,field:string)=>{const existingRow=allowed(key,field),newTarget=creating&&key===target.key&&selected.output.has(field)
        const visible=existingRow||newTarget,writable=canWrite(target),write=writable&&((existingRow&&field===currentOptions.contentField)
          ||(newTarget&&field!==primaryKey&&field!==currentOptions.revisionField))
        return {read:visible?'visible' as const:'invisible' as const,write:write?'allowed' as const:'denied' as const,
          component:!visible?'hidden' as const:write?'editable' as const:'readonly' as const,required:false,
          writeMode:write?'editable' as const:'readonly' as const}},
      readFieldAccess:(row:Readonly<DataRow>,field:string)=>selected.rows.includes(row)&&selected.output.has(field)?'visible' as const:'invisible' as const,
      addActionState:(available=true)=>creating&&available&&canCreate(target)?'enabled' as const:'disabled' as const,
      editActionState:(key:unknown)=>keys.has(String(key))&&canWrite(target)?'enabled' as const:'disabled' as const,
      deleteActionState:(key:unknown,available=true)=>keys.has(String(key))&&available&&canDelete(target)&&currentOptions.transport.remove?'enabled' as const:'disabled' as const,
      createChildActionState:()=> 'disabled' as const,
      viewActionState:(key:unknown)=>keys.has(String(key))?'enabled' as const:'disabled' as const}
    contexts.set(queryResult,{view,rows:rows.map(row=>({...row})),target});return queryResult
  }
  const source:DataViewSourceAdapter={
    views:current=>{const currentTarget=targetFor(current);return current.dataTable?.viewList.filter(candidate=>{
      try{return targetIdentity(targets.get(candidate)??currentOptions.target(candidate))===targetIdentity(currentTarget)}catch{return false}
    })??[]},
    preview:async current=>{const target=targetFor(current);assertCurrent(current,target);const snapshot=await currentOptions.transport.read(target);assertCurrent(current,target)
      if(snapshot===null)throw new Error('FILE_RESOURCE_MISSING: 来源文件不存在')
      return {version:snapshot.revision,content:snapshot.text}},
    adopt:async(current,snapshot,hooks)=>{const target=targetFor(current);assertCurrent(current,target);assertWritable(target);const remote=await currentOptions.transport.read(target);assertCurrent(current,target);hooks.assertCurrent()
      if(remote?.text !== snapshot.content||remote.revision!==snapshot.version)throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件已变化')
      hooks.beforeApply()},
    ...(currentOptions.transport.history?{history:{
      list:async current=>{const target=targetFor(current);assertCurrent(current,target);const items=await requireHistoryTransport().list(target);assertCurrent(current,target);return items.map(item=>({...item,label:item.fileName}))},
      preview:async(current,version)=>{const target=targetFor(current);assertCurrent(current,target);const text=await requireHistoryTransport().preview(target,version);assertCurrent(current,target);return text},
      status:(current):DataViewSourceHistoryStatus=>{const target=targetFor(current),item=stateFor(current).historyAttempts.get(target.key)
        return item?{state:item.state,version:item.attempt.version,fileName:item.attempt.fileName,message:item.message}: {state:'idle',version:null,fileName:null,message:null}},
      isDeliveryPending:current=>{const target=targetFor(current),item=stateFor(current).historyAttempts.get(target.key);return item?.state==='confirmed'&&item.deliveryPending},
      acknowledge:current=>{const target=targetFor(current),state=stateFor(current),item=state.historyAttempts.get(target.key)
        if(item&&(item.state==='confirmed'||item.state==='not-applied'))state.historyAttempts.set(target.key,{...item,deliveryPending:false})},
      verify:async(current,hooks)=>{const target=targetFor(current),state=stateFor(current),item=state.historyAttempts.get(target.key)
        if(item?.state !== 'unknown')return {state:item?.state??'idle',version:item?.attempt.version??null,fileName:item?.attempt.fileName??null,message:item?.message??null}
        hooks.assertCurrent();const applied=await requireHistoryTransport().verify(target,item.attempt,item.text);hooks.assertCurrent();assertCurrent(current,target)
        const next={...item,state:applied?'confirmed' as const:'not-applied' as const,message:null,deliveryPending:applied};state.historyAttempts.set(target.key,next)
        return {state:next.state,version:next.attempt.version,fileName:next.attempt.fileName,message:null}},
      create:async(current,hooks)=>{const target=targetFor(current);assertCurrent(current,target);assertWritable(target);await requireHistoryTransport().assertCanCreate?.(target);assertCurrent(current,target)
        const snapshot=await currentOptions.transport.read(target);assertCurrent(current,target)
        if(!snapshot)throw new Error('FILE_RESOURCE_MISSING: 来源文件不存在')
        const matching=current.rows.filter(row=>String(row[current.primaryKey])===target.key)
        const baseline=matching[0]
        if(matching.length!==1||!baseline)throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件与当前DataView查询基线不同')
        if(baseline[currentOptions.contentField]!==snapshot.text)throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件与当前DataView查询基线不同')
        if(currentOptions.revisionField!==undefined&&String(baseline[currentOptions.revisionField]??'')!==String(snapshot.revision??'')){
          throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件与当前DataView查询基线不同')
        }
        let captured:FileResourceHistoryAttempt|undefined
        try{await requireHistoryTransport().create(target,snapshot.text,attempt=>{hooks.assertCurrent();if(captured)throw new Error('FILE_RESOURCE_ATTEMPT_INVALID: attempt重复捕获')
          captured=attempt;stateFor(current).historyAttempts.set(target.key,{target,attempt,text:snapshot.text,state:'pending',message:null,deliveryPending:true});hooks.onAttempt(attempt)})
          if(!captured)throw new Error('FILE_RESOURCE_ATTEMPT_MISSING: 创建来源历史未捕获attempt')
          stateFor(current).historyAttempts.set(target.key,{target,attempt:captured,text:snapshot.text,state:'confirmed',message:null,deliveryPending:true})
        }catch(error){if(captured){const state=stateFor(current),storedAttempt=state.historyAttempts.get(target.key)
          if(storedAttempt){const notApplied=requireHistoryTransport().isDefiniteRejection?.(error)===true;state.historyAttempts.set(target.key,{...storedAttempt,state:notApplied?'not-applied':'unknown',deliveryPending:!notApplied,message:error instanceof Error?error.message:String(error)})}}
          throw error}},
    }}: {}),
    verifyWriteAttempt:async(current,hooks)=>{
      const target=targetFor(current),state=stateFor(current),attempt=state.pending.get(target.key)
      if(!attempt)return {state:'idle',text:null,message:null}
      hooks.assertCurrent();assertCurrent(current,target)
      const remote=await currentOptions.transport.read(attempt.target);hooks.assertCurrent();assertCurrent(current,target)
      if(attempt.operation==='delete'){
        if(remote===null){state.pending.set(target.key,{...attempt,state:'confirmed',message:null});return {state:'confirmed',text:null,message:null}}
        if(remote.text===attempt.baseline.text&&remote.revision===attempt.baseline.revision){state.pending.set(target.key,{...attempt,state:'not-applied',message:null});return {state:'not-applied',text:null,message:null}}
        return {state:'unknown',text:null,message:'远端文件与删除前来源均不一致'}
      }
      if(remote?.text===attempt.text){confirmWriteProjection(current,attempt)
        return {state:'confirmed',text:attempt.text,message:null}}
      if(attempt.baseline===null?remote===null:remote?.text===attempt.baseline.text&&remote.revision===attempt.baseline.revision){const notApplied={...attempt,state:'not-applied' as const,message:null};state.pending.set(target.key,notApplied)
        return {state:'not-applied',text:attempt.text,message:null}}
      return {state:'unknown',text:attempt.text,message:'远端文件与原提交及原基线均不一致'}
    },
    acknowledgeWriteAttempt:current=>{
      const target=targetFor(current),state=stateFor(current),attempt=state.pending.get(target.key)
      if(attempt?.state==='confirmed'||attempt?.state==='not-applied')state.pending.delete(target.key)
    },
  }
  const executor:Executor={localAggregates:false,saveIndependently:true,source,
    executeQuery:async(currentView,params:QueryParams)=>{
      const target=targetFor(currentView);assertCurrent(currentView,target)
      const snapshot=await currentOptions.transport.read(target);assertCurrent(currentView,target)
      if(snapshot===null)return result(currentView,[],target)
      const revisionField=currentOptions.revisionField
      const row:DataRow={...target.fields,...snapshot.fields,[currentView.primaryKey]:target.key,[currentOptions.contentField]:snapshot.text,
        ...(revisionField?{[revisionField]:snapshot.revision??''}:{})}
      const selected=DataViewLocalQuery.select({rows:[row],fields:new Set(currentView.columns.map(column=>column.name)),
        primaryKeys:[currentView.primaryKey],params})
      const context=result(currentView,selected.rows,target)
      return context
    },
    save:async(command:SaveCommand)=>{
      const receipts:SaveReceipt[]=[]
      for(const change of command.changes){
        const context=contexts.get(change.context),original=context?.rows[0]
        const added=change.changes.added??[],changed=change.changes.changed??[],deleted=change.changes.deleted??[]
        const operationCount=Number(added.length>0)+Number(changed.length>0)+Number(deleted.length>0)
        if(!context||operationCount!==1||added.length+changed.length+deleted.length!==1){throw new Error('FILE_RESOURCE_CHANGE: 每次文件资源保存只允许一个新增、更新或删除行')}
        const {view,target}=context,state=stateFor(view)
        assertCurrent(view,target)
        if(!deleted.length)assertWritable(target)
        if(state.saving.has(target.key))throw new Error('FILE_RESOURCE_SAVE_PENDING: 文件目标正在提交')
        state.saving.add(target.key)
        try{
        const prior=state.pending.get(target.key)
        let confirmedSnapshot:FileResourceSnapshot|null=null
        if(added.length){
          const submitted=added[0]
          const writeText=submitted?.[currentOptions.contentField]
          if(!canCreate(target))throw new Error('FILE_RESOURCE_READ_ONLY: 文件来源不允许新增')
          if(!submitted||context.rows.length!==0||submitted[view.primaryKey]!==target.key||typeof writeText!=='string'
            ||Object.entries(target.fields).some(([field,value])=>!Object.is(submitted[field],value)))throw new Error('FILE_RESOURCE_SCOPE: 文件新增身份或内容无效')
          if(prior){
            if(prior.operation!=='write')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原文件提交与当前新增操作不一致')
            const remote=await currentOptions.transport.read(prior.target);assertCurrent(view,target)
            if(remote?.text===prior.text){
              confirmWriteProjection(view,prior)
              if(prior.text!==writeText)throw new Error('FILE_RESOURCE_UNKNOWN_DELIVERY: 原提交已确认，须先交付原回执再提交新文本')
              confirmedSnapshot=remote
            }
            else if(remote===null){state.pending.set(target.key,{...prior,state:'not-applied',message:null});throw new Error('FILE_RESOURCE_NOT_APPLIED: 原文件新增未确认生效')}
            else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与原提交及空基线均不一致')
          }else{
              const baseline=await currentOptions.transport.read(target);assertCurrent(view,target)
            if(baseline!==null)throw new Error('FILE_RESOURCE_CONFLICT: 新增目标文件已存在')
            try{await currentOptions.transport.write({target,text:writeText,baseline:null})}
            catch(error){if(currentOptions.transport.isUnknown(error))state.pending.set(target.key,{target,operation:'write',baseline:null,text:writeText,state:'unknown',message:error instanceof Error?error.message:String(error),projectionNotified:false});throw error}
            try{confirmedSnapshot=await currentOptions.transport.read(target);assertCurrent(view,target)
              if(confirmedSnapshot?.text!==writeText)throw new Error('FILE_RESOURCE_READBACK: 文件新增回读不一致')
            }catch(error){state.pending.set(target.key,{target,operation:'write',baseline:null,text:writeText,state:'unknown',message:error instanceof Error?error.message:String(error),projectionNotified:false});throw error}
            confirmWriteProjection(view,{target,operation:'write',baseline:null,text:writeText,state:'confirmed',message:null,projectionNotified:false})
          }
          const saved=confirmedSnapshot
          if(saved.text!==writeText)throw new Error('FILE_RESOURCE_RECEIPT: 文件新增回执无法确认')
          const snapshotFields=formalSnapshotFields(view,saved.fields)
          const accepted={...submitted,...snapshotFields,...(currentOptions.revisionField?{[currentOptions.revisionField]:saved.revision??''}:{})}
          receipts.push({metaName:change.identity.metaName,added:[accepted],changed:[],deleted:[],changedFields:[],context:result(view,[accepted],target)})
          state.pending.delete(target.key)
          continue
        }
        if(changed.length){
          const submitted=changed[0]
          const writeText=submitted?.[currentOptions.contentField]
          if(!submitted||!original||submitted[view.primaryKey]!==original[view.primaryKey]||typeof writeText!=='string')throw new Error('FILE_RESOURCE_SCOPE: 文件更新行身份或内容无效')
          if(prior){
            if(prior.operation!=='write')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原文件提交与当前更新操作不一致')
            const remote=await currentOptions.transport.read(prior.target);assertCurrent(view,target)
            if(remote?.text===prior.text){
              confirmWriteProjection(view,prior)
              if(prior.text!==writeText)throw new Error('FILE_RESOURCE_UNKNOWN_DELIVERY: 原提交已确认，须先交付原回执再提交新文本')
              confirmedSnapshot=remote
            }
            else if(prior.baseline!==null&&remote?.text===prior.baseline.text&&remote.revision===prior.baseline.revision){state.pending.set(target.key,{...prior,state:'not-applied',message:null});throw new Error('FILE_RESOURCE_NOT_APPLIED: 原文件提交确认未生效')}
            else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与原提交及原基线均不一致')
          }else{
            const baseline=await currentOptions.transport.read(target);assertCurrent(view,target)
            if(baseline===null||baseline.text!==original[currentOptions.contentField]
              ||currentOptions.revisionField&&String(baseline.revision??'')!==String(original[currentOptions.revisionField]??''))throw new Error('FILE_RESOURCE_CONFLICT: 远端文件已不同于DataView查询基线')
            try{await currentOptions.transport.write({target,text:writeText,baseline})}
            catch(error){if(currentOptions.transport.isUnknown(error))state.pending.set(target.key,{target,operation:'write',baseline,text:writeText,state:'unknown',message:error instanceof Error?error.message:String(error),projectionNotified:false});throw error}
            try{confirmedSnapshot=await currentOptions.transport.read(target);assertCurrent(view,target)
              if(confirmedSnapshot?.text!==writeText)throw new Error('FILE_RESOURCE_READBACK: 文件保存回读不一致')
            }catch(error){state.pending.set(target.key,{target,operation:'write',baseline,text:writeText,state:'unknown',message:error instanceof Error?error.message:String(error),projectionNotified:false});throw error}
            confirmWriteProjection(view,{target,operation:'write',baseline,text:writeText,state:'confirmed',message:null,projectionNotified:false})
          }
          const saved=confirmedSnapshot
          if(saved.text!==writeText)throw new Error('FILE_RESOURCE_RECEIPT: 文件保存回执无法确认')
          const snapshotFields=formalSnapshotFields(view,saved.fields)
          const accepted={...submitted,...snapshotFields,...(currentOptions.revisionField?{[currentOptions.revisionField]:saved.revision??''}:{})}
          receipts.push({metaName:change.identity.metaName,added:[],changed:[accepted],deleted:[],
            changedFields:[[currentOptions.contentField,...(currentOptions.revisionField?[currentOptions.revisionField]:[]),...Object.keys(snapshotFields)]
              .filter(field=>view.columns.some(column=>column.name===field))],context:result(view,[accepted],target)})
          state.pending.delete(target.key)
          continue
        }
        const submitted=deleted[0]
        if(!canDelete(target))throw new Error('FILE_RESOURCE_READ_ONLY: 文件目标只读')
        if(!submitted||!original||!currentOptions.transport.remove||submitted[view.primaryKey]!==original[view.primaryKey])throw new Error('FILE_RESOURCE_DELETE_UNSUPPORTED: 来源不支持或无法确认目标文件行删除')
        if(prior){
          if(prior.operation!=='delete')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原文件提交与当前删除操作不一致')
          const remote=await currentOptions.transport.read(prior.target);assertCurrent(view,target)
          if(remote===null){state.pending.set(target.key,{...prior,state:'confirmed',message:null})}
          else if(remote.text===prior.baseline.text&&remote.revision===prior.baseline.revision){state.pending.set(target.key,{...prior,state:'not-applied',message:null});throw new Error('FILE_RESOURCE_NOT_APPLIED: 文件删除未确认生效')}
          else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与删除前来源均不一致')
        }else{
          const baseline=await currentOptions.transport.read(target);assertCurrent(view,target)
          if(!baseline||baseline.text!==original[currentOptions.contentField]
            ||currentOptions.revisionField&&String(baseline.revision??'')!==String(original[currentOptions.revisionField]??''))throw new Error('FILE_RESOURCE_CONFLICT: 远端文件已不同于DataView删除基线')
          try{await currentOptions.transport.remove({target,baseline})}
          catch(error){if(currentOptions.transport.isUnknown(error))state.pending.set(target.key,{target,operation:'delete',baseline,state:'unknown',message:error instanceof Error?error.message:String(error)});throw error}
          try{const readback=await currentOptions.transport.read(target);assertCurrent(view,target)
            if(readback!==null)throw new Error('FILE_RESOURCE_READBACK: 文件删除回读仍存在')
          }catch(error){state.pending.set(target.key,{target,operation:'delete',baseline,state:'unknown',message:error instanceof Error?error.message:String(error)});throw error}
          state.pending.set(target.key,{target,operation:'delete',baseline,state:'confirmed',message:null})
        }
        receipts.push({metaName:change.identity.metaName,added:[],changed:[],deleted:[submitted],changedFields:[],context:result(view,[],target)})
        state.pending.delete(target.key)
        }finally{state.saving.delete(target.key)}
      }
      return receipts
    },
    hasUnconfirmedSave:context=>{const captured=contexts.get(context);return captured!==undefined&&stateFor(captured.view).pending.has(captured.target.key)},
    abandonUnconfirmedSave:context=>{const captured=contexts.get(context);if(captured)stateFor(captured.view).pending.delete(captured.target.key)},
  }
  const update=(next:BindFileResourceAdapterOptions)=>{
    if(next.resourceId!==currentOptions.resourceId)throw new Error('FILE_RESOURCE_IDENTITY: DataView 已绑定另一资源')
    if(eagerView&&targetIdentity(next.target(eagerView))!==targetSignatures.get(eagerView))throw new Error('FILE_RESOURCE_IDENTITY: DataView 已绑定另一文件目标')
    currentOptions=next
  }
  return {executor,update}
}

/** Creates the shared DataView executor for a declared file resource table, including named query clones. */
export function createFileResourceAdapterExecutor(options:BindFileResourceAdapterOptions):Parameters<DataView['bindQueryExecutor']>[0]{
  return createFileResourceEngine(options).executor
}

/** Binds an already identified DataView immediately; a different target requires a new DataView. */
export function bindFileResourceAdapter(view:DataView,options:BindFileResourceAdapterOptions):void{
  const existing=fileResourceBindings.get(view)
  if(existing){existing(options);return}
  const engine=createFileResourceEngine(options,view)
  view.bindQueryExecutor(engine.executor,{resource:{resourceType:'file',resourceId:options.resourceId}})
  fileResourceBindings.set(view,engine.update)
}

/** Binds a complete, read-only file directory listing to one DataView query. */
export function bindFileDirectoryQueryAdapter(view:DataView,options:BindFileDirectoryQueryAdapterOptions):void{
  const existing=fileDirectoryBindings.get(view)
  if(existing){existing(options);return}
  let currentOptions=options
  const targetIdentity=(target:FileResourceTarget)=>JSON.stringify([target.key,target.fields])
  const boundTargetIdentity=targetIdentity(currentOptions.target(view))
  const assertCurrent=()=>{
    if(view.destroyed||view.dataTable?.getView(view.viewId)!==view)throw new Error('FILE_DIRECTORY_VIEW_STALE: DataView已释放或解绑')
    if(targetIdentity(currentOptions.target(view))!==boundTargetIdentity)throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录视图目标不可改绑')
    currentOptions.assertCurrent?.()
  }
  const executor:Executor={localAggregates:false,executeQuery:async(current,params)=>{
    assertCurrent()
    if(current!==view)throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录查询视图不匹配')
    const target=currentOptions.target(current)
    if(targetIdentity(target)!==boundTargetIdentity)throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录视图目标不可改绑')
    const names=await currentOptions.list(target)
    assertCurrent()
    const rows=names.map(fileName=>({[current.primaryKey]:fileName,fileName}))
    const selected=DataViewLocalQuery.select({rows,fields:new Set(current.columns.map(column=>column.name)),primaryKeys:[current.primaryKey],
      params:{...params,allPages:true,treeMode:'flat'}})
    const keys=new Set(selected.rows.map(row=>String(row[current.primaryKey])))
    const visible=(key:unknown,field:string)=>keys.has(String(key))&&selected.output.has(field)
    return {rows:selected.rows,total:selected.total,rowKey:(row:Readonly<DataRow>)=>row[current.primaryKey],
      assertIdentity:identity=>{assertCurrent();if(identity.scenarioId!==current.dataSet?.scenarioId||identity.metaName!==current.tableName
        ||identity.resource?.resourceType!=='file'||identity.resource.resourceId!==currentOptions.resourceId){
        throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录资源身份不匹配')}} ,
      fieldAccess:(key,field)=>{const allowed=visible(key,field);return {read:allowed?'visible' as const:'invisible' as const,write:'denied' as const,
        component:allowed?'readonly' as const:'hidden' as const,required:false,writeMode:'readonly' as const}},
      readFieldAccess:(_row,field)=>selected.output.has(field)?'visible' as const:'invisible' as const,
      addActionState:()=> 'disabled' as const,editActionState:()=> 'disabled' as const,deleteActionState:()=> 'disabled' as const,
      createChildActionState:()=> 'disabled' as const,viewActionState:key=>keys.has(String(key))?'enabled' as const:'hidden' as const}
  }}
  view.bindQueryExecutor(executor,{resource:{resourceType:'file',resourceId:currentOptions.resourceId}})
  fileDirectoryBindings.set(view,next=>{
    if(next.resourceId!==currentOptions.resourceId)throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录视图已绑定另一资源')
    if(targetIdentity(next.target(view))!==boundTargetIdentity)throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录视图目标不可改绑')
    currentOptions=next
  })
}
