/**
 * @module app:lowcode/resources/application/project-blueprint-document
 * 职责：承接蓝图 legacy 文档导出提交，供应用管理/蓝图工作台消费。
 * 边界：只返回 submitted 回执，不表示文件已生成；提交不重试。
 */
import { LowcodeApiError } from '@/platform-adapters/api'
import type {
  ProjectBlueprintDocumentKind,
  ProjectBlueprintDocumentSubmitOptions,
  ProjectBlueprintDocumentTask,
} from '@spark-appworks/spark-project-model'
import {requestAjaxResult, type HttpClientBase} from '@spark-appworks/spark-utils'
import {lowcodeHttp} from '@/platform-adapters/lowcode-runtime'

export function submitBlueprintDocument(
  projectId: string, kind: ProjectBlueprintDocumentKind, options: ProjectBlueprintDocumentSubmitOptions = {},
): Promise<ProjectBlueprintDocumentTask> {
  return requestBlueprintDocument(lowcodeHttp, { projectId, kind, options })
}

type BlueprintDocumentCommand = Readonly<{
  projectId: string
  kind: ProjectBlueprintDocumentKind
  options?: ProjectBlueprintDocumentSubmitOptions
}>

/** Submit a legacy menu-scoped task through the host's authenticated HTTP transport. */
export async function requestBlueprintDocument(
  http: HttpClientBase, command: BlueprintDocumentCommand,
): Promise<ProjectBlueprintDocumentTask> {
  const { kind, options = {} } = command
  const projectId = command.projectId.trim()
  if (!projectId) throw new Error('projectId 不能为空')
  const query = new URLSearchParams({ sysId: projectId })
  let endpoint: string
  if (kind === 'requirements-specification') {
    endpoint = '/api/File/exportSRS'
  } else if (kind === 'system-detailed-design') {
    endpoint = '/api/File/exportSDD'
  } else {
    endpoint = '/api/File/exportDesignDoc'
    if (options.level !== undefined) query.set('level', String(options.level))
    query.set('isText', String(options.includeText ?? true))
    query.set('isHtml', String(options.includeHtml ?? true))
  }
  const result = await requestAjaxResult(http, {
    url: `${endpoint}?${query.toString()}`,
    method: 'GET',
    retry: 0,
  }, { errorType: LowcodeApiError })
  return {
    projectId,
    kind,
    status: 'submitted',
    coverage: 'legacy-menu-scope',
    message: typeof result === 'string' && result.trim()
      ? result : '任务提交请求已确认；文档生成状态未知',
  }
}