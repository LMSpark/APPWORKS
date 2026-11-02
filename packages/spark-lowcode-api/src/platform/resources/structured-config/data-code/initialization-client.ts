/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/data-code/initialization-client
 * 职责：沿实际CodeInitDataList合同读取服务端生成的前段组合与待用值。
 * 边界：结果不提供写权限，不写Base_CodeSerialPerform，不在浏览器排列业务组合。
 * AI用途：初始化DataView资源适配内部消费；页面不得绕过数据空间调用该客户端。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import type {DataSpaceRequestScope} from '../../../data-space/runtime/data-space-runtime-contract.js'
import {requireRecord,unwrapAjaxResult} from '../../shared/http-record-guards.js'

export type CodeInitializationInput=Readonly<{codeId:string;nodeId:string;date:string}>
export class CodeInitializationClient {
  constructor(private readonly http:HttpClientBase,
    private readonly options:Readonly<{scenarioId:string;readScope:()=>DataSpaceRequestScope}>) {}
  /** @param input 当前已保存设计、顺序段和日期。 @returns 原服务组合，权限须另外消费正式模型查询。 */
  async read(input:CodeInitializationInput):Promise<ReadonlyArray<Readonly<Record<string,unknown>>>> {
    const codeid=input.codeId.trim(),nodeid=input.nodeId.trim(),scope=this.options.readScope(),scenario=this.options.scenarioId.trim()
    if(!codeid||!nodeid||!scenario||!scope.token.trim()||!scope.headers['X-AppId']?.trim())throw new Error('编码初始化缺少正式输入或执行身份')
    const headers={...scope.headers,'X-FormKey':scenario}
    const value=unwrapAjaxResult(await this.http.get<unknown>('/api/Codeing/CodeInitDataList',
      {codeid,nodeid,date:input.date},{headers}))
    const current=this.options.readScope()
    if(current.token!==scope.token||current.headers['X-AppId']!==scope.headers['X-AppId'])throw new Error('SPARK_EXECUTION_SCOPE_STALE: 编码初始化执行域已改变')
    if(!Array.isArray(value))throw new Error('编码初始化结果必须是对象数组')
    const rows:readonly unknown[]=value
    return rows.map(row=>({...requireRecord(row,'编码初始化包含无效行')}))
  }
}
