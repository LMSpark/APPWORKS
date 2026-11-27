/**
 * @module @/platform-adapters/api:platform/resources/integration/registered-interface-call-resource
 * 职责：把“调用已登记接口”适配为原命令DataView的单次服务命令，回执保存本次输出文本供页面显示。
 * 边界：接口按已保存的提供商、名称和参数类型定位；测试值与结果过滤取当前编辑值。每条命令只发送一次，失败或结果未知都不重发。
 */
import {DataSetCommandAttempt,type BindCommandSubmitOptions,type DataRow,type DataView} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {LowcodeClient} from '../../../core/lowcode-client'
import {LowcodeApiError} from '../../../core/lowcode-api-error'

/** interfaces为接口列表视图，parameters为按所选接口级联的输入参数视图，二者与命令视图须属同一DataSet。 */
type RegisteredInterfaceCallOptions=Readonly<{
 interfaces:DataView
 parameters:DataView
 http:HttpClientBase
 readScope:()=>Readonly<{token:string;headers:Readonly<Record<string,string>>}>
 assertCurrent:()=>void
}>
type Request=Readonly<{path:string;params:Readonly<Record<string,string>>;data:unknown}>
type Intent={interfaceId:string;request:Request;assertRead:()=>void;attempt:DataSetCommandAttempt;result?:string}
class RegisteredInterfaceCallUnknown extends Error{}
const identity=['ProviderID','Name','RequestType'] as const
const parameterIdentity=['pid','parname','parzdtype'] as const
const parameterFields=[...parameterIdentity,'testvalue'] as const
const text=(value:unknown)=>value===undefined||value===null?'':String(value)

function captureParameters(parameters:DataView,interfaces:DataView,interfaceId:string):()=>void{
 const assertScope=()=>{
  const dataSet=parameters.dataSet
  const cascades=dataSet?.getParentCascades(parameters.tableName,parameters.viewId)??[]
  const cascade=cascades[0]
  const filter=cascades.length===1&&cascade?.parentTable===interfaces.tableName
   &&cascade.parentViewId===interfaces.viewId?dataSet?.resolveCascadeFilter(cascade):null
  if(!filter||'logic'in filter||filter.field!=='pid'||filter.operator!=='in'
   ||!Array.isArray(filter.value)||filter.value.length!==1||filter.value[0]!==interfaceId
   ||parameters.queryConfig.allPages!==true||parameters.resultKind!=='entity'||parameters.countReported!==true||parameters.rows.length!==parameters.total
   ||parameters.scopeFilter||parameters.filterExpression||parameters.refreshPending||parameters.mutating
   ||parameters.hasUnconfirmedSave||parameters.dirtyTracking.hasPendingChanges()){
   throw Error('INTERFACE_CALL_PARAMETERS: 请先完整读取当前接口的输入参数')
  }
 }
 let assertResult:()=>void
 try{assertResult=parameters.captureReadResult()}
 catch(cause){throw Error('INTERFACE_CALL_PARAMETERS: 请先完整读取当前接口的输入参数',{cause})}
 assertScope()
 return()=>{assertResult();assertScope()}
}

/** 命令行ID只标识本次本地捕获；结果未知时可放弃该命令，再由用户重新调用。 */
export class RegisteredInterfaceCallResource{
 static readonly resourceId='integration:registered-interface-call'
 readonly #client:LowcodeClient
 readonly #scope:string
 constructor(private readonly input:RegisteredInterfaceCallOptions){
  this.#scope=input.readScope().token
  if(!this.#scope.trim())throw Error('接口调用scope缺失')
  this.#client=new LowcodeClient(input.http)
 }
 binding(command:DataView):BindCommandSubmitOptions{
  const {interfaces,parameters,readScope,assertCurrent}=this.input,intents=new Map<string,Intent>()
  const guard=()=>{
   assertCurrent()
   const ds=command.dataSet
   if(readScope().token!==this.#scope||command.destroyed||interfaces.destroyed||parameters.destroyed||!ds||ds.destroyed
    ||interfaces.dataSet!==ds||parameters.dataSet!==ds||command.dataTable?.resourceType!=='command'
    ||command.dataTable.resourceId!==RegisteredInterfaceCallResource.resourceId||command.primaryKey!=='commandId'
    ||interfaces.tableName!=='Base_DataServiceInterface'||parameters.tableName!=='_Base_ParamList'
    ||interfaces.primaryKey!=='rowid'||parameters.primaryKey!=='parid')throw Error('INTERFACE_CALL_SCOPE: 接口调用命令资源已失效')
  }
  const request=(interfaceId:string,resultFilter:string):Pick<Intent,'request'|'assertRead'>=>{
   const row=interfaces.currentRow
   if(!row||interfaces.getPkKey(row)!==interfaceId||interfaces.hasUnconfirmedSave||interfaces.dirtyTracking.hasPendingChanges())throw Error('INTERFACE_CALL_SOURCE: 接口不在当前列表或尚有待提交修改，请先保存接口')
   const patch=interfaces.getEditingPatch(interfaceId)
   if(patch&&identity.some(field=>Object.hasOwn(patch,field)))throw Error('INTERFACE_CALL_SOURCE: 接口名称或参数类型尚未保存，请先保存接口')
   if(identity.some(field=>interfaces.fieldAccess(row,field).read!=='visible'))throw Error('INTERFACE_CALL_PERMISSION: 接口身份字段不可读')
   const provider=text(row['ProviderID']).trim(),name=text(row['Name']).trim(),form=text(row['RequestType'])==='FormData'
   if(!provider||!name)throw Error('INTERFACE_CALL_SOURCE: 接口缺少提供商或名称')
   const assertInterface=interfaces.captureReadRow(row,[...identity]),assertParameters=captureParameters(parameters,interfaces,interfaceId)
   const parameterReads:Array<()=>void>=[]
   const values:Record<string,unknown>={}
   for(const source of parameters.rows){
    if(parameterFields.some(field=>parameters.fieldAccess(source,field).read!=='visible'))throw Error('INTERFACE_CALL_PERMISSION: 输入参数不可读')
    if(source['pid']!==interfaceId)throw Error('INTERFACE_CALL_PARAMETERS: 参数查询含其他接口记录')
    const key=parameters.getPkKey(source)
    if(key===undefined)throw Error('INTERFACE_CALL_PARAMETERS: 输入参数缺少原行身份')
    const parameterPatch=parameters.getEditingPatch(key)
    if(parameterPatch&&parameterIdentity.some(field=>Object.hasOwn(parameterPatch,field)))throw Error('INTERFACE_CALL_PARAMETERS: 请先保存参数定义')
    parameterReads.push(parameters.captureReadRow(source,parameterFields))
    const paramName=text(source['parname']).trim(),value=text((parameters.getEditingRow(key)??source)['testvalue']).trim(),type=text(source['parzdtype'])
    if(!paramName)throw Error('INTERFACE_CALL_SOURCE: 输入参数名称为空')
    if(Object.hasOwn(values,paramName))throw Error(`INTERFACE_CALL_SOURCE: 输入参数“${paramName}”重复`)
    try{values[paramName]=!form&&(type==='object'||type==='array')?JSON.parse(value):value}
    catch{throw Error(`INTERFACE_CALL_SOURCE: 输入参数“${paramName}”的测试值不是有效JSON`)}
   }
   const assertRead=()=>{
    if(interfaces.currentRow!==row)throw Error('INTERFACE_CALL_SOURCE: 当前接口已切换')
    assertInterface()
    assertParameters()
    for(const read of parameterReads)read()
   }
   const params={qy_provider:provider,qy_api:name}
   if(!form)return{assertRead,request:{path:'/api/dataInterface/callApi/Body',params,data:{qy_client_param:values,qy_is_filter:resultFilter}}}
   const data=new FormData()
   for(const [paramName,value]of Object.entries(values))data.append(paramName,text(value))
   data.append('qy_is_filter',resultFilter)
   return{assertRead,request:{path:'/api/dataInterface/callApi/FormData',params,data}}
  }
  const capture=(row:Readonly<DataRow>):Intent=>{
   const id=row['commandId'],intent=typeof id==='string'?intents.get(id):undefined
   if(!intent||row['interfaceId']!==intent.interfaceId)throw Error('INTERFACE_CALL_CAPTURE: 命令与原调用意图不符')
   return intent
  }
  const receipt=(row:Readonly<DataRow>,intent:Intent)=>({commandId:row['commandId'],interfaceId:intent.interfaceId,result:intent.result??''})
  guard()
  return{resource:{resourceType:'command',resourceId:RegisteredInterfaceCallResource.resourceId},inputFields:['interfaceId','resultFilter'],guard,
   createKey:()=>crypto.randomUUID(),allowAbandonUnconfirmed:true,
   onPrepareInput:row=>{
    guard()
    for(const [id]of intents)if(!command.rows.some(candidate=>command.getPkKey(candidate)===id))intents.delete(id)
    const id=row['commandId'],interfaceId=row['interfaceId']
    if(typeof id!=='string'||!id||intents.has(id)||command.hasUnconfirmedSave)throw Error('INTERFACE_CALL_CAPTURE: 原调用未处理或命令身份重复')
    if(typeof interfaceId!=='string'||!interfaceId)throw Error('INTERFACE_CALL_CAPTURE: 缺少接口身份')
    const filter=text(row['resultFilter']).trim()||'$'
    intents.set(id,{interfaceId,...request(interfaceId,filter),attempt:new DataSetCommandAttempt()})
   },
   submit:async row=>{
    guard();const intent=capture(row)
    if(intent.attempt.isConfirmed())return receipt(row,intent)
    if(intent.attempt.isFailed())throw Error('本次调用已失败；请放弃后重新调用')
    if(!intent.attempt.isPrepared())throw new RegisteredInterfaceCallUnknown('接口调用结果未知；不重新发送，可放弃后重新调用')
    intent.assertRead()
    let value:unknown
    try{
     value=await this.#client.requestResult({path:intent.request.path,method:'POST',params:intent.request.params,data:intent.request.data,
      headers:readScope().headers,retry:0,onTransportAttempt:started=>{
       if(!started)return
       guard()
       intent.assertRead()
       intent.attempt.dispatch()
      }})
    }catch(cause){
     if(!intent.attempt.isDispatched())throw cause
     if(cause instanceof LowcodeApiError){intent.attempt.fail();throw cause}
     intent.attempt.unknown()
     throw new RegisteredInterfaceCallUnknown(`接口调用结果未知，不重新发送：${cause instanceof Error?cause.message:String(cause)}`,{cause})
    }
    const output=typeof value==='string'?value:JSON.stringify(value===undefined?null:value,null,2)
    intent.attempt.confirm();intent.result=output
    return receipt(row,intent)
   },
   verify:row=>Promise.resolve().then(()=>{
    guard();const intent=capture(row)
    if(intent.attempt.isConfirmed())return receipt(row,intent)
    throw new RegisteredInterfaceCallUnknown('接口调用结果未知；不重新发送，可放弃后重新调用')
   }),
   isUnconfirmed:failure=>failure instanceof RegisteredInterfaceCallUnknown,
  }
 }
}
