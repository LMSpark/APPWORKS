/**
 * lowcode 项目蓝图 HTTP 门面：读取 Base_NavigationInfo 记录、导航授权证据与文档导出任务。
 * 本模块不构造 AppWorks 项目蓝图、运行导航、治理或 AI 领域输出。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeClient } from '../../core/lowcode-client.js'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '../lowcode-application.js'
import {
  normalizeLowcodeNavigationAuthorization,
  type LowcodeNavigationAuthorizationEvidence,
} from '../lowcode-navigation.js'
import {
  validateLowcodeProjectBlueprintRecords,
  type LowcodeProjectBlueprintRecord,
} from './project-blueprint.js'
import type {
  LowcodeProjectBlueprintDocumentKind,
  LowcodeProjectBlueprintDocumentSubmitOptions,
  LowcodeProjectBlueprintDocumentTask,
} from './outputs/document/project-blueprint-document.js'
import { normalizeLowcodeProjectBlueprintRecords, lowcodeProjectBlueprintQuery } from './project-blueprint-wire.js'

/** 项目蓝图只读与文档任务提交门面；依赖应用目录 FormKey 访问 GetData。 */
export class LowcodeProjectBlueprintApi {
  readonly #client: LowcodeClient

  public constructor(http: HttpClientBase) {
    this.#client = new LowcodeClient(http)
  }

  /** 按 SysId 拉取并校验完整 Base_NavigationInfo 记录；不投影领域聚合。 */
  public async readRecords(projectId: string): Promise<readonly LowcodeProjectBlueprintRecord[]> {
    const normalizedProjectId = projectId.trim()
    const result = await this.#client.requestResult({
      path: '/api/DataOperation/GetData',
      method: 'POST',
      data: lowcodeProjectBlueprintQuery(normalizedProjectId),
      headers: { 'x-FormKey': LOWCODE_APPLICATION_CATALOG_FORM_KEY },
    })
    return validateLowcodeProjectBlueprintRecords(
      normalizedProjectId,
      normalizeLowcodeProjectBlueprintRecords(result),
    )
  }

  /** 读取 GetNavigationMenus 的后端授权事实；beginNodeId 为授权树根。 */
  public async readNavigationAuthorization(
    projectId: string,
    beginNodeId: string,
  ): Promise<LowcodeNavigationAuthorizationEvidence> {
    const normalizedProjectId = projectId.trim()
    const normalizedBeginNodeId = beginNodeId.trim()
    if (!normalizedProjectId || !normalizedBeginNodeId) {
      throw new Error('projectId 和 beginNodeId 不能为空')
    }
    const authorization = await this.#client.requestResult({
      path: `/api/FormDesign/GetNavigationMenus/${encodeURIComponent(normalizedProjectId)}/${encodeURIComponent(normalizedBeginNodeId)}`,
      method: 'GET',
    })
    return normalizeLowcodeNavigationAuthorization(authorization)
  }

  /** 提交 legacy 文档导出任务（SRS/SDD/功能设计）；返回 coverage=legacy-menu-scope 的任务回执，不等待生成完成。 */
  public async submitDocument(
    projectId: string,
    kind: LowcodeProjectBlueprintDocumentKind,
    options: LowcodeProjectBlueprintDocumentSubmitOptions = {},
  ): Promise<LowcodeProjectBlueprintDocumentTask> {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) throw new Error('projectId 不能为空')
    const query = new URLSearchParams({ sysId: normalizedProjectId })
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
    const result = await this.#client.requestResult({
      path: `${endpoint}?${query.toString()}`,
      method: 'GET',
    })
    return {
      projectId: normalizedProjectId,
      kind,
      status: 'submitted',
      coverage: 'legacy-menu-scope',
      message: typeof result === 'string' ? result : '蓝图文档任务已提交',
    }
  }
}
