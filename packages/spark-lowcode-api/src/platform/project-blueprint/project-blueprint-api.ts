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

export const LOWCODE_PROJECT_BLUEPRINT_MUTABLE_FIELDS = [
  'memo',
  'htmlDesc',
  'conid',
  'conType',
  'DifficultyFactor',
  'Manhour',
  'Number',
  'Sum',
  'Total',
  'personCharge',
  'status',
  'NavigationUrl',
  'VersionId',
  'IsShowAtNav',
  'NavigationType',
] as const

export type LowcodeProjectBlueprintMutableField = typeof LOWCODE_PROJECT_BLUEPRINT_MUTABLE_FIELDS[number]
export type LowcodeProjectBlueprintPatch = Readonly<Partial<Record<LowcodeProjectBlueprintMutableField, string | number>>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function editableFields(source: Readonly<Record<string, unknown>>): ReadonlySet<string> {
  const params = source['lingma_sys_params']
  if (!isRecord(params) || !Array.isArray(params['e'])) {
    throw new Error('导航节点缺少后端字段写权限证据')
  }
  return new Set(params['e'].filter((field): field is string => typeof field === 'string'))
}

function readbackValue(record: LowcodeProjectBlueprintRecord, field: LowcodeProjectBlueprintMutableField): unknown {
  if (field === 'VersionId') return record.source['VersionId'] ?? record.source['versionId']
  return record.source[field]
}

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

  /** 只更新一个导航节点的六阶段所属字段，并以正式 GetData 读回确认。 */
  public async updateNodeFields(
    projectId: string,
    nodeId: string,
    patch: LowcodeProjectBlueprintPatch,
  ): Promise<LowcodeProjectBlueprintRecord> {
    const normalizedNodeId = nodeId.trim()
    if (!normalizedNodeId) throw new Error('nodeId 不能为空')
    const entries = Object.entries(patch) as Array<[LowcodeProjectBlueprintMutableField, string | number]>
    if (entries.length === 0) throw new Error('导航节点更新字段不能为空')
    const preimage = (await this.readRecords(projectId)).find(record => record.id === normalizedNodeId)
    if (preimage === undefined) throw new Error(`项目中不存在导航节点 ${normalizedNodeId}`)
    const editable = editableFields(preimage.source)
    for (const [field] of entries) {
      if (!LOWCODE_PROJECT_BLUEPRINT_MUTABLE_FIELDS.includes(field)) {
        throw new Error(`导航字段不属于六阶段写入合同：${field}`)
      }
      if (!editable.has(field)) throw new Error(`后端权限不允许修改导航字段 ${field}`)
    }
    const systemKey = preimage.source['lingma_sys_key']
    if (typeof systemKey !== 'string' || !systemKey.trim()) {
      throw new Error('导航节点缺少 lingma_sys_key')
    }
    await this.#client.requestResult({
      path: '/api/DataOperation/BatchTableOperateRequestByCRUD',
      method: 'POST',
      data: [{
        TableName: 'QYVirtualPlat@Base_NavigationInfo',
        CrudModel: {
          Added: [],
          Changed: [{ rowid: normalizedNodeId, lingma_sys_key: systemKey, ...patch }],
          Deleted: [],
        },
      }],
    })
    const readback = (await this.readRecords(projectId)).find(record => record.id === normalizedNodeId)
    if (readback === undefined) throw new Error(`导航节点 ${normalizedNodeId} 更新后无法读回`)
    for (const [field, expected] of entries) {
      const actual = readbackValue(readback, field)
      const matches = typeof expected === 'number'
        ? Number(actual ?? 0) === expected
        : String(actual ?? '') === expected
      if (!matches) {
        throw new Error(`导航字段 ${field} 写入后读回不一致`)
      }
    }
    return readback
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
