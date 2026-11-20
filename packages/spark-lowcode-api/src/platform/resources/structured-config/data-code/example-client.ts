/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/data-code/example-client
 * 职责：读取实服TestGetCodeString生成的示例；不分配正式编码，不保存设计。
 * 边界：仅供语义DataView资源适配调用，保留服务拒绝并拒绝失效执行域。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import type {DataSpaceRequestScope} from '../../../data-space/runtime/data-space-runtime-contract.js'
import {unwrapAjaxResult} from '../../shared/http-record-guards.js'

export type CodeExampleNode=Readonly<{NodeNo:number;NodeType:number;CodeNodeDesignJson:string}>
export type CodeExampleInput=Readonly<{busTableId:string;nodes:readonly CodeExampleNode[]}>
export class CodeExampleClient {
  constructor(private readonly http:HttpClientBase,
    private readonly options:Readonly<{scenarioId:string;readScope:()=>DataSpaceRequestScope}>){}
  /** @param input 当前可读编辑节点；调用方核业务身份及字段权限。 @returns 服务生成的示例字符串，不代表已保存。 */
  async read(input:CodeExampleInput):Promise<string>{
    const id=input.busTableId.trim(),scope=this.options.readScope(),token=scope.token,originalHeaders={...scope.headers}
    const scenario=this.options.scenarioId.trim()
    if(!id||!input.nodes.length||!scenario||!token.trim()||!originalHeaders['X-AppId']?.trim())throw new Error('编码示例缺少输入或执行身份')
    const value=unwrapAjaxResult(await this.http.post<unknown>(`/api/Codeing/TestGetCodeString/${encodeURIComponent(id)}`,
      {codeNodesList:input.nodes},{headers:{...originalHeaders,'X-FormKey':scenario}}))
    const current=this.options.readScope()
    if(current.token!==token||JSON.stringify(current.headers)!==JSON.stringify(originalHeaders))throw new Error('SPARK_EXECUTION_SCOPE_STALE: 编码示例执行域已改变')
    if(typeof value!=='string')throw new Error('编码示例结果必须是字符串')
    return value.trim()
  }
}
