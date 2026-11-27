/**
 * @module app:platform-adapters/resources/integration/mp-open/channels-accounts-resource
 * 职责：把专用视频号授权账号列表绑定为独立的只读 DataView。
 * 边界：按正式应用和场景发出一次查询。仅映射安全投影，不用模型行替代服务拒绝，不产生管理或挂载权限。
 * AI用途：视频号页面读取专用账号时复用本资源，表格消费命名视图和它自身的读取状态。
 */
import type {DataRow, DataSet, DataSpaceRequestScope} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {requireRecord, unwrapAjaxResult} from '@/platform-adapters/api/platform/resources/shared/http-record-guards'

export const CHANNELS_ACCOUNTS_TABLE = 'WechatChannelsAccounts'
const resource = {resourceType:'wechat-channels-account-read',resourceId:'mp-open.channels:accounts'}
const fields = ['authorizerAppId','nickName','authorizationStatus','userName','enabled'] as const
const path = '/api/wechat-open/channels/accounts'

/** 专用账号查询依赖同一已获授权的应用场景及短生命周期传输身份。 */
type ChannelAccountWorkspace = Readonly<{
  /** 当前 PageRuntime 装配的正式空间，用于限定投影视图的归属。 */
  dataSet: DataSet
  /** 宿主现有网关传输，由资源 owner 使用。 */
  http: HttpClientBase
  /** 返回已登录用户的执行头，资源在当前调用域内派发。 */
  readScope: () => DataSpaceRequestScope
  /** 确认派发前和回包后仍由原应用、同一登录身份及场景实例接纳。 */
  assertCurrent: () => void
}>

function projectAccounts(payload: unknown): Map<string, DataRow> {
  if (!Array.isArray(payload)) throw Error('视频号专用账号服务返回了无效列表')
  const result = new Map<string, DataRow>()
  for (const value of payload) {
    const original = requireRecord(value, '视频号专用账号服务返回了无效记录')
    const key = original['authorizerAppId']
    if (typeof key!=='string' || !key.trim() || result.has(key) || original['accountType']!=='CHANNELS') {
      throw Error('视频号专用账号结果身份不一致')
    }
    const safe: DataRow = {authorizerAppId:key}
    for (const field of fields) {
      const fieldValue = original[field]
      if (typeof fieldValue === (field==='enabled' ? 'boolean' : 'string')) safe[field] = fieldValue
    }
    result.set(key,safe)
  }
  return result
}

/** 读取失败由当前账号视图保留，运营号正式模型独立结算。 */
export function bindWechatChannelsAccounts(input: ChannelAccountWorkspace): void {
  const {dataSet,http,readScope,assertCurrent} = input
  const scenarioId = dataSet.scenarioId
  if (!scenarioId || dataSet.getTable(CHANNELS_ACCOUNTS_TABLE)) throw Error('视频号专用账号视图身份无效')
  const table = dataSet.addTable(CHANNELS_ACCOUNTS_TABLE,fields.map(name=>({name,
    type:name==='enabled'?'boolean':'string',isPrimaryKey:name==='authorizerAppId'})))
  table.resourceType=resource.resourceType
  table.resourceId=resource.resourceId
  const view = table.getOrCreateView('default')
  view.applyViewConfig({autoLoad:false,queryConfig:{allPages:true,autoQuery:false},allowDelete:false})
  view.bindQueryExecutor({localAggregates:false,async executeQuery() {
    assertCurrent()
    const headers = {...readScope().headers,'X-FormKey':scenarioId}
    const response = await http.get<unknown>(path,undefined,{headers,retry:0,cache:false,meta:{rawEnvelope:true}})
    assertCurrent()
    const selected = projectAccounts(unwrapAjaxResult(response))
    const rows = [...selected.values()]
    const canRead = (key:unknown, field:string):boolean => typeof key==='string'
      && Object.hasOwn(selected.get(key) ?? {},field)
    return {rows,total:rows.length,resultPrimaryKey:'authorizerAppId',rowKey:row=>row['authorizerAppId'],assertIdentity:identity=>{
      assertCurrent()
      if (identity.scenarioId!==scenarioId || identity.metaName!==CHANNELS_ACCOUNTS_TABLE
        || identity.resource?.resourceType!==resource.resourceType || identity.resource.resourceId!==resource.resourceId) {
        throw Error('视频号专用账号读取身份已变化')
      }
    },fieldAccess:(key,field)=>({read:canRead(key,field)?'visible':'invisible',write:'denied',
      component:canRead(key,field)?'readonly':'hidden',required:false,writeMode:'readonly'}),
    readFieldAccess:(row,field)=>selected.get(String(row['authorizerAppId']))===row&&canRead(row['authorizerAppId'],field)?'visible':'invisible',
    addActionState:()=> 'hidden',editActionState:()=> 'hidden',deleteActionState:()=> 'hidden',
    createChildActionState:()=> 'hidden',viewActionState:()=> 'hidden'}
  }},{resource})
}
