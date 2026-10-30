/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/workflow-definition/design-client
 * 职责：数据工作流设计 JSON 读写适配（参考 DataWorkFlowDesign，实服 URL 待核）。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {requireRecord, unwrapAjaxResult} from '../../shared/http-record-guards.js'

export type WorkflowDefinitionDesignPayload = Readonly<{workflowId: string; nodes: unknown; connectors: unknown}>

export class WorkflowDesignClient {
  public constructor(private readonly http: HttpClientBase) {}

  public async read(workflowId: string): Promise<WorkflowDefinitionDesignPayload> {
    const result = unwrapAjaxResult(await this.http.post<unknown>('/api/DataWorkFlowDesign/read', {workflowId}))
    const record = requireRecord(result, '工作流设计读取结果无效')
    return {workflowId, nodes: record['nodes'] ?? [], connectors: record['connectors'] ?? []}
  }

  public async write(document: WorkflowDefinitionDesignPayload): Promise<void> {
    unwrapAjaxResult(await this.http.post<unknown>('/api/DataWorkFlowDesign/write', document))
  }
}
