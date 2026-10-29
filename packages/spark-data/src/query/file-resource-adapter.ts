import type {DataView} from '../data-view'
import {DataViewLocalQuery} from './data-view-local-query'
import type {DataViewSourceAdapter, DataViewSourceHistoryStatus} from './data-view-source'
import type {DataRow, QueryParams} from '../types'

export type FileResourceTarget=Readonly<{key:string;fields:Readonly<DataRow>}>
export type FileResourceSnapshot=Readonly<{text:string;revision:string|null}>
export type FileResourceHistoryAttempt=Readonly<{version:string|number;fileName:string}>
export type FileResourceTransport=Readonly<{
  read(target:FileResourceTarget):Promise<FileResourceSnapshot|null>
  write(input:Readonly<{target:FileResourceTarget;text:string;baseline:FileResourceSnapshot}>):Promise<void>
  isUnknown(error:unknown):boolean
  history?:Readonly<{
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
type PendingWrite=Readonly<{target:FileResourceTarget;baseline:FileResourceSnapshot;text:string;state:'unknown'|'confirmed'|'not-applied';message:string|null}>
type SharedFileResourceState=Readonly<{pending:Map<string,PendingWrite>;historyAttempts:Map<string,Readonly<{target:FileResourceTarget;attempt:FileResourceHistoryAttempt;text:string;state:'pending'|'unknown'|'confirmed'|'not-applied';message:string|null}>>}>
const sharedStates=new WeakMap<object,Map<string,SharedFileResourceState>>()

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
  const state=sharedState(view,options.resourceId)
  const contexts=new WeakMap<object,Readonly<{rows:readonly DataRow[];target:FileResourceTarget}>>()
  const assertCurrent=()=>{if(view.destroyed||view.dataTable?.getView(view.viewId)!==view)throw new Error('FILE_RESOURCE_VIEW_STALE: DataView已释放或解绑');options.assertCurrent?.()}
  const targetIdentity=(target:FileResourceTarget)=>JSON.stringify([target.key,target.fields])
  const historyTransport=options.transport.history
  const result=(rows:readonly DataRow[],target:FileResourceTarget):Awaited<ReturnType<Executor['executeQuery']>>=>{
    const primaryKey=view.primaryKey
    const fields=new Set(view.columns.map(column=>column.name)),selected=DataViewLocalQuery.select({rows:[...rows],fields,primaryKeys:[primaryKey],params:{page:1,allPages:true,treeMode:'flat'}})
    const keys=new Set(selected.rows.map(row=>String(row[primaryKey])))
    const rowKey=(row:Readonly<DataRow>)=>row[primaryKey]
    const allowed=(key:unknown,field:string)=>keys.has(String(key))&&selected.output.has(field)
    const queryResult={rows:selected.rows,total:selected.total,rowKey,assertIdentity:()=>assertCurrent(),
      fieldAccess:(key:unknown,field:string)=>{const visible=allowed(key,field),write=visible&&field===options.contentField
        return {read:visible?'visible' as const:'invisible' as const,write:write?'allowed' as const:'denied' as const,
          component:!visible?'hidden' as const:write?'editable' as const:'readonly' as const,required:false,
          writeMode:write?'editable' as const:'readonly' as const}},
      readFieldAccess:(row:Readonly<DataRow>,field:string)=>selected.rows.includes(row)&&selected.output.has(field)?'visible' as const:'invisible' as const,
      addActionState:()=> 'disabled' as const,editActionState:(key:unknown)=>keys.has(String(key))?'enabled' as const:'disabled' as const,
      deleteActionState:()=> 'disabled' as const,createChildActionState:()=> 'disabled' as const,
      viewActionState:(key:unknown)=>keys.has(String(key))?'enabled' as const:'disabled' as const}
    contexts.set(queryResult,{rows:rows.map(row=>({...row})),target});return queryResult
  }
  const source:DataViewSourceAdapter={
    views:current=>current.dataTable?.viewList.filter(candidate=>{
      try{return targetIdentity(options.target(candidate))===targetIdentity(options.target(current))}catch{return false}
    })??[],
    preview:async current=>{assertCurrent();const target=options.target(current),snapshot=await options.transport.read(target);assertCurrent()
      if(snapshot===null)throw new Error('FILE_RESOURCE_MISSING: 来源文件不存在')
      return {version:snapshot.revision,content:snapshot.text}},
    adopt:async(current,snapshot,hooks)=>{assertCurrent();const target=options.target(current),remote=await options.transport.read(target);assertCurrent();hooks.assertCurrent()
      if(remote?.text !== snapshot.content||remote.revision!==snapshot.version)throw new Error('FILE_RESOURCE_SOURCE_CONFLICT: 来源文件已变化')
      hooks.beforeApply()},
    ...(historyTransport?{history:{
      list:async current=>{assertCurrent();const target=options.target(current),items=await historyTransport.list(target);assertCurrent();return items.map(item=>({...item,label:item.fileName}))},
      preview:async(current,version)=>{assertCurrent();const target=options.target(current),text=await historyTransport.preview(target,version);assertCurrent();return text},
      status:(current):DataViewSourceHistoryStatus=>{const target=options.target(current),item=state.historyAttempts.get(target.key)
        return item?{state:item.state,version:item.attempt.version,fileName:item.attempt.fileName,message:item.message}: {state:'idle',version:null,fileName:null,message:null}},
      verify:async(current,hooks)=>{const target=options.target(current),item=state.historyAttempts.get(target.key)
        if(item?.state !== 'unknown')return {state:item?.state??'idle',version:item?.attempt.version??null,fileName:item?.attempt.fileName??null,message:item?.message??null}
        hooks.assertCurrent();const applied=await historyTransport.verify(target,item.attempt,item.text);hooks.assertCurrent()
        const next={...item,state:applied?'confirmed' as const:'not-applied' as const,message:null};state.historyAttempts.set(target.key,next)
        return {state:next.state,version:next.attempt.version,fileName:next.attempt.fileName,message:null}},
      create:async(current,hooks)=>{assertCurrent();const target=options.target(current),snapshot=await options.transport.read(target);assertCurrent()
        if(!snapshot)throw new Error('FILE_RESOURCE_MISSING: 来源文件不存在')
        let captured:FileResourceHistoryAttempt|undefined
        try{await historyTransport.create(target,snapshot.text,attempt=>{hooks.assertCurrent();if(captured)throw new Error('FILE_RESOURCE_ATTEMPT_INVALID: attempt重复捕获')
          captured=attempt;state.historyAttempts.set(target.key,{target,attempt,text:snapshot.text,state:'pending',message:null});hooks.onAttempt(attempt)})
          if(!captured)throw new Error('FILE_RESOURCE_ATTEMPT_MISSING: 创建来源历史未捕获attempt')
          state.historyAttempts.set(target.key,{target,attempt:captured,text:snapshot.text,state:'confirmed',message:null})
        }catch(error){if(captured){const existing=state.historyAttempts.get(target.key)
          if(existing)state.historyAttempts.set(target.key,{...existing,state:options.transport.isUnknown(error)?'unknown':'not-applied',message:error instanceof Error?error.message:String(error)})}
          throw error}},
    }}: {}),
    verifyWriteAttempt:async(current,hooks)=>{
      const target=options.target(current),attempt=state.pending.get(target.key)
      if(!attempt)return {state:'idle',text:null,message:null}
      hooks.assertCurrent()
      const remote=await options.transport.read(attempt.target);hooks.assertCurrent()
      if(remote?.text===attempt.text){const confirmed={...attempt,state:'confirmed' as const,message:null};state.pending.set(target.key,confirmed)
        return {state:'confirmed',text:attempt.text,message:null}}
      if(remote?.text===attempt.baseline.text){const notApplied={...attempt,state:'not-applied' as const,message:null};state.pending.set(target.key,notApplied)
        return {state:'not-applied',text:attempt.text,message:null}}
      return {state:'unknown',text:attempt.text,message:'远端文件与原提交及原基线均不一致'}
    },
    acknowledgeWriteAttempt:current=>{
      const target=options.target(current),attempt=state.pending.get(target.key)
      if(attempt?.state==='confirmed'||attempt?.state==='not-applied')state.pending.delete(target.key)
    },
  }
  const executor:Executor={localAggregates:false,source,
    executeQuery:async(currentView,params:QueryParams)=>{
      assertCurrent();const target=options.target(currentView),snapshot=await options.transport.read(target);assertCurrent()
      if(snapshot===null)throw new Error('FILE_RESOURCE_MISSING: 查询目标文件不存在')
      const revisionField=options.revisionField
      const row:DataRow={...target.fields,[currentView.primaryKey]:target.key,[options.contentField]:snapshot.text,
        ...(revisionField?{[revisionField]:snapshot.revision??''}:{})}
      const selected=DataViewLocalQuery.select({rows:[row],fields:new Set(currentView.columns.map(column=>column.name)),
        primaryKeys:[currentView.primaryKey],params})
      const context=result(selected.rows,target)
      return context
    },
    save:async(command:SaveCommand)=>{
      assertCurrent();const receipts:SaveReceipt[]=[]
      for(const change of command.changes){
        const context=contexts.get(change.context),original=context?.rows[0],submitted=change.changes.changed?.[0]
        if(!context||!original||!submitted||(change.changes.added?.length??0)>0||(change.changes.deleted?.length??0)>0||change.changes.changed.length!==1){
          throw new Error('FILE_RESOURCE_CHANGE: 仅允许一个已查询文件行的内容更新')
        }
        const target=options.target(view),text=submitted[options.contentField]
        if(targetIdentity(target)!==targetIdentity(context.target)||JSON.stringify(target.fields)!==JSON.stringify(context.target.fields)
          ||submitted[view.primaryKey]!==original[view.primaryKey]||typeof text!=='string'){
          throw new Error('FILE_RESOURCE_SCOPE: 文件目标或内容身份无效')
        }
        assertCurrent()
        const prior=state.pending.get(target.key)
        if(prior){
          const remote=await options.transport.read(prior.target);assertCurrent()
          if(remote?.text===prior.text){state.pending.set(target.key,{...prior,state:'confirmed',message:null});if(text!==prior.text)throw new Error('FILE_RESOURCE_UNKNOWN_DELIVERY: 原提交已确认，须先交付原回执再提交新文本');state.pending.delete(target.key)}
          else if(remote?.text===prior.baseline.text){state.pending.set(target.key,{...prior,state:'not-applied',message:null});throw new Error('FILE_RESOURCE_NOT_APPLIED: 原文件提交确认未生效')}
          else throw new Error('FILE_RESOURCE_UNKNOWN_CONFLICT: 远端文件与原提交及基线均不一致')
        }else{
          const baseline=await options.transport.read(target);assertCurrent()
          if(baseline===null||baseline.text!==original[options.contentField]
            ||options.revisionField&&String(baseline.revision??'')!==String(original[options.revisionField]??'')){
            throw new Error('FILE_RESOURCE_CONFLICT: 远端文件已不同于DataView查询基线')
          }
          try{
            await options.transport.write({target,text,baseline})
            const readback=await options.transport.read(target);assertCurrent()
            if(readback?.text!==text)throw new Error('FILE_RESOURCE_READBACK: 文件保存回读不一致')
          }catch(error){
            if(options.transport.isUnknown(error))state.pending.set(target.key,{target,baseline,text,state:'unknown',message:error instanceof Error?error.message:String(error)})
            throw error
          }
        }
        const saved=await options.transport.read(target);assertCurrent()
        if(saved?.text !== text)throw new Error('FILE_RESOURCE_RECEIPT: 文件保存回执无法确认')
        const accepted={...submitted,...(options.revisionField?{[options.revisionField]:saved.revision??''}:{})}
        receipts.push({metaName:change.identity.metaName,added:[],changed:[accepted],deleted:[],
          changedFields:[[options.contentField,...(options.revisionField?[options.revisionField]:[])]],
          context:result([accepted],target)})
      }
      return receipts
    },
    hasUnconfirmedSave:context=>{const captured=contexts.get(context);return captured!==undefined&&state.pending.has(captured.target.key)},
    abandonUnconfirmedSave:context=>{const captured=contexts.get(context);if(captured)state.pending.delete(captured.target.key)},
  }
  view.bindQueryExecutor(executor,{resource:{resourceType:'file',resourceId:options.resourceId}})
}

/** Binds a complete, read-only file directory listing to one DataView query. */
export function bindFileDirectoryQueryAdapter(view:DataView,options:BindFileDirectoryQueryAdapterOptions):void{
  const assertCurrent=()=>{
    if(view.destroyed||view.dataTable?.getView(view.viewId)!==view)throw new Error('FILE_DIRECTORY_VIEW_STALE: DataView已释放或解绑')
    options.assertCurrent?.()
  }
  const executor:Executor={localAggregates:false,executeQuery:async(current,params)=>{
    assertCurrent()
    if(current!==view)throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录查询视图不匹配')
    const target=options.target(current),names=await options.list(target)
    assertCurrent()
    const rows=names.map(fileName=>({[current.primaryKey]:fileName,fileName}))
    const selected=DataViewLocalQuery.select({rows,fields:new Set(current.columns.map(column=>column.name)),primaryKeys:[current.primaryKey],
      params:{...params,allPages:true,treeMode:'flat'}})
    const keys=new Set(selected.rows.map(row=>String(row[current.primaryKey])))
    const visible=(key:unknown,field:string)=>keys.has(String(key))&&selected.output.has(field)
    return {rows:selected.rows,total:selected.total,rowKey:(row:Readonly<DataRow>)=>row[current.primaryKey],
      assertIdentity:identity=>{assertCurrent();if(identity.scenarioId!==current.dataSet?.scenarioId||identity.metaName!==current.tableName
        ||identity.resource?.resourceType!=='file'||identity.resource.resourceId!==options.resourceId){
        throw new Error('FILE_DIRECTORY_VIEW_IDENTITY: 目录资源身份不匹配')}} ,
      fieldAccess:(key,field)=>{const allowed=visible(key,field);return {read:allowed?'visible' as const:'invisible' as const,write:'denied' as const,
        component:allowed?'readonly' as const:'hidden' as const,required:false,writeMode:'readonly' as const}},
      readFieldAccess:(_row,field)=>selected.output.has(field)?'visible' as const:'invisible' as const,
      addActionState:()=> 'disabled' as const,editActionState:()=> 'disabled' as const,deleteActionState:()=> 'disabled' as const,
      createChildActionState:()=> 'disabled' as const,viewActionState:key=>keys.has(String(key))?'enabled' as const:'hidden' as const}
  }}
  view.bindQueryExecutor(executor,{resource:{resourceType:'file',resourceId:options.resourceId}})
}
