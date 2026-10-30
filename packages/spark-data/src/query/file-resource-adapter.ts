import type {DataView} from '../data-view'
import type {DataSet} from '../dataset'
import type {DataColumn} from '../types'
import {DataViewLocalQuery} from './data-view-local-query'
import type {DataViewSourceAdapter, DataViewSourceHistoryStatus} from './data-view-source'
import type {DataRow, QueryParams} from '../types'

export type FileResourceTarget=Readonly<{key:string;fields:Readonly<DataRow>}>
export type FileResourceSnapshot=Readonly<{text:string;revision:string|null}>
export type FileResourceHistoryAttempt=Readonly<{version:string|number;fileName:string}>
export type FileResourceTransport=Readonly<{
  read(target:FileResourceTarget):Promise<FileResourceSnapshot|null>
  write(input:Readonly<{target:FileResourceTarget;text:string;baseline:FileResourceSnapshot|null}>):Promise<void>
  remove?(input:Readonly<{target:FileResourceTarget;baseline:FileResourceSnapshot}>):Promise<void>
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
  target(view:DataView):FileResourceTarget
  transport:FileResourceTransport
  assertCurrent?():void
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
type PendingWrite=Readonly<{target:FileResourceTarget;operation:'write';baseline:FileResourceSnapshot|null;text:string;state:'unknown'|'confirmed'|'not-applied';message:string|null}>
type PendingDelete=Readonly<{target:FileResourceTarget;operation:'delete';baseline:FileResourceSnapshot;state:'unknown'|'confirmed'|'not-applied';message:string|null}>
type PendingResourceChange=PendingWrite|PendingDelete
type HistoryAttempt=Readonly<{target:FileResourceTarget;attempt:FileResourceHistoryAttempt;text:string;state:'pending'|'unknown'|'confirmed'|'not-applied';message:string|null;deliveryPending:boolean}>
type SharedFileResourceState=Readonly<{pending:Map<string,PendingResourceChange>;historyAttempts:Map<string,HistoryAttempt>}>
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
  queryContext?:Readonly<Record<string,unknown>>
  target:(view:DataView)=>FileResourceTarget
  transport:FileResourceTransport
  assertCurrent?:()=>void
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
  if(!state){state={pending:new Map(),historyAttempts:new Map()};resources.set(resourceId,state)}
  return state
}

/** Binds one semantic file resource to the standard DataView query/save and receipt lifecycle. */
export function bindFileResourceAdapter(view:DataView,options:BindFileResourceAdapterOptions):void{
  const existing=fileResourceBindings.get(view)
  if(existing){existing(options);return}
  let currentOptions=options
  const state=sharedState(view,currentOptions.resourceId)
  const contexts=new WeakMap<object,Readonly<{rows:readonly DataRow[];target:FileResourceTarget}>>()
  const targetIdentity=(target:FileResourceTarget)=>JSON.stringify([target.key,target.fields])
  const boundTargetIdentity=targetIdentity(currentOptions.target(view))
  const assertCurrent=()=>{
    if(view.destroyed||view.dataTable?.getView(view.viewId)!==view)throw new Error('FILE_RESOURCE_VIEW_STALE: DataView已释放或解绑')
    if(targetIdentity(currentOptions.target(view))!==boundTargetIdentity)throw new Error('FILE_RESOURCE_IDENTITY: 文件DataView目标不可改绑')
    currentOptions.assertCurrent?.()
  }
  let historyTransport=currentOptions.transport.history
  const historyTransportRef={current:historyTransport}
  const requireHistoryTransport=()=>{
    const transport=historyTransportRef.current
    if(!transport)throw new Error('FILE_RESOURCE_HISTORY_UNAVAILABLE: 来源历史适配器不可用')
    return transport
  }
  const result=(rows:readonly DataRow[],target:FileResourceTarget):Awaited<ReturnType<Executor['executeQuery']>>=>{
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
      assertIdentity:()=>assertCurrent(),
      fieldAccess:(key:unknown,field:string)=>{const existingRow=allowed(key,field),newTarget=creating&&key===target.key&&selected.output.has(field)
        const visible=existingRow||newTarget,write=(existingRow&&field===currentOptions.contentField)
          ||(newTarget&&field!==primaryKey&&field!==currentOptions.revisionField)
        return {read:visible?'visible' as const:'invisible' as const,write:write?'allowed' as const:'denied' as const,
          component:!visible?'hidden' as const:write?'editable' as const:'readonly' as const,required:false,
          writeMode:write?'editable' as const:'readonly' as const}},
      readFieldAccess:(row:Readonly<DataRow>,field:string)=>selected.rows.includes(row)&&selected.output.has(field)?'visible' as const:'invisible' as const,
      addActionState:(available=true)=>creating&&available?'enabled' as const:'disabled' as const,
      editActionState:(key:unknown)=>keys.has(String(key))?'enabled' as const:'disabled' as const,
      deleteActionState:(key:unknown,available=true)=>keys.has(String(key))&&available&&currentOptions.transport.remove?'enabled' as const:'disabled' as const,
      createChildActionState:()=> 'disabled' as const,
      viewActionState:(key:unknown)=>keys.has(String(key))?'enabled' as const:'disabled' as const}
    contexts.set(queryResult,{rows:rows.map(row=>({...row})),target});return queryResult
  }
  const source:DataViewSourceAdapter={
    views:current=>current.dataTable?.viewList.filter(candidate=>{
      try{return targetIdentity(currentOptions.target(candidate))===targetIdentity(currentOptions.target(current))}catch{return false}
    })??[],
    preview:async current=>{assertCurrent();const target=currentOptions.target(current),snapshot=await currentOptions.transport.read(target);assertCurrent()
      if(snapshot===null)throw new Error('FILE_RESOURCE_MISSING: 来源文件不存在')
      return {version:snapshot.revision,content:snapshot.text}},
    adopt:async(current,snapshot,hooks)=>{assertCurrent();const target=currentOptions.target(current),remote=await currentOptions.transport.read(target);assertCurrent();hooks.assertCurrent()
      if(remote?.text !== snapshot.content||remote.revision!==snapshot.version)throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件已变化')
      hooks.beforeApply()},
    ...(historyTransport?{history:{
      list:async current=>{assertCurrent();const target=currentOptions.target(current),items=await requireHistoryTransport().list(target);assertCurrent();return items.map(item=>({...item,label:item.fileName}))},
      preview:async(current,version)=>{assertCurrent();const target=currentOptions.target(current),text=await requireHistoryTransport().preview(target,version);assertCurrent();return text},
      status:(current):DataViewSourceHistoryStatus=>{const target=currentOptions.target(current),item=state.historyAttempts.get(target.key)
        return item?{state:item.state,version:item.attempt.version,fileName:item.attempt.fileName,message:item.message}: {state:'idle',version:null,fileName:null,message:null}},
      isDeliveryPending:current=>{const item=state.historyAttempts.get(currentOptions.target(current).key);return item?.state==='confirmed'&&item.deliveryPending},
      acknowledge:current=>{const target=currentOptions.target(current),item=state.historyAttempts.get(target.key)
        if(item&&(item.state==='confirmed'||item.state==='not-applied'))state.historyAttempts.set(target.key,{...item,deliveryPending:false})},
      verify:async(current,hooks)=>{const target=currentOptions.target(current),item=state.historyAttempts.get(target.key)
        if(item?.state !== 'unknown')return {state:item?.state??'idle',version:item?.attempt.version??null,fileName:item?.attempt.fileName??null,message:item?.message??null}
        hooks.assertCurrent();const applied=await requireHistoryTransport().verify(target,item.attempt,item.text);hooks.assertCurrent()
        const next={...item,state:applied?'confirmed' as const:'not-applied' as const,message:null,deliveryPending:applied};state.historyAttempts.set(target.key,next)
        return {state:next.state,version:next.attempt.version,fileName:next.attempt.fileName,message:null}},
      create:async(current,hooks)=>{assertCurrent();const target=currentOptions.target(current);await requireHistoryTransport().assertCanCreate?.(target);assertCurrent()
        const snapshot=await currentOptions.transport.read(target);assertCurrent()
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
          captured=attempt;state.historyAttempts.set(target.key,{target,attempt,text:snapshot.text,state:'pending',message:null,deliveryPending:true});hooks.onAttempt(attempt)})
          if(!captured)throw new Error('FILE_RESOURCE_ATTEMPT_MISSING: 创建来源历史未捕获attempt')
          state.historyAttempts.set(target.key,{target,attempt:captured,text:snapshot.text,state:'confirmed',message:null,deliveryPending:true})
        }catch(error){if(captured){const storedAttempt=state.historyAttempts.get(target.key)
          if(storedAttempt){const notApplied=requireHistoryTransport().isDefiniteRejection?.(error)===true;state.historyAttempts.set(target.key,{...storedAttempt,state:notApplied?'not-applied':'unknown',deliveryPending:!notApplied,message:error instanceof Error?error.message:String(error)})}}
          throw error}},
    }}: {}),
    verifyWriteAttempt:async(current,hooks)=>{
      const target=currentOptions.target(current),attempt=state.pending.get(target.key)
      if(!attempt)return {state:'idle',text:null,message:null}
      hooks.assertCurrent()
      const remote=await currentOptions.transport.read(attempt.target);hooks.assertCurrent()
      if(attempt.operation==='delete'){
        if(remote===null){state.pending.set(target.key,{...attempt,state:'confirmed',message:null});return {state:'confirmed',text:null,message:null}}
        if(remote.text===attempt.baseline.text&&remote.revision===attempt.baseline.revision){state.pending.set(target.key,{...attempt,state:'not-applied',message:null});return {state:'not-applied',text:null,message:null}}
        return {state:'unknown',text:null,message:'远端文件与删除前来源均不一致'}
      }
      if(remote?.text===attempt.text){const confirmed={...attempt,state:'confirmed' as const,message:null};state.pending.set(target.key,confirmed)
        return {state:'confirmed',text:attempt.text,message:null}}
      if(attempt.baseline===null?remote===null:remote?.text===attempt.baseline.text&&remote.revision===attempt.baseline.revision){const notApplied={...attempt,state:'not-applied' as const,message:null};state.pending.set(target.key,notApplied)
        return {state:'not-applied',text:attempt.text,message:null}}
      return {state:'unknown',text:attempt.text,message:'远端文件与原提交及原基线均不一致'}
    },
    acknowledgeWriteAttempt:current=>{
      const target=currentOptions.target(current),attempt=state.pending.get(target.key)
      if(attempt?.state==='confirmed'||attempt?.state==='not-applied')state.pending.delete(target.key)
    },
  }
  const executor:Executor={localAggregates:false,source,
    executeQuery:async(currentView,params:QueryParams)=>{
      assertCurrent();const target=currentOptions.target(currentView),snapshot=await currentOptions.transport.read(target);assertCurrent()
      if(snapshot===null)return result([],target)
      const revisionField=currentOptions.revisionField
      const row:DataRow={...target.fields,[currentView.primaryKey]:target.key,[currentOptions.contentField]:snapshot.text,
        ...(revisionField?{[revisionField]:snapshot.revision??''}:{})}
      const selected=DataViewLocalQuery.select({rows:[row],fields:new Set(currentView.columns.map(column=>column.name)),
        primaryKeys:[currentView.primaryKey],params})
      const context=result(selected.rows,target)
      return context
    },
    save:async(command:SaveCommand)=>{
      assertCurrent();const receipts:SaveReceipt[]=[]
      for(const change of command.changes){
        const context=contexts.get(change.context),original=context?.rows[0]
        const added=change.changes.added??[],changed=change.changes.changed??[],deleted=change.changes.deleted??[]
        const operationCount=Number(added.length>0)+Number(changed.length>0)+Number(deleted.length>0)
        if(!context||operationCount!==1||added.length+changed.length+deleted.length!==1){throw new Error('FILE_RESOURCE_CHANGE: 每次文件资源保存只允许一个新增、更新或删除行')}
        const target=currentOptions.target(view)
        if(targetIdentity(target)!==targetIdentity(context.target)||JSON.stringify(target.fields)!==JSON.stringify(context.target.fields)){
          throw new Error('FILE_RESOURCE_SCOPE: 文件目标或内容身份无效')
        }
        assertCurrent()
        const prior=state.pending.get(target.key)
        if(added.length){
          const submitted=added[0]
          const writeText=submitted?.[currentOptions.contentField]
          if(!submitted||context.rows.length!==0||submitted[view.primaryKey]!==target.key||typeof writeText!=='string'
            ||Object.entries(target.fields).some(([field,value])=>!Object.is(submitted[field],value)))throw new Error('FILE_RESOURCE_SCOPE: 文件新增身份或内容无效')
          if(prior){
            if(prior.operation!=='write')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原文件提交与当前新增操作不一致')
            const remote=await currentOptions.transport.read(prior.target);assertCurrent()
            if(remote?.text===prior.text){
              state.pending.set(target.key,{...prior,state:'confirmed',message:null})
              if(prior.text!==writeText)throw new Error('FILE_RESOURCE_UNKNOWN_DELIVERY: 原提交已确认，须先交付原回执再提交新文本')
              state.pending.delete(target.key)
            }
            else if(remote===null){state.pending.set(target.key,{...prior,state:'not-applied',message:null});throw new Error('FILE_RESOURCE_NOT_APPLIED: 原文件新增未确认生效')}
            else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与原提交及空基线均不一致')
          }else{
            const baseline=await currentOptions.transport.read(target);assertCurrent()
            if(baseline!==null)throw new Error('FILE_RESOURCE_CONFLICT: 新增目标文件已存在')
            try{
              await currentOptions.transport.write({target,text:writeText,baseline:null})
              const readback=await currentOptions.transport.read(target);assertCurrent()
              if(readback?.text!==writeText)throw new Error('FILE_RESOURCE_READBACK: 文件新增回读不一致')
            }catch(error){
              if(currentOptions.transport.isUnknown(error))state.pending.set(target.key,{target,operation:'write',baseline:null,text:writeText,state:'unknown',message:error instanceof Error?error.message:String(error)})
              throw error
            }
          }
          const saved=await currentOptions.transport.read(target);assertCurrent()
          if(saved?.text!==writeText)throw new Error('FILE_RESOURCE_RECEIPT: 文件新增回执无法确认')
          const accepted={...submitted,...(currentOptions.revisionField?{[currentOptions.revisionField]:saved.revision??''}:{})}
          receipts.push({metaName:change.identity.metaName,added:[accepted],changed:[],deleted:[],changedFields:[],context:result([accepted],target)})
          continue
        }
        if(changed.length){
          const submitted=changed[0]
          const writeText=submitted?.[currentOptions.contentField]
          if(!submitted||!original||submitted[view.primaryKey]!==original[view.primaryKey]||typeof writeText!=='string')throw new Error('FILE_RESOURCE_SCOPE: 文件更新行身份或内容无效')
          if(prior){
            if(prior.operation!=='write')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原文件提交与当前更新操作不一致')
            const remote=await currentOptions.transport.read(prior.target);assertCurrent()
            if(remote?.text===prior.text){
              state.pending.set(target.key,{...prior,state:'confirmed',message:null})
              if(prior.text!==writeText)throw new Error('FILE_RESOURCE_UNKNOWN_DELIVERY: 原提交已确认，须先交付原回执再提交新文本')
              state.pending.delete(target.key)
            }
            else if(prior.baseline!==null&&remote?.text===prior.baseline.text&&remote.revision===prior.baseline.revision){state.pending.set(target.key,{...prior,state:'not-applied',message:null});throw new Error('FILE_RESOURCE_NOT_APPLIED: 原文件提交确认未生效')}
            else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与原提交及原基线均不一致')
          }else{
            const baseline=await currentOptions.transport.read(target);assertCurrent()
            if(baseline===null||baseline.text!==original[currentOptions.contentField]
              ||currentOptions.revisionField&&String(baseline.revision??'')!==String(original[currentOptions.revisionField]??''))throw new Error('FILE_RESOURCE_CONFLICT: 远端文件已不同于DataView查询基线')
            try{
              await currentOptions.transport.write({target,text:writeText,baseline})
              const readback=await currentOptions.transport.read(target);assertCurrent()
              if(readback?.text!==writeText)throw new Error('FILE_RESOURCE_READBACK: 文件保存回读不一致')
            }catch(error){
              if(currentOptions.transport.isUnknown(error))state.pending.set(target.key,{target,operation:'write',baseline,text:writeText,state:'unknown',message:error instanceof Error?error.message:String(error)})
              throw error
            }
          }
          const saved=await currentOptions.transport.read(target);assertCurrent()
          if(saved?.text!==writeText)throw new Error('FILE_RESOURCE_RECEIPT: 文件保存回执无法确认')
          const accepted={...submitted,...(currentOptions.revisionField?{[currentOptions.revisionField]:saved.revision??''}:{})}
          receipts.push({metaName:change.identity.metaName,added:[],changed:[accepted],deleted:[],
            changedFields:[[currentOptions.contentField,...(currentOptions.revisionField?[currentOptions.revisionField]:[])]],context:result([accepted],target)})
          continue
        }
        const submitted=deleted[0]
        if(!submitted||!original||!currentOptions.transport.remove||submitted[view.primaryKey]!==original[view.primaryKey])throw new Error('FILE_RESOURCE_DELETE_UNSUPPORTED: 来源不支持或无法确认目标文件行删除')
        if(prior){
          if(prior.operation!=='delete')throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 原文件提交与当前删除操作不一致')
          const remote=await currentOptions.transport.read(prior.target);assertCurrent()
          if(remote===null)state.pending.delete(target.key)
          else if(remote.text===prior.baseline.text&&remote.revision===prior.baseline.revision){state.pending.set(target.key,{...prior,state:'not-applied',message:null});throw new Error('FILE_RESOURCE_NOT_APPLIED: 文件删除未确认生效')}
          else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与删除前来源均不一致')
        }else{
          const baseline=await currentOptions.transport.read(target);assertCurrent()
          if(!baseline||baseline.text!==original[currentOptions.contentField]
            ||currentOptions.revisionField&&String(baseline.revision??'')!==String(original[currentOptions.revisionField]??''))throw new Error('FILE_RESOURCE_CONFLICT: 远端文件已不同于DataView删除基线')
          try{
            await currentOptions.transport.remove({target,baseline})
            const readback=await currentOptions.transport.read(target);assertCurrent()
            if(readback!==null)throw new Error('FILE_RESOURCE_READBACK: 文件删除回读仍存在')
          }catch(error){
            if(currentOptions.transport.isUnknown(error))state.pending.set(target.key,{target,operation:'delete',baseline,state:'unknown',message:error instanceof Error?error.message:String(error)})
            throw error
          }
        }
        const readback=await currentOptions.transport.read(target);assertCurrent()
        if(readback!==null)throw new Error('FILE_RESOURCE_RECEIPT: 文件删除回执无法确认')
        receipts.push({metaName:change.identity.metaName,added:[],changed:[],deleted:[submitted],changedFields:[],context:result([],target)})
      }
      return receipts
    },
    hasUnconfirmedSave:context=>{const captured=contexts.get(context);return captured!==undefined&&state.pending.has(captured.target.key)},
    abandonUnconfirmedSave:context=>{const captured=contexts.get(context);if(captured)state.pending.delete(captured.target.key)},
  }
  view.bindQueryExecutor(executor,{resource:{resourceType:'file',resourceId:currentOptions.resourceId}})
  fileResourceBindings.set(view,next=>{
    if(next.resourceId!==currentOptions.resourceId)throw new Error('FILE_RESOURCE_IDENTITY: DataView 已绑定另一资源')
    if(targetIdentity(next.target(view))!==boundTargetIdentity)throw new Error('FILE_RESOURCE_IDENTITY: DataView 已绑定另一文件目标')
    currentOptions=next
    historyTransport=next.transport.history;historyTransportRef.current=historyTransport
  })
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
