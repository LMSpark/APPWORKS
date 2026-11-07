/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/data-code/initialization-resource
 * 职责：编码初始化组合接入唯一DataView编辑及保存链，适配原正式分配记录owner。
 * 边界：仅持查询/提交基线；不创建第二草稿、不补历史节点归属、不重放未知写入。
 * AI用途：宿主传当前DataSet、正式runtime和目标读取器，标准组件绑定返回视图。
 */
import {DataViewFilter,DataViewLocalQuery,DataViewSaveNotAppliedError,type DataRow,type DataSet,type DataView,type QueryParams} from '@spark-appworks/spark-data'
import type {DataSpaceRuntimeApi} from '../../../data-space/runtime/data-space-runtime-api.js'
import type {DataSpaceQueryContext} from '../../../data-space/runtime/query/data-space-query-context.js'
import type {CodeInitializationClient} from './initialization-client.js'
import {CodeSequenceRange} from './code-sequence-range.js'
import {initializationDenied,projectInitialization,type CodeInitializationTarget} from './initialization-projection.js'

type Executor=Parameters<DataView['bindQueryExecutor']>[0]
type Result=Awaited<ReturnType<Executor['executeQuery']>>
type Projection=ReturnType<typeof projectInitialization>
type Snapshot={target:CodeInitializationTarget;context:DataSpaceQueryContext;projection:Projection;params:QueryParams}
type PhysicalChange=Parameters<DataSpaceRuntimeApi['save']>[0]['changes'][number]
type Expected=Readonly<{key:string;value:string;recordId:string;storedCode:string|null;nodeOwner:unknown}>
type Attempt={signature:string;physical:PhysicalChange;expected:readonly Expected[];written:boolean}
type Options=Readonly<{dataSet:DataSet;runtime:DataSpaceRuntimeApi;client:Pick<CodeInitializationClient,'read'>;readTarget:()=>CodeInitializationTarget}>
const name='CodeInitialization',resource={resourceType:'code-initialization',resourceId:'CodeInitDataList'}
/** @param options 本次原生运行空间及已确认的服务/模型责任方。 @returns 唯一初始化语义视图，不自动查询或保存。 */
export function createCodeInitializationView(options:Options):DataView {
  const {dataSet,runtime,client}=options,base=dataSet.getView('Base_CodeSerialPerform')
  const scenarioId=dataSet.scenarioId
  if(!scenarioId||base?.primaryKey!=='rowid'||base.dataTable?.modelBinding?.modelName!=='Base_CodeSerialPerform'
    ||dataSet.getTable(name))throw new Error('初始化缺少唯一原正式分配视图')
  const physicalIdentity={scenarioId,metaName:'Base_CodeSerialPerform'}
  const source=base.dataTable.getOrCreateView('initializationSource')
  source.primaryKey=base.primaryKey
  source.configure({commitMode:'staged',autoLoad:false,queryConfig:{...base.queryConfig},fieldProjection:base.fieldProjection})
  const table=dataSet.addTable(name,[{name:'candidateKey',type:'string',isPrimaryKey:true},{name:'recordId',type:'string'},
    {name:'prefix',type:'string'},{name:'InitVal',type:'string',required:true},{name:'min',type:'string'},{name:'max',type:'string'}])
  table.resourceType=resource.resourceType;table.resourceId=resource.resourceId
  const view=table.getOrCreateView('default');view.configure({commitMode:'staged',autoLoad:false})
  let captured:DataSpaceQueryContext|undefined
  const readCaptured=()=>captured
  source.bindQueryExecutor({localAggregates:false,
    executeQuery:async(current,params)=>{captured=await runtime.executeQuery(current,params);return captured},
  })
  const snapshots=new WeakMap<Result,Snapshot>(),attempts=new WeakMap<Result,Attempt>()
  const target=():CodeInitializationTarget=>structuredClone(options.readTarget())
  const assertCurrent=(expected:CodeInitializationTarget)=>{
    if(dataSet.destroyed||source.destroyed||view.destroyed||dataSet.scenarioId!==physicalIdentity.scenarioId||JSON.stringify(target())!==JSON.stringify(expected))throw new Error('编码初始化目标已改变')
  }
  async function load(params:QueryParams):Promise<Snapshot>{
    const current=target();assertCurrent(current)
    if(source.hasEditingChanges()||source.dirtyTracking.hasPendingChanges()||source.hasUnconfirmedSave)throw new Error('原分配视图有待提交或未知结果')
    const rows=await client.read(current);assertCurrent(current)
    const ids=rows.flatMap(row=>typeof row['rowid']==='string'&&row['rowid']?[row['rowid']]:[])
    source.queryContext={...source.queryContext,codeDesignId:current.codeId,sequenceNodeId:current.nodeId}
    source.filterExpression=DataViewFilter.group({logic:'and',filters:[{field:'CodeDesignID',operator:'eq',value:current.codeId},
      ids.length?{field:'rowid',operator:'in',value:ids}:{field:'NodeDesignId',operator:'eq',value:current.nodeId}]}).toJSON()
    captured=undefined;await source.refresh();assertCurrent(current)
    if(source.loadingError)throw source.loadingError
    const context=readCaptured();if(!context)throw new Error('初始化没有原正式查询基线')
    return {target:current,context,params,projection:projectInitialization({target:current,rows,context,createAccess:source.newRowFieldAccess('Code')})}
  }
  function result(snapshot:Snapshot):Result{
    const assertSnapshot=()=>{assertCurrent(snapshot.target);snapshot.context.assertIdentity(physicalIdentity)}
    const rows=[...snapshot.projection.candidates.values()].map(candidate=>candidate.row)
    const selected=DataViewLocalQuery.select({rows,fields:new Set(table.columns.map(column=>column.name)),primaryKeys:['candidateKey'],params:snapshot.params})
    const context:Result={rows:selected.rows,total:selected.total,resultPrimaryKey:'candidateKey',rowKey:row=>row['candidateKey'],
      assertIdentity:identity=>{assertSnapshot();if(identity.scenarioId!==dataSet.scenarioId||identity.metaName!==name||identity.resource?.resourceId!==resource.resourceId)throw new Error('初始化资源身份不匹配')},
      fieldAccess:(key,field)=>{assertSnapshot();return selected.output.has(field)?snapshot.projection.access(key,field):initializationDenied},
      readFieldAccess:(row,field)=>selected.rows.includes(row)?snapshot.projection.access(row['candidateKey'],field).read:'invisible',
      addActionState:()=> 'disabled',deleteActionState:()=> 'disabled',createChildActionState:()=> 'disabled',
      editActionState:(key,available=true)=>available&&snapshot.projection.access(key,'InitVal').write==='allowed'?'enabled':'disabled',
      viewActionState:(key,available=true)=>available&&typeof key==='string'&&snapshot.projection.candidates.has(key)?'enabled':'disabled'}
    snapshots.set(context,snapshot);return context
  }
  function capture(snapshot:Snapshot,change:Parameters<NonNullable<Executor['save']>>[0]['changes'][number]):Attempt{
    if(change.changes.added?.length||change.changes.deleted?.length)throw new Error('初始化仅接受既有组合的待用值修改')
    const added:DataRow[]=[],changed:DataRow[]=[],expected:Expected[]=[]
    const range=new CodeSequenceRange(snapshot.target.format,snapshot.target.increment)
    for(const row of change.changes.changed??[]){
      const key=row['candidateKey'],candidate=typeof key==='string'?snapshot.projection.candidates.get(key):undefined
      if(!candidate||typeof key!=='string'||typeof row['InitVal']!=='string'||snapshot.projection.access(key,'InitVal').write!=='allowed')throw new Error('初始化修改缺少原身份或权限')
      for(const field of Object.keys(row))if(field!=='InitVal'&&Object.hasOwn(candidate.row,field)&&row[field]!==candidate.row[field])throw new Error('初始化只允许修改待用值')
      const code=range.previous(row['InitVal'])
      let recordId=candidate.recordId
      if(recordId)changed.push({rowid:recordId,Code:code})
      else {
        const created=snapshot.context.prepareNewRow({CodeDesignID:snapshot.target.codeId,NodeDesignId:snapshot.target.nodeId,NodeCode:candidate.prefix,Code:code})
        if(typeof created['rowid']!=='string'||!created['rowid'])throw new Error('初始化原查询未生成正式身份')
        recordId=created['rowid'];added.push(created)
      }
      const nodeOwner=candidate.recordId?snapshot.context.rows.find(original=>snapshot.context.rowKey(original)===candidate.recordId)?.['NodeDesignId']:snapshot.target.nodeId
      expected.push({key,value:row['InitVal'],recordId,storedCode:code,nodeOwner})
    }
    return {signature:JSON.stringify(change.changes),physical:{identity:physicalIdentity,context:snapshot.context,changes:{added,changed,deleted:[]}},expected,written:false}
  }
  const executor:Executor={localAggregates:false,executeQuery:async(_current,params)=>result(await load(params)),
    hasUnconfirmedSave:context=>{const snapshot=snapshots.get(context),attempt=attempts.get(context);return !!snapshot&&(attempt?.written===true||runtime.hasUnconfirmedSave(snapshot.context))},
    save:async command=>{
      const receipts=[]
      for(const change of command.changes){
        const snapshot=snapshots.get(change.context);if(!snapshot)throw new Error('初始化提交没有原资源基线')
        assertCurrent(snapshot.target)
        let attempt=attempts.get(change.context)
        if(attempt&&attempt.signature!==JSON.stringify(change.changes))throw new Error('初始化未知结果必须核验原修改')
        if(!attempt){attempt=capture(snapshot,change);attempts.set(change.context,attempt)}
        if(!attempt.written){
          try{await runtime.save({changes:[attempt.physical]});attempt.written=true}
          catch(error){
            if(!runtime.hasUnconfirmedSave(snapshot.context))attempts.delete(change.context)
            if(error instanceof DataViewSaveNotAppliedError&&error.appliesTo(attempt.physical))throw new DataViewSaveNotAppliedError([change],error.message)
            throw error
          }
        }
        assertCurrent(snapshot.target)
        let next:Snapshot
        try{next=await load(snapshot.params)}catch(error){throw new Error(`初始化保存后回读未确认: ${error instanceof Error?error.message:String(error)}`)}
        const accepted=attempt.expected.map(item=>{
          const row=next.projection.candidates.get(item.key)?.row
          if(row?.['InitVal']!==item.value)throw new Error('初始化待用值回读不一致')
          if(row['recordId']!==item.recordId)throw new Error('初始化正式身份回读不一致')
          const formal=next.context.rows.find(original=>next.context.rowKey(original)===item.recordId)
          if(formal?.['Code']!==item.storedCode||formal['NodeDesignId']!==item.nodeOwner)throw new Error('初始化正式值或节点归属回读不一致')
          return row
        })
        receipts.push({metaName:name,added:[],changed:accepted,deleted:[],changedFields:accepted.map(()=>['InitVal','recordId']),context:result(next)})
        attempts.delete(change.context)
      }
      return receipts
    }}
  view.bindQueryExecutor(executor,{resource});return view
}
