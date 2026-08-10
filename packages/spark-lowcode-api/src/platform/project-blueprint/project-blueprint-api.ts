/**
 * 项目蓝图 HTTP 门面：读取 Base_NavigationInfo 蓝图树、运行导航投影与文档导出任务。
 * 文档导出 coverage 固定为 legacy-menu-scope；变更写入须走 governance.mutationPlanner 而非本模块。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeClient } from '../../core/lowcode-client.js'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '../lowcode-application.js'
import { normalizeRuntimeNavigationAuthorization } from '../lowcode-navigation.js'
import { ProjectBlueprint } from './project-blueprint.js'
import type { RuntimeNavigation } from './outputs/runtime-navigation.js'
import type {
  ProjectBlueprintDocumentKind,
  ProjectBlueprintDocumentSubmitOptions,
  ProjectBlueprintDocumentTask,
} from './outputs/document/project-blueprint-document.js'
import { normalizeProjectBlueprintNodes, projectBlueprintQuery } from './project-blueprint-wire.js'

/** 项目蓝图只读与文档任务提交门面；依赖应用目录 FormKey 访问 GetData。 */
export class ProjectBlueprintApi {
  readonly #client: LowcodeClient

  public constructor(http: HttpClientBase) {
    this.#client = new LowcodeClient(http)
  }

  /** 按 SysId 拉取蓝图节点并归一化为 `ProjectBlueprint`；projectId 为空时 fail-fast。 */
  public async read(projectId: string): Promise<ProjectBlueprint> {
    const normalizedProjectId = projectId.trim()
    const result = await this.#client.requestResult({
      path: '/api/DataOperation/GetData',
      method: 'POST',
      data: projectBlueprintQuery(normalizedProjectId),
      headers: { 'x-FormKey': LOWCODE_APPLICATION_CATALOG_FORM_KEY },
    })
    return new ProjectBlueprint(normalizedProjectId, normalizeProjectBlueprintNodes(result))
  }

  /** 并行读取蓝图与 GetNavigationMenus 授权证据，投影为运行导航；beginNodeId 为授权树根。 */
  public async readRuntimeNavigation(projectId: string, beginNodeId: string): Promise<RuntimeNavigation> {
    const normalizedProjectId = projectId.trim()
    const normalizedBeginNodeId = beginNodeId.trim()
    if (!normalizedProjectId || !normalizedBeginNodeId) {
      throw new Error('projectId 和 beginNodeId 不能为空')
    }
    const [blueprint, authorization] = await Promise.all([
      this.read(normalizedProjectId),
      this.#client.requestResult({
        path: `/api/FormDesign/GetNavigationMenus/${encodeURIComponent(normalizedProjectId)}/${encodeURIComponent(normalizedBeginNodeId)}`,
        method: 'GET',
      }),
    ])
    return blueprint.outputs.delivery.runtimeNavigation(normalizeRuntimeNavigationAuthorization(authorization))
  }

  /** 提交 legacy 文档导出任务（SRS/SDD/功能设计）；返回 coverage=legacy-menu-scope 的任务回执，不等待生成完成。 */
  public async submitDocument(
    projectId: string,
    kind: ProjectBlueprintDocumentKind,
    options: ProjectBlueprintDocumentSubmitOptions = {},
  ): Promise<ProjectBlueprintDocumentTask> {
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
