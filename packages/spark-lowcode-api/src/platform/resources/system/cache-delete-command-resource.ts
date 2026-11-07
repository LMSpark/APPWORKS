/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/system/cache-delete-command-resource
 * 职责：捕获原缓存行的单键删除意图，沿原命令DataView提交和保留未知结果。
 * 边界：不改列表权限、不构造缓存主键、不重放未知命令；校验快照不是可编辑数据真源。
 */
import type {BindCommandSubmitOptions,DataRow,DataView} from '@spark-appworks/spark-data'
import type {DataSpaceRuntimeApi} from '../../data-space/runtime/data-space-runtime-api'
import {DataSpaceModelCommandNotDispatchedError} from '../../data-space/runtime/data-space-model-command-error'
import {LowcodeApiError} from '../../../core/lowcode-api-error'
type Options=Readonly<{list:DataView;definition:DataView;runtime:Pick<DataSpaceRuntimeApi,'executeModelCommand'>;resourceId:string;assertCurrent:()=>void}>
type Intent={key:string;row:DataRow;assertRead:()=>void;phase:'prepared'|'dispatched'|'unknown'|'confirmed'}
class CacheDeleteUnknown extends Error{}
export class CacheDeleteCommandResource{
 constructor(private readonly input:Options){}
 /** 绑定已经由pagedata装配的命令视图，不创建表、查询或第二保存入口。 */
 binding(command:DataView):BindCommandSubmitOptions{
  const {list,definition,runtime,resourceId,assertCurrent}=this.input,intents=new Map<string,Intent>()
  const guard=()=>{
   assertCurrent()
   if(command.destroyed||list.destroyed||definition.destroyed||!command.dataSet||command.dataSet.destroyed
    ||command.dataSet!==list.dataSet||command.dataSet!==definition.dataSet||command.dataTable?.resourceType!=='command'
    ||command.dataTable.resourceId!==resourceId||!command.primaryKey)throw Error('CACHE_DELETE_SCOPE: 原缓存命令资源已失效')
  }
  const capture=(row:Readonly<DataRow>):Intent=>{
   const id=row[command.primaryKey],intent=typeof id==='string'?intents.get(id):undefined
   if(!intent||row['key']!==intent.key)throw Error('CACHE_DELETE_CAPTURE: 命令与原删除意图不符')
   return intent
  }
  const receipt=(row:Readonly<DataRow>)=>({[command.primaryKey]:row[command.primaryKey],key:row['key'],outcome:'confirmed'})
  guard()
  return{resource:{resourceType:'command',resourceId},inputFields:['key'],guard,createKey:()=>crypto.randomUUID(),
   onPrepareInput:row=>{
    guard()
    for(const [id,intent]of intents)if((intent.phase==='prepared'||intent.phase==='confirmed')&&!command.rows.some(candidate=>command.getPkKey(candidate)===id))intents.delete(id)
    const id=row[command.primaryKey],key=row['key'],source=list.currentRow
    if(typeof id!=='string'||!id||intents.has(id)||command.hasUnconfirmedSave||[...intents.values()].some(intent=>intent.phase==='dispatched'||intent.phase==='unknown'))throw Error('CACHE_DELETE_CAPTURE: 原命令未处理或命令身份重复')
    if(typeof key!=='string'||!key.trim()||!source||!list.rows.includes(source)||list.fieldAccess(source,'cacheKey').read!=='visible'
     ||source['cacheKey']!==key||list.hasEditingChanges()||list.dirtyTracking.hasPendingChanges())throw Error('CACHE_DELETE_SOURCE: 缺少原可读缓存键或列表已有修改')
    const assertRead=list.captureReadRow(source,['cacheKey'])
    intents.set(id,{key,row:source,assertRead,phase:'prepared'})
   },
   submit:async row=>{
    guard();const intent=capture(row)
    if(intent.phase==='confirmed')return receipt(row)
    if(intent.phase!=='prepared')throw new CacheDeleteUnknown('缓存删除结果未知；保留原命令，不重新发送')
    if([...intents.values()].some(other=>other!==intent&&(other.phase==='dispatched'||other.phase==='unknown')))throw new Error('原缓存删除命令仍在执行或结果未知；本命令未发送，可取消此待处理输入')
    intent.assertRead()
    if(list.currentRow!==intent.row||!list.rows.includes(intent.row)||list.fieldAccess(intent.row,'cacheKey').read!=='visible'
     ||intent.row['cacheKey']!==intent.key||list.hasEditingChanges()||list.dirtyTracking.hasPendingChanges())throw Error('CACHE_DELETE_SOURCE: 原缓存行、分类或读取身份已变化')
    intent.phase='dispatched'
    try{
     const result=await runtime.executeModelCommand(definition,{key:intent.key});guard()
     const item=result.rows[0]
     if(result.rows.length!==1||!item||result.readFieldAccess(item,'Code')!=='visible'||result.readFieldAccess(item,'Type')!=='visible'
      ||String(item['Code'])!=='200'||String(item['Type']).toLowerCase()!=='success')throw Error('缓存服务未返回可确认的单键删除回执')
     intent.phase='confirmed';return receipt(row)
    }catch(cause){
     if(cause instanceof DataSpaceModelCommandNotDispatchedError||cause instanceof LowcodeApiError&&[401,403,404].includes(cause.code)){intent.phase='prepared';throw cause}
     intent.phase='unknown';throw new CacheDeleteUnknown('缓存删除结果未知；保留原命令，不重新发送',{cause})
    }
   },
   verify:row=>Promise.resolve().then(()=>{
    guard();const intent=capture(row)
    if(intent.phase==='confirmed')return receipt(row)
    throw new CacheDeleteUnknown('缓存删除结果未知；服务未提供本次命令核验合同，键缺席不证明原命令结果')
   }),
   isUnconfirmed:failure=>failure instanceof CacheDeleteUnknown,
  }
 }
}
